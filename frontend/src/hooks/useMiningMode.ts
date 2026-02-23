import { useLocation } from "react-router-dom";

export type CoinId = 'ergo' | 'monero';

export function useCoin(): CoinId {
  const { pathname } = useLocation();
  if (pathname.includes('/coin/monero')) return 'monero';
  return 'ergo';
}

export function useMiningMode(): 'pplns' | 'solo' {
  const { pathname } = useLocation();
  return pathname.includes("ergo-solo") ? 'solo' : 'pplns';
}

export function useCoinBasePath(): string {
  const coin = useCoin();
  const mode = useMiningMode();
  if (coin === 'monero') return '/coin/monero';
  return mode === 'solo' ? '/coin/ergo-solo' : '/coin/ergo';
}
