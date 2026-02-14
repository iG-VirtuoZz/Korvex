import React, { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  isAdminLoggedIn,
  adminLogin,
  clearAdminToken,
  getAdminDashboard,
  getAdminDiceRolls,
  getAdminFinancialStats,
  getAdminSystemStats,
  triggerPayout,
  AdminDashboardData,
  DiceRollsData,
  FinancialStats,
  SystemStats,
} from "../api";

function formatHashrate(h: number): string {
  if (h >= 1e12) return (h / 1e12).toFixed(2) + " TH/s";
  if (h >= 1e9) return (h / 1e9).toFixed(2) + " GH/s";
  if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
  if (h >= 1e3) return (h / 1e3).toFixed(2) + " KH/s";
  return h.toFixed(0) + " H/s";
}

function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return addr.slice(0, 8) + "..." + addr.slice(-8);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

function formatDifficulty(d: number): string {
  if (d >= 1e15) return (d / 1e15).toFixed(2) + " PH";
  if (d >= 1e12) return (d / 1e12).toFixed(2) + " TH";
  if (d >= 1e9) return (d / 1e9).toFixed(2) + " GH";
  if (d >= 1e6) return (d / 1e6).toFixed(2) + " MH";
  return d.toFixed(0);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + " TB";
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  return (bytes / 1e3).toFixed(0) + " KB";
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDay(dayStr: string): string {
  const d = new Date(dayStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ========== RESOURCE BAR ==========
const ResourceBar: React.FC<{ percent: number; color: string }> = ({ percent, color }) => (
  <div className="admin-resource-bar">
    <div
      className="admin-resource-bar-fill"
      style={{
        width: `${Math.min(percent, 100)}%`,
        background: color,
      }}
    />
  </div>
);

// ========== LOGIN ==========
const AdminLogin: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await adminLogin(password);
      if (ok) {
        onLogin();
      } else {
        setError("Mot de passe incorrect");
      }
    } catch {
      setError("Erreur de connexion");
    }
    setLoading(false);
  };

  return (
    <div className="admin-login-wrapper">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <div className="admin-login-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h2 className="admin-login-title">KORVEX ADMIN</h2>
        {error && <div className="admin-login-error">{error}</div>}
        <input
          type="password"
          className="admin-login-input"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button type="submit" className="admin-login-btn" disabled={loading || !password}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
};

// ========== DASHBOARD ==========
const AdminDashboard: React.FC = () => {
  const [loggedIn, setLoggedIn] = useState(isAdminLoggedIn());
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [diceData, setDiceData] = useState<DiceRollsData | null>(null);
  const [financialData, setFinancialData] = useState<FinancialStats | null>(null);
  const [systemData, setSystemData] = useState<SystemStats | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "dice" | "financial" | "vps">("dashboard");
  const [error, setError] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const d = await getAdminDashboard();
      setData(d);
      setError("");
    } catch (err: any) {
      if (err.message === "Session expiree") {
        setLoggedIn(false);
      } else {
        setError("Erreur chargement dashboard");
      }
    }
  }, []);

  const fetchDice = useCallback(async () => {
    try {
      const d = await getAdminDiceRolls();
      setDiceData(d);
    } catch {}
  }, []);

  const fetchFinancial = useCallback(async () => {
    try {
      const d = await getAdminFinancialStats();
      setFinancialData(d);
    } catch {}
  }, []);

  const fetchSystem = useCallback(async () => {
    try {
      const d = await getAdminSystemStats();
      setSystemData(d);
    } catch {}
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    fetchData();
    fetchDice();
    fetchFinancial();
    fetchSystem();

    const mainInterval = setInterval(() => {
      fetchData();
      fetchDice();
    }, 5000);

    const financialInterval = setInterval(fetchFinancial, 30000);
    const systemInterval = setInterval(fetchSystem, 10000);

    return () => {
      clearInterval(mainInterval);
      clearInterval(financialInterval);
      clearInterval(systemInterval);
    };
  }, [loggedIn, fetchData, fetchDice, fetchFinancial, fetchSystem]);

  const handleLogout = () => {
    clearAdminToken();
    setLoggedIn(false);
    setData(null);
  };

  const handleTriggerPayout = async () => {
    if (!window.confirm("Declencher le cycle de paiement maintenant ?")) return;
    setPayoutLoading(true);
    setPayoutResult(null);
    try {
      const result = await triggerPayout();
      setPayoutResult(
        `Confirmer: ${result.confirmer.confirmed} confirme(s), ${result.confirmer.orphaned} orphelin(s) | ` +
        `Payer: ${result.payer.sent} envoye(s), ${result.payer.failed} echoue(s)`
      );
      fetchData();
    } catch {
      setPayoutResult("Erreur lors du declenchement");
    }
    setPayoutLoading(false);
  };

  if (!loggedIn) {
    return <AdminLogin onLogin={() => setLoggedIn(true)} />;
  }

  if (!data) {
    return (
      <div className="admin-loading">
        {error || "Chargement..."}
      </div>
    );
  }

  const hasAlerts = data.alerts.unknownPayments.length > 0;

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="admin-header">
        <h1 className="admin-title">ADMIN DASHBOARD</h1>
        <div className="admin-header-right">
          <div className="admin-tabs">
            <button
              className={"admin-tab" + (activeTab === "dashboard" ? " admin-tab-active" : "")}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={"admin-tab" + (activeTab === "dice" ? " admin-tab-active" : "")}
              onClick={() => setActiveTab("dice")}
            >
              Dice Rolls
            </button>
            <button
              className={"admin-tab" + (activeTab === "financial" ? " admin-tab-active" : "")}
              onClick={() => setActiveTab("financial")}
            >
              Financial
            </button>
            <button
              className={"admin-tab" + (activeTab === "vps" ? " admin-tab-active" : "")}
              onClick={() => setActiveTab("vps")}
            >
              VPS Monitor
            </button>
          </div>
          <span className="admin-timestamp">
            {new Date(data.timestamp).toLocaleTimeString()}
          </span>
          <button className="admin-logout" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className="admin-alert-banner admin-alert-red">
          <strong>ALERTE :</strong> {data.alerts.unknownPayments.length} paiement(s) en status "unknown" - Intervention manuelle requise !
        </div>
      )}

      {error && (
        <div className="admin-alert-banner admin-alert-yellow">{error}</div>
      )}

      {/* ========== FINANCIAL TAB ========== */}
      {activeTab === "financial" && financialData && (
        <div className="admin-section">
          {/* Stat cards */}
          <div className="admin-stats-grid-4">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Total ERG Miné</div>
              <div className="admin-stat-value" style={{ color: "#22c55e" }}>
                {financialData.totalMinedErg.toFixed(4)} ERG
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Total Payé</div>
              <div className="admin-stat-value">
                {financialData.totalPaidErg.toFixed(4)} ERG
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Revenus Pool (Fee {financialData.poolFeePercent}%)</div>
              <div className="admin-stat-value" style={{ color: "#f97316" }}>
                {financialData.poolRevenueErg.toFixed(4)} ERG
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Non distribué</div>
              <div className="admin-stat-value" style={{ color: "#fbbf24" }}>
                {(financialData.totalMinedErg - financialData.totalPaidErg - financialData.poolRevenueErg).toFixed(4)} ERG
              </div>
            </div>
          </div>

          {/* Graphique gains par jour */}
          {financialData.dailyMined.length > 0 && (
            <div className="admin-info-card">
              <h3 className="admin-card-title">Gains par jour (30j)</h3>
              <div className="admin-chart-container">
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={financialData.dailyMined}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" tickFormatter={formatDay} stroke="#a1a1aa" fontSize={11} />
                    <YAxis stroke="#a1a1aa" fontSize={11} tickFormatter={(v: number) => v.toFixed(1)} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                      labelFormatter={(l: any) => new Date(l).toLocaleDateString()}
                      formatter={(value: any) => [Number(value).toFixed(4) + " ERG", "Miné"]}
                    />
                    <Area type="monotone" dataKey="erg" stroke="#22c55e" fill="rgba(34,197,94,0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Graphique paiements par jour */}
          {financialData.dailyPaid.length > 0 && (
            <div className="admin-info-card">
              <h3 className="admin-card-title">Paiements par jour (30j)</h3>
              <div className="admin-chart-container">
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={financialData.dailyPaid}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" tickFormatter={formatDay} stroke="#a1a1aa" fontSize={11} />
                    <YAxis stroke="#a1a1aa" fontSize={11} tickFormatter={(v: number) => v.toFixed(1)} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                      labelFormatter={(l: any) => new Date(l).toLocaleDateString()}
                      formatter={(value: any) => [Number(value).toFixed(4) + " ERG", "Payé"]}
                    />
                    <Area type="monotone" dataKey="erg" stroke="#f97316" fill="rgba(249,115,22,0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {financialData.dailyMined.length === 0 && financialData.dailyPaid.length === 0 && (
            <div style={{ color: "#a1a1aa", textAlign: "center", padding: "48px" }}>
              Aucune donnée financière sur les 30 derniers jours
            </div>
          )}
        </div>
      )}

      {activeTab === "financial" && !financialData && (
        <div style={{ color: "#a1a1aa", textAlign: "center", padding: "48px" }}>Chargement des données financières...</div>
      )}

      {/* ========== VPS MONITOR TAB ========== */}
      {activeTab === "vps" && systemData && (
        <div className="admin-section">
          <div className="admin-stats-grid-4">
            {/* CPU */}
            <div className="admin-stat-card">
              <div className="admin-stat-label">CPU ({systemData.cpu.cores} cores)</div>
              <div className="admin-stat-value" style={{ color: systemData.cpu.usagePercent > 80 ? "#ef4444" : systemData.cpu.usagePercent > 50 ? "#fbbf24" : "#22c55e" }}>
                {systemData.cpu.usagePercent}%
              </div>
              <ResourceBar
                percent={systemData.cpu.usagePercent}
                color={systemData.cpu.usagePercent > 80 ? "#ef4444" : systemData.cpu.usagePercent > 50 ? "#fbbf24" : "#22c55e"}
              />
              <div className="admin-stat-sub">Load: {systemData.cpu.loadAvg1m} / {systemData.cpu.loadAvg5m} / {systemData.cpu.loadAvg15m}</div>
            </div>

            {/* RAM */}
            <div className="admin-stat-card">
              <div className="admin-stat-label">RAM</div>
              <div className="admin-stat-value" style={{ color: systemData.memory.usagePercent > 85 ? "#ef4444" : systemData.memory.usagePercent > 60 ? "#fbbf24" : "#22c55e" }}>
                {systemData.memory.usagePercent}%
              </div>
              <ResourceBar
                percent={systemData.memory.usagePercent}
                color={systemData.memory.usagePercent > 85 ? "#ef4444" : systemData.memory.usagePercent > 60 ? "#fbbf24" : "#22c55e"}
              />
              <div className="admin-stat-sub">{formatBytes(systemData.memory.usedBytes)} / {formatBytes(systemData.memory.totalBytes)}</div>
            </div>

            {/* Disque */}
            <div className="admin-stat-card">
              <div className="admin-stat-label">Disque</div>
              <div className="admin-stat-value" style={{ color: systemData.disk.usagePercent > 90 ? "#ef4444" : systemData.disk.usagePercent > 70 ? "#fbbf24" : "#22c55e" }}>
                {systemData.disk.usagePercent}%
              </div>
              <ResourceBar
                percent={systemData.disk.usagePercent}
                color={systemData.disk.usagePercent > 90 ? "#ef4444" : systemData.disk.usagePercent > 70 ? "#fbbf24" : "#22c55e"}
              />
              <div className="admin-stat-sub">{formatBytes(systemData.disk.usedBytes)} / {formatBytes(systemData.disk.totalBytes)}</div>
            </div>

            {/* Uptime */}
            <div className="admin-stat-card">
              <div className="admin-stat-label">Pool Uptime</div>
              <div className="admin-stat-value" style={{ color: "#22c55e" }}>
                {formatUptime(systemData.pool.uptimeSeconds)}
              </div>
            </div>
          </div>

          {/* Noeud Ergo */}
          <div className="admin-info-card">
            <h3 className="admin-card-title">Nœud Ergo</h3>
            <div className="admin-info-grid-2" style={{ margin: 0 }}>
              <div>
                <div className="admin-info-row">
                  <span>Statut</span>
                  <span className={systemData.node.synced ? "admin-badge-green" : "admin-badge-red"}>
                    {systemData.node.synced ? "Synced" : "Syncing"}
                  </span>
                </div>
                <div className="admin-info-row">
                  <span>Hauteur</span>
                  <span>{systemData.node.fullHeight.toLocaleString()}</span>
                </div>
                <div className="admin-info-row">
                  <span>Headers</span>
                  <span>{systemData.node.headersHeight.toLocaleString()}</span>
                </div>
              </div>
              <div>
                <div className="admin-info-row">
                  <span>Pairs</span>
                  <span>{systemData.node.peersCount}</span>
                </div>
                <div className="admin-info-row">
                  <span>Latence API</span>
                  <span style={{ color: systemData.node.latencyMs > 500 ? "#ef4444" : systemData.node.latencyMs > 200 ? "#fbbf24" : "#22c55e" }}>
                    {systemData.node.latencyMs} ms
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "vps" && !systemData && (
        <div style={{ color: "#a1a1aa", textAlign: "center", padding: "48px" }}>Chargement des données VPS...</div>
      )}

      {/* ========== DICE ROLLS TAB ========== */}
      {activeTab === "dice" && diceData && (
        <div className="admin-section">
          {/* Stats cards */}
          <div className="admin-stats-grid-4">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Best Ratio</div>
              <div className="admin-stat-value" style={{ color: diceData.bestRatio !== null && diceData.bestRatio < 100 ? "#22c55e" : "#f97316" }}>
                {diceData.bestRatio !== null ? diceData.bestRatio < 10 ? diceData.bestRatio.toFixed(2) : Math.round(diceData.bestRatio).toLocaleString() : "-"}
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Total Shares</div>
              <div className="admin-stat-value">{diceData.totalShares.toLocaleString()}</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Block Candidates</div>
              <div className="admin-stat-value" style={{ color: diceData.blockCandidates > 0 ? "#22c55e" : "#a1a1aa" }}>
                {diceData.blockCandidates}
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Target</div>
              <div className="admin-stat-value" style={{ color: "#22c55e" }}>&lt; 1.0</div>
            </div>
          </div>

          <h3 className="admin-section-title">Last 100 Dice Rolls (fh / b)</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time</th>
                  <th>Worker</th>
                  <th>Height</th>
                  <th>Vardiff</th>
                  <th>Ratio (fh/b)</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {diceData.rolls.map((roll, i) => {
                  const ratioColor = roll.isBlock ? "#22c55e" :
                    roll.ratio < 100 ? "#22c55e" :
                    roll.ratio < 1000 ? "#84cc16" :
                    roll.ratio < 5000 ? "#facc15" :
                    roll.ratio < 10000 ? "#f97316" : "#a1a1aa";
                  return (
                    <tr key={i} style={roll.isBlock ? { background: "rgba(34,197,94,0.15)" } : undefined}>
                      <td style={{ color: "#a1a1aa" }}>{i + 1}</td>
                      <td>{new Date(roll.timestamp).toLocaleTimeString()}</td>
                      <td style={{ color: "#f97316" }}>{roll.worker}</td>
                      <td>{roll.height.toLocaleString()}</td>
                      <td>{roll.vardiff.toLocaleString()}</td>
                      <td style={{ color: ratioColor, fontWeight: roll.ratio < 1000 ? "bold" : "normal", fontFamily: "monospace" }}>
                        {roll.ratio < 10 ? roll.ratio.toFixed(2) : Math.round(roll.ratio).toLocaleString()}
                      </td>
                      <td>
                        {roll.isBlock ? (
                          <span className="admin-badge-green" style={{ fontWeight: "bold" }}>BLOCK!</span>
                        ) : roll.ratio < 100 ? (
                          <span style={{ color: "#22c55e" }}>Close!</span>
                        ) : roll.ratio < 1000 ? (
                          <span style={{ color: "#84cc16" }}>Near</span>
                        ) : (
                          <span style={{ color: "#a1a1aa" }}>Miss</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {diceData.rolls.length === 0 && (
                  <tr><td colSpan={7} style={{ color: "#a1a1aa", textAlign: "center", padding: "24px" }}>En attente des premieres shares...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "dice" && !diceData && (
        <div style={{ color: "#a1a1aa", textAlign: "center", padding: "48px" }}>Chargement des dice rolls...</div>
      )}

      {/* ========== DASHBOARD TAB ========== */}
      {activeTab === "dashboard" && <>

      {/* Stat cards */}
      <div className="admin-stats-grid-4">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Pool Hashrate</div>
          <div className="admin-stat-value">{formatHashrate(data.pool.hashrate)}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Miners / Sessions</div>
          <div className="admin-stat-value">{data.pool.minersCount} / {data.pool.sessions}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Wallet Balance</div>
          <div className="admin-stat-value">{data.wallet.confirmed.toFixed(4)} ERG</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Blocks Found</div>
          <div className="admin-stat-value">{data.blocks.total}</div>
        </div>
      </div>

      {/* Info cards */}
      <div className="admin-info-grid-3">
        {/* Ergo Node */}
        <div className="admin-info-card">
          <h3 className="admin-card-title">Ergo Node</h3>
          <div className="admin-info-row">
            <span>Status</span>
            <span className={data.node.synced ? "admin-badge-green" : "admin-badge-red"}>
              {data.node.synced ? "Synced" : "Syncing"}
            </span>
          </div>
          <div className="admin-info-row">
            <span>Height</span>
            <span>{data.node.fullHeight.toLocaleString()}</span>
          </div>
          <div className="admin-info-row">
            <span>Headers</span>
            <span>{data.node.headersHeight.toLocaleString()}</span>
          </div>
          <div className="admin-info-row">
            <span>Difficulty</span>
            <span>{formatDifficulty(data.node.difficulty)}</span>
          </div>
          <div className="admin-info-row">
            <span>Peers</span>
            <span>{data.node.peersCount}</span>
          </div>
        </div>

        {/* Pool Overview */}
        <div className="admin-info-card">
          <h3 className="admin-card-title">Pool Overview</h3>
          <div className="admin-info-row">
            <span>Connected Miners</span>
            <span>{data.pool.minersCount}</span>
          </div>
          <div className="admin-info-row">
            <span>Stratum Sessions</span>
            <span>{data.pool.sessions}</span>
          </div>
          {data.pool.miners.map((m) => (
            <div className="admin-info-row" key={m}>
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>{shortAddr(m)}</span>
            </div>
          ))}
        </div>

        {/* Wallet */}
        <div className="admin-info-card">
          <h3 className="admin-card-title">Wallet Balance</h3>
          <div className="admin-info-row">
            <span>Confirmed</span>
            <span style={{ color: "#22c55e" }}>{data.wallet.confirmed.toFixed(4)} ERG</span>
          </div>
          <div className="admin-info-row">
            <span>Unconfirmed</span>
            <span>{data.wallet.unconfirmed.toFixed(4)} ERG</span>
          </div>
        </div>
      </div>

      {/* Blocks + Database */}
      <div className="admin-info-grid-2">
        <div className="admin-info-card">
          <h3 className="admin-card-title">Blocks</h3>
          <div className="admin-info-row">
            <span>Pending</span>
            <span className="admin-badge-yellow">{data.blocks.pending}</span>
          </div>
          <div className="admin-info-row">
            <span>Confirmed</span>
            <span className="admin-badge-green">{data.blocks.confirmed}</span>
          </div>
          <div className="admin-info-row">
            <span>Orphan</span>
            <span className={data.blocks.orphan > 0 ? "admin-badge-red" : ""}>{data.blocks.orphan}</span>
          </div>
          <div className="admin-info-row">
            <span>Total</span>
            <span>{data.blocks.total}</span>
          </div>
        </div>

        <div className="admin-info-card">
          <h3 className="admin-card-title">Database</h3>
          <div className="admin-info-row">
            <span>Shares (1h)</span>
            <span>{data.database.shares_1h.toLocaleString()}</span>
          </div>
          <div className="admin-info-row">
            <span>Shares (24h)</span>
            <span>{data.database.shares_24h.toLocaleString()}</span>
          </div>
          <div className="admin-info-row">
            <span>Active Miners</span>
            <span>{data.database.active_miners}</span>
          </div>
          <div className="admin-info-row">
            <span>DB Size</span>
            <span>{data.database.db_size}</span>
          </div>
        </div>
      </div>

      {/* Pending Payments */}
      {data.pendingPayments.length > 0 && (
        <div className="admin-section">
          <h3 className="admin-section-title">Pending Payments ({data.pendingPayments.length})</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.pendingPayments.map((p, i) => (
                  <tr key={i}>
                    <td className="admin-mono">{shortAddr(p.address)}</td>
                    <td>{p.amount_erg} ERG</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Payments */}
      <div className="admin-section">
        <h3 className="admin-section-title">Recent Payments ({data.recentPayments.length})</h3>
        {data.recentPayments.length === 0 ? (
          <p style={{ color: "#a1a1aa", padding: "16px" }}>Aucun paiement</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>TX Hash</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((p, i) => (
                  <tr key={i}>
                    <td className="admin-mono">{shortAddr(p.address)}</td>
                    <td>{p.amount_erg} ERG</td>
                    <td>
                      <span className={
                        p.status === "sent" ? "admin-badge-green" :
                        p.status === "unknown" ? "admin-badge-red" :
                        "admin-badge-yellow"
                      }>
                        {p.status}
                      </span>
                    </td>
                    <td className="admin-mono">
                      {p.tx_hash ? shortAddr(p.tx_hash) : "-"}
                    </td>
                    <td>{p.sent_at ? timeAgo(p.sent_at) : timeAgo(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Controls */}
      <div className="admin-section">
        <h3 className="admin-section-title">Manual Controls</h3>
        <div className="admin-info-card">
          <div className="admin-controls-row">
            <button
              className="admin-action-btn"
              onClick={handleTriggerPayout}
              disabled={payoutLoading}
            >
              {payoutLoading ? "En cours..." : "Declencher le cycle de paiement"}
            </button>
            <div className="admin-config-summary">
              <span>Fee: {(data.config.fee * 100).toFixed(0)}%</span>
              <span>Min Payout: {data.config.minPayout} ERG</span>
              <span>Confirmations: {data.config.confirmations}</span>
              <span>Interval: {data.config.payoutInterval}min</span>
              <span>PPLNS: x{data.config.pplnsFactor}</span>
            </div>
          </div>
          {payoutResult && (
            <div className="admin-payout-result">{payoutResult}</div>
          )}
        </div>
      </div>

      </>}
    </div>
  );
};

export default AdminDashboard;
