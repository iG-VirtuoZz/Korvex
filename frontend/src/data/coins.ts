export interface CoinMode {
  id: string;
  label: string;
  active: boolean;
  fee: string;
  minPayout: string;
  port: number;
  route: string;
}

export interface CoinConfig {
  id: string;
  name: string;
  symbol: string;
  algorithm: string;
  iconColor: string;
  active: boolean;
  modes: CoinMode[];
}

export const coins: CoinConfig[] = [
  {
    id: "ergo",
    name: "Ergo",
    symbol: "ERG",
    algorithm: "Autolykos2",
    iconColor: "#ff5722",
    active: true,
    modes: [
      {
        id: "pool",
        label: "PPLNS",
        active: true,
        fee: "1%",
        minPayout: "1 ERG",
        port: 3416,
        route: "/coin/ergo",
      },
      {
        id: "solo",
        label: "Solo",
        active: true,
        fee: "1.5%",
        minPayout: "1 ERG",
        port: 3417,
        route: "/coin/ergo-solo",
      },
    ],
  },
  {
    id: "kaspa",
    name: "Kaspa",
    symbol: "KAS",
    algorithm: "kHeavyHash",
    iconColor: "#49eacb",
    active: false,
    modes: [
      {
        id: "pool",
        label: "PPLNS",
        active: false,
        fee: "1%",
        minPayout: "10 KAS",
        port: 3418,
        route: "",
      },
      {
        id: "solo",
        label: "Solo",
        active: false,
        fee: "1.5%",
        minPayout: "10 KAS",
        port: 3419,
        route: "",
      },
    ],
  },
];
