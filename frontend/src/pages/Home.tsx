import React, { useEffect, useState } from "react";
import { getHealth, getStats, getBlocks, HealthData, PoolStats } from "../api";
import PoolChart from "../components/PoolChart";
import { useMiningMode } from "../hooks/useMiningMode";

// ==================== HELPERS ====================

const formatHash = (h: number) => {
  if (h >= 1e12) return (h / 1e12).toFixed(2) + " TH/s";
  if (h >= 1e9) return (h / 1e9).toFixed(2) + " GH/s";
  if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
  if (h >= 1e3) return (h / 1e3).toFixed(2) + " KH/s";
  return (h || 0) + " H/s";
};

const formatDiff = (d: number) => {
  if (d >= 1e15) return (d / 1e15).toFixed(2) + " P";
  if (d >= 1e12) return (d / 1e12).toFixed(2) + " T";
  if (d >= 1e9) return (d / 1e9).toFixed(2) + " G";
  if (d >= 1e6) return (d / 1e6).toFixed(2) + " M";
  return (d || 0).toString();
};

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  return days + "d ago";
};

const effortColor = (effort: number | null | undefined): string => {
  if (effort == null) return "var(--text-dim)";
  if (effort < 50) return "#22c55e";
  if (effort < 100) return "#4ade80";
  if (effort < 150) return "#facc15";
  if (effort < 200) return "#f97316";
  return "#ef4444";
};

const effortLabel = (effort: number | null | undefined): string => {
  if (effort == null) return "N/A";
  return effort.toFixed(1) + "%";
};

// ==================== BLOCKS TABLE ====================

const BlocksTable: React.FC<{ blocks: any[] }> = ({ blocks }) => {
  const badgeClass = (status: string) => {
    if (status === "confirmed") return "badge badge-confirmed";
    if (status === "orphan") return "badge badge-orphan";
    return "badge badge-pending";
  };

  if (blocks.length === 0) return null;

  return (
    <table className="blocks-table">
      <thead>
        <tr>
          <th>Height</th>
          <th>Miner</th>
          <th>Effort</th>
          <th>Status</th>
          <th>Found</th>
        </tr>
      </thead>
      <tbody>
        {blocks.slice(0, 10).map((b) => (
          <tr key={b.height}>
            <td style={{ color: "var(--accent)" }}>{b.height}</td>
            <td style={{ fontFamily: "monospace", fontSize: 13 }}>
              {b.finder_address ? b.finder_address.slice(0, 12) + "..." : "-"}
            </td>
            <td>
              <span className="effort-badge" style={{ color: effortColor(b.effort_percent) }}>
                {effortLabel(b.effort_percent)}
              </span>
            </td>
            <td><span className={badgeClass(b.status)}>{b.status}</span></td>
            <td style={{ color: "var(--text-dim)" }}>
              {new Date(b.created_at).toLocaleString("fr-FR")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ==================== LAYOUT ====================

const HomeLayout: React.FC<{ stats: PoolStats | null; health: HealthData | null; blocks: any[]; mode: string }> = ({ stats, health, blocks, mode }) => {
  const networkDiff = health?.node?.difficulty || 0;
  const networkHr = parseInt(stats?.nodes?.[0]?.networkhashps || "0");
  const poolHr = stats?.hashrate || 0;
  const lastBlockTime = blocks.length > 0 ? timeAgo(blocks[0].created_at) : "N/A";

  return (
    <div className="layout-modern">
      {/* Header */}
      <div className="modern-header">
        <h1>KORVEX POOL</h1>
        <p>{mode === 'solo' ? 'Solo Mining - 100% Block Reward' : 'Ergo Mining Pool for Everyone'}</p>
      </div>

      {/* Stats en grille 3 colonnes */}
      <div className="modern-stats-grid">
        <div className="modern-stat-card">
          <div className="msc-label">{mode === 'solo' ? 'Solo Hashrate' : 'Pool Hashrate'}</div>
          <div className="msc-value">{formatHash(poolHr)}</div>
        </div>
        <div className="modern-stat-card">
          <div className="msc-label">Miners / Workers</div>
          <div className="msc-value">{stats?.minersTotal || 0} / {stats?.workersTotal || 0}</div>
        </div>
        <div className="modern-stat-card">
          <div className="msc-label">{mode === 'solo' ? 'Blocks Found' : 'Current Effort'}</div>
          <div className="msc-value" style={mode === 'solo' ? {} : { color: effortColor(stats?.currentEffort) }}>
            {mode === 'solo' ? (stats?.maturedTotal || 0) : effortLabel(stats?.currentEffort)}
          </div>
        </div>
      </div>

      {/* Graphique */}
      <div className="modern-chart">
        <PoolChart mode={mode} />
      </div>

      {/* 2 cards info cote a cote */}
      <div className="modern-info-row-grid">
        <div className="modern-info-card">
          <div className="modern-info-title">Network</div>
          <div className="modern-info-row">
            <span>Hashrate</span>
            <span>{formatHash(networkHr)}</span>
          </div>
          <div className="modern-info-row">
            <span>Difficulty</span>
            <span>{formatDiff(networkDiff)}</span>
          </div>
          <div className="modern-info-row">
            <span>ERG Price</span>
            <span>${stats?.ergPriceUsd?.toFixed(4) || "—"}</span>
          </div>
          <div className="modern-info-row">
            <span>Block Reward</span>
            <span>{stats?.blockReward || 6} ERG</span>
          </div>
        </div>

        <div className="modern-info-card">
          <div className="modern-info-title">Pool Info</div>
          <div className="modern-info-row">
            <span>Last Block Found</span>
            <span>{lastBlockTime}</span>
          </div>
          <div className="modern-info-row">
            <span>Pool Fee</span>
            <span>{mode === 'solo' ? '1.5%' : '1%'}</span>
          </div>
          <div className="modern-info-row">
            <span>Min Payout</span>
            <span>1 ERG</span>
          </div>
          <div className="modern-info-row">
            <span>Mode</span>
            <span>{mode === 'solo' ? 'SOLO' : 'PPLNS'}</span>
          </div>
          <div className="modern-info-row">
            <span>Confirmations</span>
            <span>720 blocks</span>
          </div>
        </div>
      </div>

      {/* Table des blocs si disponible */}
      {blocks.length > 0 && (
        <div className="modern-blocks-card modern-blocks-full">
          <div className="modern-info-title">Recent Blocks</div>
          <BlocksTable blocks={blocks} />
        </div>
      )}
    </div>
  );
};

// ==================== MAIN COMPONENT ====================

const Home: React.FC = () => {
  const mode = useMiningMode();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      getHealth().then(setHealth).catch(() => {});
      getStats(mode).then(setStats).catch(() => {});
      getBlocks(mode).then(setBlocks).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [mode]);

  return (
    <div className="home-page layout-modern-grid">
      <HomeLayout stats={stats} health={health} blocks={blocks} mode={mode} />
    </div>
  );
};

export default Home;
