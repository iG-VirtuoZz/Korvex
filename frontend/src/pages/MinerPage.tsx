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

// Fonction statique pour calculer le temps ecoule
const calcTimeAgo = (dateStr: string | null | undefined) => {
  if (!dateStr) return "\u2014";
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 1) return "Now";
  if (sec < 60) return sec + "s ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + " min ago";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "h ago";
  return Math.floor(hr / 24) + "d ago";
};

// Composant LiveTimeAgo - mise a jour adaptative avec sync precise
// < 60 sec : update chaque seconde
// >= 60 sec : update synchronise sur le changement de minute
const LiveTimeAgo: React.FC<{ dateStr: string | null | undefined }> = ({ dateStr }) => {
  const [display, setDisplay] = useState(() => calcTimeAgo(dateStr));

  useEffect(() => {
    if (!dateStr) {
      setDisplay("\u2014");
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const scheduleUpdate = () => {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffSec = Math.floor(diffMs / 1000);

      setDisplay(calcTimeAgo(dateStr));

      let nextUpdateMs: number;
      if (diffSec < 60) {
        // Moins de 60 sec : update chaque seconde
        nextUpdateMs = 1000;
      } else {
        // Plus de 60 sec : calculer le temps jusqu'a la prochaine minute
        // Ex: a 1min 45sec, attendre 15 sec pour passer a 2 min
        const secsIntoCurrentMinute = diffSec % 60;
        nextUpdateMs = (60 - secsIntoCurrentMinute) * 1000;
        // Securite : minimum 1 sec, maximum 60 sec
        nextUpdateMs = Math.max(1000, Math.min(nextUpdateMs, 60000));
      }

      timeoutId = setTimeout(scheduleUpdate, nextUpdateMs);
    };

    scheduleUpdate();
    return () => clearTimeout(timeoutId);
  }, [dateStr]);

  return <>{display}</>;
};

const effortColor = (effort: number | null) => {
  if (effort === null) return "var(--text-dim)";
  if (effort < 50) return "#16a34a";   // Vert fonce (different du vert USD)
  if (effort < 100) return "#84cc16";  // Lime / vert-jaune
  if (effort < 150) return "#facc15";  // Jaune
  if (effort < 200) return "#f97316";  // Orange
  return "#ef4444";                     // Rouge
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
    }, 5000); // Refresh toutes les 5 secondes pour voir les shares en temps reel
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
      <div className="layout-modern">
        <div className="modern-header">
          <h1>MINER STATS</h1>
          <p>Use the search bar above to look up a wallet address</p>
        </div>
        <div className="modern-info-card" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
          Enter a wallet address in the header search bar to view miner statistics.
        </div>
      </div>
    );
  }

  return (
    <div className="layout-modern">
      {/* Header */}
      <div className="modern-header">
        <h1>MINER STATS</h1>
        <p>Detailed statistics for a single miner</p>
      </div>

      {loading && !miner && (
        <div className="modern-info-card" style={{ textAlign: "center", color: "var(--text-dim)", padding: 32 }}>Loading...</div>
      )}
      {error && (
        <div className="modern-info-card miner-not-found">
          <div className="mnf-icon">&#128269;</div>
          <div className="mnf-title">No data yet</div>
          <div className="mnf-addr">{paramAddress}</div>
          <div className="mnf-text">This address has not been seen on KORVEX Pool, or has no recent activity.</div>
        </div>
      )}

      {miner && (
        <>
          {/* Adresse du mineur */}
          <div className="miner-address-bar">
            <span className="miner-address-label">Address</span>
            <span className="miner-address-value">{miner.address}</span>
            <button
              className="miner-address-copy"
              onClick={() => navigator.clipboard.writeText(miner.address)}
              title="Copy address"
            >
              &#x2398;
            </button>
          </div>

          {/* Section Earnings - 3 stats */}
          <div className="miner-section-title">Earnings</div>
          <div className="modern-stats-grid">
            <div className="modern-stat-card modern-stat-accent">
              <div className="msc-icon">&#9203;</div>
              <div className="msc-label">Unpaid (Pending)</div>
              <div className="msc-value">{formatErg(miner.pending_balance)}</div>
              <div className="msc-sub">PPLNS rewards awaiting confirmation</div>
            </div>
            <div className="modern-stat-card modern-stat-accent">
              <div className="msc-icon">&#128176;</div>
              <div className="msc-label">Confirmed Balance</div>
              <div className="msc-value">{formatErg(miner.balance)}</div>
              <div className="msc-sub">Ready for payout (&ge; 1 ERG)</div>
            </div>
            <div className="modern-stat-card modern-stat-accent">
              <div className="msc-icon">&#128184;</div>
              <div className="msc-label">Total Paid</div>
              <div className="msc-value">{formatErg(miner.total_paid_nano)}</div>
              <div className="msc-sub">Lifetime earnings sent</div>
            </div>
          </div>

          {/* Section Performance - 5 stats */}
          <div className="miner-section-title">Performance</div>
          <div className="modern-stats-grid modern-stats-grid-5">
            <div className="modern-stat-card">
              <div className="msc-icon">&#9889;</div>
              <div className="msc-label">Hashrate 15m</div>
              <div className="msc-value">{formatHash(miner.hashrate_15m)}</div>
            </div>
            <div className="modern-stat-card">
              <div className="msc-icon">&#9889;</div>
              <div className="msc-label">Hashrate 1h</div>
              <div className="msc-value">{formatHash(miner.hashrate_1h)}</div>
            </div>
            <div className="modern-stat-card">
              <div className="msc-icon">&#128296;</div>
              <div className="msc-label">Workers</div>
              <div className="msc-value">{visibleWorkers.length || 0}</div>
            </div>
            <div className="modern-stat-card">
              <div className="msc-icon">&#128200;</div>
              <div className="msc-label">Total Shares</div>
              <div className="msc-value">{miner.total_shares ? Number(miner.total_shares).toLocaleString() : "0"}</div>
            </div>
            <div className="modern-stat-card">
              <div className="msc-icon">&#128338;</div>
              <div className="msc-label">Last Share</div>
              <div className="msc-value"><LiveTimeAgo dateStr={lastShareAt} /></div>
            </div>
          </div>

          {/* Graphique Hashrate */}
          <div className="modern-info-card">
            <MinerChart address={paramAddress} />
          </div>

          {/* Workers Table - gardé tel quel */}
          <div className="modern-info-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="modern-info-title" style={{ marginBottom: 0 }}>Active Workers</div>
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
                            <LiveTimeAgo dateStr={w.last_share} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Graphique du worker selectionne */}
                {selectedWorker && selectedWorkerData && (
                  <div className="worker-detail-panel">
                    <div className="worker-detail-header">
                      <h4 className="worker-detail-title">
                        {selectedWorker} — Hashrate History
                      </h4>
                      <button
                        className="worker-detail-close"
                        onClick={() => setSelectedWorker(null)}
                        title="Close"
                      >
                        &#x2715;
                      </button>
                    </div>

                    <MinerChart address={paramAddress} worker={selectedWorker} hideTitle />
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "var(--text-dim)", padding: "12px 0" }}>No active workers in the last 24 hours.</div>
            )}
          </div>

          {/* Estimated Earnings - gardé tel quel */}
          {poolStats && networkDifficulty > 0 && (
            <div className="modern-info-card">
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

          {/* Payments - gardé tel quel */}
          <div className="modern-info-card">
            <div className="modern-info-title">Recent Payments</div>
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
        </>
      )}
    </div>
  );
};

export default MinerPage;
