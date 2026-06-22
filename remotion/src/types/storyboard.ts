export type SourcedFact = {
  claim: string;
  sourceUrl: string;
  sourceTitle?: string;
};

export type VisualType =
  | "titleCard"
  | "timeline"
  | "map"
  | "chart"
  | "stat"
  | "comparison"
  | "quoteCard"
  | "archivalPhoto"
  | "newspaper"
  | "document"
  | "globe"
  | "video"
  | "archiveMontage"
  | "genImage"
  | "genVideo"
  | "hyperframeClip";

export type AssetKind = "image" | "video" | "lottie" | "svg" | "mp4";

export type AssetSource =
  | "wikimedia"
  | "internetArchive"
  | "pexels"
  | "storyblocks"
  | "envato"
  | "kling"
  | "veo"
  | "imageModel"
  | "hyperframes"
  | "generated";

export type Asset = {
  ref: string;
  kind: AssetKind;
  source: AssetSource;
  license: {
    type: string;
    attributionRequired: boolean;
    attributionText?: string;
  };
};

export type WordTiming = {
  word: string;
  startMs: number;
  endMs: number;
};

export type OverlayAnchor =
  | "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
  | "left" | "right" | "center";

/** A timed element layered ON TOP of a scene's base visual, word-cued. */
export type Overlay =
  | { kind: "image"; atMs: number; durationMs?: number; anchor?: OverlayAnchor; src?: string; subject?: string; caption?: string; attribution?: string }
  | { kind: "text"; atMs: number; durationMs?: number; anchor?: OverlayAnchor; text: string; emphasis?: boolean }
  | { kind: "stat"; atMs: number; durationMs?: number; anchor?: OverlayAnchor; value: string; label?: string };

export type Scene = {
  id: string;
  narration: string;
  onScreenText?: string;
  visual: {
    type: VisualType;
    directive: string;
    style?: Record<string, unknown>;
    assets?: Asset[];
    overlays?: Overlay[];
  };
  sources: SourcedFact[];
  durationMs?: number;
  audioRef?: string;
  wordTimings?: WordTiming[];
};

export type StoryboardStatus =
  | "draft"
  | "script_approved"
  | "rendered"
  | "final_approved"
  | "uploaded";

export type Storyboard = {
  id: string;
  channelId: string;
  topic: string;
  thesis: string;
  scenes: Scene[];
  status: StoryboardStatus;
};
