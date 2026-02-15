import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import os from "os";
import { execSync } from "child_process";
import rateLimit from "express-rate-limit";
import { config } from "../config";
import { database } from "../db/database";
import { ergoNode } from "../ergo/node";
import { runConfirmer } from "../payout/confirmer";
import { runPayer } from "../payout/payer";

// Hashrate correction factor for Ergo/Autolykos2
// Compensates for GPU time lost during Autolykos2 dataset generation
// MiningCore uses 1.15x, adjusted to 1.08 for our pool (measured over 8h)
// HiveOS: 2.158 GH/s, Raw pool: 2.01 GH/s -> ideal ratio ~1.074
const ERGO_HASHRATE_CORRECTION = 1.08;

const CHART_PERIODS: Record<string, { interval: string | null; bucketSeconds: number }> = {
  "1d":  { interval: "24 hours",  bucketSeconds: 300 },
  "7d":  { interval: "7 days",    bucketSeconds: 3600 },
  "30d": { interval: "30 days",   bucketSeconds: 14400 },
  "1y":  { interval: "365 days",  bucketSeconds: 86400 },
  "all": { interval: null,        bucketSeconds: 0 },
};

// Allowed periods for miner hashrate chart (no 1y/all because of 90-day retention limit)
const MINER_CHART_PERIODS: Record<string, { interval: string; bucketSeconds: number }> = {
  "1h":  { interval: "1 hour",    bucketSeconds: 60 },
  "1d":  { interval: "24 hours",  bucketSeconds: 300 },
  "7d":  { interval: "7 days",    bucketSeconds: 3600 },
};

// Cache for blockReward (avoids calling the node too often)
let cachedBlockReward: number = 6;
let blockRewardCacheTime: number = 0;
const BLOCK_REWARD_CACHE_TTL = 3600_000; // 1 hour

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

// Cache for ERG price (CoinGecko, refreshed every 5 min)
let cachedErgPriceUsd: number = 0;
let cachedErgPriceBtc: number = 0;
let ergPriceCacheTime: number = 0;
const ERG_PRICE_CACHE_TTL = 300_000; // 5 minutes (avoids HTTP 429 from CoinGecko)

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

// Cache for last network block timestamp (with debug logs)
// We use the moment of DETECTION (not the block's own timestamp)
// so that the progress bar always starts from 0% when a new block is found
let cachedDetectionTs: number | null = null;
let cachedLastBlockHeight: number = 0;

async function getLastBlockTimestampCached(): Promise<number | null> {
  try {
    const info = await ergoNode.getInfo();
    const currentHeight = info.fullHeight || 0;

    // If height changed, use current time as reference
    if (currentHeight !== cachedLastBlockHeight && currentHeight > 0) {
      const oldHeight = cachedLastBlockHeight;
      const oldTs = cachedDetectionTs;
      const now = Date.now();

      // Log the block change
      if (oldHeight > 0) {
        const oldElapsed = oldTs ? Math.floor((now - oldTs) / 1000) : 0;
        console.log(`[BlockProgress] Nouveau bloc! Hauteur: ${oldHeight} -> ${currentHeight}, ` +
          `Ancien elapsed: ${oldElapsed}s (${(oldElapsed/120*100).toFixed(1)}%), Reset a 0%`);
      } else {
        console.log(`[BlockProgress] Init hauteur: ${currentHeight}`);
      }

      cachedLastBlockHeight = currentHeight;
      cachedDetectionTs = now; // We use the detection moment, not the block's timestamp
    }
    return cachedDetectionTs;
  } catch (err) {
    console.error("[BlockProgress] Erreur:", err);
    return cachedDetectionTs;
  }
}

// Timing-safe comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Admin authentication middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!config.admin.password) {
    return res.status(503).json({ error: "Admin non configure" });
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ") || !safeCompare(auth.slice(7), config.admin.password)) {
    return res.status(401).json({ error: "Non autorise" });
  }
  next();
}

function getMiningMode(req: any): string {
  const mode = ((req.query?.mode as string) || 'pplns').toLowerCase();
  return mode === 'solo' ? 'solo' : 'pplns';
}

export function createApi(
  getStratumInfo: (mode?: string) => { sessions: number; miners: string[] },
  getDiceRolls: () => { rolls: any[]; bestRatio: number | null; totalShares: number; blockCandidates: number }
) {
  const app = express();

  // Fix trust proxy for express-rate-limit behind Nginx
  app.set("trust proxy", 1);

  app.use(cors({
    origin: ["https://korvexpool.com", "http://localhost:3000"],
  }));

  // Rate limit: 120 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", apiLimiter);
  app.use(express.json());

  // Health check (enriched in Phase 3)
  app.get("/api/health", async (_req, res) => {
    try {
      // Healthcheck DB
      await database.query("SELECT 1");

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
          // wallet_configured removed for security
        },
      });
    } catch (err) {
      console.error("[API] Erreur /api/health:", err);
      res.status(500).json({ status: "error", message: "Node indisponible" });
    }
  });

  // General stats (MiningPoolStats compatible) + effort/luck + price
  app.get("/api/stats", async (req, res) => {
    try {
      const mode = getMiningMode(req);
      const info = await ergoNode.getInfo();
      const stratum = getStratumInfo(mode);

      // Pool hashrate: same method as chart, filtered by mode
      const hrResult = await database.query(
        `WITH all_buckets AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300) as ts,
            SUM(diff_sum) * ${ERGO_HASHRATE_CORRECTION} / GREATEST(COUNT(*) * 60, 1) as value
          FROM pool_hashrate_1m
          WHERE ts_minute > NOW() - INTERVAL '24 hours' AND mining_mode = $1
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
          LIMIT 12
        )
        SELECT COALESCE(AVG(hr), 0) as avg_hr FROM recent_capped`,
        [mode]
      );
      const hashrate = Math.round(parseFloat(hrResult.rows[0].avg_hr));

      // Blocks found by this mode
      const blocksResult = await database.query(
        "SELECT COUNT(*) as count FROM blocks WHERE mining_mode = $1",
        [mode]
      );
      const totalBlocks = parseInt(blocksResult.rows[0].count) || 0;

      const lastBlockResult = await database.query(
        "SELECT height FROM blocks WHERE mining_mode = $1 ORDER BY height DESC LIMIT 1",
        [mode]
      );
      const lastBlockHeight = lastBlockResult.rows[0]?.height || 0;

      // Current effort and average luck
      let currentEffort: number | null = null;
      let poolLuck: number | null = null;

      if (mode === 'pplns') {
        try {
          const effortFraction = await database.getEffortSinceLastBlock('pplns');
          currentEffort = effortFraction * 100;
        } catch (err) {
          console.error("[API] Erreur calcul effort:", err);
        }

        try {
          poolLuck = await database.getAverageEffort(20);
        } catch (err) {
          console.error("[API] Erreur calcul poolLuck:", err);
        }
      }

      // Block reward with cache
      const blockReward = await getBlockRewardCached();

      // ERG price with cache
      const ergPrice = await getErgPriceCached();

      // Last network block timestamp (for the progress bar)
      const lastNetworkBlockTimestamp = await getLastBlockTimestampCached();

      res.json({
        hashrate,
        minersTotal: stratum.miners.length,
        workersTotal: stratum.sessions,
        maturedTotal: totalBlocks,
        candidatesTotal: 0,
        immatureTotal: 0,
        miningMode: mode,
        nodes: [{
          difficulty: info.difficulty?.toString() || "0",
          height: info.fullHeight?.toString() || "0",
          networkhashps: info.difficulty ? Math.round(info.difficulty / 120).toString() : "0",
        }],
        stats: {
          lastBlockFound: lastBlockHeight,
        },
        currentEffort: currentEffort !== null ? Math.round(currentEffort * 100) / 100 : null,
        poolLuck: poolLuck !== null ? Math.round(poolLuck * 100) / 100 : null,
        blockReward,
        poolFee: mode === 'solo' ? config.solo.fee : config.pool.fee,
        ergPriceUsd: ergPrice.usd,
        ergPriceBtc: ergPrice.btc,
        lastNetworkBlockTimestamp,
        minPayout: 1,
      });
    } catch (err) {
      console.error("[API] Erreur /api/stats:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // ========== LEADERBOARD — MUST be BEFORE /api/miners/:address ==========
  app.get("/api/miners/leaderboard", async (req, res) => {
    try {
      const mode = getMiningMode(req);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const search = (req.query.search as string || "").trim();

      // Sortable columns (whitelist to prevent SQL injection)
      const SORTABLE: Record<string, string> = {
        hashrate_1h: "hashrate_1h",
        hashrate_15m: "hashrate_15m",
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

      // Parameter $1 is the mode, so search starts at $2
      const searchClause = search ? "AND address ILIKE $2" : "";

      const sql = `
        WITH active_miners AS (
          SELECT DISTINCT s.address
          FROM shares s
          WHERE s.created_at > NOW() - INTERVAL '24 hours'
            AND s.mining_mode = $1
            ${search ? "AND s.address ILIKE $2" : ""}
        ),
        miner_info AS (
          SELECT address, last_seen, total_shares, total_blocks, total_paid
          FROM miners
          WHERE address IN (SELECT address FROM active_miners)
        ),
        miner_hr AS (
          SELECT
            address,
            COALESCE(SUM(diff_sum) FILTER (WHERE ts_minute > NOW() - INTERVAL '15 minutes'), 0) * ${ERGO_HASHRATE_CORRECTION} / 900.0 as hashrate_15m,
            COALESCE(SUM(diff_sum) FILTER (WHERE ts_minute > NOW() - INTERVAL '1 hour'), 0) * ${ERGO_HASHRATE_CORRECTION} / 3600.0 as hashrate_1h
          FROM miner_hashrate_1m
          WHERE address IN (SELECT address FROM active_miners)
            AND ts_minute > NOW() - INTERVAL '1 hour'
            AND mining_mode = $1
          GROUP BY address
        ),
        miner_workers AS (
          SELECT address, COUNT(DISTINCT worker) as workers_count
          FROM shares
          WHERE address IN (SELECT address FROM active_miners)
            AND created_at > NOW() - INTERVAL '10 minutes'
            AND mining_mode = $1
          GROUP BY address
        ),
        miner_shares_1h AS (
          SELECT address, COUNT(*) as shares_1h, MAX(created_at) as last_share_at
          FROM shares
          WHERE address IN (SELECT address FROM active_miners)
            AND created_at > NOW() - INTERVAL '1 hour'
            AND mining_mode = $1
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
          ROUND(COALESCE(hr.hashrate_15m, 0))::bigint as hashrate_15m,
          ROUND(COALESCE(hr.hashrate_1h, 0))::bigint as hashrate_1h,
          COALESCE(w.workers_count, 0)::int as workers_count,
          COALESCE(s.shares_1h, 0)::bigint as shares_1h,
          s.last_share_at,
          COALESCE(bal.amount, 0)::bigint as balance_nano,
          COALESCE(p.pending_balance_nano, 0)::bigint as pending_balance_nano,
          COALESCE(paid.total_paid_nano, 0)::bigint as total_paid_nano,
          COALESCE(m.total_blocks, 0)::int as blocks_found
        FROM miner_info m
        LEFT JOIN miner_hr hr ON hr.address = m.address
        LEFT JOIN miner_workers w ON w.address = m.address
        LEFT JOIN miner_shares_1h s ON s.address = m.address
        LEFT JOIN balances bal ON bal.address = m.address
        LEFT JOIN miner_pending p ON p.address = m.address
        LEFT JOIN miner_paid paid ON paid.address = m.address
        ORDER BY ${sortCol} ${sortOrder} NULLS LAST
        LIMIT ${search ? "$3" : "$2"} OFFSET ${search ? "$4" : "$3"}
      `;

      const countSql = `
        SELECT COUNT(DISTINCT address) as total FROM shares
        WHERE created_at > NOW() - INTERVAL '24 hours'
          AND mining_mode = $1
          ${search ? "AND address ILIKE $2" : ""}
      `;

      const dataParams = search ? [mode, search + "%", limit, offset] : [mode, limit, offset];
      const countParams = search ? [mode, search + "%"] : [mode];
      const [dataResult, countResult] = await Promise.all([
        database.query(sql, dataParams),
        database.query(countSql, countParams),
      ]);

      res.json({
        miners: dataResult.rows.map((r: any) => ({
          address: r.address,
          hashrate_15m: parseInt(r.hashrate_15m) || 0,
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

  // List of active miners
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

  // Miner stats (+ balance + payments + per-worker effort + per-worker hashrate)
  app.get("/api/miners/:address", async (req, res) => {
    try {
      const mode = getMiningMode(req);
      const { address } = req.params;

      const miner = await database.query("SELECT * FROM miners WHERE address = $1", [address]);
      if (miner.rows.length === 0) {
        return res.status(404).json({ error: "Mineur non trouve" });
      }

      // Miner hashrate with P90 anti-spike cap, filtered by mode
      const hrResult = await database.query(
        `WITH all_buckets AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300) as ts,
            SUM(diff_sum) * ${ERGO_HASHRATE_CORRECTION} / GREATEST(COUNT(*) * 60, 1) as value
          FROM miner_hashrate_1m
          WHERE address = $1 AND ts_minute > NOW() - INTERVAL '24 hours' AND mining_mode = $2
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
          COALESCE(AVG(hr) FILTER (WHERE ts > NOW() - INTERVAL '15 minutes'), 0) as total_15m,
          COALESCE(AVG(hr) FILTER (WHERE ts > NOW() - INTERVAL '1 hour'), 0) as total_1h
        FROM capped`,
        [address, mode]
      );

      const payments = await database.query(
        "SELECT amount_nano, tx_hash, status, sent_at, created_at FROM payments WHERE address=$1 ORDER BY created_at DESC LIMIT 20",
        [address]
      );

      // Enriched workers: shares 1h + effort since last block + blocks found + per-worker hashrate
      // In SOLO: effort since the MINER's last block (not any SOLO miner's)
      // In PPLNS: effort since the pool's last block
      let lastBlockAt: string;
      if (mode === 'solo') {
        const lastBlockTime = await database.query(
          "SELECT MAX(created_at) as last_block_at FROM blocks WHERE is_orphan = false AND mining_mode = 'solo' AND finder_address = $1",
          [address]
        );
        lastBlockAt = lastBlockTime.rows[0]?.last_block_at || '1970-01-01';
      } else {
        const lastBlockTime = await database.query(
          "SELECT MAX(created_at) as last_block_at FROM blocks WHERE is_orphan = false AND mining_mode = $1",
          [mode]
        );
        lastBlockAt = lastBlockTime.rows[0]?.last_block_at || '1970-01-01';
      }

      // Fetch network difficulty to calculate effort
      let networkDifficulty = 0;
      try {
        const info = await ergoNode.getInfo();
        networkDifficulty = info.difficulty || 0;
      } catch (err) {
        console.error("[API] Erreur fetch networkDifficulty:", err);
      }

      // Workers with 24h shares (to also show yellow/red inactive ones) AND smoothed effort since last block
      const workers = await database.query(
        `SELECT
          w24h.worker,
          w24h.shares,
          w24h.last_share,
          COALESCE(weffort.effort_fraction, 0) as effort_fraction
        FROM (
          SELECT worker, COUNT(*) as shares, MAX(created_at) as last_share
          FROM shares WHERE address=$1 AND created_at > NOW() - INTERVAL '24 hours' AND mining_mode = $3
          GROUP BY worker
        ) w24h
        LEFT JOIN (
          SELECT worker, SUM(share_diff::double precision / NULLIF(block_diff::double precision, 0)) as effort_fraction
          FROM shares WHERE address=$1 AND created_at > $2 AND is_valid = true AND share_diff > 0 AND mining_mode = $3
          GROUP BY worker
        ) weffort ON weffort.worker = w24h.worker`,
        [address, lastBlockAt, mode]
      );

      // Blocks found per worker (lifetime)
      const workerBlocks = await database.query(
        "SELECT finder_worker as worker, COUNT(*) as blocks_found FROM blocks WHERE finder_address=$1 AND is_orphan = false GROUP BY finder_worker",
        [address]
      );
      const blocksMap: Record<string, number> = {};
      for (const row of workerBlocks.rows) {
        if (row.worker) blocksMap[row.worker] = parseInt(row.blocks_found) || 0;
      }

      // Per-worker hashrate with P90 anti-spike cap, filtered by mode
      const workerHr = await database.query(
        `WITH all_buckets AS (
          SELECT
            worker,
            to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300) as ts,
            SUM(diff_sum) * ${ERGO_HASHRATE_CORRECTION} / GREATEST(COUNT(*) * 60, 1) as value
          FROM worker_hashrate_1m
          WHERE address = $1 AND ts_minute > NOW() - INTERVAL '24 hours' AND mining_mode = $2
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
          COALESCE(AVG(hr) FILTER (WHERE ts > NOW() - INTERVAL '15 minutes'), 0) as hashrate_15m,
          COALESCE(AVG(hr) FILTER (WHERE ts > NOW() - INTERVAL '1 hour'), 0) as hashrate_1h
        FROM capped
        GROUP BY worker`,
        [address, mode]
      );
      const workerHrMap: Record<string, { hashrate_15m: number; hashrate_1h: number }> = {};
      for (const row of workerHr.rows) {
        workerHrMap[row.worker] = {
          hashrate_15m: Math.round(parseFloat(row.hashrate_15m) || 0),
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

      // SOLO-specific stats
      let soloEffortPercent: number | null = null;
      let soloBlocksFound = 0;
      if (mode === 'solo') {
        try {
          const soloEffort = await database.getEffortForMinerSolo(address);
          soloEffortPercent = soloEffort * 100;
        } catch {}
        try {
          const soloBlocksResult = await database.query(
            "SELECT COUNT(*) as count FROM blocks WHERE finder_address = $1 AND mining_mode = 'solo'",
            [address]
          );
          soloBlocksFound = parseInt(soloBlocksResult.rows[0].count) || 0;
        } catch {}
      }

      res.json({
        ...miner.rows[0],
        miningMode: mode,
        hashrate_15m: Math.round(parseFloat(hrResult.rows[0].total_15m) || 0),
        hashrate_1h: Math.round(parseFloat(hrResult.rows[0].total_1h) || 0),
        balance: balance.toString(),
        pending_balance: pendingBalance.toString(),
        total_paid_nano: totalPaidNano.toString(),
        soloEffortPercent: soloEffortPercent !== null ? Math.round(soloEffortPercent * 100) / 100 : null,
        soloBlocksFound,
        payments: payments.rows.map((p: any) => ({
          amount_nano: (p.amount_nano || "0").toString(),
          amount_erg: p.amount_nano ? (Number(BigInt(p.amount_nano)) / 1e9).toFixed(9) : "0",
          tx_hash: p.tx_hash,
          status: p.status,
          sent_at: p.sent_at,
          created_at: p.created_at,
        })),
        workers: workers.rows.map((w: any) => {
          const hr = workerHrMap[w.worker] || { hashrate_15m: 0, hashrate_1h: 0 };
          return {
            worker: w.worker,
            shares: parseInt(w.shares) || 0,
            last_share: w.last_share,
            effort_percent: Math.round(parseFloat(w.effort_fraction) * 10000) / 100,
            blocks_found: blocksMap[w.worker] || 0,
            hashrate_15m: hr.hashrate_15m,
            hashrate_1h: hr.hashrate_1h,
          };
        }),
      });
    } catch (err) {
      console.error("[API] Erreur miners/:address:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Recent blocks
  app.get("/api/blocks", async (req, res) => {
    try {
      const mode = getMiningMode(req);
      const result = await database.query(
        "SELECT * FROM blocks WHERE mining_mode = $1 ORDER BY height DESC LIMIT 50",
        [mode]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[API] Erreur /api/blocks:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // PPLNS distribution for a block
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

  // Recent payments
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

  // Pool hashrate chart
  app.get("/api/chart/pool-hashrate", async (req, res) => {
    try {
      const mode = getMiningMode(req);
      const period = (req.query.period as string) || "1d";
      const conf = CHART_PERIODS[period] || CHART_PERIODS["1d"];

      let bucketSeconds = conf.bucketSeconds;

      if (period === "all") {
        const oldest = await database.query(
          "SELECT MIN(ts_minute) as oldest FROM pool_hashrate_1m WHERE mining_mode = $1",
          [mode]
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

      // Smoothing: moving average window (ROWS BETWEEN N PRECEDING AND N FOLLOWING)
      // Pool smoothing: 1d: 4 (40 min), 7d: 0 (1h raw), others: 1
      const smoothingWindow = period === "1d" ? 4 : period === "7d" ? 0 : 1;

      // Anti-spike cap BEFORE smoothing: we compute the 75th percentile over the entire period
      // and cap each bucket at that value. P75 represents the "normally high" hashrate
      // without being polluted by spikes. Anything above is vardiff noise.
      // Then we apply smoothing on the already-capped data.

      const result = await database.query(`
        WITH first_data AS (
          SELECT COALESCE(MIN(ts_minute), NOW()) as first_ts FROM pool_hashrate_1m WHERE mining_mode = $1
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
            SUM(diff_sum) * ${ERGO_HASHRATE_CORRECTION} / GREATEST(COUNT(*) * 60, 1) as value
          FROM pool_hashrate_1m
          WHERE ts_minute >= GREATEST(${periodStart}, (SELECT first_ts FROM first_data)) AND mining_mode = $1
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
      `, [mode]);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[API] Erreur chart pool-hashrate:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Miner hashrate chart (filtered by address)
  app.get("/api/chart/miner-hashrate/:address", async (req, res) => {
    try {
      const mode = getMiningMode(req);
      const { address } = req.params;
      const period = (req.query.period as string) || "1d";
      const conf = MINER_CHART_PERIODS[period] || MINER_CHART_PERIODS["1d"];
      const bucketSeconds = conf.bucketSeconds;

      // Smoothing: 1h: 6 (12 min), 1d: 4 (40 min), 7d: 0 (1h raw), others: 1 (12h)
      const smoothingWindow = period === "1h" ? 6 : period === "1d" ? 4 : period === "7d" ? 0 : 1;
      const smoothingClause = "AVG(raw_value) OVER (ORDER BY ts ROWS BETWEEN " + smoothingWindow + " PRECEDING AND " + smoothingWindow + " FOLLOWING)";

      const result = await database.query(`
        WITH first_data AS (
          SELECT COALESCE(MIN(ts_minute), NOW()) as first_ts
          FROM miner_hashrate_1m WHERE address = $1 AND mining_mode = $2
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
            SUM(diff_sum) * ${ERGO_HASHRATE_CORRECTION} / GREATEST(COUNT(*) * 60, 1) as value
          FROM miner_hashrate_1m
          WHERE address = $1 AND mining_mode = $2
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
      `, [address, mode]);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[API] Erreur chart miner-hashrate:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Worker hashrate chart (filtered by address + worker)
  app.get("/api/chart/worker-hashrate/:address/:worker", async (req, res) => {
    try {
      const mode = getMiningMode(req);
      const { address, worker } = req.params;
      const period = (req.query.period as string) || "1d";
      const conf = MINER_CHART_PERIODS[period] || MINER_CHART_PERIODS["1d"];
      const bucketSeconds = conf.bucketSeconds;

      // Smoothing: 1h: 6 (12 min), 1d: 4 (40 min), 7d: 0 (1h raw), others: 1 (12h)
      const smoothingWindow = period === "1h" ? 6 : period === "1d" ? 4 : period === "7d" ? 0 : 1;
      const smoothingClause = "AVG(raw_value) OVER (ORDER BY ts ROWS BETWEEN " + smoothingWindow + " PRECEDING AND " + smoothingWindow + " FOLLOWING)";

      const result = await database.query(`
        WITH first_data AS (
          SELECT COALESCE(MIN(ts_minute), NOW()) as first_ts
          FROM worker_hashrate_1m WHERE address = $1 AND worker = $2 AND mining_mode = $3
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
            SUM(diff_sum) * ${ERGO_HASHRATE_CORRECTION} / GREATEST(COUNT(*) * 60, 1) as value
          FROM worker_hashrate_1m
          WHERE address = $1 AND worker = $2 AND mining_mode = $3
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
      `, [address, worker, mode]);

      res.json({ period, data: result.rows });
    } catch (err) {
      console.error("[API] Erreur chart worker-hashrate:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Network difficulty chart
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
        // 1D view: difficulty change points
        // 1) Anchor point: last snapshot BEFORE the window (repositioned at the start)
        const beforeResult = await database.query(`
          SELECT difficulty as value, height
          FROM network_snapshots
          WHERE ts < NOW() - INTERVAL '24 hours'
          ORDER BY ts DESC
          LIMIT 1
        `);

        // 2) Difficulty changes within the window
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

        // 3) Last known snapshot (for the "now" point)
        const lastResult = await database.query(`
          SELECT difficulty as value, height
          FROM network_snapshots
          ORDER BY ts DESC
          LIMIT 1
        `);

        const data: any[] = [];

        // Add the anchor point at the start of the window
        if (beforeResult.rows.length > 0) {
          data.push({
            ts: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
            value: parseFloat(beforeResult.rows[0].value),
            height: beforeResult.rows[0].height?.toString(),
          });
        }

        // Add the changes
        for (const row of changesResult.rows) {
          data.push(row);
        }

        // Add the "now" point if different from the last point
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

  // ========== ADMIN ENDPOINTS ==========

  // Admin login
  app.post("/api/admin/login", (req, res) => {
    if (!config.admin.password) {
      return res.status(503).json({ error: "Admin non configure" });
    }
    const { password } = req.body;
    if (!password || typeof password !== "string" || !safeCompare(password, config.admin.password)) {
      return res.status(401).json({ error: "Mot de passe incorrect" });
    }
    res.json({ success: true });
  });

  // Admin dashboard - all info in a single call
  app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
    try {
      // Node info
      const info = await ergoNode.getInfo();
      const synced = await ergoNode.isSynced();

      // Pool info
      const stratum = getStratumInfo();
      const hrResult = await database.query(
        `WITH all_buckets AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts_minute) / 300) * 300) as ts,
            SUM(diff_sum) * ${ERGO_HASHRATE_CORRECTION} / GREATEST(COUNT(*) * 60, 1) as value
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
      const poolHashrate = Math.round(parseFloat(hrResult.rows[0].avg_hr));

      // Wallet balance
      let walletConfirmed = 0;
      let walletUnconfirmed = 0;
      try {
        // /wallet/balances returns { balance, height, assets }
        const walletRes = await fetch(config.ergoNode.url + "/wallet/balances", {
          headers: { "api_key": config.ergoNode.apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (walletRes.ok) {
          const walletData = await walletRes.json() as any;
          walletConfirmed = (walletData.balance || 0) / 1e9;
        }
        // /wallet/balances/withUnconfirmed returns the balance including mempool txs
        const walletResUnconf = await fetch(config.ergoNode.url + "/wallet/balances/withUnconfirmed", {
          headers: { "api_key": config.ergoNode.apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (walletResUnconf.ok) {
          const walletDataUnconf = await walletResUnconf.json() as any;
          const totalWithUnconf = (walletDataUnconf.balance || 0) / 1e9;
          walletUnconfirmed = totalWithUnconf - walletConfirmed;
        }
      } catch (err) {
        console.error("[Admin] Erreur wallet balance:", err);
      }

      // Pending payments (miners eligible for payout)
      const pendingPayments = await database.query(
        `SELECT address, amount FROM balances WHERE amount >= ${config.pool.minPayoutNano.toString()}`
      );

      // Recent payments
      const recentPayments = await database.getRecentPayments(20);

      // Blocks stats
      const blocksStats = await database.query(`
        SELECT
          COUNT(*) FILTER (WHERE reward_distributed = false AND is_orphan = false AND reward_nano > 0) as pending,
          COUNT(*) FILTER (WHERE reward_distributed = true) as confirmed,
          COUNT(*) FILTER (WHERE is_orphan = true) as orphan,
          COUNT(*) as total
        FROM blocks
      `);

      // Alerts: payments with 'unknown' status
      const unknownPayments = await database.query(
        "SELECT address, amount_nano, tx_hash, created_at FROM payments WHERE status = 'unknown' ORDER BY created_at DESC"
      );

      // Database stats
      const dbStats = await database.query(`
        SELECT
          (SELECT COUNT(*) FROM shares WHERE created_at > NOW() - INTERVAL '1 hour') as shares_1h,
          (SELECT COUNT(*) FROM shares WHERE created_at > NOW() - INTERVAL '24 hours') as shares_24h,
          (SELECT COUNT(DISTINCT address) FROM miners WHERE last_seen > NOW() - INTERVAL '24 hours') as active_miners,
          (SELECT pg_size_pretty(pg_database_size(current_database()))) as db_size
      `);

      res.json({
        timestamp: new Date().toISOString(),
        node: {
          fullHeight: info.fullHeight || 0,
          headersHeight: info.headersHeight || 0,
          difficulty: info.difficulty || 0,
          peersCount: info.peersCount || 0,
          synced,
        },
        pool: {
          hashrate: poolHashrate,
          sessions: stratum.sessions,
          miners: stratum.miners,
          minersCount: stratum.miners.length,
        },
        wallet: {
          confirmed: walletConfirmed,
          unconfirmed: walletUnconfirmed,
        },
        pendingPayments: pendingPayments.rows.map((r: any) => ({
          address: r.address,
          amount_nano: r.amount.toString(),
          amount_erg: (Number(BigInt(r.amount)) / 1e9).toFixed(4),
        })),
        recentPayments: recentPayments.map((p: any) => ({
          address: p.address,
          amount_nano: (p.amount_nano || "0").toString(),
          amount_erg: p.amount_nano ? (Number(BigInt(p.amount_nano)) / 1e9).toFixed(4) : "0",
          tx_hash: p.tx_hash,
          status: p.status,
          sent_at: p.sent_at,
          created_at: p.created_at,
        })),
        blocks: {
          pending: parseInt(blocksStats.rows[0].pending) || 0,
          confirmed: parseInt(blocksStats.rows[0].confirmed) || 0,
          orphan: parseInt(blocksStats.rows[0].orphan) || 0,
          total: parseInt(blocksStats.rows[0].total) || 0,
        },
        alerts: {
          unknownPayments: unknownPayments.rows.map((r: any) => ({
            address: r.address,
            amount_nano: (r.amount_nano || "0").toString(),
            tx_hash: r.tx_hash,
            created_at: r.created_at,
          })),
        },
        database: {
          shares_1h: parseInt(dbStats.rows[0].shares_1h) || 0,
          shares_24h: parseInt(dbStats.rows[0].shares_24h) || 0,
          active_miners: parseInt(dbStats.rows[0].active_miners) || 0,
          db_size: dbStats.rows[0].db_size || "N/A",
        },
        config: {
          fee: config.pool.fee,
          minPayout: Number(config.pool.minPayoutNano) / 1e9,
          confirmations: config.payout.confirmations,
          payoutInterval: config.payout.intervalMinutes,
          pplnsFactor: config.pplns.factor,
        },
      });
    } catch (err) {
      console.error("[Admin] Erreur dashboard:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Dice Rolls — last 100 shares with their fh/b ratio (casino style)
  app.get("/api/admin/dice-rolls", requireAdmin, async (_req, res) => {
    try {
      res.json(getDiceRolls());
    } catch (err) {
      console.error("[Admin] Erreur dice-rolls:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Financial stats — total mined, paid, pool revenue, earnings/payments per day (30d)
  app.get("/api/admin/financial-stats", requireAdmin, async (_req, res) => {
    try {
      // Total ERG mined (sum of reward_nano from all confirmed blocks)
      const minedResult = await database.query(`
        SELECT COALESCE(SUM(reward_nano), 0) as total_mined
        FROM blocks WHERE reward_distributed = true
      `);
      const totalMinedNano = BigInt(minedResult.rows[0].total_mined || "0");
      const totalMinedErg = Number(totalMinedNano) / 1e9;

      // Total ERG paid (sum of sent payments)
      const paidResult = await database.query(`
        SELECT COALESCE(SUM(amount_nano), 0) as total_paid
        FROM payments WHERE status = 'sent'
      `);
      const totalPaidNano = BigInt(paidResult.rows[0].total_paid || "0");
      const totalPaidErg = Number(totalPaidNano) / 1e9;

      // Pool revenue (collected fees) = totalMined * fee
      const poolRevenueErg = totalMinedErg * config.pool.fee;

      // Earnings per day (confirmed blocks, last 30 days)
      const dailyMined = await database.query(`
        SELECT
          DATE(found_at) as day,
          COALESCE(SUM(reward_nano), 0) as mined_nano,
          COUNT(*) as blocks_count
        FROM blocks
        WHERE reward_distributed = true
          AND found_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(found_at)
        ORDER BY day ASC
      `);

      // Payments per day (last 30 days)
      const dailyPaid = await database.query(`
        SELECT
          DATE(sent_at) as day,
          COALESCE(SUM(amount_nano), 0) as paid_nano,
          COUNT(*) as payments_count
        FROM payments
        WHERE status = 'sent'
          AND sent_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(sent_at)
        ORDER BY day ASC
      `);

      res.json({
        totalMinedErg: parseFloat(totalMinedErg.toFixed(4)),
        totalPaidErg: parseFloat(totalPaidErg.toFixed(4)),
        poolRevenueErg: parseFloat(poolRevenueErg.toFixed(4)),
        poolFeePercent: config.pool.fee * 100,
        dailyMined: dailyMined.rows.map((r: any) => ({
          day: r.day,
          erg: Number(BigInt(r.mined_nano || "0")) / 1e9,
          blocks: parseInt(r.blocks_count) || 0,
        })),
        dailyPaid: dailyPaid.rows.map((r: any) => ({
          day: r.day,
          erg: Number(BigInt(r.paid_nano || "0")) / 1e9,
          payments: parseInt(r.payments_count) || 0,
        })),
      });
    } catch (err) {
      console.error("[Admin] Erreur financial-stats:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // System stats — CPU, RAM, disk, Ergo node, pool uptime
  app.get("/api/admin/system-stats", requireAdmin, async (_req, res) => {
    try {
      // CPU
      const loadAvg = os.loadavg(); // [1min, 5min, 15min]
      const cpuCount = os.cpus().length;

      // RAM
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // Disk (via df)
      let diskTotal = 0;
      let diskUsed = 0;
      let diskFree = 0;
      try {
        const dfOutput = execSync("df -B1 / | tail -1", { timeout: 5000 }).toString().trim();
        const parts = dfOutput.split(/\s+/);
        if (parts.length >= 4) {
          diskTotal = parseInt(parts[1]) || 0;
          diskUsed = parseInt(parts[2]) || 0;
          diskFree = parseInt(parts[3]) || 0;
        }
      } catch {}

      // Ergo node
      let nodeInfo = { synced: false, fullHeight: 0, headersHeight: 0, peersCount: 0, latencyMs: 0 };
      try {
        const start = Date.now();
        const info = await ergoNode.getInfo();
        const latency = Date.now() - start;
        const synced = await ergoNode.isSynced();
        nodeInfo = {
          synced,
          fullHeight: info.fullHeight || 0,
          headersHeight: info.headersHeight || 0,
          peersCount: info.peersCount || 0,
          latencyMs: latency,
        };
      } catch {}

      // Pool uptime
      const uptimeSeconds = process.uptime();

      res.json({
        cpu: {
          loadAvg1m: parseFloat(loadAvg[0].toFixed(2)),
          loadAvg5m: parseFloat(loadAvg[1].toFixed(2)),
          loadAvg15m: parseFloat(loadAvg[2].toFixed(2)),
          cores: cpuCount,
          usagePercent: parseFloat(((loadAvg[0] / cpuCount) * 100).toFixed(1)),
        },
        memory: {
          totalBytes: totalMem,
          usedBytes: usedMem,
          freeBytes: freeMem,
          usagePercent: parseFloat(((usedMem / totalMem) * 100).toFixed(1)),
        },
        disk: {
          totalBytes: diskTotal,
          usedBytes: diskUsed,
          freeBytes: diskFree,
          usagePercent: diskTotal > 0 ? parseFloat(((diskUsed / diskTotal) * 100).toFixed(1)) : 0,
        },
        node: nodeInfo,
        pool: {
          uptimeSeconds: Math.floor(uptimeSeconds),
        },
      });
    } catch (err) {
      console.error("[Admin] Erreur system-stats:", err);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Manual payout trigger
  app.post("/api/admin/trigger-payout", requireAdmin, async (_req, res) => {
    try {
      console.log("[Admin] Declenchement manuel du cycle de paiement");
      const confirmResult = await runConfirmer();
      const payResult = await runPayer();
      res.json({
        success: true,
        confirmer: confirmResult,
        payer: payResult,
      });
    } catch (err) {
      console.error("[Admin] Erreur trigger payout:", err);
      res.status(500).json({ error: "Erreur lors du paiement" });
    }
  });

  app.listen(config.api.port, "127.0.0.1", () => {
    console.log(`[API] Ecoute sur 127.0.0.1:${config.api.port}`);
  });

  return app;
}
