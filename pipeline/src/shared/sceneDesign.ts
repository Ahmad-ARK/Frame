// Shared scene-design guidance used by BOTH the own-script importer and the
// greenfield script generator. Keeping it in one place is what keeps every
// scene — however it was produced — speaking the same channel visual language.

export const SCENE_DESIGN_GUIDE = `## Visual language — SHOW, don't tell
This is a documentary, NOT a slideshow of text. Every scene should SHOW something:
real footage, a photograph, a map, a generated image — OR a designed GRAPHIC like a
quote card, a declassified document, a newspaper, a stat, a comparison, or a
timeline. The narration is spoken aloud AND shown as a lower-third caption, so the
screen must never just repeat the spoken words as big centered text on black.

THE REAL ENEMY IS RAW TEXT ON BLACK — a "titleCard" or a bare narrator "statement"
that simply restates the narration in large type. Those are what makes a video feel
cheap, and they are strictly capped (see below).

GRAPHIC SCENES THAT CONTAIN TEXT ARE NOT "TEXT SCENES" — they are VISUALS, and you
should use them freely whenever the beat fits:
- A real person's quotation → "quoteCard" (their quote sits beside their PORTRAIT).
- A line FROM a memo/cable/treaty → "document" (a designed declassified page with a
  stamp and a highlighted passage — a graphic, not a text card).
- A press moment → "newspaper" (a front page — a graphic).
- A number → "stat"; two sides → "comparison"; a real run of dated events → "timeline".
These are RICH, on-brand visuals. Reaching for them is GOOD. Do NOT downgrade a
quotation to a plain photo, or a leaked-memo line to a generic image, out of a
misplaced fear of "text" — these designed graphics are exactly what you want.

HARD RULE: at most about 1 in 8 scenes may be a pure raw-text card ("titleCard" or a
bare "statement"). quoteCard / document / newspaper / stat / comparison / timeline do
NOT count against this budget — they are visuals. If you reach for a bare title/text
card to cover ordinary narrative, you are doing it wrong.

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
- "genImage"     — a PHOTOGRAPHIC, atmospheric scene where no real photo exists: a
  mood, a place's atmosphere, a reconstructed real-looking moment. genImage produces
  a PHOTO-REALISTIC IMAGE, nothing else. NEVER use it to "draw" a document, a memo,
  a newspaper, a chart, a map, or a timeline — those have dedicated types below that
  render far better. If your directive starts "a graphic of…", "a stylized
  representation of…", "an image showing a document/chart/timeline of…", you have
  picked the WRONG type — pick the real structured type instead. Use genImage sparingly.
DATA & EVIDENCE (these ARE the visual — prefer them over a drawn genImage):
- "document"     — ANY reference to a memo, cable, treaty, dossier, classified file,
  declassified paper, report, manual, playbook, or official record — whether you are
  quoting it OR just invoking it ("the CIA's playbook", "Operation Cyclone was shut
  down", "a declassified memo"). Our renderer builds a real typed/redacted/stamped
  page (it has a "stamp" field for CLASSIFIED / CLOSED / DECLASSIFIED). This is the
  RIGHT choice for "the operating manual", "Operation Cyclone CLOSED", a leaked cable.
- "newspaper"    — a headline, front page, or press-reaction moment ("the world's
  papers screamed", "9/11 made every front page"). Renders a real front page.
- "timeline"     — THREE OR MORE related events/cases shown in sequence, OR a beat
  that CONNECTS/RECAPS several events into a pattern ("Iran 1953, Iraq 1963, Libya
  2011 — the same playbook"). DO NOT use for a single date. If a beat ties multiple
  past events together, this (or "comparison") is the answer — NOT a vague genImage.
- "stat"         — one dramatic number or a small comparison (the $3B figure, the
  death toll). ONLY when the narration actually states the figure.
- "chart"        — one quantity tracked over time (troop levels 1979-1989).
- "comparison"   — two or three forces/cases explicitly contrasted (US vs Soviet,
  before/after, "everyone won — here's what each side actually lost").
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
3. Does the beat reference a DOCUMENT in any way — a memo, cable, treaty, dossier,
   report, manual, playbook, classified/declassified file, or official record, OR
   describe one being created/stamped/shut down (e.g. "Operation Cyclone was closed",
   "the operating manual")? → "document". (You do NOT need a verbatim quote.)
4. Is it a headline, front page, or press reaction? → "newspaper".
5. Does the beat name THREE OR MORE events/cases, OR connect/recap several past
   events into a pattern ("Iran, Iraq, Libya — the same playbook")? → "timeline"
   (or "comparison" if it's two/three cases set against each other).
6. Is it a dramatic standalone number? → "stat".
7. Is it two/three sides or cases explicitly contrasted? → "comparison".
8. Is it a single quantity tracked over time? → "chart".
9. Does real archival FOOTAGE of this action exist? → "video".
10. Does a real historical photograph of this subject exist? → "archivalPhoto".
11. ONLY a photographic mood/atmosphere with no real photo and nothing structured to
    show? → "genImage". (If you were about to write "a graphic/representation of a
    document/chart/timeline/map", you skipped a rule above — go back and use it.)
12. Is it a pure chapter-title line with NO visual subject? → "titleCard" (remember:
    max 2 for the whole film — only the film title and one major section break).

## ANTI-PATTERN — do not "draw" a structured graphic with genImage
A directive that describes one of our structured scenes is a sign you picked the
wrong type. Translate it:
- "a graphic/stylized image of a declassified manual / memo / dossier" → "document"
- "an image of a newspaper front page / headline" → "newspaper"
- "a graphic connecting events / showing a pattern over the years" → "timeline"
- "a chart/diagram showing X vs Y" → "chart" or "comparison"
- "a stylized map of …" → "map"
genImage is ONLY for a photo-realistic scene (a place, a mood, people, an object).
If the thing you want has words, stamps, dates, or data ON it, it is NOT a genImage.

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
