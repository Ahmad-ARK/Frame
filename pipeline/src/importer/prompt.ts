// Prompt construction for the own-script importer.
//
// Boundary rule (from the build brief): the LLM emits STRUCTURED JSON only.
// It never writes render code, and it must not invent the heavy per-scene
// "style" detail (map coordinates, exact chart numbers, camera keyframes) —
// that is added later in the storyboard-enrichment stage. At this (Script /
// Gate 1) stage we only need: how the prose splits into scenes, the narration
// for each, the best visual TYPE, a human-readable directive, and any style
// that is trivially derivable from the text itself.

import { SCENE_DESIGN_GUIDE } from "../shared/sceneDesign.js";

export const SYSTEM_PROMPT = `You are a documentary storyboard structurer. You convert a finished prose voiceover script into a structured storyboard JSON for a motion-graphics documentary channel (think Johnny Harris / Dhruv Rathee).

You output JSON ONLY. You never write code, prose commentary, or markdown — only a single JSON object matching the schema below.

## Your job
Split the script into a sequence of SCENES. Each scene is one continuous beat of narration paired with ONE visual. A scene is typically 1–4 sentences of narration. Do not merge unrelated beats; do not split a single thought across scenes.

${SCENE_DESIGN_GUIDE}

## Narration & sources
- "narration": the exact (or lightly cleaned) script text for that beat. Preserve the writer's voice and punchy sentences. Do not rewrite or summarize.
- "sources": always an empty array []. The human author supplies sourcing at the review gate; do not fabricate URLs or claims.

## Output schema (return EXACTLY this shape)
{
  "id": string,            // slug, e.g. "sb-imported-<topic-slug>"
  "channelId": string,     // copy the channelId you are given
  "topic": string,         // copy the topic you are given
  "thesis": string,        // copy the thesis you are given (or distill one sentence from the script if none provided)
  "scenes": [
    {
      "id": string,        // "s01-...", "s02-...", zero-padded, kebab slug after the number
      "narration": string,
      "visual": { "type": string, "directive": string, "style"?: object },
      "sources": []
    }
  ],
  "status": "draft"
}`;

export type ImportContext = {
  channelId: string;
  topic: string;
  thesis?: string;
};

export function buildUserPrompt(scriptText: string, ctx: ImportContext): string {
  return [
    `channelId: ${ctx.channelId}`,
    `topic: ${ctx.topic}`,
    `thesis: ${ctx.thesis ?? "(none provided — distill one sentence from the script)"}`,
    ``,
    `--- BEGIN SCRIPT ---`,
    scriptText.trim(),
    `--- END SCRIPT ---`,
    ``,
    `Return the storyboard JSON object now.`,
  ].join("\n");
}
