import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StoryboardSchema } from "../schema/storyboard.js";
import { enrichStoryboardAssets } from "../assets/enrichAssets.js";

type Args = {
  input?: string;
  out?: string;
  publicDir?: string;
  max?: number;
  allowShareAlike: boolean;
  sources?: string[];
};

// Accepts "--flag value" and "--flag=value". Run via `npx tsx` directly;
// `npm run assets -- --flag` strips the flag (npm intercepts it).
function parseArgs(argv: string[]): Args {
  const args: Args = { allowShareAlike: false };
  const positional: string[] = [];
  const take = (i: number, inline?: string): [string, number] =>
    inline !== undefined ? [inline, i] : [argv[++i], i];

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const key = eq >= 0 ? raw.slice(0, eq) : raw;
    const inline = eq >= 0 ? raw.slice(eq + 1) : undefined;

    if (key === "--out") [args.out, i] = take(i, inline);
    else if (key === "--public-dir") [args.publicDir, i] = take(i, inline);
    else if (key === "--max") { let v; [v, i] = take(i, inline); args.max = Number(v); }
    else if (key === "--allow-share-alike") args.allowShareAlike = true;
    else if (key === "--source") { let v; [v, i] = take(i, inline); args.sources = v.split(",").map((s) => s.trim()).filter(Boolean); }
    else if (!raw.startsWith("--")) positional.push(raw);
  }
  args.input = positional[0];
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    console.error(
      [
        "Usage: npx tsx src/cli/assets.ts <storyboard.json> [options]",
        "",
        "  Fetches license-clean Wikimedia images for image-backed scenes",
        "  (archivalPhoto/newspaper/document), downloads them into Remotion's",
        "  public/ dir, and populates scene.visual.assets[0].",
        "",
        "  --out               <path>   Output storyboard path (default: overwrite input)",
        "  --public-dir        <path>   Remotion public dir (default: ../remotion/public)",
        "  --max               <number> Stop after N fetches",
        "  --source            <list>   Comma-sep source order (default: wikimedia,internetArchive)",
        "  --allow-share-alike          Permit CC BY-SA images (off by default)",
      ].join("\n")
    );
    process.exit(1);
  }

  const inPath = resolve(args.input);
  const outPath = resolve(args.out ?? args.input);

  const storyboard = StoryboardSchema.parse(JSON.parse(await readFile(inPath, "utf8")));

  console.error(`Fetching assets for "${storyboard.topic}" ...\n`);

  const { storyboard: enriched, filled, notFound, errored, skipped } =
    await enrichStoryboardAssets(storyboard, {
      publicDir: args.publicDir ? resolve(args.publicDir) : undefined,
      max: args.max,
      allowShareAlike: args.allowShareAlike,
      sources: args.sources,
      onProgress: ({ sceneId, query, result, detail, index, total }) => {
        const tag = result === "filled" ? "✓" : result === "error" ? "✗" : "·";
        console.error(`  ${tag} [${index}/${total}] ${sceneId}  "${query.slice(0, 48)}"`);
        if (detail) console.error(`      ${detail}`);
      },
    });

  const validated = StoryboardSchema.parse(enriched);
  await writeFile(outPath, JSON.stringify(validated, null, 2) + "\n", "utf8");

  console.error(`\n✓ Fetched ${filled} image(s) → ${outPath}`);
  if (notFound > 0) console.error(`  · ${notFound} scene(s) had no license-clean match`);
  if (errored > 0) console.error(`  ✗ ${errored} scene(s) errored`);
  if (skipped > 0) console.error(`  · ${skipped} scene(s) skipped (--max limit)`);
  if (filled === 0 && notFound === 0 && errored === 0) {
    console.error("  (no image-backed scenes needed fetching)");
  }
}

main().catch((err) => {
  console.error("\n✗ Asset fetch failed:\n" + (err as Error).message);
  process.exit(1);
});
