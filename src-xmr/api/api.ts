import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { xmrConfig } from "../config";
import { xmrDatabase } from "../db/database";
import { daemon } from "../monero/daemon";
import { wallet } from "../monero/wallet";

// Monero n'a PAS de facteur de correction hashrate (pas de dataset GPU)
// CPU mining est direct : hashrate brut = hashrate reel
const XMR_HASHRATE_CORRECTION = 1.0;

const CHART_PERIODS: Record<string, { interval: string | null; bucketSeconds: number }> = {
  "1d":  { interval: "24 hours",  bucketSeconds: 300 },
  "7d":  { interval: "7 days",    bucketSeconds: 3600 },
  "30d": { interval: "30 days",   bucketSeconds: 14400 },
  "1y":  { interval: "365 days",  bucketSeconds: 86400 },
  "all": { interval: null,        bucketSeconds: 0 },
};

const MINER_CHART_PERIODS: Record<string, { interval: string; bucketSeconds: number; smoothing: number }> = {
  "1h":  { interval: "1 hour",    bucketSeconds: 120,  smoothing: 2 },
  "1d":  { interval: "24 hours",  bucketSeconds: 300,  smoothing: 4 },
  "7d":  { interval: "7 days",    bucketSeconds: 3600, smoothing: 1 },
};

// Cache prix XMR (CoinGecko)
let cachedXmrPriceUsd: number = 0;
let cachedXmrPriceBtc: number = 0;
let xmrPriceCacheTime: number = 0;
const XMR_PRICE_CACHE_TTL = 300_000;

async function getXmrPriceCached(): Promise<{ usd: number; btc: number }> {
  const now = Date.now();
  if (now - xmrPriceCacheTime < XMR_PRICE_CACHE_TTL && cachedXmrPriceUsd > 0) {
    return { usd: cachedXmrPriceUsd, btc: cachedXmrPriceBtc };
  }
  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd,btc";
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("CoinGecko HTTP " + res.status);
    const json = await res.json() as any;
    cachedXmrPriceUsd = json.monero?.usd || 0;
    cachedXmrPriceBtc = json.monero?.btc || 0;
    xmrPriceCacheTime = now;
    return { usd: cachedXmrPriceUsd, btc: cachedXmrPriceBtc };
  } catch (err) {
    console.error("[XMR API] Erreur fetch prix XMR:", err);
    return { usd: cachedXmrPriceUsd, btc: cachedXmrPriceBtc };
  }
}

// Cache block reward
let cachedBlockReward: number = 0.6; // ~0.6 XMR actuel
let blockRewardCacheTime: number = 0;
const BLOCK_REWARD_CACHE_TTL = 3600_000;

async function getBlockRewardCached(): Promise<number> {
  const now = Date.now();
  if (now - blockRewardCacheTime < BLOCK_REWARD_CACHE_TTL && cachedBlockReward > 0) {
    return cachedBlockReward;
  }
  try {
    const header = await daemon.getLastBlockHeader();
    cachedBlockReward = header.reward / 1e12;
    blockRewardCacheTime = now;
  } catch (err) {
    console.error("[XMR API] Erreur fetch blockReward:", err);
  }
  return cachedBlockReward;
}

// Timestamp dernier bloc reseau (barre de progression)
let cachedDetectionTs: number | null = null;
let cachedLastBlockHeight: number = 0;

async function getLastBlockTimestampCached(): Promise<number | null> {
  try {
    const info = await daemon.getInfo();
    if (info.height !== cachedLastBlockHeight && info.height > 0) {
      cachedLastBlockHeight = info.height;
      cachedDetectionTs = Date.now();
    }
    return cachedDetectionTs;
  } catch {
    return cachedDetectionTs;
  }
}

// Comparaison timing-safe
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!xmrConfig.admin.password) {
    return res.status(503).json({ error: "Admin non configure" });
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ") || !safeCompare(auth.slice(7), xmrConfig.admin.password)) {
    return res.status(401).json({ error: "Non autorise" });
  }
  next();
}

export function createXmrApi(
  getStratumInfo: () => { sessions: number; miners: string[] },
  getDiceRolls: () => { rolls: any[]; totalShares: number; blockCandidates: number }
) {
  const app = express();
  app.set("trust proxy", 1);

  app.use(cors({
    origin: ["https://korvexpool.com"],
  }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", apiLimiter);

  app.use(express.json());

  // Health check
  app.get("/api/xmr/health", async (_req, res) => {
    let dbOk = false;
    let daemonOk = false;
    let walletOk = false;

    try {
      await xmrDatabase.query("SELECT 1");
      dbOk = true;
    } catch {}

    try {
      const info = await daemon.getInfo();
      daemonOk = info.synchronized && info.height > 0;
    } catch {}

    try {
      const h = await wallet.getHeight();
      walletOk = h > 0;
    } catch {}

    const status = dbOk && daemonOk ? "ok" : "degraded";
    res.status(status === "ok" ? 200 : 503).json({ status, wallet: walletOk });
  });

  // Stats generales Monero
  app.get("/api/xmr/stats", async (_req, res) => {
    try {
      const info = await daemon.getInfo();
      const stratum = getStratumInfo();

      // Hashrate pool : depuis les raw shares (fenetre 10min, standard industrie)
      // Meme formule que node-cryptonote-pool, MoneroOcean, MiningCore
      const hrResult = await xmrDatabase.query(
        `SELECT COALESCE(SUM(share_diff), 0) / 600.0 as hr
         FROM xmr_shares
         WHERE created_at > NOW() - INTERVAL '10 minutes' AND mining_mode = 'pplns'`
      );
      const hashrate = Math.round(parseFloat(hrResult.rows[0].hr) || 0);

      // Blocs trouves
      const blocksResult = await xmrDatabase.query(
        "SELECT COUNT(*) as count FROM xmr_blocks WHERE mining_mode = 'pplns'"
      );
      const totalBlocks = parseInt(blocksResult.rows[0].count) || 0;

      const lastBlockResult = await xmrDatabase.query(
        "SELECT height FROM xmr_blocks WHERE mining_mode = 'pplns' ORDER BY height DESC LIMIT 1"
      );
      const lastBlockHeight = lastBlockResult.rows[0]?.height || 0;

      // Effort et luck
      let currentEffort: number | null = null;
      let poolLuck: number | null = null;
      try {
        const effortFraction = await xmrDatabase.getEffortSinceLastBlock("pplns");
        currentEffort = effortFraction * 100;
      } catch {}
      try {
        poolLuck = await xmrDatabase.getAverageEffort(20);
      } catch {}

      const blockReward = await getBlockRewardCached();
      const xmrPrice = await getXmrPriceCached();
      const lastNetworkBlockTimestamp = await getLastBlockTimestampCached();

      // Hashrate reseau : difficulty / block_time (120s pour Monero)
      const networkHashrate = info.difficulty ? Math.round(info.difficulty / 120) : 0;

      res.json({
        hashrate,
        minersTotal: stratum.miners.length,
        workersTotal: stratum.sessions,
        maturedTotal: totalBlocks,
        miningMode: "pplns",
        coin: "monero",
        symbol: "XMR",
        algorithm: "RandomX",
        nodes: [{
          difficulty: info.difficulty?.toString() || "0",
          height: info.height?.toString() || "0",
          networkhashps: networkHashrate.toString(),
        }],
        stats: {
          lastBlockFound: lastBlockHeight,
        },
        currentEffort: currentEffort !== null ? Math.round(currentEffort * 100) / 100 : null,
        poolLuck: poolLuck !== null ? Math.round(poolLuck * 100) / 100 : null,
        blockReward,
        poolFee: xmrConfig.pool.fee,
        xmrPriceUsd: xmrPrice.usd,
        xmrPriceBtc: xmrPrice.btc,
        lastNetworkBlockTimestamp,
        minPayout: Number(xmrConfig.pool.minPayoutPico) / 1e12,
      });
    } catch (err) {
      console.error("[XMR API] Erreur /api/xmr/stats:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Leaderboard mineurs
  app.get("/api/xmr/miners/leaderboard", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);

      const sql = `
        WITH active_miners AS (
          SELECT DISTINCT address
          FROM xmr_shares
          WHERE created_at > NOW() - INTERVAL '24 hours'
            AND mining_mode = 'pplns'
        ),
        miner_hr AS (
          SELECT
            address,
            COALESCE(SUM(share_diff), 0) / 600.0 as hashrate
          FROM xmr_shares
          WHERE address IN (SELECT address FROM active_miners)
            AND created_at > NOW() - INTERVAL '10 minutes'
            AND mining_mode = 'pplns'
          GROUP BY address
        ),
        miner_workers AS (
          SELECT address, COUNT(DISTINCT worker) as workers_count
          FROM xmr_shares
          WHERE address IN (SELECT address FROM active_miners)
            AND created_at > NOW() - INTERVAL '10 minutes'
            AND mining_mode = 'pplns'
          GROUP BY address
        )
        SELECT
          m.address,
          ROUND(COALESCE(hr.hashrate, 0))::bigint as hashrate,
          COALESCE(w.workers_count, 0)::int as workers_count,
          COALESCE(bal.amount, 0)::bigint as balance_pico,
          mi.total_blocks as blocks_found
        FROM active_miners am
        JOIN xmr_miners mi ON mi.address = am.address
        LEFT JOIN miner_hr hr ON hr.address = am.address
        LEFT JOIN miner_workers w ON w.address = am.address
        LEFT JOIN xmr_balances bal ON bal.address = am.address
        LEFT JOIN LATERAL (SELECT address FROM active_miners a2 WHERE a2.address = am.address) m ON true
        ORDER BY hashrate DESC NULLS LAST
        LIMIT $1 OFFSET $2
      `;

      const countSql = `
        SELECT COUNT(DISTINCT address) as total FROM xmr_shares
        WHERE created_at > NOW() - INTERVAL '24 hours' AND mining_mode = 'pplns'
      `;

      const [dataResult, countResult] = await Promise.all([
        xmrDatabase.query(sql, [limit, offset]),
        xmrDatabase.query(countSql),
      ]);

      res.json({
        miners: dataResult.rows.map((r: any) => ({
          address: r.address,
          hashrate: parseInt(r.hashrate) || 0,
          hashrate_15m: parseInt(r.hashrate) || 0,
          hashrate_1h: parseInt(r.hashrate) || 0,
          workers_count: r.workers_count || 0,
          balance_pico: (r.balance_pico || "0").toString(),
          blocks_found: r.blocks_found || 0,
        })),
        total: parseInt(countResult.rows[0].total) || 0,
      });
    } catch (err) {
      console.error("[XMR API] Erreur leaderboard:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Liste des mineurs actifs
  app.get("/api/xmr/miners", async (_req, res) => {
    try {
      const result = await xmrDatabase.query(
        "SELECT address, last_seen, total_shares, total_blocks, total_paid FROM xmr_miners WHERE last_seen > NOW() - INTERVAL '24 hours' ORDER BY total_shares DESC LIMIT 1000"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[XMR API] Erreur /api/xmr/miners:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Stats d'un mineur
  app.get("/api/xmr/miners/:address", async (req, res) => {
    try {
      const { address } = req.params;

      const miner = await xmrDatabase.query("SELECT * FROM xmr_miners WHERE address = $1", [address]);
      if (miner.rows.length === 0) {
        return res.status(404).json({ error: "Mineur non trouve" });
      }

      // Hashrate depuis les raw shares (10min, standard industrie)
      const hrResult = await xmrDatabase.query(
        `SELECT COALESCE(SUM(share_diff), 0) / 600.0 as hashrate
         FROM xmr_shares
         WHERE address = $1 AND created_at > NOW() - INTERVAL '10 minutes' AND mining_mode = 'pplns'`,
        [address]
      );
      const minerHashrate = Math.round(parseFloat(hrResult.rows[0].hashrate) || 0);

      const payments = await xmrDatabase.query(
        "SELECT amount_pico, tx_hash, status, sent_at, created_at FROM xmr_payments WHERE address=$1 AND status = 'sent' ORDER BY created_at DESC LIMIT 20",
        [address]
      );

      const workers = await xmrDatabase.query(
        `SELECT worker, COUNT(*) as shares, MAX(created_at) as last_share
         FROM xmr_shares WHERE address=$1 AND created_at > NOW() - INTERVAL '24 hours' AND mining_mode = 'pplns'
         GROUP BY worker`,
        [address]
      );

      // Hashrate par worker depuis les raw shares (10min, standard industrie)
      const workerHrResult = await xmrDatabase.query(
        `SELECT worker, COALESCE(SUM(share_diff), 0) / 600.0 as hashrate
         FROM xmr_shares
         WHERE address = $1 AND created_at > NOW() - INTERVAL '10 minutes' AND mining_mode = 'pplns'
         GROUP BY worker`,
        [address]
      );
      const workerHrMap: Record<string, number> = {};
      for (const row of workerHrResult.rows) {
        workerHrMap[row.worker] = Math.round(parseFloat(row.hashrate) || 0);
      }

      const balance = await xmrDatabase.getBalance(address);

      const pendingResult = await xmrDatabase.query(
        "SELECT COALESCE(SUM(br.amount), 0) as pending FROM xmr_block_rewards br JOIN xmr_blocks b ON b.height = br.block_height WHERE br.address = $1 AND b.reward_distributed = false AND b.is_orphan = false",
        [address]
      );
      const pendingBalance = pendingResult.rows[0].pending || "0";

      const paidResult = await xmrDatabase.query(
        "SELECT COALESCE(SUM(amount_pico), 0) as total_paid_pico FROM xmr_payments WHERE address = $1 AND status = 'sent'",
        [address]
      );
      const totalPaidPico = paidResult.rows[0].total_paid_pico || "0";

      res.json({
        ...miner.rows[0],
        hashrate: minerHashrate,
        hashrate_15m: minerHashrate,
        hashrate_1h: minerHashrate,
        balance: balance.toString(),
        pending_balance: pendingBalance.toString(),
        total_paid_pico: totalPaidPico.toString(),
        payments: payments.rows.map((p: any) => ({
          amount_pico: (p.amount_pico || "0").toString(),
          amount_xmr: p.amount_pico ? (Number(BigInt(p.amount_pico)) / 1e12).toFixed(12) : "0",
          tx_hash: p.tx_hash,
          status: p.status,
          sent_at: p.sent_at,
          created_at: p.created_at,
        })),
        workers: workers.rows.map((w: any) => {
          return {
            worker: w.worker,
            shares: parseInt(w.shares) || 0,
            last_share: w.last_share,
            hashrate: workerHrMap[w.worker] || 0,
            hashrate_15m: workerHrMap[w.worker] || 0,
            hashrate_1h: workerHrMap[w.worker] || 0,
          };
        }),
      });
    } catch (err) {
      console.error("[XMR API] Erreur miners/:address:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Derniers blocs
  app.get("/api/xmr/blocks", async (_req, res) => {
    try {
      const result = await xmrDatabase.query(
        "SELECT * FROM xmr_blocks WHERE mining_mode = 'pplns' ORDER BY height DESC LIMIT 50"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[XMR API] Erreur /api/xmr/blocks:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Derniers paiements
  app.get("/api/xmr/payments", async (_req, res) => {
    try {
      const payments = await xmrDatabase.getRecentPayments(50);
      res.json(payments.map((p: any) => ({
        address: p.address,
        amount_pico: (p.amount_pico || "0").toString(),
        amount_xmr: p.amount_pico ? (Number(BigInt(p.amount_pico)) / 1e12).toFixed(12) : "0",
        tx_hash: p.tx_hash,
        status: p.status,
        sent_at: p.sent_at,
        created_at: p.created_at,
      })));
    } catch (err) {
      console.error("[XMR API] Erreur /api/xmr/payments:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Chart pool hashrate
  app.get("/api/xmr/chart/pool-hashrate", async (req, res) => {
    try {
      const period = (req.query.period as string) || "1d";
      const conf = CHART_PERIODS[period] || CHART_PERIODS["1d"];
      let bucketSeconds = conf.bucketSeconds;

      if (period === "all") {
        const oldest = await xmrDatabase.query(
          "SELECT MIN(ts_minute) as oldest FROM xmr_pool_hashrate_1m WHERE mining_mode = 'pplns'"
        );
        if (oldest.rows[0].oldest) {
          const oldestTime = new Date(oldest.rows[0].oldest).getTime();
          const totalDays = (Date.now() - oldestTime) / (1000 * 86400);
          bucketSeconds = Math.max(3600, Math.ceil((totalDays * 86400) / 700));
          bucketSeconds = Math.ceil(bucketSeconds / 3600) * 3600;
        } else {
          bucketSeconds = 3600;
        }
      }

      const periodStart = conf.interval
        ? `NOW() - INTERVAL '${conf.interval}'`
        : `(SELECT COALESCE(MIN(ts_minute), NOW() - INTERVAL '24 hours') FROM xmr_pool_hashrate_1m)`;

      const smoothingWindow = period === "1d" ? 4 : period === "7d" ? 0 : 1;

      const result = await xmrDatabase.query(`
        WITH first_data AS (
          SELECT COALESCE(MIN(ts_minute), NOW()) as first_ts FROM xmr_pool_hashrate_1m WHERE mining_mode = 'pplns'
        ),
        time_series AS (
          SELECT generate_series(
            to_timestamp(floor(extract(epoch from GREATEST(${periodStart}, (SELECT first_ts FROM first_data))) / ${bucketSeconds}) * ${bucketSeconds}),
            to_timestamp(floor(extract(epoch from NOW()) / ${bucketSeconds}) * ${bucketSeconds}),
            INTERVAL '${bucketSeconds} seconds'
          ) as ts
        ),
        data AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds}) as ts,
            SUM(diff_sum) * ${XMR_HASHRATE_CORRECTION} / ${bucketSeconds}.0 as value
          FROM xmr_pool_hashrate_1m
          WHERE ts_minute >= GREATEST(${periodStart}, (SELECT first_ts FROM first_data)) AND mining_mode = 'pplns'
          GROUP BY to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds})
        ),
        joined AS (
          SELECT time_series.ts, COALESCE(data.value, 0) as raw_value
          FROM time_series LEFT JOIN data ON time_series.ts = data.ts
        )
        SELECT ts,
          AVG(raw_value) OVER (ORDER BY ts ROWS BETWEEN ${smoothingWindow} PRECEDING AND ${smoothingWindow} FOLLOWING) as value
        FROM joined
        ORDER BY ts
      `);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[XMR API] Erreur chart pool-hashrate:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Chart miner hashrate
  app.get("/api/xmr/chart/miner-hashrate/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const period = (req.query.period as string) || "1d";
      const conf = MINER_CHART_PERIODS[period] || MINER_CHART_PERIODS["1d"];

      const smoothingWindow = conf.smoothing;
      const bucketSeconds = conf.bucketSeconds;

      const result = await xmrDatabase.query(`
        WITH first_data AS (
          SELECT COALESCE(MIN(ts_minute), NOW()) as first_ts
          FROM xmr_miner_hashrate_1m
          WHERE address = $1 AND mining_mode = 'pplns'
        ),
        time_series AS (
          SELECT generate_series(
            to_timestamp(floor(extract(epoch from GREATEST(NOW() - INTERVAL '${conf.interval}', (SELECT first_ts FROM first_data))) / ${bucketSeconds}) * ${bucketSeconds}),
            to_timestamp(floor(extract(epoch from NOW()) / ${bucketSeconds}) * ${bucketSeconds}),
            INTERVAL '${bucketSeconds} seconds'
          ) as ts
        ),
        data AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds}) as ts,
            SUM(diff_sum) * ${XMR_HASHRATE_CORRECTION} / ${bucketSeconds}.0 as value
          FROM xmr_miner_hashrate_1m
          WHERE address = $1 AND mining_mode = 'pplns'
            AND ts_minute >= GREATEST(NOW() - INTERVAL '${conf.interval}', (SELECT first_ts FROM first_data))
          GROUP BY to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds})
        ),
        joined AS (
          SELECT time_series.ts, COALESCE(data.value, 0) as raw_value
          FROM time_series LEFT JOIN data ON time_series.ts = data.ts
        )
        SELECT ts,
          AVG(raw_value) OVER (ORDER BY ts ROWS BETWEEN ${smoothingWindow} PRECEDING AND ${smoothingWindow} FOLLOWING) as value
        FROM joined
        ORDER BY ts
      `, [address]);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[XMR API] Erreur chart miner-hashrate:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Chart network difficulty
  app.get("/api/xmr/chart/network-difficulty", async (req, res) => {
    try {
      const period = (req.query.period as string) || "1d";
      const conf = CHART_PERIODS[period] || CHART_PERIODS["1d"];
      const whereClause = conf.interval ? `WHERE ts > NOW() - INTERVAL '${conf.interval}'` : "";

      const bucketSeconds = conf.bucketSeconds || 3600;

      const result = await xmrDatabase.query(`
        SELECT
          to_timestamp(floor(extract(epoch from ts) / ${bucketSeconds}) * ${bucketSeconds}) as ts,
          AVG(difficulty) as value,
          MAX(height) as height
        FROM xmr_network_snapshots
        ${whereClause}
        GROUP BY to_timestamp(floor(extract(epoch from ts) / ${bucketSeconds}) * ${bucketSeconds})
        ORDER BY ts
      `);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[XMR API] Erreur chart network-difficulty:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.listen(xmrConfig.api.port, "127.0.0.1", () => {
    console.log(`[XMR API] Ecoute sur 127.0.0.1:${xmrConfig.api.port}`);
  });

  return app;
}
