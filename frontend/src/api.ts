const API_BASE = "/api";

async function fetchJson(path: string) {
  const res = await fetch(API_BASE + "/" + path);
  if (!res.ok) throw new Error("API error: " + res.status);
  return res.json();
}

export interface HealthData {
  status: string;
  node: {
    synced: boolean;
    headersHeight: number;
    fullHeight: number;
    peersCount: number;
    difficulty: number;
  };
  stratum: { sessions: number; miners: string[] };
}

export interface PoolStats {
  hashrate: number;
  minersTotal: number;
  workersTotal: number;
  maturedTotal: number;
  candidatesTotal: number;
  immatureTotal: number;
  nodes: Array<{
    difficulty: string;
    height: string;
    networkhashps: string;
  }>;
  stats: {
    lastBlockFound: number;
  };
  currentEffort: number | null;
  poolLuck: number | null;
  blockReward: number;
  poolFee: number;
  ergPriceUsd: number;
  ergPriceBtc: number;
  lastNetworkBlockTimestamp: number | null;
}

export interface ChartPoint { ts: string; value: number; height?: number; }
export interface ChartData { period: string; data: ChartPoint[]; }

export interface LeaderboardMiner {
  address: string;
  hashrate_15m: number;
  hashrate_1h: number;
  workers_count: number;
  shares_1h: number;
  last_share_at: string | null;
  balance_nano: string;
  pending_balance_nano: string;
  total_paid_nano: string;
  blocks_found: number;
}

export interface LeaderboardResponse {
  miners: LeaderboardMiner[];
  total: number;
}

function modeParam(mode?: string): string {
  return mode ? "mode=" + mode : "";
}

function appendMode(qs: string, mode?: string): string {
  if (!mode) return qs;
  return qs + (qs.includes("?") ? "&" : "?") + "mode=" + mode;
}

export const getHealth = (): Promise<HealthData> => fetchJson("health");
export const getStats = (mode?: string): Promise<PoolStats> => fetchJson("stats" + (mode ? "?mode=" + mode : ""));
export const getMiners = (): Promise<any[]> => fetchJson("miners");
export const getMiner = (addr: string, mode?: string): Promise<any> =>
  fetchJson("miners/" + encodeURIComponent(addr) + (mode ? "?mode=" + mode : ""));
export const getBlocks = (mode?: string): Promise<any[]> => fetchJson("blocks" + (mode ? "?mode=" + mode : ""));
export const getChartPoolHashrate = (p: string, mode?: string): Promise<ChartData> =>
  fetchJson(appendMode("chart/pool-hashrate?period=" + p, mode));
export const getChartNetworkDifficulty = (p: string): Promise<ChartData> => fetchJson("chart/network-difficulty?period=" + p);
export const getChartMinerHashrate = (address: string, p: string, mode?: string): Promise<ChartData> =>
  fetchJson(appendMode("chart/miner-hashrate/" + encodeURIComponent(address) + "?period=" + p, mode));
export const getChartWorkerHashrate = (address: string, worker: string, p: string, mode?: string): Promise<ChartData> =>
  fetchJson(appendMode("chart/worker-hashrate/" + encodeURIComponent(address) + "/" + encodeURIComponent(worker) + "?period=" + p, mode));

export const getLeaderboard = (params: {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
  search?: string;
  mode?: string;
}): Promise<LeaderboardResponse> => {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  if (params.sort) qs.set("sort", params.sort);
  if (params.order) qs.set("order", params.order);
  if (params.search) qs.set("search", params.search);
  if (params.mode) qs.set("mode", params.mode);
  return fetchJson("miners/leaderboard?" + qs.toString());
};

// ========== ADMIN ==========

const ADMIN_TOKEN_KEY = "korvex_admin_token";

export function setAdminToken(password: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, password);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function isAdminLoggedIn(): boolean {
  return !!localStorage.getItem(ADMIN_TOKEN_KEY);
}

async function fetchJsonAdmin(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const res = await fetch(API_BASE + "/" + path, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
  });
  if (res.status === 401) {
    clearAdminToken();
    throw new Error("Session expiree");
  }
  if (!res.ok) throw new Error("API error: " + res.status);
  return res.json();
}

export async function adminLogin(password: string): Promise<boolean> {
  const res = await fetch(API_BASE + "/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.ok) {
    setAdminToken(password);
    return true;
  }
  return false;
}

export interface AdminDashboardData {
  timestamp: string;
  node: {
    fullHeight: number;
    headersHeight: number;
    difficulty: number;
    peersCount: number;
    synced: boolean;
  };
  pool: {
    hashrate: number;
    sessions: number;
    miners: string[];
    minersCount: number;
  };
  wallet: {
    confirmed: number;
    unconfirmed: number;
  };
  pendingPayments: Array<{
    address: string;
    amount_nano: string;
    amount_erg: string;
  }>;
  recentPayments: Array<{
    address: string;
    amount_nano: string;
    amount_erg: string;
    tx_hash: string;
    status: string;
    sent_at: string;
    created_at: string;
  }>;
  blocks: {
    pending: number;
    confirmed: number;
    orphan: number;
    total: number;
  };
  alerts: {
    unknownPayments: Array<{
      address: string;
      amount_nano: string;
      tx_hash: string;
      created_at: string;
    }>;
  };
  database: {
    shares_1h: number;
    shares_24h: number;
    active_miners: number;
    db_size: string;
  };
  config: {
    fee: number;
    minPayout: number;
    confirmations: number;
    payoutInterval: number;
    pplnsFactor: number;
  };
}

export const getAdminDashboard = (): Promise<AdminDashboardData> =>
  fetchJsonAdmin("admin/dashboard");

export interface DiceRoll {
  timestamp: string;
  worker: string;
  address: string;
  ratio: number;
  isBlock: boolean;
  height: number;
  vardiff: number;
}

export interface DiceRollsData {
  rolls: DiceRoll[];
  bestRatio: number | null;
  totalShares: number;
  blockCandidates: number;
}

export const getAdminDiceRolls = (): Promise<DiceRollsData> =>
  fetchJsonAdmin("admin/dice-rolls");

export const triggerPayout = (): Promise<any> =>
  fetchJsonAdmin("admin/trigger-payout", { method: "POST" });

// ========== ADMIN FINANCIAL + SYSTEM STATS ==========

export interface FinancialStats {
  totalMinedErg: number;
  totalPaidErg: number;
  poolRevenueErg: number;
  poolFeePercent: number;
  dailyMined: Array<{ day: string; erg: number; blocks: number }>;
  dailyPaid: Array<{ day: string; erg: number; payments: number }>;
}

export interface SystemStats {
  cpu: {
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
    cores: number;
    usagePercent: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  };
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  };
  node: {
    synced: boolean;
    fullHeight: number;
    headersHeight: number;
    peersCount: number;
    latencyMs: number;
  };
  pool: {
    uptimeSeconds: number;
  };
}

export const getAdminFinancialStats = (): Promise<FinancialStats> =>
  fetchJsonAdmin("admin/financial-stats");

export const getAdminSystemStats = (): Promise<SystemStats> =>
  fetchJsonAdmin("admin/system-stats");
