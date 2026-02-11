import React from "react";
import { useTranslation } from "react-i18next";

const HowToStart: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="how-to-start-page">

      {/* ===================== 1. INTRODUCTION ===================== */}
      <h2>{t('howto.title')}</h2>
      <p dangerouslySetInnerHTML={{ __html: t('howto.intro_p1') }} />
      <p>{t('howto.intro_p2')}</p>

      <hr />

      {/* ===================== 2. SERVER ===================== */}
      <h3>{t('howto.server_title')}</h3>
      <p>{t('howto.server_desc')}</p>
      <table>
        <thead>
          <tr><th>{t('howto.server_region')}</th><th>{t('howto.server_server')}</th><th>{t('howto.server_port')}</th></tr>
        </thead>
        <tbody>
          <tr><td>{t('howto.server_europe')}</td><td>korvexpool.com</td><td>3416</td></tr>
        </tbody>
      </table>
      <p className="text-muted">
        {t('howto.server_note')}
      </p>

      <hr />

      {/* ===================== 3. WALLET ===================== */}
      <h3>{t('howto.wallet_title')}</h3>
      <p>{t('howto.wallet_desc')}</p>
      <p dangerouslySetInnerHTML={{ __html: t('howto.wallet_recommended') }} />
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t('howto.wallet_nautilus') }} />
        <li dangerouslySetInnerHTML={{ __html: t('howto.wallet_ergo') }} />
      </ul>
      <p className="text-muted">
        {t('howto.wallet_warning')}
      </p>

      <hr />

      {/* ===================== 4. MINING SOFTWARE ===================== */}
      <h3>{t('howto.software_title')}</h3>
      <p dangerouslySetInnerHTML={{ __html: t('howto.software_desc') }} />

      <div className="miner-recommendation">
        <h4>&#x2705; {t('howto.software_recommended_title')}</h4>
        <p className="text-muted">{t('howto.software_recommended_desc')}</p>
      </div>

      <h4>lolMiner <span className="badge-recommended">Recommended</span></h4>
      <p className="text-muted">{t('howto.lolminer_desc')}</p>
      <pre><code>lolMiner --algo AUTOLYKOS2 --pool korvexpool.com:3416 --user YOUR_WALLET.RIG_NAME</code></pre>

      <h4>TeamRedMiner <span className="badge-recommended">Recommended</span></h4>
      <p className="text-muted">{t('howto.teamredminer_desc')}</p>
      <pre><code>teamredminer -a autolykos2 -o stratum+tcp://korvexpool.com:3416 -u YOUR_WALLET.RIG_NAME -p x</code></pre>

      <h4>Rigel <span className="badge-recommended">Recommended</span></h4>
      <p className="text-muted">{t('howto.rigel_desc')}</p>
      <pre><code>rigel -a autolykos2 -o stratum+tcp://korvexpool.com:3416 -u YOUR_WALLET.RIG_NAME</code></pre>

      <div className="miner-recommendation miner-supported">
        <h4>&#x26A0;&#xFE0F; {t('howto.software_also_supported_title')}</h4>
        <p className="text-muted">{t('howto.software_also_supported_desc')}</p>
      </div>

      <h4>SRBMiner-MULTI</h4>
      <p className="text-muted">{t('howto.srbminer_desc')}</p>
      <pre><code>SRBMiner-MULTI --disable-cpu --algorithm autolykos2 --pool korvexpool.com:3416 --wallet YOUR_WALLET.RIG_NAME</code></pre>

      <p className="text-muted" dangerouslySetInnerHTML={{ __html: t('howto.vram_note') }} />

      <hr />

      {/* ===================== 5. POOL PARAMETERS ===================== */}
      <h3>{t('howto.params_title')}</h3>
      <table>
        <tbody>
          <tr><td><strong>{t('howto.params_coin')}</strong></td><td>ERGO (ERG)</td></tr>
          <tr><td><strong>{t('howto.params_algorithm')}</strong></td><td>Autolykos2</td></tr>
          <tr><td><strong>{t('howto.params_fee')}</strong></td><td>1%</td></tr>
          <tr><td><strong>{t('howto.params_reward')}</strong></td><td>PPLNS</td></tr>
          <tr><td><strong>{t('howto.params_min_payout')}</strong></td><td>1 ERG</td></tr>
          <tr><td><strong>{t('howto.params_confirmations')}</strong></td><td>{t('howto.params_confirmations_value')}</td></tr>
          <tr><td><strong>{t('howto.params_payouts')}</strong></td><td>{t('howto.params_payouts_value')}</td></tr>
          <tr><td><strong>{t('howto.params_port')}</strong></td><td>3416</td></tr>
        </tbody>
      </table>

      <hr />

      {/* ===================== 6. PPLNS ===================== */}
      <h3>{t('howto.pplns_title')}</h3>
      <p dangerouslySetInnerHTML={{ __html: t('howto.pplns_desc') }} />
      <p>{t('howto.pplns_window')}</p>
      <p dangerouslySetInnerHTML={{ __html: t('howto.pplns_key_points') }} />
      <ul>
        {(t('howto.pplns_points', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <hr />

      {/* ===================== 7. PAYMENTS ===================== */}
      <h3>{t('howto.payments_title')}</h3>
      <p dangerouslySetInnerHTML={{ __html: t('howto.payments_desc') }} />
      <ul>
        {(t('howto.payments_points', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <hr />

      {/* ===================== 8. STATS ===================== */}
      <h3>{t('howto.stats_title')}</h3>
      <p dangerouslySetInnerHTML={{ __html: t('howto.stats_desc') }} />
      <ul>
        {(t('howto.stats_points', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>
      <p className="text-muted">
        {t('howto.stats_note')}
      </p>

      <hr />

      {/* ===================== 9. SUPPORT ===================== */}
      <h3>{t('howto.support_title')}</h3>
      <p>{t('howto.support_desc')}</p>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t('howto.support_discord') }} />
        <li dangerouslySetInnerHTML={{ __html: t('howto.support_telegram') }} />
        <li dangerouslySetInnerHTML={{ __html: t('howto.support_email') }} />
      </ul>
      <p className="text-muted" dangerouslySetInnerHTML={{ __html: t('howto.support_note') }} />

    </div>
  );
};

export default HowToStart;
