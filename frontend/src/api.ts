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

export const getHealth = (): Promise<HealthData> => fetchJson("health");
export const getStats = (): Promise<PoolStats> => fetchJson("stats");
export const getMiners = (): Promise<any[]> => fetchJson("miners");
export const getMiner = (addr: string): Promise<any> => fetchJson("miners/" + encodeURIComponent(addr));
export const getBlocks = (): Promise<any[]> => fetchJson("blocks");
export const getChartPoolHashrate = (p: string): Promise<ChartData> => fetchJson("chart/pool-hashrate?period=" + p);
export const getChartNetworkDifficulty = (p: string): Promise<ChartData> => fetchJson("chart/network-difficulty?period=" + p);
export const getChartMinerHashrate = (address: string, p: string): Promise<ChartData> =>
  fetchJson("chart/miner-hashrate/" + encodeURIComponent(address) + "?period=" + p);
export const getChartWorkerHashrate = (address: string, worker: string, p: string): Promise<ChartData> =>
  fetchJson("chart/worker-hashrate/" + encodeURIComponent(address) + "/" + encodeURIComponent(worker) + "?period=" + p);

export const getLeaderboard = (params: {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
  search?: string;
}): Promise<LeaderboardResponse> => {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  if (params.sort) qs.set("sort", params.sort);
  if (params.order) qs.set("order", params.order);
  if (params.search) qs.set("search", params.search);
  return fetchJson("miners/leaderboard?" + qs.toString());
};
