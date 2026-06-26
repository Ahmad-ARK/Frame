// Smoke test for the parallelized search loop. Run: npx tsx src/assets/enrichAssets.smoke.ts
// Uses an INJECTED image verifier (no Gemini) and only archivalPhoto scenes (no
// FLUX/Modal). Hits real Wikimedia through the new mapPool + hostThrottle path
// and writes into a temp dir. Asserts it fetched concurrently without crashing.
import assert from "node:assert/strict";
import { readFile, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichStoryboardAssets } from "./enrichAssets.js";

const sbPath = join(process.cwd(), "..", "remotion", "storyboards", "asset-test.storyboard.json");
const sb = JSON.parse(await readFile(sbPath, "utf8"));

// Keep only plain searched-image scenes (archivalPhoto without a photo-spec), clear
// any existing assets so they become fetch targets, and take two.
sb.scenes = sb.scenes
  .filter((s: any) => s.visual?.type === "archivalPhoto" && !s.visual?.style?.photo)
  .slice(0, 2)
  .map((s: any) => ({ ...s, visual: { ...s.visual, assets: [] } }));

assert.ok(sb.scenes.length >= 1, "fixture has at least one archivalPhoto scene to test");
console.log(`testing ${sb.scenes.length} archivalPhoto scene(s)`);

const publicDir = await mkdtemp(join(tmpdir(), "asset-smoke-"));
const t0 = Date.now();
const res = await enrichStoryboardAssets(sb, {
  publicDir,
  verifyImages: true,
  imageVerifier: async () => ({ relevant: true, reason: "stub-accept" }), // no Gemini
  searchConcurrency: 3,
  delayMs: 800,
});
const ms = Date.now() - t0;

const files = await readdir(join(publicDir, "assets", sb.id)).catch(() => []);
console.log(`filled=${res.filled} notFound=${res.notFound} errored=${res.errored} in ${ms}ms; files=${files.length}`, files);
assert.equal(res.errored, 0, "no errors in the search loop");
assert.ok(res.filled + res.notFound === sb.scenes.length, "every target accounted for");
console.log("enrichAssets.smoke OK");
