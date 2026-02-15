import dotenv from "dotenv";
dotenv.config();

export const config = {
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "korvex_pool",
    user: process.env.DB_USER || "ergo",
    password: process.env.DB_PASS || (() => { throw new Error("DB_PASS environment variable is required"); })(),
  },
  ergoNode: {
    url: process.env.ERGO_NODE_URL || "http://127.0.0.1:9053",
    apiKey: process.env.ERGO_NODE_API_KEY || "",
  },
  stratum: {
    port: parseInt(process.env.STRATUM_PORT || "3416"),
    soloPort: parseInt(process.env.STRATUM_SOLO_PORT || "3417"),
  },
  solo: {
    fee: parseFloat(process.env.SOLO_FEE || "0.015"),
  },
  api: {
    port: parseInt(process.env.API_PORT || "4000"),
  },
  pool: {
    fee: parseFloat(process.env.POOL_FEE || "0.01"),
    address: process.env.POOL_ADDRESS || "",
    minPayoutNano: BigInt(process.env.MIN_PAYOUT_NANO || "1000000000"),
  },
  pplns: {
    factor: parseInt(process.env.PPLNS_FACTOR || "2"),
  },
  payout: {
    confirmations: parseInt(process.env.PAYOUT_CONFIRMATIONS || "720"),
    maxPerBatch: parseInt(process.env.PAYOUT_MAX_PER_BATCH || "20"),
    maxRetries: parseInt(process.env.PAYOUT_MAX_RETRIES || "3"),
    intervalMinutes: parseInt(process.env.PAYOUT_INTERVAL_MINUTES || "10"),
    walletPass: process.env.WALLET_PASS || "",
  },
  admin: {
    password: process.env.ADMIN_PASSWORD || "",
  },
};
