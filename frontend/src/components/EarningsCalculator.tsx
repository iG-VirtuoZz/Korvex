import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { CoinId } from "../hooks/useMiningMode";

interface EarningsCalculatorProps {
  minerHashrate: number;
  networkDifficulty: number;
  blockReward: number;
  poolFee: number;
  ergPriceUsd: number;
  ergPriceBtc: number;
  coin?: CoinId;
  symbol?: string;
}

type HashUnit = "H/s" | "KH/s" | "MH/s" | "GH/s" | "TH/s";

const UNIT_MULTIPLIERS: Record<HashUnit, number> = {
  "H/s": 1,
  "KH/s": 1e3,
  "MH/s": 1e6,
  "GH/s": 1e9,
  "TH/s": 1e12,
};

const ERGO_UNITS: HashUnit[] = ["MH/s", "GH/s", "TH/s"];
const XMR_UNITS: HashUnit[] = ["H/s", "KH/s", "MH/s"];

const bestUnit = (hashrate: number, coin: CoinId): HashUnit => {
  if (coin === 'monero') {
    if (hashrate >= 1e6) return "MH/s";
    if (hashrate >= 1e3) return "KH/s";
    return "H/s";
  }
  if (hashrate >= 1e12) return "TH/s";
  if (hashrate >= 1e9) return "GH/s";
  return "MH/s";
};

const EarningsCalculator: React.FC<EarningsCalculatorProps> = ({
  minerHashrate,
  networkDifficulty,
  blockReward,
  poolFee,
  ergPriceUsd,
  ergPriceBtc,
  coin = 'ergo',
  symbol = 'ERG',
}) => {
  const { t } = useTranslation();
  const units = coin === 'monero' ? XMR_UNITS : ERGO_UNITS;
  const initialUnit = bestUnit(minerHashrate, coin);
  const [unit, setUnit] = useState<HashUnit>(initialUnit);
  const initialValue = minerHashrate > 0 ? (minerHashrate / UNIT_MULTIPLIERS[initialUnit]).toFixed(2) : "";
  const [inputValue, setInputValue] = useState(initialValue);

  useEffect(() => {
    if (minerHashrate > 0) {
      const u = bestUnit(minerHashrate, coin);
      setUnit(u);
      setInputValue((minerHashrate / UNIT_MULTIPLIERS[u]).toFixed(2));
    }
  }, [minerHashrate, coin]);

  const inputHashrate = (parseFloat(inputValue) || 0) * UNIT_MULTIPLIERS[unit];
  const networkHashrate = networkDifficulty / 120;
  const minerShare = networkHashrate > 0 ? inputHashrate / networkHashrate : 0;
  const dailyCoin = 720 * blockReward * minerShare * (1 - poolFee);
  const weeklyCoin = dailyCoin * 7;
  const monthlyCoin = dailyCoin * 30;

  const decimals = coin === 'monero' ? 6 : 4;
  const minDisplay = coin === 'monero' ? 0.000001 : 0.0001;
  const minLabel = coin === 'monero' ? "< 0.000001" : "< 0.0001";

  const formatCoin = (value: number): string => {
    if (value <= 0 || !isFinite(value)) return (0).toFixed(decimals);
    if (value < minDisplay) return minLabel;
    return value.toFixed(decimals);
  };

  const formatUsd = (val: number): string => {
    if (ergPriceUsd <= 0 || val <= 0 || !isFinite(val)) return "N/A";
    const usd = val * ergPriceUsd;
    if (usd < 0.01) return "< $0.01";
    return "$" + usd.toFixed(2);
  };

  const formatBtc = (val: number): string => {
    if (ergPriceBtc <= 0 || val <= 0 || !isFinite(val)) return "N/A";
    const btc = val * ergPriceBtc;
    if (btc < 0.00000001) return "< 0.00000001";
    return btc.toFixed(8);
  };

  return (
    <div className="earnings-calc">
      <h3 className="earnings-title">{t('calculator.title')}</h3>
      <p className="earnings-subtitle">
        {t('calculator.subtitle')}
      </p>

      <div className="earnings-inputs">
        <input
          type="number"
          step="0.01"
          min="0"
          className="earnings-field"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="0.00"
        />
        <select
          className="earnings-select"
          value={unit}
          onChange={(e) => {
            const newUnit = e.target.value as HashUnit;
            const currentH = (parseFloat(inputValue) || 0) * UNIT_MULTIPLIERS[unit];
            const newVal = currentH / UNIT_MULTIPLIERS[newUnit];
            setUnit(newUnit);
            setInputValue(newVal > 0 ? newVal.toFixed(2) : "");
          }}
        >
          {units.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>

      <table className="earnings-table">
        <thead>
          <tr>
            <th></th>
            <th>{symbol}</th>
            <th>USD</th>
            <th>BTC</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="earnings-row-label">{t('calculator.daily')}</td>
            <td className="earnings-row-value">{formatCoin(dailyCoin)} {symbol}</td>
            <td className="earnings-row-value earnings-usd">{formatUsd(dailyCoin)}</td>
            <td className="earnings-row-value earnings-btc">{formatBtc(dailyCoin)} BTC</td>
          </tr>
          <tr>
            <td className="earnings-row-label">{t('calculator.weekly')}</td>
            <td className="earnings-row-value">{formatCoin(weeklyCoin)} {symbol}</td>
            <td className="earnings-row-value earnings-usd">{formatUsd(weeklyCoin)}</td>
            <td className="earnings-row-value earnings-btc">{formatBtc(weeklyCoin)} BTC</td>
          </tr>
          <tr>
            <td className="earnings-row-label">{t('calculator.monthly')}</td>
            <td className="earnings-row-value">{formatCoin(monthlyCoin)} {symbol}</td>
            <td className="earnings-row-value earnings-usd">{formatUsd(monthlyCoin)}</td>
            <td className="earnings-row-value earnings-btc">{formatBtc(monthlyCoin)} BTC</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default EarningsCalculator;
