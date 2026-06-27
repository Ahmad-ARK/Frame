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
      const seenIds = new Set<string>();
      sb.scenes.forEach((scene: any, i: number) => {
        if (scene && typeof scene === "object") {
          scene.id ??= `s${String(i + 1).padStart(2, "0")}`;
          // scene.id becomes audio + asset FILENAMES, and a path component is capped
          // at 255 chars (Windows MAX_PATH 260). The model sometimes emits a runaway
          // id (the whole narration slugified). Normalize to a short, slug-safe,
          // UNIQUE id so the TTS/asset writers can't blow the filename limit.
          let id = String(scene.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          if (id.length > 48) id = id.slice(0, 48).replace(/-+$/, "");
          if (!id) id = `s${i + 1}`;
          if (seenIds.has(id)) id = `${id.slice(0, 44)}-${i + 1}`;
          seenIds.add(id);
          scene.id = id;
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
            // SAFETY NET: the model sometimes tags a scene "genImage" and then
            // describes one of our structured scenes ("a graphic of a declassified
            // memo", "a graphic connecting the events"). Reroute the type so enrich
            // builds the real document/newspaper/timeline/chart instead of a worse
            // drawn imitation. Only fires when the directive literally reads as a
            // DRAWN graphic, so photographic genImage scenes are untouched.
            if (v.type === "genImage") {
              const d = String(v.directive).toLowerCase();
              const drawn = /\b(graphic|stylized|stylised|representation|depiction|illustration|diagram|drawn|infographic)\b/.test(d);
              if (drawn) {
                let rerouted: string | undefined;
                if (/\b(newspaper|front page|headline)\b/.test(d)) rerouted = "newspaper";
                else if (/\b(declassified|classified|memo|memorandum|cable|dossier|playbook|operating manual|official record|document|leaked file)\b/.test(d)) rerouted = "document";
                else if (/\b(timeline|chronolog|pattern|sequence of events|over the (years|decades)|connect\w* (the )?events)\b/.test(d)) rerouted = "timeline";
                else if (/\b(bar chart|line chart|chart showing|graph showing|diagram showing)\b/.test(d)) rerouted = "chart";
                if (rerouted) {
                  console.error(`  ↻ rerouted scene "${scene.id}" genImage → ${rerouted} (directive read as a drawn ${rerouted})`);
                  v.type = rerouted;
                }
              }
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
