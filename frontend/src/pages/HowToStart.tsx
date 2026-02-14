import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

const HowToStart: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isSolo = location.pathname.includes("solo");

  // Valeurs dynamiques selon le mode
  const fee = isSolo ? "1.5%" : "1%";
  const port = isSolo ? "3417" : "3416";
  const prefix = isSolo ? "howtoSolo" : "howto";

  return (
    <div className="layout-modern">

      {/* ===================== HEADER ===================== */}
      <div className="modern-header">
        <h1>{t(`${prefix}.title`)}</h1>
        <p className="modern-header-sub">{t(`${prefix}.subtitle`)}</p>
      </div>

      {/* ===================== ONGLETS PPLNS / SOLO ===================== */}
      <div className="howto-mode-tabs">
        <button
          className={"howto-mode-tab" + (!isSolo ? " howto-mode-tab-active" : "")}
          onClick={() => navigate("/how-to-start")}
        >
          {t('howtoSolo.tab_pplns')}
        </button>
        <button
          className={"howto-mode-tab" + (isSolo ? " howto-mode-tab-active" : "")}
          onClick={() => navigate("/how-to-start-solo")}
        >
          {t('howtoSolo.tab_solo')}
        </button>
      </div>

      {/* ===================== 3 STAT CARDS ===================== */}
      <div className="modern-stats-grid">
        <div className="stat-card-new">
          <span className="stat-label">{t(`${prefix}.stat_fee`)}</span>
          <span className="stat-value">{fee}</span>
        </div>
        <div className="stat-card-new">
          <span className="stat-label">{t('howto.stat_min_payout')}</span>
          <span className="stat-value">1 ERG</span>
        </div>
        <div className="stat-card-new">
          <span className="stat-label">{t(`${prefix}.stat_port`)}</span>
          <span className="stat-value">{port}</span>
        </div>
      </div>

      {/* ===================== INTRO ===================== */}
      <div className="modern-info-card">
        <p dangerouslySetInnerHTML={{ __html: t(`${prefix}.intro_p1`) }} />
        <p>{t(`${prefix}.intro_p2`)}</p>
      </div>

      {/* ===================== SOLO vs PPLNS COMPARISON (solo only) ===================== */}
      {isSolo && (
        <div className="modern-info-card">
          <h3>{t('howtoSolo.comparison_title')}</h3>
          <p>{t('howtoSolo.comparison_desc')}</p>
          <div className="howto-table-wrap">
            <table className="howto-table howto-comparison-table">
              <thead>
                <tr>
                  {(t('howtoSolo.comparison_headers', { returnObjects: true }) as string[]).map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(t('howtoSolo.comparison_rows', { returnObjects: true }) as string[][]).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      j === 0 ? <td key={j} style={{ fontWeight: 600, color: "var(--text)" }}>{cell}</td> :
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="howto-recommendation">
            <h4>{t('howtoSolo.recommendation_title')}</h4>
            <p dangerouslySetInnerHTML={{ __html: t('howtoSolo.recommendation_text') }} />
          </div>
        </div>
      )}

      {/* ===================== SERVER ===================== */}
      <div className="modern-info-card">
        <h3>{t('howto.server_title')}</h3>
        <p>{t('howto.server_desc')}</p>
        <table className="howto-table">
          <thead>
            <tr><th>{t('howto.server_region')}</th><th>{t('howto.server_server')}</th><th>{t('howto.server_port')}</th></tr>
          </thead>
          <tbody>
            <tr><td>{t('howto.server_europe')}</td><td>korvexpool.com</td><td>{port}</td></tr>
          </tbody>
        </table>
        <p className="howto-note">{t('howto.server_note')}</p>
      </div>

      {/* ===================== WALLET ===================== */}
      <div className="modern-info-card">
        <h3>{t('howto.wallet_title')}</h3>
        <p>{t('howto.wallet_desc')}</p>
        <p dangerouslySetInnerHTML={{ __html: t('howto.wallet_recommended') }} />
        <ul>
          <li dangerouslySetInnerHTML={{ __html: t('howto.wallet_nautilus') }} />
          <li dangerouslySetInnerHTML={{ __html: t('howto.wallet_ergo') }} />
        </ul>
        <div className="howto-warning">
          {t('howto.wallet_warning')}
        </div>
      </div>

      {/* ===================== MINING SOFTWARE ===================== */}
      <div className="modern-info-card">
        <h3>{t('howto.software_title')}</h3>
        <p dangerouslySetInnerHTML={{ __html: t(`${prefix}.software_desc`) }} />

        <h4 className="howto-section-label howto-label-green">{t('howto.software_recommended_title')}</h4>
        <p className="howto-note">{t('howto.software_recommended_desc')}</p>

        <div className="howto-miners-grid">
          <div className="howto-miner-card">
            <div className="howto-miner-header">
              <span className="howto-miner-name">lolMiner</span>
              <span className="howto-badge-rec">{t('howto.recommended')}</span>
            </div>
            <p className="howto-miner-desc">{t('howto.lolminer_desc')}</p>
            <pre><code>lolMiner --algo AUTOLYKOS2 --pool korvexpool.com:{port} --user YOUR_WALLET.RIG_NAME</code></pre>
          </div>
          <div className="howto-miner-card">
            <div className="howto-miner-header">
              <span className="howto-miner-name">TeamRedMiner</span>
              <span className="howto-badge-rec">{t('howto.recommended')}</span>
            </div>
            <p className="howto-miner-desc">{t('howto.teamredminer_desc')}</p>
            <pre><code>teamredminer -a autolykos2 -o stratum+tcp://korvexpool.com:{port} -u YOUR_WALLET.RIG_NAME -p x</code></pre>
          </div>
        </div>

        <h4 className="howto-section-label">{t('howto.software_also_supported_title')}</h4>
        <p className="howto-note">{t('howto.software_also_supported_desc')}</p>

        <div className="howto-miners-grid">
          <div className="howto-miner-card">
            <div className="howto-miner-header">
              <span className="howto-miner-name">Rigel</span>
              <span className="howto-badge-rec">{t('howto.recommended')}</span>
            </div>
            <p className="howto-miner-desc">{t('howto.rigel_desc')}</p>
            <pre><code>rigel -a autolykos2 -o stratum+tcp://korvexpool.com:{port} -u YOUR_WALLET.RIG_NAME</code></pre>
          </div>
          <div className="howto-miner-card">
            <div className="howto-miner-header">
              <span className="howto-miner-name">SRBMiner-MULTI</span>
            </div>
            <p className="howto-miner-desc">{t('howto.srbminer_desc')}</p>
            <pre><code>SRBMiner-MULTI --disable-cpu --algorithm autolykos2 --pool korvexpool.com:{port} --wallet YOUR_WALLET.RIG_NAME</code></pre>
          </div>
        </div>

        <div className="howto-warning">
          {t('howto.vram_note')}
        </div>
      </div>

      {/* ===================== REWARDS + SUPPORT (2 colonnes) ===================== */}
      <div className="howto-two-col">
        <div className="modern-info-card">
          <h3>{t(`${prefix}.pplns_title`)}</h3>
          <p dangerouslySetInnerHTML={{ __html: t(`${prefix}.pplns_desc`) }} />
          {!isSolo && <p>{t('howto.pplns_window')}</p>}
          <p dangerouslySetInnerHTML={{ __html: t(`${prefix}.pplns_key_points`) }} />
          <ul>
            {(t(`${prefix}.pplns_points`, { returnObjects: true }) as string[]).map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>
        </div>
        <div className="modern-info-card">
          <h3>{t('howto.support_title')}</h3>
          <p>{t('howto.support_desc')}</p>
          <ul>
            <li dangerouslySetInnerHTML={{ __html: t('howto.support_discord') }} />
            <li dangerouslySetInnerHTML={{ __html: t('howto.support_email') }} />
          </ul>
          <p className="howto-note" dangerouslySetInnerHTML={{ __html: t('howto.support_note') }} />
        </div>
      </div>

      {/* ===================== PAYMENTS + STATS (2 colonnes) ===================== */}
      <div className="howto-two-col">
        <div className="modern-info-card">
          <h3>{t('howto.payments_title')}</h3>
          <p dangerouslySetInnerHTML={{ __html: t('howto.payments_desc') }} />
          <ul>
            {(t('howto.payments_points', { returnObjects: true }) as string[]).map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>
        </div>
        <div className="modern-info-card">
          <h3>{t('howto.stats_title')}</h3>
          <p dangerouslySetInnerHTML={{ __html: t('howto.stats_desc') }} />
          <ul>
            {(t('howto.stats_points', { returnObjects: true }) as string[]).map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>
          <p className="howto-note">{t('howto.stats_note')}</p>
        </div>
      </div>

    </div>
  );
};

export default HowToStart;
