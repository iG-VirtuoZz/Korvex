import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getMiner, getStats, PoolStats } from "../api";
import EarningsCalculator from "../components/EarningsCalculator";
import MinerChart from "../components/MinerChart";

const STORAGE_KEY = "korvex_miner_address";

const formatHash = (h: number | undefined | null) => {
  if (!h || h <= 0) return "\u2014";
  if (h >= 1e12) return (h / 1e12).toFixed(2) + " TH/s";
  if (h >= 1e9) return (h / 1e9).toFixed(2) + " GH/s";
  if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
  if (h >= 1e3) return (h / 1e3).toFixed(2) + " KH/s";
  return h + " H/s";
};

const formatErg = (nanoStr: string | undefined | null) => {
  if (!nanoStr || nanoStr === "0") return "0 ERG";
  const val = Number(BigInt(nanoStr)) / 1e9;
  if (val < 0.0001) return "< 0.0001 ERG";
  return val.toFixed(4) + " ERG";
};

const timeAgo = (dateStr: string | null | undefined) => {
  if (!dateStr) return "\u2014";
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return sec + "s ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + " min ago";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "h ago";
  return Math.floor(hr / 24) + "d ago";
};

const effortColor = (effort: number | null) => {
  if (effort === null) return "var(--text-dim)";
  if (effort < 50) return "#22c55e";
  if (effort < 100) return "#4ade80";
  if (effort < 150) return "#facc15";
  if (effort < 200) return "#f97316";
  return "#ef4444";
};

// Determine le statut d'un worker selon la date de sa derniere share
const getWorkerStatus = (lastShare: string | null): "online" | "warning" | "offline" => {
  if (!lastShare) return "offline";
  const minutes = (Date.now() - new Date(lastShare).getTime()) / 60000;
  if (minutes < 15) return "online";
  if (minutes < 60) return "warning";
  return "offline";
};

// Gestion des workers masques dans localStorage (par adresse de mineur)
const getHiddenWorkers = (address: string): string[] => {
  try {
    const raw = localStorage.getItem(`korvex_hidden_workers_${address}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const setHiddenWorkers = (address: string, workers: string[]) => {
  localStorage.setItem(`korvex_hidden_workers_${address}`, JSON.stringify(workers));
};

const MinerPage: React.FC = () => {
  const { address: paramAddress } = useParams<{ address: string }>();
  const [miner, setMiner] = useState<any>(null);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [hiddenWorkers, setHiddenWorkersState] = useState<string[]>([]);

  // Charger les workers masques au changement d'adresse
  useEffect(() => {
    if (paramAddress) {
      setHiddenWorkersState(getHiddenWorkers(paramAddress));
    }
  }, [paramAddress]);

  const loadMiner = useCallback((addr: string) => {
    if (!addr) return;
    setError("");
    setLoading(true);
    getMiner(addr)
      .then((data) => {
        setMiner(data);
        localStorage.setItem(STORAGE_KEY, addr);
      })
      .catch(() => {
        setMiner(null);
        setError("Miner not found. Check the address.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (paramAddress) {
      loadMiner(paramAddress);
      setSelectedWorker(null);
    }
    getStats().then(setPoolStats).catch(() => {});
  }, [paramAddress, loadMiner]);

  useEffect(() => {
    if (!paramAddress) return;
    const t = setInterval(() => {
      loadMiner(paramAddress);
      getStats().then(setPoolStats).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [paramAddress, loadMiner]);

  // Masquer un worker (ajouter a la liste)
  const hideWorker = (workerName: string) => {
    if (!paramAddress) return;
    const updated = [...hiddenWorkers, workerName];
    setHiddenWorkersState(updated);
    setHiddenWorkers(paramAddress, updated);
    // Si le worker masque etait selectionne, fermer le panneau detail
    if (selectedWorker === workerName) setSelectedWorker(null);
  };

  // Masquer tous les workers offline (rouges)
  const hideAllOffline = () => {
    if (!paramAddress || !miner?.workers) return;
    const offlineNames = miner.workers
      .filter((w: any) => getWorkerStatus(w.last_share) === "offline")
      .map((w: any) => w.worker);
    const updated = Array.from(new Set(hiddenWorkers.concat(offlineNames)));
    setHiddenWorkersState(updated);
    setHiddenWorkers(paramAddress, updated);
    if (selectedWorker && offlineNames.includes(selectedWorker)) {
      setSelectedWorker(null);
    }
  };

  // Filtrer les workers : masquer les hidden SAUF s'ils sont redevenus online
  const visibleWorkers = miner?.workers?.filter((w: any) => {
    const status = getWorkerStatus(w.last_share);
    // Si le worker est masque MAIS est redevenu online, on le remontre (et on le retire de la liste)
    if (hiddenWorkers.includes(w.worker)) {
      if (status === "online") {
        // Reactiver automatiquement : retirer de la liste hidden
        const updated = hiddenWorkers.filter((name: string) => name !== w.worker);
        // On met a jour en asynchrone pour eviter un setState pendant le rendu
        setTimeout(() => {
          if (paramAddress) {
            setHiddenWorkersState(updated);
            setHiddenWorkers(paramAddress, updated);
          }
        }, 0);
        return true; // Le montrer
      }
      return false; // Masque
    }
    return true; // Pas masque, toujours visible
  }) || [];

  // Trier les workers par hashrate 1h decroissant (plus puissant en premier)
  visibleWorkers.sort((a: any, b: any) => (b.hashrate_1h || 0) - (a.hashrate_1h || 0));

  const hasOfflineWorkers = miner?.workers?.some(
    (w: any) => getWorkerStatus(w.last_share) === "offline" && !hiddenWorkers.includes(w.worker)
  );

  const lastShareAt = miner?.workers?.length
    ? miner.workers.reduce((latest: string | null, w: any) => {
        if (!w.last_share) return latest;
        if (!latest) return w.last_share;
        return new Date(w.last_share) > new Date(latest) ? w.last_share : latest;
      }, null)
    : miner?.last_seen;

  const networkDifficulty = poolStats?.nodes?.[0]?.difficulty
    ? parseFloat(poolStats.nodes[0].difficulty)
    : 0;

  // Recuperer les infos du worker selectionne
  const selectedWorkerData = selectedWorker && miner?.workers
    ? miner.workers.find((w: any) => w.worker === selectedWorker)
    : null;

  if (!paramAddress) {
    return (
      <div>
        <div className="page-title">
          <h1>MINER STATS</h1>
          <p>Use the search bar above to look up a wallet address</p>
        </div>
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
          Enter a wallet address in the header search bar to view miner statistics.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title">
        <h1>MINER STATS</h1>
        <p>Detailed statistics for a single miner</p>
      </div>

      {loading && !miner && (
        <div className="card" style={{ textAlign: "center", color: "var(--text-dim)" }}>Loading...</div>
      )}
      {error && (
        <div className="card miner-not-found">
          <div className="mnf-icon">&#128269;</div>
          <div className="mnf-title">No data yet</div>
          <div className="mnf-addr">{paramAddress}</div>
          <div className="mnf-text">This address has not been seen on KORVEX Pool, or has no recent activity.</div>
        </div>
      )}

      {miner && (
        <div>
          {/* Adresse */}
          <div className="miner-address-display">
            <span className="label">Address:</span>
            <span className="address">{miner.address}</span>
            <button
              className="miner-copy-btn"
              onClick={() => navigator.clipboard.writeText(miner.address)}
              title="Copy address"
            >
              &#x2398;
            </button>
          </div>

          {/* Section 1 — Financier */}
          <div className="miner-section-label">Earnings</div>
          <div className="stats-grid stats-grid-3">
            <div className="stat-card-new stat-card-accent">
              <div>
                <div className="stat-label">Unpaid (Pending)</div>
                <div className="stat-value">{formatErg(miner.pending_balance)}</div>
                <div className="stat-sub">PPLNS rewards awaiting confirmation</div>
              </div>
              <div className="stat-icon">&#9203;</div>
            </div>
            <div className="stat-card-new stat-card-accent">
              <div>
                <div className="stat-label">Confirmed Balance</div>
                <div className="stat-value">{formatErg(miner.balance)}</div>
                <div className="stat-sub">Ready for payout (&ge; 1 ERG)</div>
              </div>
              <div className="stat-icon">&#128176;</div>
            </div>
            <div className="stat-card-new stat-card-accent">
              <div>
                <div className="stat-label">Total Paid</div>
                <div className="stat-value">{formatErg(miner.total_paid_nano)}</div>
                <div className="stat-sub">Lifetime earnings sent</div>
              </div>
              <div className="stat-icon">&#128184;</div>
            </div>
          </div>

          {/* Section 2 — Performance */}
          <div className="miner-section-label">Performance</div>
          <div className="stats-grid">
            <div className="stat-card-new">
              <div>
                <div className="stat-label">Hashrate 15min</div>
                <div className="stat-value">{formatHash(miner.hashrate_15m)}</div>
              </div>
              <div className="stat-icon">&#9889;</div>
            </div>
            <div className="stat-card-new">
              <div>
                <div className="stat-label">Hashrate 1h</div>
                <div className="stat-value">{formatHash(miner.hashrate_1h)}</div>
              </div>
              <div className="stat-icon">&#9889;</div>
            </div>
            <div className="stat-card-new">
              <div>
                <div className="stat-label">Workers</div>
                <div className="stat-value">{visibleWorkers.length || 0}</div>
              </div>
              <div className="stat-icon">&#128296;</div>
            </div>
            <div className="stat-card-new">
              <div>
                <div className="stat-label">Shares (total)</div>
                <div className="stat-value">{miner.total_shares ? Number(miner.total_shares).toLocaleString() : "0"}</div>
              </div>
              <div className="stat-icon">&#128200;</div>
            </div>
            <div className="stat-card-new">
              <div>
                <div className="stat-label">Last Share</div>
                <div className="stat-value">{timeAgo(lastShareAt)}</div>
              </div>
              <div className="stat-icon">&#128338;</div>
            </div>
          </div>

          {/* Hashrate Chart */}
          <div className="card">
            <MinerChart address={paramAddress} />
          </div>

          {/* Workers */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ color: "#fff", margin: 0 }}>Active Workers</h3>
              {hasOfflineWorkers && (
                <button className="worker-remove-all" onClick={hideAllOffline}>
                  Remove all offline workers
                </button>
              )}
            </div>
            {visibleWorkers.length > 0 ? (
              <>
                <table className="blocks-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Status</th>
                      <th>Worker</th>
                      <th>Hashrate 15m</th>
                      <th>Hashrate 1h</th>
                      <th>Effort</th>
                      <th>Blocks</th>
                      <th>Last Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWorkers.map((w: any) => {
                      const status = getWorkerStatus(w.last_share);
                      return (
                        <tr key={w.worker}>
                          <td style={{ textAlign: "center" }}>
                            <button
                              className={`worker-power-btn worker-power-${status}`}
                              onClick={() => {
                                if (status !== "online") hideWorker(w.worker);
                              }}
                              title={
                                status === "online"
                                  ? "Online"
                                  : status === "warning"
                                  ? "Idle — click to hide"
                                  : "Offline — click to hide"
                              }
                              style={{ cursor: status === "online" ? "default" : "pointer" }}
                            >
                              {"\u23FB"}
                            </button>
                          </td>
                          <td>
                            <span
                              className="worker-link"
                              onClick={() => setSelectedWorker(
                                selectedWorker === w.worker ? null : w.worker
                              )}
                              style={{
                                color: selectedWorker === w.worker ? "#67E8F9" : "var(--accent)",
                                cursor: "pointer",
                                borderBottom: selectedWorker === w.worker ? "1px solid #67E8F9" : "1px dashed var(--accent)",
                              }}
                            >
                              {w.worker || "default"}
                            </span>
                          </td>
                          <td>{formatHash(w.hashrate_15m)}</td>
                          <td>{formatHash(w.hashrate_1h)}</td>
                          <td>
                            <span
                              className="effort-badge"
                              style={{ color: effortColor(w.effort_percent) }}
                            >
                              {w.effort_percent !== null && w.effort_percent !== undefined
                                ? w.effort_percent.toFixed(2) + "%"
                                : "\u2014"}
                            </span>
                          </td>
                          <td>{w.blocks_found || 0}</td>
                          <td style={{ color: "var(--text-dim)" }}>
                            {timeAgo(w.last_share)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Panneau detail du worker selectionne */}
                {selectedWorker && selectedWorkerData && (
                  <div className="worker-detail-panel">
                    <div className="worker-detail-header">
                      <h4 className="worker-detail-title">
                        Worker: {selectedWorker}
                      </h4>
                      <button
                        className="worker-detail-close"
                        onClick={() => setSelectedWorker(null)}
                        title="Close"
                      >
                        &#x2715;
                      </button>
                    </div>

                    <div className="worker-detail-stats">
                      <div className="worker-stat">
                        <span className="worker-stat-label">Hashrate 15m</span>
                        <span className="worker-stat-value">{formatHash(selectedWorkerData.hashrate_15m)}</span>
                      </div>
                      <div className="worker-stat">
                        <span className="worker-stat-label">Hashrate 1h</span>
                        <span className="worker-stat-value">{formatHash(selectedWorkerData.hashrate_1h)}</span>
                      </div>
                      <div className="worker-stat">
                        <span className="worker-stat-label">Effort</span>
                        <span className="worker-stat-value" style={{ color: effortColor(selectedWorkerData.effort_percent) }}>
                          {selectedWorkerData.effort_percent !== null && selectedWorkerData.effort_percent !== undefined
                            ? selectedWorkerData.effort_percent.toFixed(2) + "%"
                            : "\u2014"}
                        </span>
                      </div>
                      <div className="worker-stat">
                        <span className="worker-stat-label">Blocks Found</span>
                        <span className="worker-stat-value">{selectedWorkerData.blocks_found || 0}</span>
                      </div>
                    </div>

                    <MinerChart address={paramAddress} worker={selectedWorker} />
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "var(--text-dim)", padding: "12px 0" }}>No active workers in the last 24 hours.</div>
            )}
          </div>

          {/* Estimated Earnings — sous Active Workers */}
          {poolStats && networkDifficulty > 0 && (
            <div className="card">
              <EarningsCalculator
                minerHashrate={miner.hashrate_1h || 0}
                networkDifficulty={networkDifficulty}
                blockReward={poolStats.blockReward || 6}
                poolFee={poolStats.poolFee || 0.01}
                ergPriceUsd={poolStats.ergPriceUsd || 0}
                ergPriceBtc={poolStats.ergPriceBtc || 0}
              />
            </div>
          )}

          {/* Payments */}
          <div className="card">
            <h3 style={{ marginBottom: 12, color: "#fff" }}>Recent Payments</h3>
            {miner.payments && miner.payments.length > 0 ? (
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>TX Hash</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {miner.payments.map((p: any, i: number) => (
                    <tr key={i}>
                      <td style={{ color: "#fff", fontWeight: 600 }}>{p.amount_erg} ERG</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {p.tx_hash ? (
                          <a
                            href={"https://explorer.ergoplatform.com/en/transactions/" + p.tx_hash}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {p.tx_hash.slice(0, 16)}...
                          </a>
                        ) : "\u2014"}
                      </td>
                      <td>
                        <span className={p.status === "sent" ? "badge badge-sent" : "badge badge-failed"}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-dim)" }}>
                        {p.sent_at ? new Date(p.sent_at).toLocaleString("fr-FR") : new Date(p.created_at).toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "var(--text-dim)", padding: "12px 0" }}>No payments yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MinerPage;
