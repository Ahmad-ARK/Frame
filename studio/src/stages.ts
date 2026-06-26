// Maps the backend worker's internal stage keys (src/server/runJob.ts) to
// reviewer-facing labels. The scene/asset machinery stays hidden — the user sees
// plain progress language, never pipeline internals.
export function humanizeStage(stage?: string): string {
  if (!stage) return "Queued";
  const map: Record<string, string> = {
    start: "Queued",
    queued: "Queued",
    loaded: "Preparing the film",
    import: "Reading your script",
    generate: "Writing the script",
    audio: "Timing the narration",
    "align-audio": "Timing the narration",
    voiceover: "Recording the narration",
    enrich: "Composing scenes",
    assets: "Sourcing footage and images",
    render: "Rendering frames",
    encode: "Encoding video",
    done: "Finishing",
  };
  return map[stage.toLowerCase()] ?? stage;
}
