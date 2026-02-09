import React, { useState, useEffect, useCallback } from "react";
import {
  isAdminLoggedIn,
  adminLogin,
  clearAdminToken,
  getAdminDashboard,
  getAdminDiceRolls,
  triggerPayout,
  AdminDashboardData,
  DiceRollsData,
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "dice">("dashboard");
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

  useEffect(() => {
    if (!loggedIn) return;
    fetchData();
    fetchDice();
    const interval = setInterval(() => {
      fetchData();
      fetchDice();
    }, 5000);
    return () => clearInterval(interval);
  }, [loggedIn, fetchData, fetchDice]);

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
