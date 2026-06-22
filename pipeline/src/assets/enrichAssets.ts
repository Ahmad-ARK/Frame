import { writeFile, mkdir, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type Storyboard, type Scene } from "../schema/storyboard.js";
import { resolveFinders, resolveCandidateFinders, DEFAULT_SOURCE_ORDER } from "./sources.js";
import { findInternetArchiveVideoCandidates } from "./internetArchive.js";
import { verifyFootage, type FootageVerdict } from "./footageVerify.js";
import { verifyImage, type ImageVerdict } from "./imageVerify.js";
import { isQuotaError } from "../gemini/client.js";
import { generateFluxImage, buildFluxPrompt, FluxAuthError } from "./flux.js";
import { computeFocal } from "./focal.js";

// Visual types backed by a single fetched (searched) still image.
const IMAGE_TYPES = new Set(["archivalPhoto", "newspaper", "document"]);
// Visual types backed by an AI-generated still (FLUX).
const GEN_TYPES = new Set(["genImage"]);

const UA = "documentary-pipeline/0.1 (asset fetcher; contact via project)";

export type AssetEnrichOptions = {
  /** Remotion public dir to download into. Default: ../remotion/public */
  publicDir?: string;
  /** Stop after this many fetches (quota/testing). */
  max?: number;
  /** Delay between fetches (ms). Default 500. */
  delayMs?: number;
  /** Allow CC BY-SA images (off by default — share-alike risk). */
  allowShareAlike?: boolean;
  /** Source adapters to try, in order. Default: wikimedia → internetArchive. */
  sources?: string[];
  /** Vision-verify fetched footage actually depicts the subject. Default true. */
  verifyFootage?: boolean;
  /** How many footage candidates to try per clip before falling back. Default 3. */
  footageMaxCandidates?: number;
  /** Injectable footage verifier (tests bypass Gemini). Default: Gemini vision. */
  footageVerifier?: (clipPath: string, subject: string, durationSec: number) => Promise<FootageVerdict>;
  /** Vision-verify fetched still images actually depict the subject. Default true. */
  verifyImages?: boolean;
  /** How many image candidates to try per slot before accepting/falling back. Default 3. */
  imageMaxCandidates?: number;
  /** Injectable image verifier (tests bypass Gemini). Default: Gemini vision. */
  imageVerifier?: (filePath: string, subject: string, expectation?: string) => Promise<ImageVerdict>;
  onProgress?: (info: {
    sceneId: string;
    query: string;
    result: "filled" | "not-found" | "error";
    detail?: string;
    index: number;
    total: number;
  }) => void;
};

export type AssetEnrichResult = {
  storyboard: Storyboard;
  filled: number;
  notFound: number;
  errored: number;
  skipped: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Best available search term for a scene that needs an image. */
function queryForScene(scene: Scene): string {
  const style = (scene.visual.style ?? {}) as Record<string, any>;
  const explicit = style.query || style.caption || scene.onScreenText;
  if (explicit) return String(explicit);
  // Fall back to the directive, trimmed of common framing filler.
  return scene.visual.directive
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/\b(showing|that shows|depicting|of)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

const extFromMime = (mime: string) => (mime === "image/png" ? "png" : "jpg");
const videoExtFromMime = (mime: string) => (mime === "video/webm" ? "webm" : "mp4");

const execFileP = promisify(execFile);

/** Seconds of a media file (or remote URL) via ffprobe, or 0 if it can't be read. */
async function probeDurationSec(filePath: string, timeoutMs = 30_000): Promise<number> {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath,
    ], { timeout: timeoutMs });
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : 0;
  } catch {
    return 0;
  }
}

/**
 * A skip-in (ms) past the opening leader/titles of an archival clip. IA "movies"
 * are frequently whole films (minutes long) that open on countdowns, title cards,
 * or black leader — starting at t=0 shows that junk. Skipping ~12% in (clamped)
 * lands reliably in the body of the footage. No-op for short clips.
 */
const leaderSkipMs = (durationSec: number): number =>
  durationSec >= 60 ? Math.round(Math.min(90_000, Math.max(8_000, durationSec * 1000 * 0.12))) : 0;

async function downloadTo(url: string, filePath: string): Promise<void> {
  // Retry: Internet Archive derivative downloads transiently 5xx (on-demand
  // derivation, load), and large footage files occasionally drop mid-transfer.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`download ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(filePath, buf);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

/**
 * Walks scenes whose visual is backed by a fetched image, finds a license-clean
 * Wikimedia image, downloads it into Remotion's public/ dir, and populates
 * scene.visual.assets[0]. Idempotent: scenes that already have assets are kept.
 */
export async function enrichStoryboardAssets(
  input: Storyboard,
  opts: AssetEnrichOptions = {}
): Promise<AssetEnrichResult> {
  const publicDir = opts.publicDir ?? resolve(process.cwd(), "..", "remotion", "public");
  const delayMs = opts.delayMs ?? 1100; // ease Wikimedia rate limits (429)
  const finders = resolveFinders(opts.sources ?? DEFAULT_SOURCE_ORDER);
  const sb: Storyboard = structuredClone(input);

  const targets = sb.scenes
    .map((scene, idx) => ({ scene, idx }))
    .filter(
      ({ scene }) =>
        (IMAGE_TYPES.has(scene.visual.type) || GEN_TYPES.has(scene.visual.type)) &&
        (!scene.visual.assets || scene.visual.assets.length === 0) &&
        !(scene.visual.style as any)?.photo && // photo-spec scenes handled by the multi-image pass
        // Mode-based newspaper/document render from their style spec, not a full-scene image.
        // Their only fetched image (clipping/scan subject) is handled by Pass 5.
        !(scene.visual.style as any)?.newspaper &&
        !(scene.visual.style as any)?.document
    );

  const total = opts.max ? Math.min(opts.max, targets.length) : targets.length;
  let filled = 0;
  let notFound = 0;
  let errored = 0;
  // Once FLUX credentials are confirmed missing, skip remaining genImage scenes
  // instead of re-failing each one.
  let fluxDisabled = false;

  const assetDir = join(publicDir, "assets", sb.id);
  await mkdir(assetDir, { recursive: true });

  // ── Vision-verified image fetch (shared by every image pass) ──
  // Pulls several ranked candidates, downloads each, and asks a vision model
  // whether it really depicts the subject — so a "Mountbatten portrait" search
  // that returns a painting, or a document search that returns a book-page scan,
  // is rejected and the next candidate tried. Degrades gracefully: once Gemini's
  // daily quota is hit, it stops verifying and accepts the best-ranked candidate.
  const candidateFinders = resolveCandidateFinders(opts.sources ?? DEFAULT_SOURCE_ORDER);
  const doVerifyImages = opts.verifyImages !== false;
  const imageVerifier =
    opts.imageVerifier ?? ((p: string, s: string, exp?: string) => verifyImage(p, s, { expectation: exp }));
  const maxImageCandidates = opts.imageMaxCandidates ?? 3;
  let imageVerifyDisabled = false; // flips on first quota error — stop wasting calls

  /**
   * Finds, verifies, and downloads an image for `subject` into `assetDir` as
   * `<fileBase>.<ext>`. Returns the relative src + focal + attribution, or null if
   * nothing usable/relevant was found. `expectation` sharpens the vision check.
   */
  const fetchVerifiedImage = async (
    subject: string,
    fileBase: string,
    expectation?: string
  ): Promise<{ src: string; focal?: { x: number; y: number }; attribution?: string } | null> => {
    // Gather ranked candidates across sources (deduped).
    const candidates: Awaited<ReturnType<(typeof candidateFinders)[number]["find"]>> = [];
    const seen = new Set<string>();
    for (const { find } of candidateFinders) {
      if (candidates.length >= maxImageCandidates) break;
      let found: Awaited<ReturnType<(typeof candidateFinders)[number]["find"]>> = [];
      try { found = await find(subject, { allowShareAlike: opts.allowShareAlike, max: maxImageCandidates }); }
      catch { found = []; }
      for (const c of found) { if (!seen.has(c.url)) { seen.add(c.url); candidates.push(c); } }
    }
    if (candidates.length === 0) return null;

    const finalize = async (cand: (typeof candidates)[number]): Promise<{ src: string; focal?: { x: number; y: number }; attribution?: string }> => {
      const fileName = `${fileBase}.${extFromMime(cand.mime)}`;
      const abs = join(assetDir, fileName);
      await downloadTo(cand.url, abs);
      return { src: `assets/${sb.id}/${fileName}`, focal: await computeFocal(abs), attribution: cand.license?.attributionText };
    };

    const verify = doVerifyImages && !imageVerifyDisabled;
    for (let ci = 0; ci < candidates.length; ci++) {
      const cand = candidates[ci];
      if (!verify || imageVerifyDisabled) return finalize(cand); // accept best-ranked
      const fileName = `${fileBase}.${extFromMime(cand.mime)}`;
      const abs = join(assetDir, fileName);
      await downloadTo(cand.url, abs);
      try {
        const verdict = await imageVerifier(abs, subject, expectation);
        if (verdict.relevant) return { src: `assets/${sb.id}/${fileName}`, focal: await computeFocal(abs), attribution: cand.license?.attributionText };
        console.error(`    ✗ rejected image "${subject.slice(0, 30)}" (${cand.source}): ${verdict.reason?.slice(0, 50) ?? "not relevant"}`);
      } catch (vErr) {
        if (isQuotaError(vErr)) { imageVerifyDisabled = true; console.error(`    · image verify quota hit — accepting best-ranked from here on`); return { src: `assets/${sb.id}/${fileName}`, focal: await computeFocal(abs), attribution: cand.license?.attributionText }; }
        console.error(`    ✗ image verify error "${subject.slice(0, 30)}": ${String((vErr as Error)?.message ?? vErr).slice(0, 40)}`);
      }
      await sleep(delayMs);
    }
    // All candidates were genuinely rejected by the verifier.
    return null;
  };

  for (let i = 0; i < total; i++) {
    const { scene } = targets[i];
    const isGen = GEN_TYPES.has(scene.visual.type);
    const style = (scene.visual.style ?? {}) as Record<string, any>;
    const query = isGen ? buildFluxPrompt(scene.visual.directive, style.prompt) : queryForScene(scene);
    let result: "filled" | "not-found" | "error" = "not-found";
    let detail: string | undefined;

    if (isGen && fluxDisabled) {
      opts.onProgress?.({ sceneId: scene.id, query, result: "error", detail: "FLUX disabled (no credentials)", index: i + 1, total });
      errored++;
      if (i < total - 1) await sleep(delayMs);
      continue;
    }

    try {
      if (isGen) {
        // Generate with FLUX and write the PNG bytes directly.
        const bytes = await generateFluxImage(query, {
          width: style.width,
          height: style.height,
          seed: style.seed,
        });
        const fileName = `${scene.id}.png`;
        await writeFile(join(assetDir, fileName), bytes);
        scene.visual.assets = [
          {
            ref: `assets/${sb.id}/${fileName}`,
            kind: "image",
            source: "imageModel",
            license: { type: "AI-generated", attributionRequired: false },
          },
        ];
        filled++;
        result = "filled";
        detail = `imageModel (FLUX) · ${(bytes.length / 1024).toFixed(0)}KB`;
      } else {
        // Try each search source in order; take the first license-clean hit.
        let found = null as Awaited<ReturnType<(typeof finders)[number]["find"]>>;
        for (const { find } of finders) {
          found = await find(query, { allowShareAlike: opts.allowShareAlike });
          if (found) break;
        }
        if (found) {
          const ext = extFromMime(found.mime);
          const fileName = `${scene.id}.${ext}`;
          await downloadTo(found.url, join(assetDir, fileName));
          scene.visual.assets = [
            {
              ref: `assets/${sb.id}/${fileName}`, // staticFile()-relative (posix)
              kind: "image",
              source: found.source,
              license: found.license,
            },
          ];
          filled++;
          result = "filled";
          const dims = found.width && found.height ? ` · ${found.width}x${found.height}` : "";
          detail = `${found.source} · ${found.license.type}${dims}`;
        } else {
          notFound++;
        }
      }
    } catch (err) {
      errored++;
      result = "error";
      detail = String((err as Error)?.message ?? err).slice(0, 100);
      if (err instanceof FluxAuthError) fluxDisabled = true; // stop trying FLUX
    }

    opts.onProgress?.({ sceneId: scene.id, query, result, detail, index: i + 1, total });
    if (i < total - 1) await sleep(delayMs);
  }

  // ── Pass 2: fetch images for word-cued image OVERLAYS (insets) ──
  for (const scene of sb.scenes) {
    const ovs: any[] = (scene.visual as any).overlays ?? [];
    for (let oi = 0; oi < ovs.length; oi++) {
      const ov = ovs[oi];
      if (ov.kind !== "image" || ov.src || !ov.subject) continue;
      try {
        // 1) Prefer a real, license-clean, VISION-VERIFIED photo from search sources.
        const got = await fetchVerifiedImage(String(ov.subject), `${scene.id}-ov${oi}`);
        if (got) {
          ov.src = got.src;
          ov.focal = got.focal;
          if (got.attribution) ov.attribution = got.attribution;
          filled++;
          console.error(`  ✓ overlay ${scene.id}[${oi}] "${String(ov.subject).slice(0, 40)}" → verified photo`);
        } else if (!fluxDisabled) {
          // 2) Fallback: generate with FLUX (own infra — works regardless of
          //    whether Wikimedia is reachable). Marks the asset as AI-generated.
          try {
            const bytes = await generateFluxImage(buildFluxPrompt(String(ov.subject)), { width: 1024, height: 768 });
            const fileName = `${scene.id}-ov${oi}.png`;
            await writeFile(join(assetDir, fileName), bytes);
            ov.src = `assets/${sb.id}/${fileName}`;
            ov.attribution = "Generated · FLUX";
            filled++;
            console.error(`  ✓ overlay ${scene.id}[${oi}] "${String(ov.subject).slice(0, 40)}" → FLUX (generated fallback)`);
          } catch (gerr) {
            if (gerr instanceof FluxAuthError) fluxDisabled = true;
            notFound++;
            console.error(`  · overlay ${scene.id}[${oi}] "${String(ov.subject).slice(0, 40)}" → no image (search miss, FLUX ${fluxDisabled ? "disabled" : "failed"})`);
          }
        } else {
          notFound++;
          console.error(`  · overlay ${scene.id}[${oi}] "${String(ov.subject).slice(0, 40)}" → no image`);
        }
        await sleep(delayMs);
      } catch (err) {
        errored++;
        console.error(`  ✗ overlay ${scene.id}[${oi}]: ${String((err as Error)?.message ?? err).slice(0, 60)}`);
      }
    }
  }

  // ── Pass 3: fetch portrait photos for quoteCard "portrait" mode ──
  for (const scene of sb.scenes) {
    const q: any = (scene.visual.style as any)?.quote;
    if (!q || q.mode !== "portrait" || !q.portrait?.subject || q.portrait?.src) continue;
    try {
      // A portrait must be a real photo of the RIGHT person — exactly the case
      // keyword search botches (wrong person, or a painting). Verify it.
      const got = await fetchVerifiedImage(String(q.portrait.subject), `${scene.id}-portrait`, "a real photograph or photographic portrait of this specific person (not a painting, statue, or a different person)");
      if (got) {
        q.portrait.src = got.src;
        q.portrait.focal = got.focal;
        if (!q.portrait.caption && q.attribution) q.portrait.caption = q.attribution;
        filled++;
        console.error(`  ✓ portrait ${scene.id} "${String(q.portrait.subject).slice(0, 40)}" → verified`);
      } else {
        notFound++;
        console.error(`  · portrait ${scene.id} "${String(q.portrait.subject).slice(0, 40)}" → no verified portrait`);
      }
      await sleep(delayMs);
    } catch (err) {
      errored++;
      console.error(`  ✗ portrait ${scene.id}: ${String((err as Error)?.message ?? err).slice(0, 60)}`);
    }
  }

  // ── Pass 4: fetch the N images for photo-spec scenes (montage/split/grid/single/annotated) ──
  for (const scene of sb.scenes) {
    const photo: any = (scene.visual.style as any)?.photo;
    if (!photo?.items?.length) continue;
    const isGen = scene.visual.type === "genImage";
    for (let k = 0; k < photo.items.length; k++) {
      const item = photo.items[k];
      if (item.src || !item.subject) continue;
      try {
        if (isGen) {
          if (fluxDisabled) { errored++; continue; }
          const bytes = await generateFluxImage(buildFluxPrompt(String(item.subject)));
          const fileName = `${scene.id}-p${k}.png`;
          await writeFile(join(assetDir, fileName), bytes);
          item.src = `assets/${sb.id}/${fileName}`;
          item.focal = await computeFocal(join(assetDir, fileName));
          filled++;
          console.error(`  ✓ photo ${scene.id}[${k}] (FLUX) "${String(item.subject).slice(0, 36)}"`);
        } else {
          const got = await fetchVerifiedImage(String(item.subject), `${scene.id}-p${k}`);
          if (got) {
            item.src = got.src;
            item.focal = got.focal;
            if (!item.attribution && got.attribution) item.attribution = got.attribution;
            filled++;
            console.error(`  ✓ photo ${scene.id}[${k}] "${String(item.subject).slice(0, 36)}" → verified`);
          } else if (!fluxDisabled) {
            // No license-clean image passed verification → generate one (on-subject
            // by construction, so no placeholder gap in the grid/montage).
            try {
              const bytes = await generateFluxImage(buildFluxPrompt(String(item.subject)));
              const fileName = `${scene.id}-p${k}.png`;
              await writeFile(join(assetDir, fileName), bytes);
              item.src = `assets/${sb.id}/${fileName}`;
              item.focal = await computeFocal(join(assetDir, fileName));
              item.attribution = "Generated · FLUX";
              filled++;
              console.error(`  ✓ photo ${scene.id}[${k}] "${String(item.subject).slice(0, 36)}" → no verified image, GENERATED (FLUX)`);
            } catch (gErr) {
              if (gErr instanceof FluxAuthError) fluxDisabled = true;
              notFound++;
              console.error(`  · photo ${scene.id}[${k}] "${String(item.subject).slice(0, 36)}" → no image (FLUX ${fluxDisabled ? "disabled" : "failed"})`);
            }
          } else {
            notFound++;
            console.error(`  · photo ${scene.id}[${k}] "${String(item.subject).slice(0, 36)}" → no image (FLUX disabled)`);
          }
          await sleep(delayMs);
        }
      } catch (err) {
        errored++;
        if (err instanceof FluxAuthError) fluxDisabled = true;
        console.error(`  ✗ photo ${scene.id}[${k}]: ${String((err as Error)?.message ?? err).slice(0, 60)}`);
      }
    }
  }

  // ── Pass 5: newspaper clippings + document scans (single fetched image each) ──
  for (const scene of sb.scenes) {
    const style: any = scene.visual.style ?? {};
    const slot = scene.visual.type === "newspaper" ? style.newspaper?.clipping
      : scene.visual.type === "document" ? style.document?.scan
      : undefined;
    if (!slot || slot.src || !slot.subject) continue;
    try {
      const expectation = scene.visual.type === "newspaper"
        ? "a real newspaper front page or press clipping (printed headlines/columns)"
        : "a real scanned document, memo, cable, or typed/handwritten page";
      const got = await fetchVerifiedImage(String(slot.subject), `${scene.id}-doc`, expectation);
      if (got) {
        slot.src = got.src;
        slot.focal = got.focal;
        filled++;
        console.error(`  ✓ ${scene.visual.type} ${scene.id} "${String(slot.subject).slice(0, 36)}" → verified`);
      } else {
        notFound++;
        console.error(`  · ${scene.visual.type} ${scene.id} "${String(slot.subject).slice(0, 36)}" → no verified image`);
      }
      await sleep(delayMs);
    } catch (err) {
      errored++;
      console.error(`  ✗ ${scene.visual.type} ${scene.id}: ${String((err as Error)?.message ?? err).slice(0, 60)}`);
    }
  }

  // ── Pass 6: real B-roll for video scenes, VISION-VERIFIED, with graceful
  //    degradation. Keyword search can't tell a mushroom cloud from a cartoon, so
  //    each candidate clip is checked by a vision model; the cascade is:
  //      verified footage → archival photo (still) → AI-generated still.
  //    A clip that falls back to a still is marked kind:"image" and the renderer
  //    Ken-Burns-pans it instead of playing video.
  const doVerify = opts.verifyFootage !== false;
  const verifier = opts.footageVerifier ?? ((p: string, s: string, d: number) => verifyFootage(p, s, d));
  const maxCandidates = opts.footageMaxCandidates ?? 3;

  for (const scene of sb.scenes) {
    if (scene.visual.type !== "video") continue;
    const vid: any = (scene.visual.style as any)?.video;
    if (!vid?.clips?.length) continue;

    for (let k = 0; k < vid.clips.length; k++) {
      const clip = vid.clips[k];

      // Already resolved on a prior run — just backfill kind + leader skip-in.
      if (clip.src) {
        if (!clip.kind) clip.kind = /\.(mp4|webm|mov)$/i.test(clip.src) ? "video" : "image";
        if (clip.kind === "video" && !/^https?:\/\//.test(clip.src) && clip.trimBeforeMs === undefined) {
          const skip = leaderSkipMs(await probeDurationSec(join(publicDir, clip.src)));
          if (skip > 0) clip.trimBeforeMs = skip;
        }
        continue;
      }
      if (!clip.subject) continue;
      const subject = String(clip.subject);

      try {
        // ── 1) Try real footage candidates, vision-verified ──
        let chosen: { dur: number; verdict: FootageVerdict; attribution?: string } | null = null;
        const candidates = await findInternetArchiveVideoCandidates(subject, {
          allowShareAlike: opts.allowShareAlike,
          max: maxCandidates,
        });
        const fileName = `${scene.id}-v${k}.mp4`;
        const absPath = join(assetDir, fileName);

        for (const cand of candidates) {
          // Verify against the REMOTE url first (ffmpeg range-seeks a few frames),
          // so rejected candidates are never fully downloaded — important on a
          // constrained connection where a film can be 100s of MB.
          let dur = 0;
          let verdict: FootageVerdict = { relevant: true };
          if (doVerify) {
            dur = await probeDurationSec(cand.url);
            if (dur <= 0) { console.error(`    ? ${scene.id}[${k}] candidate unreadable remotely, skipping`); continue; }
            try {
              verdict = await verifier(cand.url, subject, dur);
            } catch (vErr) {
              console.error(`    ✗ verify error ${scene.id}[${k}]: ${String((vErr as Error)?.message ?? vErr).slice(0, 50)}`);
              continue;
            }
            if (!verdict.relevant) {
              console.error(`    ✗ rejected ${scene.id}[${k}] (${cand.license.type}): ${verdict.reason?.slice(0, 60) ?? "not relevant"}`);
              await sleep(delayMs);
              continue;
            }
          }
          // Accepted (or verification disabled) — download the full file now.
          await downloadTo(cand.url, absPath);
          if (dur <= 0) dur = await probeDurationSec(absPath);
          chosen = { dur, verdict: { ...verdict, bestAtMs: verdict.bestAtMs ?? leaderSkipMs(dur) }, attribution: cand.license?.attributionText };
          console.error(`  ✓ footage ${scene.id}[${k}] "${subject.slice(0, 32)}" → ${cand.license.type} · verified${verdict.reason ? ` (${verdict.reason.slice(0, 40)})` : ""}`);
          break;
        }

        if (chosen) {
          clip.src = `assets/${sb.id}/${fileName}`;
          clip.kind = "video";
          clip.trimBeforeMs = Math.max(0, chosen.verdict.bestAtMs ?? leaderSkipMs(chosen.dur));
          if (!clip.attribution && chosen.attribution) clip.attribution = chosen.attribution;
          filled++;
          await sleep(delayMs);
          continue;
        }

        // ── 2) No authentic footage → fall back to a still archival photo (also verified) ──
        const photo = await fetchVerifiedImage(subject, `${scene.id}-v${k}`, "a real photograph of the subject");
        if (photo) {
          clip.src = photo.src;
          clip.kind = "image";
          clip.focal = photo.focal;
          if (!clip.attribution && photo.attribution) clip.attribution = photo.attribution;
          filled++;
          console.error(`  ✓ footage ${scene.id}[${k}] "${subject.slice(0, 32)}" → no footage, using verified PHOTO`);
          await sleep(delayMs);
          continue;
        }

        // ── 3) No photo either → AI-generate a still ──
        if (!fluxDisabled) {
          try {
            const bytes = await generateFluxImage(buildFluxPrompt(subject), { width: 1536, height: 864 });
            const genName = `${scene.id}-v${k}.png`;
            await writeFile(join(assetDir, genName), bytes);
            clip.src = `assets/${sb.id}/${genName}`;
            clip.kind = "image";
            clip.attribution = "Generated · FLUX";
            clip.focal = await computeFocal(join(assetDir, genName));
            filled++;
            console.error(`  ✓ footage ${scene.id}[${k}] "${subject.slice(0, 32)}" → no footage/photo, GENERATED (FLUX)`);
            continue;
          } catch (gErr) {
            if (gErr instanceof FluxAuthError) fluxDisabled = true;
          }
        }

        notFound++;
        console.error(`  · footage ${scene.id}[${k}] "${subject.slice(0, 32)}" → nothing usable (placeholder)`);
      } catch (err) {
        errored++;
        console.error(`  ✗ footage ${scene.id}[${k}]: ${String((err as Error)?.message ?? err).slice(0, 60)}`);
      }
    }
  }

  const skipped = targets.length - total;
  return { storyboard: sb, filled, notFound, errored, skipped };
}
