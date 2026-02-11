import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getHealth, HealthData } from "../api";

const Status: React.FC = () => {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () => {
      getHealth().then(setHealth).catch(() => setError(true));
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const isOnline = health && health.status === "ok" && health.node.synced;

  return (
    <div className="status-page">
      <div className="status-block">
        {error ? (
          <>
            <div className="status-dot status-dot-down" />
            <div className="status-headline">{t('status.unreachable')}</div>
            <div className="status-detail">{t('status.try_later')}</div>
          </>
        ) : !health ? (
          <>
            <div className="status-dot status-dot-checking" />
            <div className="status-headline">{t('status.checking')}</div>
          </>
        ) : isOnline ? (
          <>
            <div className="status-dot status-dot-ok" />
            <div className="status-headline">{t('status.pool_online')}</div>
            <div className="status-detail">{t('status.operational')}</div>
          </>
        ) : (
          <>
            <div className="status-dot status-dot-warn" />
            <div className="status-headline">{t('status.degraded')}</div>
            <div className="status-detail">
              {!health.node.synced ? t('status.node_syncing') : t('status.some_issues')}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Status;
