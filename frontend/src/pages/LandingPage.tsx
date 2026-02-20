import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { coins, CoinConfig, CoinMode } from "../data/coins";
import { getStats, PoolStats } from "../api";

const formatHash = (h: number) => {
  if (!h || h <= 0) return "—";
  if (h >= 1e12) return (h / 1e12).toFixed(2) + " TH/s";
  if (h >= 1e9) return (h / 1e9).toFixed(2) + " GH/s";
  if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
  if (h >= 1e3) return (h / 1e3).toFixed(2) + " KH/s";
  return h + " H/s";
};

/* Logos des cryptos via CoinGecko CDN (images officielles) */
const coinLogoUrls: Record<string, string> = {
  ergo: "https://assets.coingecko.com/coins/images/2484/standard/Ergo.png",
  kaspa: "https://assets.coingecko.com/coins/images/25751/standard/kaspa-icon-exchanges.png",
};

const CoinIcon: React.FC<{ coinId: string }> = ({ coinId }) => (
  <div className="coin-card-icon">
    <img src={coinLogoUrls[coinId]} alt={coinId} />
  </div>
);

interface CoinCardProps {
  coin: CoinConfig;
  mode: CoinMode;
  stats: PoolStats | null;
}

const CoinCard: React.FC<CoinCardProps> = ({ coin, mode, stats }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isActive = mode.active;

  return (
    <div
      className={`coin-card ${isActive ? "coin-card-active" : "coin-card-disabled"}`}
      onClick={() => isActive && mode.route && navigate(mode.route)}
    >
      {/* Texte algorithme vertical (style 2miners) */}
      <div className="coin-card-algo-vertical">{coin.algorithm}</div>

      <div className="coin-card-header">
        <CoinIcon coinId={coin.id} />
        <div className="coin-card-name-row">
          <span className="coin-card-name">{coin.name}</span>
          {isActive && stats && (
            <span className="coin-card-hashrate">{formatHash(stats.hashrate)}</span>
          )}
        </div>
      </div>

      <div className="coin-card-details">
        {isActive && stats && (
          <div className="coin-card-detail">
            <span>{t("landing.miners")}</span>
            <span>{stats.minersTotal}</span>
          </div>
        )}
        <div className="coin-card-detail">
          <span>{t("landing.fee")}</span>
          <span>{mode.fee}</span>
        </div>
        <div className="coin-card-detail">
          <span>{t("landing.min_payout")}</span>
          <span>{mode.minPayout}</span>
        </div>
        <div className="coin-card-detail">
          <span>{t("landing.status")}</span>
          <span>
            {isActive ? (
              <span className="coin-card-status-active">
                {t("landing.active")} <span className="coin-card-status-dot" />
              </span>
            ) : (
              <span className="coin-card-status-soon">{t("landing.coming_soon")}</span>
            )}
          </span>
        </div>
      </div>

      {isActive && (
        <div className="coin-card-footer">
          <button className="coin-card-btn" onClick={(e) => { e.stopPropagation(); navigate(mode.route); }}>
            {t("landing.view_pool")} &rarr;
          </button>
        </div>
      )}
    </div>
  );
};

type TabMode = "pool" | "solo";

const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [soloStats, setSoloStats] = useState<PoolStats | null>(null);
  const [tab, setTab] = useState<TabMode>("pool");

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    getStats('solo').then(setSoloStats).catch(() => {});
    const interval = setInterval(() => {
      getStats().then(setStats).catch(() => {});
      getStats('solo').then(setSoloStats).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  /* Filtrer les coins qui ont le mode selectionne */
  const filtered = coins
    .map((coin) => {
      const mode = coin.modes.find((m) => m.id === tab);
      return mode ? { coin, mode } : null;
    })
    .filter(Boolean) as { coin: CoinConfig; mode: CoinMode }[];

  return (
    <div className="landing-page">
      <div className="landing-hero">
        <h1>KORVEX POOL</h1>
        <p>{t("landing.subtitle")}</p>
      </div>

      {/* Onglets PPLNS / Solo */}
      <div className="landing-tabs">
        <button
          className={`landing-tab ${tab === "pool" ? "landing-tab-active" : ""}`}
          onClick={() => setTab("pool")}
        >
          PPLNS
        </button>
        <button
          className={`landing-tab ${tab === "solo" ? "landing-tab-active" : ""}`}
          onClick={() => setTab("solo")}
        >
          SOLO
        </button>
      </div>

      <div className="landing-grid">
        {filtered.map(({ coin, mode }) => (
          <CoinCard
            key={`${coin.id}-${mode.id}`}
            coin={coin}
            mode={mode}
            stats={coin.id === "ergo" && mode.active ? (mode.id === "solo" ? soloStats : stats) : null}
          />
        ))}
      </div>
    </div>
  );
};

export default LandingPage;
