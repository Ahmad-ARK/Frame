import { StyleGuide } from "../types/styleGuide";

export const documentaryDark: StyleGuide = {
  channelId: "documentary-dark",
  name: "Documentary Dark",

  typography: {
    fontFamilies: {
      display: "Syne",
      body: "DM Sans",
      mono: "Space Mono",
    },
    weights: [400, 500, 700, 800],
    scale: {
      h1: 118,
      h2: 72,
      h3: 48,
      h4: 36,
      body: 28,
      caption: 20,
      micro: 14,
    },
    tracking: {
      h1: -3,
      h2: -1.5,
      h3: -0.5,
      h4: 0,
      body: 0.2,
      caption: 1.5,
      micro: 2.5,
    },
  },

  color: {
    bg: "#0b0b0f",
    surface: "#14141c",
    text: "#e8e4da",
    textMuted: "#7a7a8a",
    primary: "#cf3434",
    accent: "#f0c040",
    map: {
      land: "#252830",
      water: "#0b0b0f",
      border: "#363a45",
      highlight: "#cf3434",
    },
    chart: ["#cf3434", "#f0c040", "#4a7fb5", "#7ab54a", "#b54a9e"],
  },

  motion: {
    // Named cubic-beziers
    easings: {
      enter: [0.16, 1, 0.3, 1],      // spring-like: fast then soft settle
      exit: [0.7, 0, 1, 0.3],         // sharp exit
      emphasis: [0.37, 0, 0.63, 1],   // symmetric s-curve for emphasis
      reveal: [0.0, 0.0, 0.2, 1.0],   // pure deceleration
    },
    durationsMs: {
      enter: 800,
      exit: 400,
      emphasis: 600,
    },
    signatures: {
      labelElevation: {
        enabled: true,
        planeRotateXDeg: 52,
        labelCounterRotate: true,
        translateZ: 28,
        perspectivePx: 950,
      },
      staggerMs: 120,
    },
  },

  layout: {
    safeMarginPx: 80,
    grid: { columns: 12, gutterPx: 24 },
  },

  brand: {
    lowerThirdStyle: "sharp",
    transitionStyle: "cut",
  },
};
