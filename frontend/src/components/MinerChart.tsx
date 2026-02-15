import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getChartMinerHashrate, getChartWorkerHashrate, ChartPoint } from "../api";

const PERIODS = [
  { key: "1h", label: "1H" },
  { key: "1d", label: "1D" },
  { key: "7d", label: "7D" },
];

const formatHash = (v: number) => {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + " TH/s";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + " GH/s";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + " MH/s";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + " KH/s";
  return v.toFixed(0) + " H/s";
};

const formatXAxis = (tsNum: number, period: string) => {
  const d = new Date(tsNum);
  if (period === "1h" || period === "1d") return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
};

const computeTicks = (data: { tsNum: number }[], period: string): number[] => {
  if (data.length < 2) return [];
  const minTs = data[0].tsNum;
  const maxTs = data[data.length - 1].tsNum;
  const range = maxTs - minTs;
  if (range <= 0) return [minTs];

  let intervalMs: number;
  if (period === "1h") {
    intervalMs = 10 * 60 * 1000; // tick toutes les 10 minutes
  } else if (period === "1d") {
    intervalMs = 4 * 3600 * 1000;
  } else if (period === "7d") {
    intervalMs = 24 * 3600 * 1000;
  } else {
    intervalMs = 7 * 24 * 3600 * 1000;
  }

  const ticks: number[] = [];
  let firstTick: number;
  if (period === "1h") {
    const d = new Date(minTs);
    const m = Math.ceil(d.getMinutes() / 10) * 10;
    d.setMinutes(m, 0, 0);
    firstTick = d.getTime();
    if (firstTick < minTs) firstTick += intervalMs;
  } else if (period === "1d") {
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

// Recuperer une variable CSS
const getCSSVar = (varName: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
};

interface MinerChartProps {
  address: string;
  worker?: string;
  hideTitle?: boolean;
  mode?: string;
}

const MinerChart: React.FC<MinerChartProps> = ({ address, worker, hideTitle = false, mode }) => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("1d");
  const [rawData, setRawData] = useState<ChartPoint[]>([]);
  const [colors, setColors] = useState({ accent: "#f97316", card: "#18181b", border: "#27272a", text: "#a1a1aa" });

  // Mettre a jour les couleurs quand le style change
  useEffect(() => {
    const updateColors = () => {
      setColors({
        accent: getCSSVar("--accent", "#f97316"),
        card: getCSSVar("--card", "#18181b"),
        border: getCSSVar("--border", "#27272a"),
        text: getCSSVar("--text-dim", "#a1a1aa"),
      });
    };
    updateColors();
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const load = () => {
      const fetcher = worker
        ? getChartWorkerHashrate(address, worker, period, mode)
        : getChartMinerHashrate(address, period, mode);
      fetcher
        .then((r) => setRawData(r.data))
        .catch(() => setRawData([]));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [address, worker, period, mode]);

  const data = useMemo(() => {
    return rawData.map((p) => ({
      tsNum: new Date(p.ts).getTime(),
      value: Number(p.value),
    }));
  }, [rawData]);

  const xTicks = useMemo(() => computeTicks(data, period), [data, period]);

  const xDomain = useMemo(() => {
    if (data.length < 2) return ["auto", "auto"] as [string, string];
    return [data[0].tsNum, data[data.length - 1].tsNum] as [number, number];
  }, [data]);

  // ID unique pour le gradient (eviter collision si plusieurs charts)
  const gradientId = worker ? "grad-worker-hr-" + worker : "grad-miner-hr";

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-periods" style={{ marginLeft: 'auto' }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={period === p.key ? "active" : ""}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: colors.text }}>
          {t('chart.no_hashrate_data')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 15, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.accent} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colors.accent} stopOpacity={0} />
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
              tickFormatter={formatHash}
              stroke={colors.border}
              domain={[0, "auto"]}
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
              formatter={(v: any) => [formatHash(v), t('chart.hashrate')]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={colors.accent}
              fill={"url(#" + gradientId + ")"}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default MinerChart;
