import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getLeaderboard, LeaderboardMiner } from "../api";

const formatHash = (h: number) => {
  if (!h || h <= 0) return "\u2014";
  if (h >= 1e12) return (h / 1e12).toFixed(2) + " TH/s";
  if (h >= 1e9) return (h / 1e9).toFixed(2) + " GH/s";
  if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
  if (h >= 1e3) return (h / 1e3).toFixed(2) + " KH/s";
  return h + " H/s";
};

const formatErg = (nanoStr: string) => {
  if (!nanoStr || nanoStr === "0") return "\u2014";
  const val = Number(BigInt(nanoStr)) / 1e9;
  if (val < 0.0001) return "< 0.0001 ERG";
  return val.toFixed(4) + " ERG";
};

const timeAgo = (dateStr: string | null) => {
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

type SortField = "hashrate_15m" | "hashrate_1h" | "workers_count" | "blocks_found" | "last_share_at";

const MinersPage: React.FC = () => {
  const navigate = useNavigate();
  const [miners, setMiners] = useState<LeaderboardMiner[]>([]);
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
    })
      .then((data) => {
        setMiners(data.miners);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pageSize, page, sort, order, search]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // Reset page quand on cherche
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

  return (
    <div>
      <div className="page-title">
        <h1>MINERS</h1>
        <p>Active miners on KORVEX Pool</p>
      </div>

      <div className="card leaderboard-card">
        {/* Controls */}
        <div className="leaderboard-controls" style={{ padding: "18px 24px" }}>
          <div className="leaderboard-search">
            <input
              type="text"
              placeholder="Filter by address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="lb-clear" onClick={() => setSearch("")}>
                &times;
              </button>
            )}
          </div>
          <div className="leaderboard-meta">
            <span className="lb-total">{total} miner{total !== 1 ? "s" : ""}</span>
            <select
              className="lb-pagesize"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="leaderboard-scroll">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th className="lb-rank">#</th>
                <th>Address</th>
                <th className="lb-sortable" onClick={() => handleSort("hashrate_15m")}>
                  Hashrate 15m<span className="lb-sort-arrow">{sortArrow("hashrate_15m")}</span>
                </th>
                <th className="lb-sortable" onClick={() => handleSort("hashrate_1h")}>
                  Hashrate 1h<span className="lb-sort-arrow">{sortArrow("hashrate_1h")}</span>
                </th>
                <th className="lb-sortable lb-hide-mobile" onClick={() => handleSort("workers_count")}>
                  Workers<span className="lb-sort-arrow">{sortArrow("workers_count")}</span>
                </th>
                <th className="lb-sortable lb-hide-mobile" onClick={() => handleSort("blocks_found")}>
                  Blocks<span className="lb-sort-arrow">{sortArrow("blocks_found")}</span>
                </th>
                <th className="lb-sortable" onClick={() => handleSort("last_share_at")}>
                  Last Share<span className="lb-sort-arrow">{sortArrow("last_share_at")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {miners.map((m, i) => {
                const isActive = m.last_share_at && (Date.now() - new Date(m.last_share_at).getTime()) < 900000;
                return (
                  <tr key={m.address} className={loading ? "lb-row-loading" : ""}>
                    <td className="lb-rank">{page * pageSize + i + 1}</td>
                    <td>
                      <div className="lb-address-cell">
                        <span className={`lb-status-dot ${isActive ? "active" : "idle"}`} />
                        <span
                          className="lb-address"
                          onClick={() => navigate("/miner/" + m.address)}
                          title={m.address}
                        >
                          {m.address}
                        </span>
                        <button
                          className={"lb-copy" + (copied === m.address ? " copied" : "")}
                          onClick={() => copyAddress(m.address)}
                          title="Copy address"
                        >
                          {copied === m.address ? "\u2713" : "\u2398"}
                        </button>
                      </div>
                    </td>
                    <td>{formatHash(m.hashrate_15m)}</td>
                    <td>{formatHash(m.hashrate_1h)}</td>
                    <td className="lb-hide-mobile">{m.workers_count}</td>
                    <td className="lb-hide-mobile">{m.blocks_found || "\u2014"}</td>
                    <td style={{ color: "var(--text-dim)" }}>{timeAgo(m.last_share_at)}</td>
                  </tr>
                );
              })}
              {miners.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text-dim)", padding: 32 }}>
                    {search ? "No miners matching this address." : "No miners yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="leaderboard-pagination">
            <button onClick={() => setPage(0)} disabled={page === 0}>
              &laquo;
            </button>
            <button onClick={() => setPage(page - 1)} disabled={page === 0}>
              &lsaquo;
            </button>
            <span className="lb-page-info">
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
