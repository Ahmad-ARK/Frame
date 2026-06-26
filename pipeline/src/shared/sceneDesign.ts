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
REAL IMAGERY (prefer these whenever the beat names something real):
- "archivalPhoto" — a real historical photograph exists (a person, place, event,
  object, moment). DEFAULT choice for anything named and photographable.
- "video"        — real archival FOOTAGE of an action/event (tanks crossing, a
  speech, a crowd, a withdrawal). Prefer over a still when the beat describes
  motion or a moment unfolding.
- "genImage"     — an atmospheric/conceptual image where no real photo exists
  (a mood, a metaphor, a reconstructed scene). B-roll glue between real shots.
GEOGRAPHY:
- "map"          — invasions, borders, routes, where an event happened in a region.
- "globe"        — transcontinental relationships (arcs of money / arms / influence).
DATA & EVIDENCE:
- "timeline"     — a run of TWO OR MORE dated events.
- "stat"         — one dramatic number, or a few compared (bar).
- "chart"        — a single quantity tracked over time (line/area).
- "comparison"   — two forces/sides set against each other.
- "newspaper"    — a headline / press reaction.
- "document"     — a leaked memo, treaty, cable, or official paper (use this for a
  quotation that comes FROM a document).
NAMED QUOTES:
- "quoteCard"    — a verbatim quotation by a NAMED real person. Put the person's
  name in "attribution" so their PORTRAIT is shown beside the quote — a real
  person's words should appear next to their FACE, never floating on black.
PURE TEXT (rare — see the hard rule):
- "titleCard"    — the title drop and the occasional chapter beat ONLY.

## Selection rules (apply in order)
1. Does the beat name a real PERSON, PLACE, EVENT, or OBJECT? → SHOW it: "video"
   if it is an action/moment in motion, otherwise "archivalPhoto"; use "genImage"
   only when no real image could plausibly exist.
2. Is the core GEOGRAPHIC (invasion, route, border, location)? → "map" (one
   country/region) or "globe" (across continents).
3. TWO+ dated events named? → "timeline".
4. One quantity over time → "chart"; one or a few standalone figures → "stat".
5. A verbatim quote by a named person → "quoteCard" with attribution (→ portrait).
   A quote FROM a memo/cable/treaty → "document".
6. Two sides weighed against each other → "comparison".
7. A press reaction / headline → "newspaper".
8. ONLY a pure rhetorical title/chapter line, with no real subject to show, may be
   "titleCard" — and only within the 1-in-8 budget.

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
