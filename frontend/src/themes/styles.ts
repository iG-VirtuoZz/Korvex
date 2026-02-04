// Layouts/Designs pour Korvex Pool
// Les couleurs sont fixes (Neo Minimal orange), seul le design change

// Couleurs fixes Neo Minimal
const COLORS = {
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
};

export interface PoolLayout {
  id: string;
  name: string;
  description: string;
}

export const poolLayouts: PoolLayout[] = [
  {
    id: "clean-cards",
    name: "Clean Cards",
    description: "Aere et simple, cards bien separees",
  },
  {
    id: "dashboard-pro",
    name: "Dashboard Pro",
    description: "2 grandes sections Pool/Network",
  },
  {
    id: "modern-grid",
    name: "Modern Grid",
    description: "Grille moderne et equilibree",
  },
];

export const getLayoutById = (id: string): PoolLayout => {
  return poolLayouts.find((l) => l.id === id) || poolLayouts[0];
};

export const applyLayout = (layout: PoolLayout) => {
  const root = document.documentElement;

  // Appliquer les couleurs fixes
  root.style.setProperty("--bg", COLORS.bg);
  root.style.setProperty("--card", COLORS.card);
  root.style.setProperty("--card-hover", COLORS.cardHover);
  root.style.setProperty("--border", COLORS.border);
  root.style.setProperty("--text", COLORS.text);
  root.style.setProperty("--text-dim", COLORS.textDim);
  root.style.setProperty("--accent", COLORS.accent);
  root.style.setProperty("--accent-hover", COLORS.accentHover);
  root.style.setProperty("--accent-dim", COLORS.accentDim);
  root.style.setProperty("--accent-glow", COLORS.accentGlow);
  root.style.setProperty("--green", COLORS.green);
  root.style.setProperty("--yellow", COLORS.yellow);
  root.style.setProperty("--red", COLORS.red);
  root.style.setProperty("--gradient-start", COLORS.gradientStart);
  root.style.setProperty("--gradient-end", COLORS.gradientEnd);
  document.body.style.background = COLORS.bg;

  // Appliquer le layout via data attribute
  root.setAttribute("data-layout", layout.id);

  // Sauvegarder le choix
  localStorage.setItem("korvex-layout", layout.id);
};

export const loadSavedLayout = (): PoolLayout => {
  const savedId = localStorage.getItem("korvex-layout");
  return getLayoutById(savedId || "clean-cards");
};

// Export pour compatibilite avec l'ancien code
export type PoolStyle = PoolLayout;
export const poolStyles = poolLayouts;
export const getStyleById = getLayoutById;
export const applyStyle = applyLayout;
export const loadSavedStyle = loadSavedLayout;
