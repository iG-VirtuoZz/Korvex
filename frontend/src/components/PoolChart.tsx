import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getChartPoolHashrate, getChartNetworkDifficulty, ChartPoint } from "../api";

const PERIODS = [
  { key: "1d", label: "1D" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "1M" },
  { key: "1y", label: "1Y" },
  { key: "all", label: "All" },
];

const formatValue = (v: number, tab: string) => {
  if (tab === "difficulty") {
    if (v >= 1e15) return (v / 1e15).toFixed(2) + " P";
    if (v >= 1e12) return (v / 1e12).toFixed(2) + " T";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + " G";
    return v.toFixed(0);
  }
  if (v >= 1e12) return (v / 1e12).toFixed(2) + " TH/s";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + " GH/s";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + " MH/s";
  return v.toFixed(0) + " H/s";
};

const formatXAxis = (tsNum: number, period: string) => {
  const d = new Date(tsNum);
  if (period === "all") return d.getFullYear().toString();
  if (period === "1y") return d.toLocaleDateString("fr-FR", { month: "short" });
  if (period === "1d") return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
};

const computeTicks = (data: { tsNum: number }[], period: string): number[] => {
  if (data.length < 2) return [];
  const minTs = data[0].tsNum;
  const maxTs = data[data.length - 1].tsNum;
  const range = maxTs - minTs;
  if (range <= 0) return [minTs];

  let intervalMs: number;
  if (period === "1d") intervalMs = 4 * 3600 * 1000;
  else if (period === "7d") intervalMs = 24 * 3600 * 1000;
  else if (period === "30d") intervalMs = 7 * 24 * 3600 * 1000;
  else if (period === "1y") intervalMs = 30 * 24 * 3600 * 1000;
  else intervalMs = 365 * 24 * 3600 * 1000;

  const ticks: number[] = [];
  let firstTick: number;
  if (period === "1d") {
    const d = new Date(minTs);
    const h = Math.ceil(d.getHours() / 4) * 4;
    d.setHours(h, 0, 0, 0);
    firstTick = d.getTime();
    if (firstTick < minTs) firstTick += intervalMs;
  } else if (period === "7d") {
    const d = new Date(minTs);
    d.setHours(0, 0, 0, 0);
    firstTick = d.getTime() + intervalMs;
  } else {
    firstTick = minTs + intervalMs;
  }

  for (let t = firstTick; t <= maxTs; t += intervalMs) {
    ticks.push(t);
  }
  return ticks;
};

// Retrieve a CSS variable
const getCSSVar = (varName: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
};

interface ChartDataPoint {
  tsNum: number;
  value: number;
  height?: number;
}

interface PoolChartProps {
  mode?: string;
}

const PoolChart: React.FC<PoolChartProps> = ({ mode }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState("hashrate");
  const [period, setPeriod] = useState("1d");
  const [rawData, setRawData] = useState<ChartPoint[]>([]);
  const [colors, setColors] = useState({ accent: "#f97316", yellow: "#fbbf24", card: "#18181b", border: "#27272a", text: "#a1a1aa" });

  // Update colors when the style changes
  useEffect(() => {
    const updateColors = () => {
      setColors({
        accent: getCSSVar("--accent", "#f97316"),
        yellow: getCSSVar("--yellow", "#fbbf24"),
        card: getCSSVar("--card", "#18181b"),
        border: getCSSVar("--border", "#27272a"),
        text: getCSSVar("--text-dim", "#a1a1aa"),
      });
    };
    updateColors();
    // Observe style changes
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const load = () => {
      if (tab === "hashrate") {
        getChartPoolHashrate(period, mode).then((r) => setRawData(r.data)).catch(() => setRawData([]));
      } else {
        getChartNetworkDifficulty(period).then((r) => setRawData(r.data)).catch(() => setRawData([]));
      }
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [tab, period, mode]);

  const data: ChartDataPoint[] = useMemo(() => {
    return rawData.map((p) => ({
      tsNum: new Date(p.ts).getTime(),
      value: Number(p.value),
      height: p.height ? Number(p.height) : undefined,
    }));
  }, [rawData]);

  // Use theme colors
  const color = tab === "hashrate" ? colors.accent : colors.yellow;
  const curveType = tab === "difficulty" ? "stepAfter" : "monotone";

  const xTicks = useMemo(() => computeTicks(data, period), [data, period]);

  const xDomain = useMemo(() => {
    if (data.length < 2) return ["auto", "auto"] as [string, string];
    return [data[0].tsNum, data[data.length - 1].tsNum] as [number, number];
  }, [data]);

  const yDomain = useMemo(() => {
    if (tab !== "difficulty" || data.length === 0) return [0, "auto"] as [number, string];
    if (period === "all") return [0, "auto"] as [number, string];

    const values = data.map((d) => d.value).filter((v) => v > 0);
    if (values.length === 0) return [0, "auto"] as [number, string];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const unit = 1e12;
    const marginBottom = Math.max(range * 0.5, 50 * unit);
    const marginTop = Math.max(range * 0.3, 30 * unit);
    const yMin = Math.max(0, Math.floor((min - marginBottom) / (10 * unit)) * (10 * unit));
    const yMax = Math.ceil((max + marginTop) / (10 * unit)) * (10 * unit);
    return [yMin, yMax] as [number, number];
  }, [data, tab, period]);

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-tabs">
          <button className={tab === "hashrate" ? "active" : ""} onClick={() => setTab("hashrate")}>
            {t('chart.pool_hashrate')}
          </button>
          <button className={tab === "difficulty" ? "active" : ""} onClick={() => setTab("difficulty")}>
            {t('chart.network_difficulty')}
          </button>
        </div>
        <div className="chart-periods">
          {PERIODS.map((p) => (
            <button key={p.key} className={period === p.key ? "active" : ""} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: colors.text }}>
          {t('chart.no_data')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data} margin={{ top: 15, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={"grad-" + tab} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="tsNum"
              type="number"
              scale="time"
              domain={xDomain}
              tickFormatter={(ts) => formatXAxis(ts, period)}
              stroke={colors.border}
              ticks={xTicks}
              tick={{ fontSize: 12, fill: colors.text }}
            />
            <YAxis
              tickFormatter={(v) => formatValue(v, tab)}
              stroke={colors.border}
              domain={yDomain}
              tick={{ fontSize: 12, fill: colors.text }}
            />
            <Tooltip
              contentStyle={{
                background: colors.card,
                border: "1px solid " + colors.border,
                borderRadius: 8,
                color: colors.text,
              }}
              labelFormatter={(tsNum) => new Date(tsNum).toLocaleString()}
              formatter={(v: any) => [formatValue(v, tab), tab === "hashrate" ? t('chart.hashrate') : t('chart.difficulty')]}
            />
            <Area type={curveType} dataKey="value" stroke={color} fill={"url(#grad-" + tab + ")"} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default PoolChart;
