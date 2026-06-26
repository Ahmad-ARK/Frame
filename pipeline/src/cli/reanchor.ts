// Normalises overlays on an already-resolved storyboard with the same rules the
// enrich stage now uses — drops redundant IMAGE overlays on imagery/punch scenes,
// then collision-aware re-anchors the rest — so existing storyboards get the fix
// without a full re-enrich.
//   npx tsx src/cli/reanchor.ts <storyboard.json>
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assignOverlayAnchors, suppressesImageOverlays } from "../enrich/enrichStoryboard.js";

const input = process.argv[2];
if (!input) { console.error("Usage: npx tsx src/cli/reanchor.ts <storyboard.json>"); process.exit(1); }
const path = resolve(input);
const sb = JSON.parse(await readFile(path, "utf8"));
let dropped = 0, moved = 0;
for (const scene of sb.scenes ?? []) {
  let ovs: any[] = scene.visual?.overlays ?? [];
  if (!ovs.length) continue;
  // 1) Drop image overlays where the scene type doesn't want them.
  if (suppressesImageOverlays(scene.visual.type)) {
    const before = ovs.length;
    ovs = ovs.filter((o) => o.kind !== "image");
    if (ovs.length !== before) { console.error(`  ${scene.id}: dropped ${before - ovs.length} image overlay(s) (${scene.visual.type})`); dropped += before - ovs.length; }
    scene.visual.overlays = ovs;
  }
  if (!ovs.length) { if (scene.visual.overlays?.length === 0) delete scene.visual.overlays; continue; }
  // 2) Collision-aware re-anchor the survivors.
  const anchors = assignOverlayAnchors(
    ovs.map((o) => ({ atMs: o.atMs ?? 0, durationMs: o.durationMs ?? 3500, anchor: o.anchor })),
    scene.visual.type
  );
  ovs.forEach((o, i) => {
    if (o.anchor !== anchors[i]) { console.error(`  ${scene.id} [${o.kind}] ${o.anchor} -> ${anchors[i]}`); moved++; }
    o.anchor = anchors[i];
  });
}
await writeFile(path, JSON.stringify(sb, null, 2));
console.error(`\n✓ Dropped ${dropped} image overlay(s), re-anchored ${moved} -> ${input}`);
