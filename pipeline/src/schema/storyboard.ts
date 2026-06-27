import { z } from "zod";

// Runtime-validation mirror of remotion/src/types/storyboard.ts.
// The remotion types are the canonical TS shape; this zod schema is the
// pipeline's runtime gate for anything an LLM (or a human edit) produces.

export const SourcedFactSchema = z.object({
  claim: z.string(),
  sourceUrl: z.string(),
  sourceTitle: z.string().optional(),
});

export const VisualTypeSchema = z.enum([
  "titleCard",
  "timeline",
  "map",
  "chart",
  "stat",
  "comparison",
  "quoteCard",
  "archivalPhoto",
  "newspaper",
  "document",
  "globe",
  "video",
  "archiveMontage",
  "genImage",
  "genVideo",
  "hyperframeClip",
]);

export const AssetSchema = z.object({
  ref: z.string(),
  kind: z.enum(["image", "video", "lottie", "svg", "mp4"]),
  source: z.enum([
    "wikimedia",
    "internetArchive",
    "pexels",
    "storyblocks",
    "envato",
    "kling",
    "veo",
    "imageModel",
    "hyperframes",
    "generated",
  ]),
  license: z.object({
    type: z.string(),
    attributionRequired: z.boolean(),
    attributionText: z.string().optional(),
  }),
});

export const WordTimingSchema = z.object({
  word: z.string(),
  startMs: z.number(),
  endMs: z.number(),
});

export const OverlaySchema = z.object({
  kind: z.enum(["image", "text", "stat"]),
  atMs: z.number(),
  durationMs: z.number().optional(),
  anchor: z
    .enum(["topLeft", "topRight", "bottomLeft", "bottomRight", "left", "right", "center"])
    .optional(),
  // image
  src: z.string().optional(),
  subject: z.string().optional(), // search/gen query, filled to src by the asset stage
  caption: z.string().optional(),
  attribution: z.string().optional(),
  focal: z.object({ x: z.number(), y: z.number() }).optional(), // content-aware crop center
  // text
  text: z.string().optional(),
  emphasis: z.boolean().optional(),
  // stat
  value: z.string().optional(),
  label: z.string().optional(),
});

export const SceneSchema = z.object({
  id: z.string(),
  narration: z.string(),
  onScreenText: z.string().optional(),
  visual: z.object({
    type: VisualTypeSchema,
    directive: z.string(),
    style: z.record(z.unknown()).optional(),
    assets: z.array(AssetSchema).optional(),
    candidates: z.array(z.record(z.unknown())).optional(),
    overlays: z.array(OverlaySchema).optional(),
  }),
  sources: z.array(SourcedFactSchema),
  durationMs: z.number().optional(),
  audioRef: z.string().optional(),
  wordTimings: z.array(WordTimingSchema).optional(),
});

export const StoryboardStatusSchema = z.enum([
  "draft",
  "script_approved",
  "rendered",
  "final_approved",
  "uploaded",
]);

export const StoryboardSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  topic: z.string(),
  thesis: z.string(),
  scenes: z.array(SceneSchema),
  status: StoryboardStatusSchema,
});

export type SourcedFact = z.infer<typeof SourcedFactSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type AssetSource = Asset["source"];
export type VisualType = z.infer<typeof VisualTypeSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
