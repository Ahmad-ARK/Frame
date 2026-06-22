export type StyleGuide = {
  channelId: string;
  name: string;

  typography: {
    fontFamilies: { display: string; body: string; mono?: string };
    weights: number[];
    scale: Record<string, number>;
    tracking: Record<string, number>;
  };

  color: {
    bg: string;
    surface: string;
    text: string;
    textMuted: string;
    primary: string;
    accent: string;
    map?: {
      land: string;
      water: string;
      border: string;
      highlight: string;
    };
    chart?: string[];
  };

  motion: {
    easings: Record<string, [number, number, number, number]>;
    durationsMs: Record<string, number>;
    signatures: {
      labelElevation?: {
        enabled: boolean;
        planeRotateXDeg: number;
        labelCounterRotate: boolean;
        translateZ: number;
        perspectivePx: number;
      };
      staggerMs?: number;
    };
  };

  layout: {
    safeMarginPx: number;
    grid?: { columns: number; gutterPx: number };
  };

  audio?: { musicBed?: string; sfxPack?: string };

  brand: {
    logoRef?: string;
    lowerThirdStyle?: string;
    transitionStyle?: string;
  };
};
