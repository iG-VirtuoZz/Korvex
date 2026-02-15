// Themes for Korvex Pool
// 2 modes: Dark (pure black) and Light (white)

export interface BgTheme {
  id: string;
  name: string;
  bg: string;
  card: string;
  cardHover: string;
  border: string;
  text: string;
  textDim: string;
  accent: string;
  accentHover: string;
  accentDim: string;
  accentGlow: string;
  green: string;
  yellow: string;
  red: string;
  gradientStart: string;
  gradientEnd: string;
  preview: string;
}

export const bgThemes: BgTheme[] = [
  {
    id: "noir-pur",
    name: "Sombre",
    bg: "#09090b",
    card: "#18181b",
    cardHover: "#27272a",
    border: "#3f3f46",
    text: "#fafafa",
    textDim: "#a1a1aa",
    accent: "#f97316",
    accentHover: "#fb923c",
    accentDim: "#ea580c",
    accentGlow: "rgba(249, 115, 22, 0.08)",
    green: "#22c55e",
    yellow: "#fbbf24",
    red: "#ef4444",
    gradientStart: "#fdba74",
    gradientEnd: "#ea580c",
    preview: "#09090b",
  },
  {
    id: "clair",
    name: "Clair",
    bg: "#f5f5f5",
    card: "#ffffff",
    cardHover: "#f0f0f0",
    border: "#e0e0e0",
    text: "#1a1a1a",
    textDim: "#6b7280",
    accent: "#ea580c",
    accentHover: "#f97316",
    accentDim: "#c2410c",
    accentGlow: "rgba(234, 88, 12, 0.08)",
    green: "#16a34a",
    yellow: "#ca8a04",
    red: "#dc2626",
    gradientStart: "#fb923c",
    gradientEnd: "#c2410c",
    preview: "#f5f5f5",
  },
];

export const getBgThemeById = (id: string): BgTheme => {
  return bgThemes.find((t) => t.id === id) || bgThemes[0];
};

export const applyBgTheme = (theme: BgTheme) => {
  const root = document.documentElement;

  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--card", theme.card);
  root.style.setProperty("--card-hover", theme.cardHover);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--text-dim", theme.textDim);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-hover", theme.accentHover);
  root.style.setProperty("--accent-dim", theme.accentDim);
  root.style.setProperty("--accent-glow", theme.accentGlow);
  root.style.setProperty("--green", theme.green);
  root.style.setProperty("--yellow", theme.yellow);
  root.style.setProperty("--red", theme.red);
  root.style.setProperty("--gradient-start", theme.gradientStart);
  root.style.setProperty("--gradient-end", theme.gradientEnd);
  document.body.style.background = theme.bg;

  // Class for light mode (allows specific CSS overrides)
  if (theme.id === "clair") {
    root.classList.add("light-mode");
  } else {
    root.classList.remove("light-mode");
  }

  root.setAttribute("data-layout", "modern-grid");
  localStorage.setItem("korvex-bg-theme", theme.id);
};

export const loadSavedBgTheme = (): BgTheme => {
  const savedId = localStorage.getItem("korvex-bg-theme");
  return getBgThemeById(savedId || "noir-pur");
};

// Legacy code compatibility
export interface PoolLayout { id: string; name: string; description: string; }
export const applyLayout = (_layout: PoolLayout) => applyBgTheme(loadSavedBgTheme());
export const loadSavedLayout = (): PoolLayout => ({ id: "modern-grid", name: "Modern Grid", description: "" });
