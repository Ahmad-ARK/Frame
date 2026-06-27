// Maps a prepared storyboard into exactly what the review gates need — script
// prose, the real fetched visuals (with thumbnails + an honest "needs a look"
// flag), and real word-timed captions. The scene-type system stays hidden: the
// UI only ever sees a description, a source label, and an image URL.

export interface ReviewCandidate {
  ref?: string;    // local path (image) — served via /media/
  url?: string;    // remote URL (video not yet downloaded)
  kind: "image" | "video";
  source: string;
  thumbUrl?: string;
  caption?: string;
}

export interface ReviewVisual {
  id: string;
  sceneId: string; // storyboard scene id — used by pick-asset endpoint
  desc: string; // plain-language description of the picture
  line: string; // the narration line it illustrates
  source: string; // friendly provenance ("Wikimedia Commons", "AI-generated", …)
  flagged: boolean; // surfaced for review (AI-generated = worth a look)
  thumbUrl?: string; // the actual fetched/generated image
  candidates?: ReviewCandidate[]; // alternative options the user can pick
}

export interface ReviewCaption {
  id: string;
  t: string; // mm:ss
  text: string;
}

export interface ReviewData {
  id: string;
  title: string;
  script: string;
  visuals: ReviewVisual[];
  captions: ReviewCaption[];
  verifiedCount: number; // confident (non-flagged) visuals, for the calm line
}

// Image refs in a storyboard are staticFile-relative ("assets/<sbId>/<file>").
// The browser reaches them through the proxy at /api/media/<ref>.
const MEDIA_BASE = "/media/";
function mediaUrl(ref?: string): string | undefined {
  if (!ref) return undefined;
  if (/^https?:\/\//.test(ref)) return ref;
  return MEDIA_BASE + String(ref).replace(/^\/+/, "");
}

const SOURCE_LABEL: Record<string, string> = {
  wikimedia: "Wikimedia Commons",
  internetArchive: "Internet Archive",
  pexels: "Pexels",
  storyblocks: "Storyblocks",
  imageModel: "AI-generated",
  generated: "AI-generated",
  kling: "AI-generated",
  veo: "AI-generated",
  hyperframes: "Motion graphic",
};
const isGenerated = (s?: string) =>
  s === "imageModel" || s === "generated" || s === "kling" || s === "veo";

/** The narration line a visual sits under (first sentence, trimmed). */
function firstLine(narration: string): string {
  const s = String(narration ?? "").replace(/\s+/g, " ").trim();
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim().slice(0, 100);
}

export function mapStoryboardToReview(sb: any): ReviewData {
  const id = String(sb?.id ?? "untitled");
  const title = String(sb?.topic || sb?.title || "Untitled documentary");
  const scenes: any[] = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const script = scenes
    .map((s) => String(s?.narration ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  // ── visuals: every real fetched/generated image, wherever it lives ──
  const visuals: ReviewVisual[] = [];
  const seen = new Set<string>();
  let vseq = 0;
  for (const scene of scenes) {
    const v = scene?.visual ?? {};
    const style = v.style ?? {};
    const line = firstLine(scene?.narration ?? "");
    const directive = String(v.directive ?? "A visual for this moment");
    const sceneId = String(scene?.id ?? "");
    const add = (ref: string | undefined, source: string | undefined, desc: string) => {
      const url = mediaUrl(ref);
      if (!url || seen.has(url)) return;
      seen.add(url);
      // Map raw candidates to ReviewCandidate (image → mediaUrl, video → keep remote url)
      const rawCandidates: any[] = Array.isArray(v.candidates) ? v.candidates : [];
      const candidates: ReviewCandidate[] = rawCandidates
        .map((c: any) => {
          const isImg = (c.kind ?? "image") === "image";
          const cThumb = isImg ? mediaUrl(c.ref) : undefined;
          return {
            ref: c.ref,
            url: c.url,
            kind: (c.kind ?? "image") as "image" | "video",
            source: SOURCE_LABEL[c.source ?? ""] ?? String(c.source ?? "Unknown"),
            thumbUrl: cThumb,
            caption: c.caption || c.subject,
          };
        })
        .filter((c) => c.ref || c.url);
      visuals.push({
        id: `v${++vseq}`,
        sceneId,
        desc: String(desc || directive).slice(0, 160),
        line,
        source: SOURCE_LABEL[source ?? ""] ?? "Library footage",
        flagged: isGenerated(source),
        thumbUrl: url,
        candidates: candidates.length > 1 ? candidates : undefined,
      });
    };
    for (const a of v.assets ?? []) {
      if (a?.kind === "image" || a?.kind === "video" || a?.kind === "mp4") add(a.ref, a.source, directive);
    }
    for (const it of style.photo?.items ?? []) add(it?.src, it?.source, it?.subject || it?.caption || directive);
    for (const c of style.video?.clips ?? []) add(c?.src, c?.source, c?.subject || c?.caption || directive);
    for (const o of v.overlays ?? []) if (o?.src) add(o.src, o.source, o?.subject || o?.caption || directive);
    if (style.quote?.portrait?.src) add(style.quote.portrait.src, undefined, style.quote.portrait.caption || directive);
    if (style.newspaper?.clipping?.src) add(style.newspaper.clipping.src, undefined, directive);
    if (style.document?.scan?.src) add(style.document.scan.src, undefined, directive);
  }

  // ── captions: real word timings, grouped into readable lines, global mm:ss ──
  const captions: ReviewCaption[] = [];
  let cseq = 0;
  let offsetMs = 0;
  for (const scene of scenes) {
    const wt: any[] = Array.isArray(scene?.wordTimings) ? scene.wordTimings : [];
    const dur = Number(scene?.durationMs) || (wt.length ? Math.max(...wt.map((w) => Number(w.endMs) || 0)) : 0);
    if (wt.length) {
      let words: string[] = [];
      let lineStart = Number(wt[0].startMs) || 0;
      let prevEnd = lineStart;
      const flush = () => {
        if (!words.length) return;
        const sec = Math.round((offsetMs + lineStart) / 1000);
        captions.push({ id: `c${++cseq}`, t: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`, text: words.join(" ") });
        words = [];
      };
      for (const w of wt) {
        const word = String(w?.word ?? "");
        if (!word) continue;
        const start = Number(w.startMs) || prevEnd;
        const gap = start - prevEnd;
        if (words.length && (words.join(" ").length + word.length + 1 > 42 || gap > 340)) {
          flush();
          lineStart = start;
        }
        if (!words.length) lineStart = start;
        words.push(word);
        if (/[.!?]["')]?$/.test(word)) flush();
        prevEnd = Number(w.endMs) || start;
      }
      flush();
    }
    offsetMs += dur;
  }

  const verifiedCount = visuals.filter((x) => !x.flagged).length;
  return { id, title, script, visuals, captions, verifiedCount };
}
