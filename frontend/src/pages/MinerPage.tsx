import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/i18n";
import { getMiner, getStats, PoolStats } from "../api";
import { useMiningMode } from "../hooks/useMiningMode";
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
// Utilise i18n.t() car elle est en dehors du composant React
const calcTimeAgo = (dateStr: string | null | undefined) => {
  if (!dateStr) return "\u2014";
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 1) return i18n.t('time.now');
  if (sec < 60) return i18n.t('time.s_ago', { count: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return i18n.t('time.min_ago', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return i18n.t('time.h_ago', { count: hr });
  return i18n.t('time.d_ago', { count: Math.floor(hr / 24) });
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

// Composant barre de progression du bloc reseau
// Style avec rayures diagonales animees et fleche
const BLOCK_TARGET_TIME = 120; // 2 minutes en secondes
const NetworkBlockProgress: React.FC<{ lastBlockTimestamp: number; label: string }> = ({ lastBlockTimestamp, label }) => {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const now = Date.now();
      const elapsedSec = Math.floor((now - lastBlockTimestamp) / 1000);
      const pct = (elapsedSec / BLOCK_TARGET_TIME) * 100;
      setPercent(Math.max(0, pct));
    };

    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [lastBlockTimestamp]);

  // Position du remplissage (max 100% de la barre = 250% effort)
  const fillPercent = Math.min((percent / 250) * 100, 100);

  // Couleur et degrade selon l'effort actuel
  const getGradient = () => {
    if (percent <= 50) return "linear-gradient(90deg, #16a34a 0%, #22c55e 100%)";
    if (percent <= 100) return "linear-gradient(90deg, #16a34a 0%, #84cc16 50%, #a3e635 100%)";
    if (percent <= 150) return "linear-gradient(90deg, #84cc16 0%, #facc15 100%)";
    if (percent <= 200) return "linear-gradient(90deg, #facc15 0%, #f97316 100%)";
    return "linear-gradient(90deg, #f97316 0%, #ef4444 100%)";
  };

  const getCurrentColor = () => {
    if (percent <= 50) return "#22c55e";
    if (percent <= 100) return "#a3e635";
    if (percent <= 150) return "#facc15";
    if (percent <= 200) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="block-progress-bar">
      <div className="block-progress-label">
        <span>{label}</span>
        <span className="block-progress-percent" style={{ color: getCurrentColor() }}>
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="block-progress-track-v2">
        <div
          className="block-progress-fill-v2"
          style={{
            width: `${Math.max(fillPercent, 0.5)}%`,
            background: getGradient()
          }}
        >
          <div className="block-progress-stripes"></div>
        </div>
      </div>
      <div className="block-progress-markers-v2">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
        <span>150%</span>
        <span>200%</span>
        <span>250%</span>
      </div>
    </div>
  );
};

// Composant barre d'effort de la pool
// Affiche le % d'effort actuel de la pool pour trouver un bloc
const PoolEffortProgress: React.FC<{ effort: number | null; label: string }> = ({ effort, label }) => {
  const percent = effort ?? 0;

  // Position du remplissage (max 100% de la barre = 250% effort)
  const fillPercent = Math.min((percent / 250) * 100, 100);

  // Couleur et degrade selon l'effort actuel
  const getGradient = () => {
    if (percent <= 50) return "linear-gradient(90deg, #16a34a 0%, #22c55e 100%)";
    if (percent <= 100) return "linear-gradient(90deg, #16a34a 0%, #84cc16 50%, #a3e635 100%)";
    if (percent <= 150) return "linear-gradient(90deg, #84cc16 0%, #facc15 100%)";
    if (percent <= 200) return "linear-gradient(90deg, #facc15 0%, #f97316 100%)";
    return "linear-gradient(90deg, #f97316 0%, #ef4444 100%)";
  };

  const getCurrentColor = () => {
    if (percent <= 50) return "#22c55e";
    if (percent <= 100) return "#a3e635";
    if (percent <= 150) return "#facc15";
    if (percent <= 200) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="block-progress-bar">
      <div className="block-progress-label">
        <span>{label}</span>
        <span className="block-progress-percent" style={{ color: getCurrentColor() }}>
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="block-progress-track-v2">
        <div
          className="block-progress-fill-v2"
          style={{
            width: `${Math.max(fillPercent, 0.5)}%`,
            background: getGradient()
          }}
        >
          <div className="block-progress-stripes"></div>
        </div>
      </div>
      <div className="block-progress-markers-v2">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
        <span>150%</span>
        <span>200%</span>
        <span>250%</span>
      </div>
    </div>
  );
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
  const { t } = useTranslation();
  const mode = useMiningMode();
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
    getMiner(addr, mode)
      .then((data) => {
        setMiner(data);
        localStorage.setItem(STORAGE_KEY, addr);
      })
      .catch(() => {
        setMiner(null);
        setError(t('miner.not_found_text'));
      })
      .finally(() => setLoading(false));
  }, [mode, t]);

  useEffect(() => {
    if (paramAddress) {
      loadMiner(paramAddress);
      setSelectedWorker(null);
    }
    getStats(mode).then(setPoolStats).catch(() => {});
  }, [paramAddress, loadMiner, mode]);

  useEffect(() => {
    if (!paramAddress) return;
    const interval = setInterval(() => {
      loadMiner(paramAddress);
      getStats(mode).then(setPoolStats).catch(() => {});
    }, 15000); // Refresh toutes les 15 secondes (evite surcharge DB/API)
    return () => clearInterval(interval);
  }, [paramAddress, loadMiner, mode]);

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
          <h1>{t('miner.title')}</h1>
          <p>{t('miner.search_prompt')}</p>
        </div>
        <div className="modern-info-card" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
          {t('miner.search_detail')}
        </div>
      </div>
    );
  }

  return (
    <div className="layout-modern">
      {/* Header */}
      <div className="modern-header">
        <h1>{mode === 'solo' ? t('miner.title_solo') : t('miner.title')}</h1>
        <p>{mode === 'solo' ? t('miner.subtitle_solo') : t('miner.subtitle')}</p>
      </div>

      {loading && !miner && (
        <div className="modern-info-card" style={{ textAlign: "center", color: "var(--text-dim)", padding: 32 }}>{t('miner.loading')}</div>
      )}
      {error && (
        <div className="modern-info-card miner-not-found">
          <div className="mnf-icon">&#128269;</div>
          <div className="mnf-title">{t('miner.not_found_title')}</div>
          <div className="mnf-addr">{paramAddress}</div>
          <div className="mnf-text">{t('miner.not_found_text')}</div>
        </div>
      )}

      {miner && (
        <>
          {/* Adresse du mineur */}
          <div className="miner-address-bar">
            <span className="miner-address-label">{t('miner.address')}</span>
            <span className="miner-address-value">{miner.address}</span>
            <button
              className="miner-address-copy"
              onClick={() => navigator.clipboard.writeText(miner.address)}
              title={t('miner.copy_address')}
            >
              &#x2398;
            </button>
          </div>

          {/* Section Earnings - 3 stats */}
          <div className="miner-section-title">{t('miner.earnings')}</div>
          <div className="modern-stats-grid">
            {mode === 'solo' ? (
              <div className="modern-stat-card modern-stat-accent">
                <div className="msc-icon">&#9874;</div>
                <div className="msc-label">{t('miner.solo_blocks_found')}</div>
                <div className="msc-value">{miner.soloBlocksFound || 0}</div>
                <div className="msc-sub">{t('miner.solo_sub')}</div>
              </div>
            ) : (
              <div className="modern-stat-card modern-stat-accent">
                <div className="msc-icon">&#9203;</div>
                <div className="msc-label">{t('miner.unpaid_pending')}</div>
                <div className="msc-value">{formatErg(miner.pending_balance)}</div>
                <div className="msc-sub">{t('miner.pplns_sub')}</div>
              </div>
            )}
            <div className="modern-stat-card modern-stat-accent">
              <div className="msc-icon">&#128176;</div>
              <div className="msc-label">{t('miner.confirmed_balance')}</div>
              <div className="msc-value">{formatErg(miner.balance)}</div>
              <div className="msc-sub">{t('miner.confirmed_sub')}</div>
            </div>
            <div className="modern-stat-card modern-stat-accent">
              <div className="msc-icon">&#128184;</div>
              <div className="msc-label">{t('miner.total_paid')}</div>
              <div className="msc-value">{formatErg(miner.total_paid_nano)}</div>
              <div className="msc-sub">{t('miner.total_paid_sub')}</div>
            </div>
          </div>

          {/* Section Performance - 5 stats */}
          <div className="miner-section-title">{t('miner.performance')}</div>
          <div className="modern-stats-grid modern-stats-grid-5">
            <div className="modern-stat-card">
              <div className="msc-icon">&#9889;</div>
              <div className="msc-label">{t('miner.hashrate_15m')}</div>
              <div className="msc-value">{formatHash(miner.hashrate_15m)}</div>
            </div>
            <div className="modern-stat-card">
              <div className="msc-icon">&#9889;</div>
              <div className="msc-label">{t('miner.hashrate_1h')}</div>
              <div className="msc-value">{formatHash(miner.hashrate_1h)}</div>
            </div>
            <div className="modern-stat-card">
              <div className="msc-icon">&#128296;</div>
              <div className="msc-label">{t('miner.workers')}</div>
              <div className="msc-value">{visibleWorkers.length || 0}</div>
            </div>
            <div className="modern-stat-card">
              <div className="msc-icon">&#128200;</div>
              <div className="msc-label">{t('miner.total_shares')}</div>
              <div className="msc-value">{miner.total_shares ? Number(miner.total_shares).toLocaleString() : "0"}</div>
            </div>
            <div className="modern-stat-card">
              <div className="msc-icon">&#128338;</div>
              <div className="msc-label">{t('miner.last_share')}</div>
              <div className="msc-value"><LiveTimeAgo dateStr={lastShareAt} /></div>
            </div>
          </div>

          {/* Graphique Hashrate */}
          <div className="modern-info-card">
            <MinerChart address={paramAddress} mode={mode} />
          </div>

          {/* Barres de progression */}
          <div className="progress-bars-container">
            {poolStats && poolStats.lastNetworkBlockTimestamp && (
              <NetworkBlockProgress lastBlockTimestamp={poolStats.lastNetworkBlockTimestamp} label={t('miner.network_block_progress')} />
            )}
            {mode === 'solo' ? (
              miner.soloEffortPercent != null && (
                <PoolEffortProgress effort={miner.soloEffortPercent} label={t('miner.personal_effort')} />
              )
            ) : (
              poolStats && (
                <PoolEffortProgress effort={poolStats.currentEffort} label={t('miner.pool_effort')} />
              )
            )}
          </div>

          {/* Workers Table - garde tel quel */}
          <div className="modern-info-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="modern-info-title" style={{ marginBottom: 0 }}>{t('miner.active_workers')}</div>
              {hasOfflineWorkers && (
                <button className="worker-remove-all" onClick={hideAllOffline}>
                  {t('miner.remove_all_offline')}
                </button>
              )}
            </div>
            {visibleWorkers.length > 0 ? (
              <>
                <table className="blocks-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>{t('miner.worker_status')}</th>
                      <th>{t('miner.worker_name')}</th>
                      <th>{t('miner.hashrate_15m')}</th>
                      <th>{t('miner.hashrate_1h')}</th>
                      <th>{t('miner.worker_effort')}</th>
                      <th>{t('miner.worker_blocks')}</th>
                      <th>{t('miner.last_share')}</th>
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
                                  ? t('miner.worker_online')
                                  : status === "warning"
                                  ? t('miner.worker_idle')
                                  : t('miner.worker_offline')
                              }
                              style={{ cursor: status === "online" ? "default" : "pointer" }}
                            >
                              <span className="power-icon-desktop">{"\u23FB"}</span>
                              <svg className="power-icon-mobile" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v6"/><path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/></svg>
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
                        {selectedWorker} — {t('miner.worker_hashrate_history')}
                      </h4>
                      <button
                        className="worker-detail-close"
                        onClick={() => setSelectedWorker(null)}
                        title={t('miner.close')}
                      >
                        &#x2715;
                      </button>
                    </div>

                    <MinerChart address={paramAddress} worker={selectedWorker} hideTitle mode={mode} />
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "var(--text-dim)", padding: "12px 0" }}>{t('miner.no_active_workers')}</div>
            )}
          </div>

          {/* Estimated Earnings - garde tel quel */}
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

          {/* Payments - garde tel quel */}
          <div className="modern-info-card">
            <div className="modern-info-title">{t('miner.recent_payments')}</div>
            {miner.payments && miner.payments.length > 0 ? (
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>{t('miner.amount')}</th>
                    <th>{t('miner.tx_hash')}</th>
                    <th>{t('miner.payment_status')}</th>
                    <th>{t('miner.date')}</th>
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
                        {p.sent_at ? new Date(p.sent_at).toLocaleString() : new Date(p.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "var(--text-dim)", padding: "12px 0" }}>{t('miner.no_payments')}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MinerPage;
