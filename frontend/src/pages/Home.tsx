import React, { useEffect, useState } from "react";
import { getHealth, getStats, getBlocks, HealthData, PoolStats } from "../api";
import PoolChart from "../components/PoolChart";

function StatCard({ icon, label, value, sub, className, valueColor }: { icon: string; label: string; value: string; sub?: string; className?: string; valueColor?: string }) {
  return (
    <div className={"stat-card-new" + (className ? " " + className : "")}>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
      <div className="stat-icon">{icon}</div>
    </div>
  );
}

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

const Home: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);

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

  const lastBlockTime = blocks.length > 0 ? timeAgo(blocks[0].created_at) : "N/A";
  const networkDiff = health?.node?.difficulty || 0;
  const networkHr = parseInt(stats?.nodes?.[0]?.networkhashps || "0");

  const badgeClass = (status: string) => {
    if (status === "confirmed") return "badge badge-confirmed";
    if (status === "orphan") return "badge badge-orphan";
    return "badge badge-pending";
  };

  const poolHr = stats?.hashrate || 0;
  const poolPct = (networkHr > 0 ? ((poolHr / networkHr) * 100).toFixed(2) + "% of network" : "") + " \u00B7 avg 30m";

  return (
    <div>
      {/* Titre */}
      <div className="page-title">
        <h1>KORVEX POOL</h1>
        <p>Ergo Mining Pool for Everyone</p>
      </div>

      {/* Row 1 — 6 stat cards */}
      <div className="stats-grid">
        <StatCard icon="&#127760;" label="Network Hashrate" value={formatHash(networkHr)} sub={"Diff: " + formatDiff(networkDiff)} />
        <StatCard icon="&#9889;" label="Pool Hashrate" value={formatHash(poolHr)} sub={poolPct} />
        <StatCard icon="&#9935;" label="Miners Online" value={String(stats?.minersTotal || 0)} />
        <StatCard icon="&#128296;" label="Workers" value={String(stats?.workersTotal || 0)} />
        <StatCard icon="&#9878;" label="Last Block Found" value={lastBlockTime} sub={stats?.stats?.lastBlockFound ? "#" + stats.stats.lastBlockFound : ""} />
        <StatCard
          icon="&#127922;"
          label="Current Effort"
          value={effortLabel(stats?.currentEffort)}
          valueColor={effortColor(stats?.currentEffort)}
          sub={stats?.poolLuck != null ? "Avg luck: " + stats.poolLuck.toFixed(1) + "%" : "No blocks yet"}
          className="effort-card"
        />
      </div>

      {/* Chart */}
      <PoolChart />

      {/* Row 2 — Stats secondaires : Economics */}
      <div className="secondary-stats-row">
        <div className="secondary-stat">
          <div className="ss-label">ERG Price</div>
          <div className="ss-value-row">
            <svg className="ss-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="15" fill="none" stroke="#FF5722" strokeWidth="1.5" opacity="0.6"/>
              <text x="16" y="21" textAnchor="middle" fill="#FF5722" fontSize="16" fontWeight="700" fontFamily="Arial, sans-serif">&#931;</text>
            </svg>
            <span className="ss-value">${stats?.ergPriceUsd ? stats.ergPriceUsd.toFixed(4) : "—"}</span>
          </div>
        </div>
        <div className="secondary-stat">
          <div className="ss-label">ERG Block Reward</div>
          <div className="ss-value">{stats?.blockReward || 6} ERG</div>
        </div>
        <div className="secondary-stat">
          <div className="ss-label">Pool Fee</div>
          <div className="ss-value">{stats?.poolFee ? (stats.poolFee * 100).toFixed(0) : "1"}%</div>
        </div>
      </div>

      {/* Row 3 — Stats secondaires : Rules */}
      <div className="secondary-stats-row">
        <div className="secondary-stat">
          <div className="ss-label">Min Payout</div>
          <div className="ss-value">1 ERG</div>
        </div>
        <div className="secondary-stat">
          <div className="ss-label">Confirmations</div>
          <div className="ss-value">720 blocks</div>
        </div>
        <div className="secondary-stat tooltip-wrap">
          <div className="ss-label">PPLNS Window</div>
          <div className="ss-value">2&times; Network Diff</div>
          <div className="tooltip">Standard PPLNS window. Prevents pool hopping and rewards long-term miners.</div>
        </div>
      </div>

      {/* Table blocs */}
      {blocks.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 12, color: "#fff" }}>Recent Blocks</h3>
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
                    <span
                      className="effort-badge"
                      style={{ color: effortColor(b.effort_percent) }}
                    >
                      {effortLabel(b.effort_percent)}
                    </span>
                  </td>
                  <td>
                    <span className={badgeClass(b.status)}>{b.status}</span>
                  </td>
                  <td style={{ color: "var(--text-dim)" }}>
                    {new Date(b.created_at).toLocaleString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Home;
