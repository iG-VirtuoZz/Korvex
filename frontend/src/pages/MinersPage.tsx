import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/i18n";
import { getLeaderboard, getStats, LeaderboardMiner, PoolStats } from "../api";
import { useMiningMode, useCoinBasePath } from "../hooks/useMiningMode";

const formatHash = (h: number) => {
  if (!h || h <= 0) return "\u2014";
  if (h >= 1e12) return (h / 1e12).toFixed(2) + " TH/s";
  if (h >= 1e9) return (h / 1e9).toFixed(2) + " GH/s";
  if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
  if (h >= 1e3) return (h / 1e3).toFixed(2) + " KH/s";
  return h + " H/s";
};

const timeAgo = (dateStr: string | null) => {
  if (!dateStr) return "\u2014";
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return i18n.t('time.s_ago', { count: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return i18n.t('time.min_ago', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return i18n.t('time.h_ago', { count: hr });
  return i18n.t('time.d_ago', { count: Math.floor(hr / 24) });
};

type SortField = "hashrate_15m" | "hashrate_1h" | "workers_count" | "blocks_found" | "last_share_at";

const MinersPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const mode = useMiningMode();
  const basePath = useCoinBasePath();
  const [miners, setMiners] = useState<LeaderboardMiner[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortField>("hashrate_1h");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getLeaderboard({
      limit: pageSize,
      offset: page * pageSize,
      sort,
      order,
      search: search || undefined,
      mode,
    })
      .then((data) => {
        setMiners(data.miners);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pageSize, page, sort, order, search, mode]);

  useEffect(() => {
    load();
    getStats(mode).then(setStats).catch(() => {});
    const timer = setInterval(() => {
      load();
      getStats(mode).then(setStats).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [load, mode]);

  useEffect(() => {
    setPage(0);
  }, [search, pageSize]);

  const handleSort = (field: SortField) => {
    if (sort === field) {
      setOrder(order === "desc" ? "asc" : "desc");
    } else {
      setSort(field);
      setOrder("desc");
    }
  };

  const sortArrow = (field: SortField) => {
    if (sort !== field) return "";
    return order === "desc" ? " \u25BC" : " \u25B2";
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 2000);
  };

  const totalPages = Math.ceil(total / pageSize);
  const poolHr = stats?.hashrate || 0;

  return (
    <div className="layout-modern">
      {/* Header */}
      <div className="modern-header">
        <h1>{mode === 'solo' ? t('miners.title_solo') : t('miners.title')}</h1>
        <p>{mode === 'solo' ? t('miners.subtitle_solo') : t('miners.subtitle')}</p>
      </div>

      {/* Stats grid */}
      <div className="modern-stats-grid">
        <div className="modern-stat-card">
          <div className="msc-label">{t('miners.total_miners')}</div>
          <div className="msc-value">{stats?.minersTotal || 0}</div>
        </div>
        <div className="modern-stat-card">
          <div className="msc-label">{t('miners.total_workers')}</div>
          <div className="msc-value">{stats?.workersTotal || 0}</div>
        </div>
        <div className="modern-stat-card">
          <div className="msc-label">{mode === 'solo' ? t('miners.solo_hashrate') : t('miners.pool_hashrate')}</div>
          <div className="msc-value">{formatHash(poolHr)}</div>
        </div>
      </div>

      {/* Miners table */}
      <div className="modern-info-card miners-table-card">
        <div className="modern-info-title">{t('miners.leaderboard')}</div>

        {/* Controls */}
        <div className="miners-controls">
          <div className="miners-search">
            <input
              type="text"
              placeholder={t('miners.filter_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="miners-clear" onClick={() => setSearch("")}>
                &times;
              </button>
            )}
          </div>
          <div className="miners-meta">
            <span className="miners-total">{total > 1 ? t('miners.miners_count_plural', { count: total }) : t('miners.miners_count', { count: total })}</span>
            <select
              className="miners-pagesize"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={10}>10 {t('miners.per_page')}</option>
              <option value={25}>25 {t('miners.per_page')}</option>
              <option value={50}>50 {t('miners.per_page')}</option>
              <option value={100}>100 {t('miners.per_page')}</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="miners-table-scroll">
          <table className="miners-table">
            <thead>
              <tr>
                <th className="miners-rank">#</th>
                <th>{t('miners.address')}</th>
                <th className="miners-sortable" onClick={() => handleSort("hashrate_15m")}>
                  {t('miners.hashrate_15m')}<span className="miners-sort-arrow">{sortArrow("hashrate_15m")}</span>
                </th>
                <th className="miners-sortable" onClick={() => handleSort("hashrate_1h")}>
                  {t('miners.hashrate_1h')}<span className="miners-sort-arrow">{sortArrow("hashrate_1h")}</span>
                </th>
                <th className="miners-sortable miners-hide-mobile" onClick={() => handleSort("workers_count")}>
                  {t('miners.workers')}<span className="miners-sort-arrow">{sortArrow("workers_count")}</span>
                </th>
                <th className="miners-sortable miners-hide-mobile" onClick={() => handleSort("blocks_found")}>
                  {t('miners.blocks')}<span className="miners-sort-arrow">{sortArrow("blocks_found")}</span>
                </th>
                <th className="miners-sortable" onClick={() => handleSort("last_share_at")}>
                  {t('miners.last_share')}<span className="miners-sort-arrow">{sortArrow("last_share_at")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {miners.map((m, i) => {
                const isActive = m.last_share_at && (Date.now() - new Date(m.last_share_at).getTime()) < 900000;
                return (
                  <tr key={m.address} className={loading ? "miners-row-loading" : ""}>
                    <td className="miners-rank">{page * pageSize + i + 1}</td>
                    <td>
                      <div className="miners-address-cell">
                        <span className={`miners-status-dot ${isActive ? "active" : "idle"}`} />
                        <span
                          className="miners-address"
                          onClick={() => navigate(basePath + "/miner/" + m.address)}
                          title={m.address}
                        >
                          {m.address}
                        </span>
                        <button
                          className={"miners-copy" + (copied === m.address ? " copied" : "")}
                          onClick={() => copyAddress(m.address)}
                          title={t('miners.copy_address')}
                        >
                          {copied === m.address ? "\u2713" : "\u2398"}
                        </button>
                      </div>
                    </td>
                    <td>{formatHash(m.hashrate_15m)}</td>
                    <td>{formatHash(m.hashrate_1h)}</td>
                    <td className="miners-hide-mobile">{m.workers_count}</td>
                    <td className="miners-hide-mobile">{m.blocks_found || "\u2014"}</td>
                    <td style={{ color: "var(--text-dim)" }}>{timeAgo(m.last_share_at)}</td>
                  </tr>
                );
              })}
              {miners.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text-dim)", padding: 32 }}>
                    {search ? t('miners.no_miners_search') : t('miners.no_miners')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="miners-pagination">
            <button onClick={() => setPage(0)} disabled={page === 0}>
              &laquo;
            </button>
            <button onClick={() => setPage(page - 1)} disabled={page === 0}>
              &lsaquo;
            </button>
            <span className="miners-page-info">
              {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1}>
              &rsaquo;
            </button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>
              &raquo;
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MinersPage;
