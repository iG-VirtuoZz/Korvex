import React, { useEffect, useState } from "react";
import { getHealth, getStats, getBlocks, HealthData, PoolStats } from "../api";
import PoolChart from "../components/PoolChart";

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

// ==================== LAYOUT: CLEAN CARDS ====================
// Structure aeree, cards bien separees, simplicite

const LayoutCleanCards: React.FC<{ stats: PoolStats | null; health: HealthData | null; blocks: any[] }> = ({ stats, health, blocks }) => {
  const networkDiff = health?.node?.difficulty || 0;
  const networkHr = parseInt(stats?.nodes?.[0]?.networkhashps || "0");
  const poolHr = stats?.hashrate || 0;
  const lastBlockTime = blocks.length > 0 ? timeAgo(blocks[0].created_at) : "N/A";

  return (
    <div className="layout-clean">
      {/* Header simple */}
      <div className="clean-header">
        <h1>KORVEX POOL</h1>
        <p>Ergo Mining Pool</p>
      </div>

      {/* 2 cards principales cote a cote */}
      <div className="clean-main-row">
        <div className="clean-card">
          <div className="clean-card-title">Pool</div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Hashrate</span>
            <span className="clean-stat-value">{formatHash(poolHr)}</span>
          </div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Miners</span>
            <span className="clean-stat-value">{stats?.minersTotal || 0}</span>
          </div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Workers</span>
            <span className="clean-stat-value">{stats?.workersTotal || 0}</span>
          </div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Effort</span>
            <span className="clean-stat-value" style={{ color: effortColor(stats?.currentEffort) }}>
              {effortLabel(stats?.currentEffort)}
            </span>
          </div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Last Block</span>
            <span className="clean-stat-value">{lastBlockTime}</span>
          </div>
        </div>

        <div className="clean-card">
          <div className="clean-card-title">Network</div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Hashrate</span>
            <span className="clean-stat-value">{formatHash(networkHr)}</span>
          </div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Difficulty</span>
            <span className="clean-stat-value">{formatDiff(networkDiff)}</span>
          </div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">ERG Price</span>
            <span className="clean-stat-value">${stats?.ergPriceUsd?.toFixed(4) || "—"}</span>
          </div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Block Reward</span>
            <span className="clean-stat-value">{stats?.blockReward || 6} ERG</span>
          </div>
          <div className="clean-stat-row">
            <span className="clean-stat-label">Pool Fee</span>
            <span className="clean-stat-value">1%</span>
          </div>
        </div>
      </div>

      {/* Graphique */}
      <div className="clean-chart">
        <PoolChart />
      </div>

      {/* Table des blocs */}
      {blocks.length > 0 && (
        <div className="clean-card clean-blocks">
          <div className="clean-card-title">Recent Blocks</div>
          <BlocksTable blocks={blocks} />
        </div>
      )}
    </div>
  );
};

// ==================== LAYOUT: DASHBOARD PRO ====================
// 2 grandes sections Pool/Network avec graphique integre

const LayoutDashboardPro: React.FC<{ stats: PoolStats | null; health: HealthData | null; blocks: any[] }> = ({ stats, health, blocks }) => {
  const networkDiff = health?.node?.difficulty || 0;
  const networkHr = parseInt(stats?.nodes?.[0]?.networkhashps || "0");
  const poolHr = stats?.hashrate || 0;
  const lastBlockTime = blocks.length > 0 ? timeAgo(blocks[0].created_at) : "N/A";

  return (
    <div className="layout-dashboard">
      {/* Header avec titre */}
      <div className="dashboard-header">
        <h1>KORVEX</h1>
      </div>

      {/* Section principale : Graphique + Stats */}
      <div className="dashboard-main">
        <div className="dashboard-chart-section">
          <PoolChart />
        </div>
        <div className="dashboard-stats-section">
          <div className="dashboard-stats-group">
            <div className="dashboard-group-title">Pool Stats</div>
            <div className="dashboard-stat">
              <span className="ds-label">Hashrate</span>
              <span className="ds-value">{formatHash(poolHr)}</span>
            </div>
            <div className="dashboard-stat">
              <span className="ds-label">Miners</span>
              <span className="ds-value">{stats?.minersTotal || 0}</span>
            </div>
            <div className="dashboard-stat">
              <span className="ds-label">Workers</span>
              <span className="ds-value">{stats?.workersTotal || 0}</span>
            </div>
            <div className="dashboard-stat">
              <span className="ds-label">Effort</span>
              <span className="ds-value" style={{ color: effortColor(stats?.currentEffort) }}>
                {effortLabel(stats?.currentEffort)}
              </span>
            </div>
            <div className="dashboard-stat">
              <span className="ds-label">Last Block</span>
              <span className="ds-value">{lastBlockTime}</span>
            </div>
          </div>

          <div className="dashboard-stats-group">
            <div className="dashboard-group-title">Network</div>
            <div className="dashboard-stat">
              <span className="ds-label">Hashrate</span>
              <span className="ds-value">{formatHash(networkHr)}</span>
            </div>
            <div className="dashboard-stat">
              <span className="ds-label">Difficulty</span>
              <span className="ds-value">{formatDiff(networkDiff)}</span>
            </div>
            <div className="dashboard-stat">
              <span className="ds-label">ERG Price</span>
              <span className="ds-value">${stats?.ergPriceUsd?.toFixed(4) || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table des blocs */}
      {blocks.length > 0 && (
        <div className="dashboard-blocks">
          <div className="dashboard-group-title">Recent Blocks</div>
          <BlocksTable blocks={blocks} />
        </div>
      )}
    </div>
  );
};

// ==================== LAYOUT: MODERN GRID ====================
// Grille moderne avec stats individuelles et equilibre

const LayoutModernGrid: React.FC<{ stats: PoolStats | null; health: HealthData | null; blocks: any[] }> = ({ stats, health, blocks }) => {
  const networkDiff = health?.node?.difficulty || 0;
  const networkHr = parseInt(stats?.nodes?.[0]?.networkhashps || "0");
  const poolHr = stats?.hashrate || 0;
  const lastBlockTime = blocks.length > 0 ? timeAgo(blocks[0].created_at) : "N/A";

  return (
    <div className="layout-modern">
      {/* Header */}
      <div className="modern-header">
        <h1>KORVEX POOL</h1>
        <p>Ergo Mining Pool for Everyone</p>
      </div>

      {/* Stats en grille 3 colonnes */}
      <div className="modern-stats-grid">
        <div className="modern-stat-card">
          <div className="msc-label">Pool Hashrate</div>
          <div className="msc-value">{formatHash(poolHr)}</div>
        </div>
        <div className="modern-stat-card">
          <div className="msc-label">Miners / Workers</div>
          <div className="msc-value">{stats?.minersTotal || 0} / {stats?.workersTotal || 0}</div>
        </div>
        <div className="modern-stat-card">
          <div className="msc-label">Current Effort</div>
          <div className="msc-value" style={{ color: effortColor(stats?.currentEffort) }}>
            {effortLabel(stats?.currentEffort)}
          </div>
        </div>
      </div>

      {/* Graphique */}
      <div className="modern-chart">
        <PoolChart />
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
            <span>1%</span>
          </div>
          <div className="modern-info-row">
            <span>Min Payout</span>
            <span>1 ERG</span>
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
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [layout, setLayout] = useState<string>("clean-cards");

  useEffect(() => {
    const load = () => {
      getHealth().then(setHealth).catch(() => {});
      getStats().then(setStats).catch(() => {});
      getBlocks().then(setBlocks).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  // Observer le changement de layout
  useEffect(() => {
    const updateLayout = () => {
      const current = document.documentElement.getAttribute("data-layout") || "clean-cards";
      setLayout(current);
    };
    updateLayout();
    const observer = new MutationObserver(updateLayout);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-layout"] });
    return () => observer.disconnect();
  }, []);

  const layoutProps = { stats, health, blocks };

  return (
    <div className={"home-page layout-" + layout}>
      {layout === "clean-cards" && <LayoutCleanCards {...layoutProps} />}
      {layout === "dashboard-pro" && <LayoutDashboardPro {...layoutProps} />}
      {layout === "modern-grid" && <LayoutModernGrid {...layoutProps} />}
    </div>
  );
};

export default Home;
