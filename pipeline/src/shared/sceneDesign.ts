// Shared scene-design guidance used by BOTH the own-script importer and the
// greenfield script generator. Keeping it in one place is what keeps every
// scene — however it was produced — speaking the same channel visual language.

export const SCENE_DESIGN_GUIDE = `## Scene visual vocabulary
Each scene pairs one beat of narration with ONE visual. Choose the single best visual TYPE from this vocabulary:
- "titleCard"  — section/chapter openers, the hook, the closing line. Big kinetic typography.
- "timeline"   — a sequence of dated events ("In 1979... then 1989... then 2001").
- "map"        — anything geographic: invasions, borders, routes, locations of events.
- "stat"       — a single dramatic number, OR a comparison of a few numbers (bar chart).
- "chart"      — data trends over time (line/area). Use "stat" for single figures.
- "comparison" — two things set against each other side by side.
- "quoteCard"  — a direct quotation from a named real person.
- "archivalPhoto" — a real historical photograph would carry the beat.
- "newspaper"  — a headline / press reaction.
- "document"   — a leaked memo, treaty, or official paper.

## Selection rules (apply in order)
1. If the beat names TWO OR MORE dated events (years/months), use "timeline" — even if it also mentions money or counts. A run of dates is a timeline, not a chart.
2. Use "chart" only for a single quantity tracked over time. Use "stat" for one or a few standalone figures.
3. Use "quoteCard" ONLY for a verbatim quotation spoken/written by a named real person who appears in the text. If you cannot attribute it to a specific named person, it is NOT a quote — do NOT use quoteCard, and NEVER use an attribution like "Narrator", "Author", or the channel name. A line the writer speaks directly to the audience is "titleCard" (for a punchy section/closing line) or whatever visual fits its content — never quoteCard.
4. Use "map" for any beat whose core is geographic (invasion, route, border, location).
5. Otherwise prefer the simplest type that serves the beat.
Open and close with "titleCard".

## Per-scene fields
- "visual.type": one value from the vocabulary above.
- "visual.directive": a short, concrete art-direction note describing what the viewer sees — what is on screen, what animates, what is emphasized. One or two sentences.
- "visual.style": OPTIONAL. Only include fields DIRECTLY derivable from the beat's text:
    - titleCard: { "eyebrow": short kicker, "title": on-screen headline (use \\n for a line break), "subtitle": optional one-liner }
    - timeline:  { "heading": short section heading, "events": [ { "date": "...", "title": "...", "description": "..." } ] } — only the dates/events actually named.
    - stat:      { "label": what the number measures, "context": one-line caption } — do NOT fabricate the numeric value; include it only if the text states it.
    - quoteCard: { "quote": "...", "attribution": "Real Person's Name" }
  For map/chart/comparison and any number you are unsure of, OMIT style entirely and describe it in the directive. Never invent coordinates, ISO codes, or statistics.
- Do NOT include "durationMs", "audioRef", "wordTimings", or "assets". Those are derived in later stages.`;
