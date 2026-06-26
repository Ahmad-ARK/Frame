import { StoryboardSchema, type Storyboard } from "../schema/storyboard.js";

/** Strips markdown code fences Gemini sometimes adds despite JSON mode. */
export function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export type FinalizeContext = {
  channelId: string;
  topic: string;
  thesis?: string;
  idPrefix: string; // e.g. "sb-imported" or "sb-generated"
};

/**
 * Parses a raw LLM response into a validated Storyboard. Fills the handful of
 * top-level / per-scene defaults the model sometimes omits, then gates the
 * whole thing through zod. Throws with the raw response attached on failure.
 */
export function finalizeAndValidate(
  rawResponse: string,
  ctx: FinalizeContext
): Storyboard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(rawResponse));
  } catch (err) {
    throw new Error(
      `Model did not return valid JSON: ${(err as Error).message}\n--- raw ---\n${rawResponse}`
    );
  }

  if (parsed && typeof parsed === "object") {
    const sb = parsed as Record<string, any>;
    sb.id ??= `${ctx.idPrefix}-${slugify(ctx.topic)}`;
    sb.channelId ??= ctx.channelId;
    sb.topic ??= ctx.topic;
    if (ctx.thesis && !sb.thesis) sb.thesis = ctx.thesis;
    sb.status ??= "draft";
    if (Array.isArray(sb.scenes)) {
      sb.scenes.forEach((scene: any, i: number) => {
        if (scene && typeof scene === "object") {
          scene.id ??= `s${String(i + 1).padStart(2, "0")}`;
          scene.sources ??= [];
          // The model occasionally drops visual.type / visual.directive on a
          // scene. Repair rather than fail the whole storyboard: default to a
          // visual type and derive the directive from the narration (which the
          // asset stage can search on).
          if (scene.visual && typeof scene.visual === "object") {
            const v = scene.visual as Record<string, any>;
            if (typeof v.type !== "string" || !v.type.trim()) v.type = "archivalPhoto";
            if (typeof v.directive !== "string" || !v.directive.trim()) {
              const n = typeof scene.narration === "string" ? scene.narration : "";
              v.directive = n.replace(/\s+/g, " ").trim().slice(0, 140) || "Documentary visual for this beat.";
            }
          }
        }
      });
    }
  }

  const result = StoryboardSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Storyboard failed schema validation:\n${result.error.toString()}\n--- raw ---\n${rawResponse}`
    );
  }
  return result.data;
}
