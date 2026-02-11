import React from "react";
import { useTranslation } from "react-i18next";

const Legal: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="legal-page">

      <h2>{t('legal.mentions_title')}</h2>
      <p dangerouslySetInnerHTML={{ __html: t('legal.mentions_editor') }} />
      <p dangerouslySetInnerHTML={{ __html: t('legal.mentions_contact') }} />
      <p dangerouslySetInnerHTML={{ __html: t('legal.mentions_host') }} />
      <p dangerouslySetInnerHTML={{ __html: t('legal.mentions_domain') }} />

      <hr />

      <h2>{t('legal.cgu_title')}</h2>
      <p>{t('legal.cgu_updated')}</p>

      <h3>{t('legal.cgu1_title')}</h3>
      <p>{t('legal.cgu1_text')}</p>

      <h3>{t('legal.cgu2_title')}</h3>
      <ul>
        {(t('legal.cgu2_items', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <h3>{t('legal.cgu3_title')}</h3>
      <ul>
        {(t('legal.cgu3_items', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <h3>{t('legal.cgu4_title')}</h3>
      <ul>
        {(t('legal.cgu4_items', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <h3>{t('legal.cgu5_title')}</h3>
      <ul>
        {(t('legal.cgu5_items', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <h3>{t('legal.cgu6_title')}</h3>
      <p>{t('legal.cgu6_text')}</p>

      <h3>{t('legal.cgu7_title')}</h3>
      <p>{t('legal.cgu7_text')}</p>

      <hr />

      <h2>{t('legal.privacy_title')}</h2>
      <p>{t('legal.privacy_updated')}</p>

      <h3>{t('legal.privacy1_title')}</h3>
      <p>{t('legal.privacy1_desc')}</p>
      <ul>
        {(t('legal.privacy1_items', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <h3>{t('legal.privacy2_title')}</h3>
      <p>{t('legal.privacy2_desc')}</p>
      <ul>
        {(t('legal.privacy2_items', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <h3>{t('legal.privacy3_title')}</h3>
      <p>{t('legal.privacy3_desc')}</p>
      <ul>
        {(t('legal.privacy3_items', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <h3>{t('legal.privacy4_title')}</h3>
      <p>{t('legal.privacy4_text')}</p>

      <h3>{t('legal.privacy5_title')}</h3>
      <ul>
        {(t('legal.privacy5_items', { returnObjects: true }) as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>

      <h3>{t('legal.privacy6_title')}</h3>
      <p>{t('legal.privacy6_text')}</p>

      <h3>{t('legal.privacy7_title')}</h3>
      <p>{t('legal.privacy7_text')}</p>
    </div>
  );
};

export default Legal;
