import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "../config";
import { database } from "../db/database";
import { ergoNode } from "../ergo/node";

const CHART_PERIODS: Record<string, { interval: string | null; bucketSeconds: number }> = {
  "1d":  { interval: "24 hours",  bucketSeconds: 300 },
  "7d":  { interval: "7 days",    bucketSeconds: 3600 },
  "30d": { interval: "30 days",   bucketSeconds: 14400 },
  "1y":  { interval: "365 days",  bucketSeconds: 86400 },
  "all": { interval: null,        bucketSeconds: 0 },
};

// Periodes autorisees pour le chart miner hashrate (pas de 1y/all car retention 90j max)
const MINER_CHART_PERIODS: Record<string, { interval: string; bucketSeconds: number }> = {
  "1d":  { interval: "24 hours",  bucketSeconds: 300 },
  "7d":  { interval: "7 days",    bucketSeconds: 3600 },
  "30d": { interval: "30 days",   bucketSeconds: 14400 },
};

// Cache pour blockReward (evite d'appeler le noeud trop souvent)
let cachedBlockReward: number = 6;
let blockRewardCacheTime: number = 0;
const BLOCK_REWARD_CACHE_TTL = 3600_000; // 1 heure

async function getBlockRewardCached(): Promise<number> {
  const now = Date.now();
  if (now - blockRewardCacheTime < BLOCK_REWARD_CACHE_TTL && cachedBlockReward > 0) {
    return cachedBlockReward;
  }
  try {
    const info = await ergoNode.getInfo();
    const height = info.fullHeight || 0;
    if (height > 0) {
      const rewardNano = await ergoNode.getEmissionReward(height);
      cachedBlockReward = Number(rewardNano) / 1e9;
      blockRewardCacheTime = now;
    }
  } catch (err) {
    console.error("[API] Erreur fetch blockReward:", err);
  }
  return cachedBlockReward;
}

// Cache pour le prix ERG (CoinGecko, rafraichi toutes les 5 min)
let cachedErgPriceUsd: number = 0;
let cachedErgPriceBtc: number = 0;
let ergPriceCacheTime: number = 0;
const ERG_PRICE_CACHE_TTL = 30_000; // 30 secondes

async function fetchErgPrice(): Promise<{ usd: number; btc: number }> {
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd,btc";
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error("CoinGecko HTTP " + res.status);
  const json = await res.json() as any;
  return { usd: json.ergo?.usd || 0, btc: json.ergo?.btc || 0 };
}

async function getErgPriceCached(): Promise<{ usd: number; btc: number }> {
  const now = Date.now();
  if (now - ergPriceCacheTime < ERG_PRICE_CACHE_TTL && cachedErgPriceUsd > 0) {
    return { usd: cachedErgPriceUsd, btc: cachedErgPriceBtc };
  }
  try {
    const price = await fetchErgPrice();
    cachedErgPriceUsd = price.usd;
    cachedErgPriceBtc = price.btc;
    ergPriceCacheTime = now;
    return price;
  } catch (err) {
    console.error("[API] Erreur fetch prix ERG:", err);
    return { usd: cachedErgPriceUsd, btc: cachedErgPriceBtc };
  }
}

export function createApi(getStratumInfo: () => { sessions: number; miners: string[] }) {
  const app = express();
  app.use(cors({
    origin: ["https://korvexpool.com", "http://localhost:3000"],
  }));

  // Rate limit : 120 requetes par minute par IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", apiLimiter);
  app.use(express.json());

  // Health check (enrichi Phase 3)
  app.get("/api/health", async (_req, res) => {
    try {
      const info = await ergoNode.getInfo();
      const synced = await ergoNode.isSynced();

      const pendingBlocks = await database.query(
        "SELECT COUNT(*) as count FROM blocks WHERE reward_distributed = false AND is_orphan = false AND reward_nano > 0"
      );
      const confirmedBlocks = await database.query(
        "SELECT COUNT(*) as count FROM blocks WHERE reward_distributed = true"
      );
      const orphanBlocks = await database.query(
        "SELECT COUNT(*) as count FROM blocks WHERE is_orphan = true"
      );
      const totalPayable = await database.query(
        "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM balances WHERE amount >= " + config.pool.minPayoutNano.toString()
      );
      const paidCount = await database.query(
        "SELECT COUNT(*) as count FROM payments WHERE status = 'sent'"
      );

      res.json({
        status: "ok",
        node: {
          synced,
          headersHeight: info.headersHeight,
          fullHeight: info.fullHeight,
          peersCount: info.peersCount,
          difficulty: info.difficulty,
        },
        stratum: getStratumInfo(),
        payout: {
          confirmations_required: config.payout.confirmations,
          blocks_pending: parseInt(pendingBlocks.rows[0].count) || 0,
          blocks_confirmed: parseInt(confirmedBlocks.rows[0].count) || 0,
          blocks_orphan: parseInt(orphanBlocks.rows[0].count) || 0,
          miners_payable: parseInt(totalPayable.rows[0].count) || 0,
          total_payable_nano: totalPayable.rows[0].total?.toString() || "0",
          payments_sent: parseInt(paidCount.rows[0].count) || 0,
          // wallet_configured retire pour securite
        },
      });
    } catch (err) {
      console.error("[API] Erreur /api/health:", err);
      res.status(500).json({ status: "error", message: "Node indisponible" });
    }
  });

  // Stats generales (compatible MiningPoolStats) + effort/luck + prix
  app.get("/api/stats", async (_req, res) => {
    try {
      const info = await ergoNode.getInfo();
      const poolStats = await database.getPoolStats();
      const stratum = getStratumInfo();

      // Hashrate pool : meme methode que le chart.
      // P75 calcule sur 24h de buckets 5 min (robuste meme avec des spikes recents).
      // Cap + smoothing sur les 6 derniers buckets (30 min).
      const hrResult = await database.query(
        `WITH all_buckets AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300) as ts,
            SUM(diff_sum) / GREATEST(COUNT(*) * 60, 1) as value
          FROM pool_hashrate_1m
          WHERE ts_minute > NOW() - INTERVAL '24 hours'
          GROUP BY to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300)
        ),
        cap AS (
          SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value) as p75
          FROM all_buckets WHERE value > 0
        ),
        recent_capped AS (
          SELECT b.ts,
            CASE WHEN c.p75 > 0 AND b.value > c.p75 THEN c.p75
                 ELSE b.value END as hr
          FROM all_buckets b CROSS JOIN cap c
          ORDER BY b.ts DESC
          LIMIT 6
        )
        SELECT COALESCE(AVG(hr), 0) as avg_hr FROM recent_capped`
      );
      const hashrate = Math.round(parseFloat(hrResult.rows[0].avg_hr));

      // Effort en cours et luck moyenne
      const networkDifficulty = info.difficulty || 0;
      let currentEffort: number | null = null;
      let poolLuck: number | null = null;

      try {
        const totalShareDiff = await database.getShareDiffSinceLastBlock();
        if (networkDifficulty > 0) {
          currentEffort = (totalShareDiff / networkDifficulty) * 100;
        }
      } catch (err) {
        console.error("[API] Erreur calcul effort:", err);
      }

      try {
        poolLuck = await database.getAverageEffort(20);
      } catch (err) {
        console.error("[API] Erreur calcul poolLuck:", err);
      }

      // Block reward avec cache
      const blockReward = await getBlockRewardCached();

      // Prix ERG avec cache
      const ergPrice = await getErgPriceCached();

      res.json({
        hashrate,
        minersTotal: stratum.miners.length,
        workersTotal: stratum.sessions,
        maturedTotal: poolStats.totalBlocks,
        candidatesTotal: 0,
        immatureTotal: 0,
        nodes: [{
          difficulty: info.difficulty?.toString() || "0",
          height: info.fullHeight?.toString() || "0",
          networkhashps: info.difficulty ? Math.round(info.difficulty / 120).toString() : "0",
        }],
        stats: {
          lastBlockFound: poolStats.lastBlockHeight,
        },
        // Nouveaux champs effort/luck/reward/prix
        currentEffort: currentEffort !== null ? Math.round(currentEffort * 100) / 100 : null,
        poolLuck: poolLuck !== null ? Math.round(poolLuck * 100) / 100 : null,
        blockReward,
        poolFee: config.pool.fee,
        ergPriceUsd: ergPrice.usd,
        ergPriceBtc: ergPrice.btc,
      });
    } catch (err) {
      console.error("[API] Erreur /api/stats:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // ========== LEADERBOARD — DOIT etre AVANT /api/miners/:address ==========
  app.get("/api/miners/leaderboard", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const search = (req.query.search as string || "").trim();

      // Colonnes triables (whitelist pour eviter injection SQL)
      const SORTABLE: Record<string, string> = {
        hashrate_1h: "hashrate_1h",
        hashrate_5m: "hashrate_5m",
        shares_1h: "shares_1h",
        workers_count: "workers_count",
        balance_nano: "balance_nano",
        pending_balance_nano: "pending_balance_nano",
        total_paid_nano: "total_paid_nano",
        blocks_found: "blocks_found",
        last_share_at: "last_share_at",
      };
      const sortCol = SORTABLE[req.query.sort as string] || "hashrate_1h";
      const sortOrder = (req.query.order as string) === "asc" ? "ASC" : "DESC";

      const searchClause = search ? "AND address ILIKE $1" : "";
      const searchParam = search ? [search + "%"] : [];

      const sql = `
        WITH active_miners AS (
          SELECT address, last_seen, total_shares, total_blocks, total_paid
          FROM miners
          WHERE last_seen > NOW() - INTERVAL '24 hours'
          ${searchClause}
        ),
        miner_hr AS (
          SELECT
            address,
            COALESCE(SUM(diff_sum) FILTER (WHERE ts_minute > NOW() - INTERVAL '5 minutes'), 0) / 300.0 as hashrate_5m,
            COALESCE(SUM(diff_sum) FILTER (WHERE ts_minute > NOW() - INTERVAL '1 hour'), 0) / 3600.0 as hashrate_1h
          FROM miner_hashrate_1m
          WHERE address IN (SELECT address FROM active_miners)
            AND ts_minute > NOW() - INTERVAL '1 hour'
          GROUP BY address
        ),
        miner_workers AS (
          SELECT address, COUNT(DISTINCT worker) as workers_count
          FROM shares
          WHERE address IN (SELECT address FROM active_miners)
            AND created_at > NOW() - INTERVAL '10 minutes'
          GROUP BY address
        ),
        miner_shares_1h AS (
          SELECT address, COUNT(*) as shares_1h, MAX(created_at) as last_share_at
          FROM shares
          WHERE address IN (SELECT address FROM active_miners)
            AND created_at > NOW() - INTERVAL '1 hour'
          GROUP BY address
        ),
        miner_pending AS (
          SELECT br.address, COALESCE(SUM(br.amount), 0) as pending_balance_nano
          FROM block_rewards br
          JOIN blocks b ON b.height = br.block_height
          WHERE br.address IN (SELECT address FROM active_miners)
            AND b.reward_distributed = false AND b.is_orphan = false
          GROUP BY br.address
        ),
        miner_paid AS (
          SELECT address, COALESCE(SUM(amount_nano), 0) as total_paid_nano
          FROM payments
          WHERE address IN (SELECT address FROM active_miners)
            AND status = 'sent'
          GROUP BY address
        )
        SELECT
          m.address,
          ROUND(COALESCE(hr.hashrate_5m, 0))::bigint as hashrate_5m,
          ROUND(COALESCE(hr.hashrate_1h, 0))::bigint as hashrate_1h,
          COALESCE(w.workers_count, 0)::int as workers_count,
          COALESCE(s.shares_1h, 0)::bigint as shares_1h,
          s.last_share_at,
          COALESCE(bal.amount, 0)::bigint as balance_nano,
          COALESCE(p.pending_balance_nano, 0)::bigint as pending_balance_nano,
          COALESCE(paid.total_paid_nano, 0)::bigint as total_paid_nano,
          COALESCE(m.total_blocks, 0)::int as blocks_found
        FROM active_miners m
        LEFT JOIN miner_hr hr ON hr.address = m.address
        LEFT JOIN miner_workers w ON w.address = m.address
        LEFT JOIN miner_shares_1h s ON s.address = m.address
        LEFT JOIN balances bal ON bal.address = m.address
        LEFT JOIN miner_pending p ON p.address = m.address
        LEFT JOIN miner_paid paid ON paid.address = m.address
        ORDER BY ${sortCol} ${sortOrder} NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `;

      const countSql = `
        SELECT COUNT(*) as total FROM miners
        WHERE last_seen > NOW() - INTERVAL '24 hours'
        ${searchClause}
      `;

      const [dataResult, countResult] = await Promise.all([
        database.query(sql, searchParam),
        database.query(countSql, searchParam),
      ]);

      res.json({
        miners: dataResult.rows.map((r: any) => ({
          address: r.address,
          hashrate_5m: parseInt(r.hashrate_5m) || 0,
          hashrate_1h: parseInt(r.hashrate_1h) || 0,
          workers_count: r.workers_count,
          shares_1h: parseInt(r.shares_1h) || 0,
          last_share_at: r.last_share_at || null,
          balance_nano: (r.balance_nano || "0").toString(),
          pending_balance_nano: (r.pending_balance_nano || "0").toString(),
          total_paid_nano: (r.total_paid_nano || "0").toString(),
          blocks_found: r.blocks_found,
        })),
        total: parseInt(countResult.rows[0].total) || 0,
      });
    } catch (err) {
      console.error("[API] Erreur leaderboard:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Liste des mineurs actifs
  app.get("/api/miners", async (_req, res) => {
    try {
      const result = await database.query(
        "SELECT address, last_seen, total_shares, total_blocks, total_paid FROM miners WHERE last_seen > NOW() - INTERVAL '24 hours' ORDER BY total_shares DESC"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[API] Erreur /api/miners:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Stats d'un mineur (+ solde + paiements + effort par worker + hashrate par worker)
  app.get("/api/miners/:address", async (req, res) => {
    try {
      const { address } = req.params;

      const miner = await database.query("SELECT * FROM miners WHERE address = $1", [address]);
      if (miner.rows.length === 0) {
        return res.status(404).json({ error: "Mineur non trouve" });
      }

      // Hashrate mineur avec cap P90 anti-spike
      // P90 (pas P75) car un mineur individuel a plus de variance que la pool entiere
      const hrResult = await database.query(
        `WITH all_buckets AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300) as ts,
            SUM(diff_sum) / GREATEST(COUNT(*) * 60, 1) as value
          FROM miner_hashrate_1m
          WHERE address = $1 AND ts_minute > NOW() - INTERVAL '24 hours'
          GROUP BY to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300)
        ),
        cap AS (
          SELECT COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value), 0) as cap_val
          FROM all_buckets WHERE value > 0
        ),
        capped AS (
          SELECT b.ts,
            CASE WHEN c.cap_val > 0 AND b.value > c.cap_val THEN c.cap_val ELSE b.value END as hr
          FROM all_buckets b CROSS JOIN cap c
        )
        SELECT
          COALESCE(AVG(hr) FILTER (WHERE ts > NOW() - INTERVAL '5 minutes'), 0) as total_5m,
          COALESCE(AVG(hr) FILTER (WHERE ts > NOW() - INTERVAL '1 hour'), 0) as total_1h
        FROM capped`,
        [address]
      );

      const payments = await database.query(
        "SELECT amount_nano, tx_hash, status, sent_at, created_at FROM payments WHERE address=$1 ORDER BY created_at DESC LIMIT 20",
        [address]
      );

      // Workers enrichis : shares 1h + effort depuis dernier bloc + blocs trouves + hashrate par worker
      const lastBlockTime = await database.query(
        "SELECT MAX(created_at) as last_block_at FROM blocks WHERE is_orphan = false"
      );
      const lastBlockAt = lastBlockTime.rows[0]?.last_block_at || '1970-01-01';

      // Recuperer la difficulte reseau pour calculer l'effort
      let networkDifficulty = 0;
      try {
        const info = await ergoNode.getInfo();
        networkDifficulty = info.difficulty || 0;
      } catch (err) {
        console.error("[API] Erreur fetch networkDifficulty:", err);
      }

      // Workers avec shares 24h (pour voir aussi les inactifs jaunes/rouges) ET effort depuis dernier bloc
      const workers = await database.query(
        `SELECT
          w24h.worker,
          w24h.shares,
          w24h.last_share,
          COALESCE(weffort.diff_since_block, 0) as diff_since_block
        FROM (
          SELECT worker, COUNT(*) as shares, MAX(created_at) as last_share
          FROM shares WHERE address=$1 AND created_at > NOW() - INTERVAL '24 hours'
          GROUP BY worker
        ) w24h
        LEFT JOIN (
          SELECT worker, SUM(share_diff) as diff_since_block
          FROM shares WHERE address=$1 AND created_at > $2
          GROUP BY worker
        ) weffort ON weffort.worker = w24h.worker`,
        [address, lastBlockAt]
      );

      // Blocs trouves par worker (lifetime)
      const workerBlocks = await database.query(
        "SELECT finder_worker as worker, COUNT(*) as blocks_found FROM blocks WHERE finder_address=$1 AND is_orphan = false GROUP BY finder_worker",
        [address]
      );
      const blocksMap: Record<string, number> = {};
      for (const row of workerBlocks.rows) {
        if (row.worker) blocksMap[row.worker] = parseInt(row.blocks_found) || 0;
      }

      // Hashrate par worker avec cap P90 anti-spike
      const workerHr = await database.query(
        `WITH all_buckets AS (
          SELECT
            worker,
            to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300) as ts,
            SUM(diff_sum) / GREATEST(COUNT(*) * 60, 1) as value
          FROM worker_hashrate_1m
          WHERE address = $1 AND ts_minute > NOW() - INTERVAL '24 hours'
          GROUP BY worker, to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300)
        ),
        cap AS (
          SELECT worker, COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value), 0) as cap_val
          FROM all_buckets WHERE value > 0
          GROUP BY worker
        ),
        capped AS (
          SELECT b.worker, b.ts,
            CASE WHEN c.cap_val > 0 AND b.value > c.cap_val THEN c.cap_val ELSE b.value END as hr
          FROM all_buckets b JOIN cap c ON c.worker = b.worker
        )
        SELECT
          worker,
          COALESCE(AVG(hr) FILTER (WHERE ts > NOW() - INTERVAL '5 minutes'), 0) as hashrate_5m,
          COALESCE(AVG(hr) FILTER (WHERE ts > NOW() - INTERVAL '1 hour'), 0) as hashrate_1h
        FROM capped
        GROUP BY worker`,
        [address]
      );
      const workerHrMap: Record<string, { hashrate_5m: number; hashrate_1h: number }> = {};
      for (const row of workerHr.rows) {
        workerHrMap[row.worker] = {
          hashrate_5m: Math.round(parseFloat(row.hashrate_5m) || 0),
          hashrate_1h: Math.round(parseFloat(row.hashrate_1h) || 0),
        };
      }

      const balance = await database.getBalance(address);

      const pendingResult = await database.query(
        "SELECT COALESCE(SUM(br.amount), 0) as pending FROM block_rewards br JOIN blocks b ON b.height = br.block_height WHERE br.address = $1 AND b.reward_distributed = false AND b.is_orphan = false",
        [address]
      );
      const pendingBalance = pendingResult.rows[0].pending || "0";

      const paidResult = await database.query(
        "SELECT COALESCE(SUM(amount_nano), 0) as total_paid_nano FROM payments WHERE address = $1 AND status = 'sent'",
        [address]
      );
      const totalPaidNano = paidResult.rows[0].total_paid_nano || "0";

      res.json({
        ...miner.rows[0],
        hashrate_5m: Math.round(parseFloat(hrResult.rows[0].total_5m) || 0),
        hashrate_1h: Math.round(parseFloat(hrResult.rows[0].total_1h) || 0),
        balance: balance.toString(),
        pending_balance: pendingBalance.toString(),
        total_paid_nano: totalPaidNano.toString(),
        payments: payments.rows.map((p: any) => ({
          amount_nano: (p.amount_nano || "0").toString(),
          amount_erg: p.amount_nano ? (Number(BigInt(p.amount_nano)) / 1e9).toFixed(9) : "0",
          tx_hash: p.tx_hash,
          status: p.status,
          sent_at: p.sent_at,
          created_at: p.created_at,
        })),
        workers: workers.rows.map((w: any) => {
          const hr = workerHrMap[w.worker] || { hashrate_5m: 0, hashrate_1h: 0 };
          return {
            worker: w.worker,
            shares: parseInt(w.shares) || 0,
            last_share: w.last_share,
            effort_percent: networkDifficulty > 0
              ? Math.round((parseFloat(w.diff_since_block) / networkDifficulty) * 10000) / 100
              : null,
            blocks_found: blocksMap[w.worker] || 0,
            hashrate_5m: hr.hashrate_5m,
            hashrate_1h: hr.hashrate_1h,
          };
        }),
      });
    } catch (err) {
      console.error("[API] Erreur miners/:address:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Derniers blocs
  app.get("/api/blocks", async (_req, res) => {
    try {
      const result = await database.query(
        "SELECT * FROM blocks ORDER BY height DESC LIMIT 50"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[API] Erreur /api/blocks:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Distribution PPLNS d'un bloc
  app.get("/api/blocks/:height/rewards", async (req, res) => {
    try {
      const height = parseInt(req.params.height);
      if (isNaN(height)) {
        return res.status(400).json({ error: "Hauteur invalide" });
      }

      const rewards = await database.getBlockRewards(height);
      if (rewards.length === 0) {
        return res.status(404).json({ error: "Aucune distribution trouvee pour ce bloc" });
      }

      let totalNano = BigInt(0);
      for (const r of rewards) {
        totalNano += BigInt(r.amount);
      }

      res.json({
        block_height: height,
        total_reward_nano: totalNano.toString(),
        total_reward_erg: (Number(totalNano) / 1e9).toFixed(9),
        miners: rewards.map((r) => ({
          address: r.address,
          amount_nano: r.amount.toString(),
          amount_erg: (Number(BigInt(r.amount)) / 1e9).toFixed(9),
          share_count: r.share_count,
          share_diff_sum: r.share_diff_sum,
          percentage: rewards.length > 0
            ? ((Number(BigInt(r.amount)) / Number(totalNano)) * 100).toFixed(2)
            : "0",
        })),
      });
    } catch (err) {
      console.error("[API] Erreur /api/blocks/:height/rewards:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Derniers paiements
  app.get("/api/payouts", async (_req, res) => {
    try {
      const payments = await database.getRecentPayments(50);
      res.json(payments.map((p: any) => ({
        address: p.address,
        amount_nano: (p.amount_nano || "0").toString(),
        amount_erg: p.amount_nano ? (Number(BigInt(p.amount_nano)) / 1e9).toFixed(9) : "0",
        tx_hash: p.tx_hash,
        status: p.status,
        error_msg: p.error_msg,
        retry_count: p.retry_count,
        sent_at: p.sent_at,
        created_at: p.created_at,
      })));
    } catch (err) {
      console.error("[API] Erreur /api/payouts:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Chart pool hashrate
  app.get("/api/chart/pool-hashrate", async (req, res) => {
    try {
      const period = (req.query.period as string) || "1d";
      const conf = CHART_PERIODS[period] || CHART_PERIODS["1d"];

      let bucketSeconds = conf.bucketSeconds;

      if (period === "all") {
        const oldest = await database.query(
          "SELECT MIN(ts_minute) as oldest FROM pool_hashrate_1m"
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
        : `(SELECT COALESCE(MIN(ts_minute), NOW() - INTERVAL '24 hours') FROM pool_hashrate_1m)`;

      // Lissage : fenetre 3 pour 1d (buckets 5min = volatile), 1 pour les autres
      const smoothingWindow = period === "1d" ? 3 : 1;

      // Cap anti-spike AVANT lissage : on calcule le percentile 75 de toute la periode
      // et on cap chaque bucket a cette valeur. Le P75 represente le hashrate "normalement haut"
      // sans etre pollue par les spikes. Tout ce qui depasse est du bruit de vardiff.
      // Ensuite on applique le lissage sur les donnees deja cappees.

      const result = await database.query(`
        WITH first_data AS (
          SELECT COALESCE(MIN(ts_minute), NOW()) as first_ts FROM pool_hashrate_1m
        ),
        params AS (
          SELECT
            to_timestamp(floor(extract(epoch from GREATEST(${periodStart}, (SELECT first_ts FROM first_data))) / ${bucketSeconds}) * ${bucketSeconds}) as start_ts,
            to_timestamp(floor(extract(epoch from NOW()) / ${bucketSeconds}) * ${bucketSeconds}) as end_ts
        ),
        time_series AS (
          SELECT generate_series(
            (SELECT start_ts FROM params),
            (SELECT end_ts FROM params),
            INTERVAL '${bucketSeconds} seconds'
          ) as ts
        ),
        data AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds}) as ts,
            SUM(diff_sum) / GREATEST(COUNT(*) * 60, 1) as value
          FROM pool_hashrate_1m
          WHERE ts_minute >= GREATEST(${periodStart}, (SELECT first_ts FROM first_data))
          GROUP BY to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds})
        ),
        joined AS (
          SELECT time_series.ts, COALESCE(data.value, 0) as raw_value
          FROM time_series
          LEFT JOIN data ON time_series.ts = data.ts
        ),
        cap_threshold AS (
          SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY raw_value) as cap_hr
          FROM joined
          WHERE raw_value > 0
        ),
        capped AS (
          SELECT j.ts,
            CASE
              WHEN c.cap_hr > 0 AND j.raw_value > c.cap_hr
              THEN c.cap_hr
              ELSE j.raw_value
            END as capped_value
          FROM joined j
          CROSS JOIN cap_threshold c
        )
        SELECT ts,
          AVG(capped_value) OVER (ORDER BY ts ROWS BETWEEN ${smoothingWindow} PRECEDING AND ${smoothingWindow} FOLLOWING) as value
        FROM capped
        ORDER BY ts
      `);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[API] Erreur chart pool-hashrate:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Chart miner hashrate (filtre par adresse)
  app.get("/api/chart/miner-hashrate/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const period = (req.query.period as string) || "1d";
      const conf = MINER_CHART_PERIODS[period] || MINER_CHART_PERIODS["1d"];
      const bucketSeconds = conf.bucketSeconds;

      // Lissage : fenetre plus large pour 1d (buckets 5min = volatile)
      const smoothingWindow = period === "1d" ? 3 : 1;
      const smoothingClause = "AVG(raw_value) OVER (ORDER BY ts ROWS BETWEEN " + smoothingWindow + " PRECEDING AND " + smoothingWindow + " FOLLOWING)";

      const result = await database.query(`
        WITH first_data AS (
          SELECT COALESCE(MIN(ts_minute), NOW()) as first_ts
          FROM miner_hashrate_1m WHERE address = $1
        ),
        params AS (
          SELECT
            to_timestamp(floor(extract(epoch from GREATEST(NOW() - INTERVAL '${conf.interval}', (SELECT first_ts FROM first_data))) / ${bucketSeconds}) * ${bucketSeconds}) as start_ts,
            to_timestamp(floor(extract(epoch from NOW()) / ${bucketSeconds}) * ${bucketSeconds}) as end_ts
        ),
        time_series AS (
          SELECT generate_series(
            (SELECT start_ts FROM params),
            (SELECT end_ts FROM params),
            INTERVAL '${bucketSeconds} seconds'
          ) as ts
        ),
        data AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds}) as ts,
            SUM(diff_sum) / GREATEST(COUNT(*) * 60, 1) as value
          FROM miner_hashrate_1m
          WHERE address = $1
            AND ts_minute >= GREATEST(NOW() - INTERVAL '${conf.interval}', (SELECT first_ts FROM first_data))
          GROUP BY to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds})
        ),
        joined AS (
          SELECT time_series.ts, COALESCE(data.value, 0) as raw_value
          FROM time_series
          LEFT JOIN data ON time_series.ts = data.ts
        ),
        cap_threshold AS (
          SELECT PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY raw_value) as cap_hr
          FROM joined WHERE raw_value > 0
        ),
        capped AS (
          SELECT j.ts,
            CASE WHEN c.cap_hr > 0 AND j.raw_value > c.cap_hr THEN c.cap_hr
                 ELSE j.raw_value END as capped_value
          FROM joined j CROSS JOIN cap_threshold c
        )
        SELECT ts,
          AVG(capped_value) OVER (ORDER BY ts ROWS BETWEEN ${smoothingWindow} PRECEDING AND ${smoothingWindow} FOLLOWING) as value
        FROM capped
        ORDER BY ts
      `, [address]);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[API] Erreur chart miner-hashrate:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Chart worker hashrate (filtre par adresse + worker)
  app.get("/api/chart/worker-hashrate/:address/:worker", async (req, res) => {
    try {
      const { address, worker } = req.params;
      const period = (req.query.period as string) || "1d";
      const conf = MINER_CHART_PERIODS[period] || MINER_CHART_PERIODS["1d"];
      const bucketSeconds = conf.bucketSeconds;

      const smoothingWindow = period === "1d" ? 3 : 1;
      const smoothingClause = "AVG(raw_value) OVER (ORDER BY ts ROWS BETWEEN " + smoothingWindow + " PRECEDING AND " + smoothingWindow + " FOLLOWING)";

      const result = await database.query(`
        WITH first_data AS (
          SELECT COALESCE(MIN(ts_minute), NOW()) as first_ts
          FROM worker_hashrate_1m WHERE address = $1 AND worker = $2
        ),
        params AS (
          SELECT
            to_timestamp(floor(extract(epoch from GREATEST(NOW() - INTERVAL '${conf.interval}', (SELECT first_ts FROM first_data))) / ${bucketSeconds}) * ${bucketSeconds}) as start_ts,
            to_timestamp(floor(extract(epoch from NOW()) / ${bucketSeconds}) * ${bucketSeconds}) as end_ts
        ),
        time_series AS (
          SELECT generate_series(
            (SELECT start_ts FROM params),
            (SELECT end_ts FROM params),
            INTERVAL '${bucketSeconds} seconds'
          ) as ts
        ),
        data AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds}) as ts,
            SUM(diff_sum) / GREATEST(COUNT(*) * 60, 1) as value
          FROM worker_hashrate_1m
          WHERE address = $1 AND worker = $2
            AND ts_minute >= GREATEST(NOW() - INTERVAL '${conf.interval}', (SELECT first_ts FROM first_data))
          GROUP BY to_timestamp(floor(extract(epoch from ts_minute) / ${bucketSeconds}) * ${bucketSeconds})
        ),
        joined AS (
          SELECT time_series.ts, COALESCE(data.value, 0) as raw_value
          FROM time_series
          LEFT JOIN data ON time_series.ts = data.ts
        ),
        cap_threshold AS (
          SELECT PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY raw_value) as cap_hr
          FROM joined WHERE raw_value > 0
        ),
        capped AS (
          SELECT j.ts,
            CASE WHEN c.cap_hr > 0 AND j.raw_value > c.cap_hr THEN c.cap_hr
                 ELSE j.raw_value END as capped_value
          FROM joined j CROSS JOIN cap_threshold c
        )
        SELECT ts,
          AVG(capped_value) OVER (ORDER BY ts ROWS BETWEEN ${smoothingWindow} PRECEDING AND ${smoothingWindow} FOLLOWING) as value
        FROM capped
        ORDER BY ts
      `, [address, worker]);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[API] Erreur chart worker-hashrate:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Chart difficulte reseau
  app.get("/api/chart/network-difficulty", async (req, res) => {
    try {
      const period = (req.query.period as string) || "1d";
      const conf = CHART_PERIODS[period] || CHART_PERIODS["1d"];
      const whereClause = conf.interval ? `WHERE ts > NOW() - INTERVAL '${conf.interval}'` : "";

      let result;
      if (period === "30d") {
        result = await database.query(`
          SELECT
            to_timestamp(floor(extract(epoch from ts) / 14400) * 14400) as ts,
            AVG(difficulty) as value,
            MAX(height) as height
          FROM network_snapshots
          ${whereClause}
          GROUP BY to_timestamp(floor(extract(epoch from ts) / 14400) * 14400)
          ORDER BY ts
        `);
      } else if (period === "1y" || period === "all") {
        result = await database.query(`
          SELECT
            date_trunc('day', ts) as ts,
            AVG(difficulty) as value,
            MAX(height) as height
          FROM network_snapshots
          ${whereClause}
          GROUP BY date_trunc('day', ts)
          ORDER BY ts
        `);
      } else if (period === "7d") {
        result = await database.query(`
          SELECT
            to_timestamp(floor(extract(epoch from ts) / 3600) * 3600) as ts,
            AVG(difficulty) as value,
            MAX(height) as height
          FROM network_snapshots
          ${whereClause}
          GROUP BY to_timestamp(floor(extract(epoch from ts) / 3600) * 3600)
          ORDER BY ts
        `);
      } else {
        // Vue 1J : points de changement de difficulte
        // 1) Point d'ancrage : dernier snapshot AVANT la fenetre (repositionne au debut)
        const beforeResult = await database.query(`
          SELECT difficulty as value, height
          FROM network_snapshots
          WHERE ts < NOW() - INTERVAL '24 hours'
          ORDER BY ts DESC
          LIMIT 1
        `);

        // 2) Changements de diff dans la fenetre
        const changesResult = await database.query(`
          SELECT ts, value, height FROM (
            SELECT
              ts,
              difficulty as value,
              height,
              LAG(difficulty) OVER (ORDER BY ts) as prev_diff
            FROM network_snapshots
            WHERE ts > NOW() - INTERVAL '24 hours'
          ) sub
          WHERE prev_diff IS NULL OR value != prev_diff
          ORDER BY ts
        `);

        // 3) Dernier snapshot connu (pour le point "maintenant")
        const lastResult = await database.query(`
          SELECT difficulty as value, height
          FROM network_snapshots
          ORDER BY ts DESC
          LIMIT 1
        `);

        const data: any[] = [];

        // Ajouter le point d'ancrage au debut de la fenetre
        if (beforeResult.rows.length > 0) {
          data.push({
            ts: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
            value: parseFloat(beforeResult.rows[0].value),
            height: beforeResult.rows[0].height?.toString(),
          });
        }

        // Ajouter les changements
        for (const row of changesResult.rows) {
          data.push(row);
        }

        // Ajouter le point "maintenant" si different du dernier point
        if (lastResult.rows.length > 0) {
          data.push({
            ts: new Date().toISOString(),
            value: parseFloat(lastResult.rows[0].value),
            height: lastResult.rows[0].height?.toString(),
          });
        }

        result = { rows: data };
      }
      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[API] Erreur /api/chart/network-difficulty:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.listen(config.api.port, "127.0.0.1", () => {
    console.log(`[API] Ecoute sur 127.0.0.1:${config.api.port}`);
  });

  return app;
}
