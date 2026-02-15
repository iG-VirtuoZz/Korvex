import { useLocation } from "react-router-dom";

export function useMiningMode(): 'pplns' | 'solo' {
  const { pathname } = useLocation();
  return pathname.includes("ergo-solo") ? 'solo' : 'pplns';
}

export function useCoinBasePath(): string {
  const mode = useMiningMode();
  return mode === 'solo' ? '/coin/ergo-solo' : '/coin/ergo';
}
