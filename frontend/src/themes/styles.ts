// Styles complets pour Korvex Pool
// Chaque style a ses propres couleurs + modifications CSS

export interface PoolStyle {
  id: string;
  name: string;
  description: string;
  colors: {
    bg: string;
    bgGradient?: string;
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
  };
  effects: {
    cardBlur?: string;
    cardBg?: string;
    cardBorder?: string;
    cardRadius: string;
    cardShadow?: string;
    headerBlur?: string;
    headerBg?: string;
    buttonRadius: string;
    inputRadius: string;
    tableStyle: 'default' | 'minimal' | 'bordered' | 'striped';
    glowEffects: boolean;
  };
}

export const poolStyles: PoolStyle[] = [
  {
    id: "current",
    name: "Classic",
    description: "Design actuel de Korvex",
    colors: {
      bg: "#111827",
      card: "#1a2332",
      cardHover: "#1f2b3d",
      border: "#2d3748",
      text: "#c9d1d9",
      textDim: "#8b949e",
      accent: "#00D4FF",
      accentHover: "#67E8F9",
      accentDim: "#0891B2",
      accentGlow: "rgba(0, 212, 255, 0.15)",
      green: "#2ea043",
      yellow: "#d29922",
      red: "#f85149",
      gradientStart: "#A5F3FC",
      gradientEnd: "#0891B2",
    },
    effects: {
      cardRadius: "12px",
      buttonRadius: "8px",
      inputRadius: "8px",
      tableStyle: "default",
      glowEffects: true,
    },
  },
  {
    id: "glass",
    name: "Glassmorphism",
    description: "Effets de verre et transparences",
    colors: {
      bg: "#0a0a1a",
      bgGradient: "radial-gradient(ellipse at top, #1a1a3a 0%, #0a0a1a 50%, #050510 100%)",
      card: "rgba(255, 255, 255, 0.03)",
      cardHover: "rgba(255, 255, 255, 0.06)",
      border: "rgba(255, 255, 255, 0.08)",
      text: "#e4e4e7",
      textDim: "#71717a",
      accent: "#8b5cf6",
      accentHover: "#a78bfa",
      accentDim: "#7c3aed",
      accentGlow: "rgba(139, 92, 246, 0.2)",
      green: "#22c55e",
      yellow: "#eab308",
      red: "#ef4444",
      gradientStart: "#c4b5fd",
      gradientEnd: "#7c3aed",
    },
    effects: {
      cardBlur: "16px",
      cardBg: "rgba(255, 255, 255, 0.03)",
      cardBorder: "1px solid rgba(255, 255, 255, 0.08)",
      cardRadius: "20px",
      cardShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      headerBlur: "20px",
      headerBg: "rgba(10, 10, 26, 0.8)",
      buttonRadius: "12px",
      inputRadius: "12px",
      tableStyle: "minimal",
      glowEffects: true,
    },
  },
  {
    id: "trading",
    name: "Trading Pro",
    description: "Style Binance/TradingView",
    colors: {
      bg: "#0b0e11",
      card: "#1e2329",
      cardHover: "#2b3139",
      border: "#2b3139",
      text: "#eaecef",
      textDim: "#848e9c",
      accent: "#f0b90b",
      accentHover: "#f8d33a",
      accentDim: "#c99a09",
      accentGlow: "rgba(240, 185, 11, 0.15)",
      green: "#0ecb81",
      yellow: "#f0b90b",
      red: "#f6465d",
      gradientStart: "#f8d33a",
      gradientEnd: "#c99a09",
    },
    effects: {
      cardRadius: "4px",
      cardShadow: "none",
      buttonRadius: "4px",
      inputRadius: "4px",
      tableStyle: "bordered",
      glowEffects: false,
    },
  },
  {
    id: "minimal",
    name: "Neo Minimal",
    description: "Ultra clean et moderne",
    colors: {
      bg: "#09090b",
      card: "#18181b",
      cardHover: "#27272a",
      border: "#3f3f46",
      text: "#fafafa",
      textDim: "#a1a1aa",
      accent: "#f97316",
      accentHover: "#fb923c",
      accentDim: "#ea580c",
      accentGlow: "rgba(249, 115, 22, 0.2)",
      green: "#22c55e",
      yellow: "#fbbf24",
      red: "#ef4444",
      gradientStart: "#fdba74",
      gradientEnd: "#ea580c",
    },
    effects: {
      cardRadius: "8px",
      cardShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
      buttonRadius: "6px",
      inputRadius: "6px",
      tableStyle: "bordered",
      glowEffects: true,
    },
  },
  {
    id: "emerald",
    name: "Emerald Finance",
    description: "Style bancaire elegant",
    colors: {
      bg: "#022c22",
      card: "#064e3b",
      cardHover: "#065f46",
      border: "#047857",
      text: "#ecfdf5",
      textDim: "#6ee7b7",
      accent: "#10b981",
      accentHover: "#34d399",
      accentDim: "#059669",
      accentGlow: "rgba(16, 185, 129, 0.2)",
      green: "#34d399",
      yellow: "#fbbf24",
      red: "#f87171",
      gradientStart: "#6ee7b7",
      gradientEnd: "#059669",
    },
    effects: {
      cardRadius: "16px",
      cardShadow: "0 4px 24px rgba(0, 0, 0, 0.2)",
      buttonRadius: "10px",
      inputRadius: "10px",
      tableStyle: "default",
      glowEffects: true,
    },
  },
];

export const getStyleById = (id: string): PoolStyle => {
  return poolStyles.find((s) => s.id === id) || poolStyles[0];
};

export const applyStyle = (style: PoolStyle) => {
  const root = document.documentElement;

  // Couleurs de base
  root.style.setProperty("--bg", style.colors.bg);
  root.style.setProperty("--card", style.colors.card);
  root.style.setProperty("--card-hover", style.colors.cardHover);
  root.style.setProperty("--border", style.colors.border);
  root.style.setProperty("--text", style.colors.text);
  root.style.setProperty("--text-dim", style.colors.textDim);
  root.style.setProperty("--accent", style.colors.accent);
  root.style.setProperty("--accent-hover", style.colors.accentHover);
  root.style.setProperty("--accent-dim", style.colors.accentDim);
  root.style.setProperty("--accent-glow", style.colors.accentGlow);
  root.style.setProperty("--green", style.colors.green);
  root.style.setProperty("--yellow", style.colors.yellow);
  root.style.setProperty("--red", style.colors.red);
  root.style.setProperty("--gradient-start", style.colors.gradientStart);
  root.style.setProperty("--gradient-end", style.colors.gradientEnd);

  // Effets
  root.style.setProperty("--card-radius", style.effects.cardRadius);
  root.style.setProperty("--button-radius", style.effects.buttonRadius);
  root.style.setProperty("--input-radius", style.effects.inputRadius);

  // Background gradient si defini
  if (style.colors.bgGradient) {
    document.body.style.background = style.colors.bgGradient;
  } else {
    document.body.style.background = style.colors.bg;
  }

  // Effets glassmorphism
  if (style.effects.cardBlur) {
    root.style.setProperty("--card-blur", style.effects.cardBlur);
    root.style.setProperty("--card-bg", style.effects.cardBg || style.colors.card);
    root.classList.add("style-glass");
  } else {
    root.style.removeProperty("--card-blur");
    root.style.removeProperty("--card-bg");
    root.classList.remove("style-glass");
  }

  // Shadow
  if (style.effects.cardShadow) {
    root.style.setProperty("--card-shadow", style.effects.cardShadow);
  } else {
    root.style.setProperty("--card-shadow", "none");
  }

  // Header blur pour glass
  if (style.effects.headerBlur) {
    root.style.setProperty("--header-blur", style.effects.headerBlur);
    root.style.setProperty("--header-bg", style.effects.headerBg || style.colors.card);
  } else {
    root.style.removeProperty("--header-blur");
    root.style.removeProperty("--header-bg");
  }

  // Table style
  root.setAttribute("data-table-style", style.effects.tableStyle);

  // Glow effects
  if (style.effects.glowEffects) {
    root.classList.add("style-glow");
  } else {
    root.classList.remove("style-glow");
  }

  // Sauvegarder le choix
  localStorage.setItem("korvex-style", style.id);
};

export const loadSavedStyle = (): PoolStyle => {
  const savedId = localStorage.getItem("korvex-style");
  return getStyleById(savedId || "current");
};
