import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { StoryboardSchema } from "../schema/storyboard.js";
import { enrichStoryboardSources } from "../research/enrichSources.js";

type Args = {
  input?: string;
  out?: string;
  max?: number;
  delay?: number;
};

// Accepts both "--flag value" and "--flag=value". Use `npx tsx` directly;
// `npm run research -- --flag` strips the flag (npm intercepts it).
function parseArgs(argv: string[]): Args {
  const args: Args = {};
  const positional: string[] = [];
  const take = (i: number, inline?: string): [string, number] =>
    inline !== undefined ? [inline, i] : [argv[++i], i];

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const key = eq >= 0 ? raw.slice(0, eq) : raw;
    const inline = eq >= 0 ? raw.slice(eq + 1) : undefined;

    if (key === "--out") [args.out, i] = take(i, inline);
    else if (key === "--max") { let v; [v, i] = take(i, inline); args.max = Number(v); }
    else if (key === "--delay") { let v; [v, i] = take(i, inline); args.delay = Number(v); }
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
        "Usage: npx tsx src/cli/research.ts <storyboard.json> [options]",
        "",
        "  Fills empty source URLs on every scene's claims using grounded search.",
        "  NOTE: run via `npx tsx` directly. `npm run research -- --flag` does NOT work.",
        "",
        "  --out   <path>     Output path (default: overwrite the input file)",
        "  --max   <number>   Stop after sourcing this many claims (quota control)",
        "  --delay <ms>       Delay between grounded calls (default: 1200)",
      ].join("\n")
    );
    process.exit(1);
  }

  const inPath = resolve(args.input);
  const outPath = resolve(args.out ?? args.input);

  const parsed = JSON.parse(await readFile(inPath, "utf8"));
  const storyboard = StoryboardSchema.parse(parsed);

  const pending = storyboard.scenes.reduce(
    (n, s) => n + s.sources.filter((src) => src.sourceUrl.trim() === "").length,
    0
  );
  if (pending === 0) {
    console.error("✓ All claims already have sources. Nothing to do.");
    return;
  }

  console.error(
    `Researching ${args.max ? Math.min(args.max, pending) : pending} of ${pending} unsourced claim(s) for "${storyboard.topic}" ...\n`
  );

  const { storyboard: enriched, filled, notFound, skipped, quotaHit } =
    await enrichStoryboardSources(storyboard, {
      max: args.max,
      delayMs: args.delay,
      onProgress: ({ sceneId, claim, result, sourceUrl, index, total }) => {
        const tag = result === "filled" ? "✓" : "·";
        const tail = sourceUrl ? sourceUrl : "(no citation found)";
        console.error(
          `  ${tag} [${index}/${total}] ${sceneId}: ${claim.slice(0, 56)}…\n      → ${tail}`
        );
      },
    });

  // Re-validate before writing (grounding could in theory produce odd data).
  const validated = StoryboardSchema.parse(enriched);
  await writeFile(outPath, JSON.stringify(validated, null, 2) + "\n", "utf8");

  const remaining = validated.scenes.reduce(
    (n, s) => n + s.sources.filter((src) => src.sourceUrl.trim() === "").length,
    0
  );
  console.error(`\n✓ Sourced ${filled} claim(s) → ${outPath}`);
  if (notFound > 0) console.error(`  · ${notFound} claim(s) had no citation found`);
  if (skipped > 0 && !quotaHit) console.error(`  · ${skipped} claim(s) skipped (--max limit)`);

  if (quotaHit) {
    console.error(
      [
        "",
        "  ⚠ Stopped early: Gemini API quota exhausted (free-tier daily cap).",
        `    ${remaining} claim(s) still need sourcing. Progress was saved to the output file.`,
        "    Resume later (after the daily quota resets) by running on the OUTPUT file —",
        "    already-sourced claims are skipped:",
        "",
        `      npx tsx src/cli/research.ts ${relative(process.cwd(), outPath)}`,
      ].join("\n")
    );
  } else if (remaining > 0) {
    console.error(`  ⚠ ${remaining} claim(s) still need sourcing.`);
  }
}

main().catch((err) => {
  console.error("\n✗ Research failed:\n" + (err as Error).message);
  process.exit(1);
});
