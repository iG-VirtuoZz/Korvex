import React, { useEffect, useState } from "react";
import { getHealth, HealthData } from "../api";

const Status: React.FC = () => {
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
            <div className="status-headline">Unable to reach server</div>
            <div className="status-detail">Please try again later.</div>
          </>
        ) : !health ? (
          <>
            <div className="status-dot status-dot-checking" />
            <div className="status-headline">Checking...</div>
          </>
        ) : isOnline ? (
          <>
            <div className="status-dot status-dot-ok" />
            <div className="status-headline">Pool Online</div>
            <div className="status-detail">Stratum, Node & Payments operational</div>
          </>
        ) : (
          <>
            <div className="status-dot status-dot-warn" />
            <div className="status-headline">Degraded Performance</div>
            <div className="status-detail">
              {!health.node.synced ? "Node is syncing. Mining may be temporarily affected." : "Some services are experiencing issues."}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Status;
