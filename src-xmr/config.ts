import dotenv from "dotenv";
dotenv.config();

export const xmrConfig = {
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "korvex_pool",
    user: process.env.DB_USER || "ergo",
    password: process.env.DB_PASS || (() => { throw new Error("DB_PASS environment variable is required"); })(),
  },
  daemon: {
    url: process.env.XMR_DAEMON_URL || "http://127.0.0.1:18081",
  },
  walletRpc: {
    url: process.env.XMR_WALLET_RPC_URL || "http://127.0.0.1:18082",
  },
  stratum: {
    port: parseInt(process.env.XMR_STRATUM_PORT || "3418"),
  },
  api: {
    port: parseInt(process.env.XMR_API_PORT || "4100"),
  },
  pool: {
    fee: parseFloat(process.env.XMR_POOL_FEE || "0.01"),
    address: process.env.XMR_POOL_ADDRESS || "",
    // 0.1 XMR = 100_000_000_000 piconero
    minPayoutPico: BigInt(process.env.XMR_MIN_PAYOUT_PICO || "100000000000"),
  },
  pplns: {
    factor: parseInt(process.env.XMR_PPLNS_FACTOR || "2"),
  },
  payout: {
    confirmations: parseInt(process.env.XMR_PAYOUT_CONFIRMATIONS || "60"),
    maxPerBatch: 16, // Monero max 16 outputs par transaction
    maxRetries: 3,
    intervalMinutes: parseInt(process.env.XMR_PAYOUT_INTERVAL_MINUTES || "30"),
  },
  admin: {
    password: process.env.ADMIN_PASSWORD || "",
  },
};
