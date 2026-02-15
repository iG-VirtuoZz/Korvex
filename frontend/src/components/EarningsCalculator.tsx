import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface EarningsCalculatorProps {
  minerHashrate: number;
  networkDifficulty: number;
  blockReward: number;
  poolFee: number;
  ergPriceUsd: number;
  ergPriceBtc: number;
}

type HashUnit = "MH/s" | "GH/s" | "TH/s";

const UNIT_MULTIPLIERS: Record<HashUnit, number> = {
  "MH/s": 1e6,
  "GH/s": 1e9,
  "TH/s": 1e12,
};

const bestUnit = (hashrate: number): HashUnit => {
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
}) => {
  const { t } = useTranslation();
  const initialUnit = bestUnit(minerHashrate);
  const [unit, setUnit] = useState<HashUnit>(initialUnit);
  const initialValue = minerHashrate > 0 ? (minerHashrate / UNIT_MULTIPLIERS[initialUnit]).toFixed(2) : "";
  const [inputValue, setInputValue] = useState(initialValue);

  useEffect(() => {
    if (minerHashrate > 0) {
      const u = bestUnit(minerHashrate);
      setUnit(u);
      setInputValue((minerHashrate / UNIT_MULTIPLIERS[u]).toFixed(2));
    }
  }, [minerHashrate]);

  const inputHashrate = (parseFloat(inputValue) || 0) * UNIT_MULTIPLIERS[unit];
  const networkHashrate = networkDifficulty / 120;
  const minerShare = networkHashrate > 0 ? inputHashrate / networkHashrate : 0;
  const dailyErg = 720 * blockReward * minerShare * (1 - poolFee);
  const weeklyErg = dailyErg * 7;
  const monthlyErg = dailyErg * 30;

  const formatErg = (value: number): string => {
    if (value <= 0 || !isFinite(value)) return "0.0000";
    if (value < 0.0001) return "< 0.0001";
    return value.toFixed(4);
  };

  const formatUsd = (erg: number): string => {
    if (ergPriceUsd <= 0 || erg <= 0 || !isFinite(erg)) return "N/A";
    const usd = erg * ergPriceUsd;
    if (usd < 0.01) return "< $0.01";
    return "$" + usd.toFixed(2);
  };

  const formatBtc = (erg: number): string => {
    if (ergPriceBtc <= 0 || erg <= 0 || !isFinite(erg)) return "N/A";
    const btc = erg * ergPriceBtc;
    if (btc < 0.00000001) return "< 0.00000001";
    return btc.toFixed(8);
  };

  const units: HashUnit[] = ["MH/s", "GH/s", "TH/s"];

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
            <th>ERG</th>
            <th>USD</th>
            <th>BTC</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="earnings-row-label">{t('calculator.daily')}</td>
            <td className="earnings-row-value">{formatErg(dailyErg)} ERG</td>
            <td className="earnings-row-value earnings-usd">{formatUsd(dailyErg)}</td>
            <td className="earnings-row-value earnings-btc">{formatBtc(dailyErg)} BTC</td>
          </tr>
          <tr>
            <td className="earnings-row-label">{t('calculator.weekly')}</td>
            <td className="earnings-row-value">{formatErg(weeklyErg)} ERG</td>
            <td className="earnings-row-value earnings-usd">{formatUsd(weeklyErg)}</td>
            <td className="earnings-row-value earnings-btc">{formatBtc(weeklyErg)} BTC</td>
          </tr>
          <tr>
            <td className="earnings-row-label">{t('calculator.monthly')}</td>
            <td className="earnings-row-value">{formatErg(monthlyErg)} ERG</td>
            <td className="earnings-row-value earnings-usd">{formatUsd(monthlyErg)}</td>
            <td className="earnings-row-value earnings-btc">{formatBtc(monthlyErg)} BTC</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default EarningsCalculator;
