// Shared scene-design guidance used by BOTH the own-script importer and the
// greenfield script generator. Keeping it in one place is what keeps every
// scene — however it was produced — speaking the same channel visual language.

export const SCENE_DESIGN_GUIDE = `## Visual language — SHOW, don't tell
This is a documentary, NOT a slideshow of text. The screen should almost always
show a real VISUAL — archival footage, a photograph, a map, a generated image, a
document, or a data scene — that SHOWS what the narration describes. The narration
is spoken aloud AND shown as a lower-third caption, so the screen must NOT repeat
the words as big centered text. A viewer staring at words on a black background
swipes away.

HARD RULE: at MOST about 1 in 8 scenes may be a pure-text card ("titleCard", or a
bare narrator "statement"). EVERY other scene must carry a real visual. If you
reach for a title/text card to cover ordinary narrative, you are doing it wrong —
find the photo, footage, map, document, or image that shows it instead.

## Scene visual vocabulary — pick the single best TYPE per beat
GEOGRAPHY (check this FIRST — geography beats everything else):
- "map"          — any beat where LOCATION or MOVEMENT is the point: an invasion,
  a border, a supply route, where something happened. Subtypes at enrich time:
  locator (one place), tour (narrator names 2-4 places), route (physical movement
  along a path — tanks, refugees, a convoy), compare (territory divided/split),
  flows (arms/money/influence from A to B), spread (territory growing over time).
  USE MAP whenever a country, region, river, or border is central — even if real
  footage or a photo also exists. A map SHOWS geography; a photo only hints at it.
- "globe"        — transcontinental arcs (CIA → Pakistan → Afghanistan, or attacks
  across oceans). Use over "map" when the relationship spans multiple continents.
REAL IMAGERY (when the beat is NOT primarily geographic):
- "video"        — real archival FOOTAGE of an action unfolding (tanks rolling,
  a speech, a crowd, a signing, a withdrawal). Pick this when motion carries the beat.
- "archivalPhoto"— a real historical photograph of a named person, object, or event
  where video doesn't exist or isn't needed.
- "genImage"     — an atmospheric/conceptual image where no real photo could plausibly
  exist (a mood, a metaphor, a reconstructed scene). Use sparingly.
DATA & EVIDENCE:
- "timeline"     — THREE OR MORE causally related dated events that form a meaningful
  chronological sequence (e.g. "1979 invasion → 1985 Stinger missiles → 1989
  withdrawal"). DO NOT use for a single date, a decade reference, or two isolated
  facts. If you only have 1-2 dates, use "archivalPhoto" or "video" instead.
- "stat"         — one dramatic number or a small comparison (the $3B figure, the
  death toll). ONLY when the narration actually states the figure.
- "chart"        — one quantity tracked over time (troop levels 1979-1989).
- "comparison"   — two or three forces explicitly contrasted (US vs Soviet, before/after).
- "newspaper"    — a headline or press reaction moment.
- "document"     — a leaked memo, treaty, cable, or official paper; use when quoting
  FROM a document rather than FROM a person.
NAMED QUOTES:
- "quoteCard"    — a verbatim quotation by a NAMED real person. Always set
  "attribution" so their portrait appears beside the quote.
PURE TEXT (rare — see the hard rule):
- "titleCard"    — MAXIMUM 2 per film. Only for the video's own title and
  a major mid-film chapter drop. NEVER for a sentence of regular narration.

## Selection rules (apply in order — stop at the first match)
1. Is LOCATION or MOVEMENT the core of the beat (an invasion, a route, a border,
   where something happened, arms flowing from one country to another)?
   → "map" (same continent) or "globe" (across continents). Do NOT fall back to
   archivalPhoto just because a photo of the place also exists.
2. Is it a verbatim quote by a named real person? → "quoteCard".
3. Is it a quote FROM a document (memo, cable, treaty)? → "document".
4. Is it a press reaction or headline? → "newspaper".
5. Are there THREE OR MORE causally related dated events in sequence? → "timeline".
   (Fewer than 3 dates, or two isolated facts → do NOT use timeline.)
6. Is it a dramatic standalone number or comparison of a few figures? → "stat".
7. Is it two sides explicitly contrasted? → "comparison".
8. Is it a quantity tracked over time? → "chart".
9. Does real archival FOOTAGE of this action exist? → "video".
10. Does a real historical photograph of this subject exist? → "archivalPhoto".
11. No real image could plausibly exist (mood, metaphor, reconstruction)? → "genImage".
12. Is it a pure chapter-title line with NO visual subject? → "titleCard" (remember:
    max 2 for the whole film — only the film title and one major section break).

## Title cards — SHORT and RARE (this is where the last render went wrong)
- A "titleCard" scene's narration must be SHORT — just the title/chapter words —
  so it stays ~2-3 seconds. NEVER pad a title card with sentences of narration;
  that leaves text sitting on a black screen for 10+ seconds, the single worst
  thing you can do.
- NEVER open the video on a title card. COLD-OPEN on a strong visual (footage /
  photo / map). The title DROPS a beat or two later, as a short moment mid-flow.
- A long passage is NEVER one title card. Split it into several VISUAL scenes
  (1-2 sentences each) so the picture changes every ~6-10 seconds.

## Per-scene fields
EVERY scene MUST include BOTH "visual.type" AND "visual.directive" (a non-empty
string) — even when you also provide "visual.style". Never omit them.
- "visual.type": one value from the vocabulary above.
- "visual.directive": a concrete note naming the SUBJECT to show — e.g. "Archival
  footage of Soviet T-62 tanks crossing the Amu Darya bridge into Afghanistan,
  Dec 1979" or "Black-and-white photo of Zbigniew Brzezinski at his White House
  desk". Specific enough for the asset stage to search or generate it. One sentence.
- "visual.style": OPTIONAL — only fields DIRECTLY derivable from the text:
    - titleCard: { "eyebrow": short kicker, "title": headline (use \\n for a line break), "subtitle"?: one-liner }
    - quoteCard: { "quote": "...", "attribution": "Real Person's Name" }
    - timeline:  { "heading": "...", "events": [ { "date", "title", "description" } ] } — only dates actually named.
    - stat:      { "label": what it measures, "context": one-line caption } — include a numeric value ONLY if the text states it.
  For map/globe/chart/comparison/archivalPhoto/video/genImage/newspaper/document,
  OMIT style and put the subject in the directive. NEVER invent coordinates, ISO
  codes, or statistics.
- Do NOT include "durationMs", "audioRef", "wordTimings", or "assets". Those are
  derived in later stages.`;
