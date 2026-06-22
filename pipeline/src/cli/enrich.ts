import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { StoryboardSchema } from "../schema/storyboard.js";
import { enrichStoryboard } from "../enrich/enrichStoryboard.js";
import { ENRICH_SYSTEM_PROMPT, buildEnrichUserPrompt } from "../enrich/prompt.js";

type Args = { input?: string; out?: string; llmJson?: string; dumpPrompt?: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const key = eq >= 0 ? raw.slice(0, eq) : raw;
    const inline = eq >= 0 ? raw.slice(eq + 1) : undefined;
    if (key === "--out") args.out = inline ?? argv[++i];
    else if (key === "--llm-json") args.llmJson = inline ?? argv[++i];
    else if (key === "--dump-prompt") args.dumpPrompt = true;
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
        "Usage: npx tsx src/cli/enrich.ts <storyboard.json> [options]",
        "",
        "  Fills heavy per-scene style (maps/stat/comparison) + word-cued overlays.",
        "  --out=path        output path (default: in place)",
        "  --dump-prompt     print the exact system+user prompt and exit (for external LLM testing)",
        "  --llm-json=path   use this pre-generated LLM JSON instead of calling Gemini",
      ].join("\n")
    );
    process.exit(1);
  }

  const inPath = resolve(args.input);
  const outPath = resolve(args.out ?? args.input);
  const parsed = JSON.parse(await readFile(inPath, "utf8"));
  const storyboard = StoryboardSchema.parse(parsed);

  // Dump the exact prompt (so a stronger external model can be tested against it).
  if (args.dumpPrompt) {
    const sceneInputs = storyboard.scenes.map((s) => ({
      id: s.id, type: s.visual.type, narration: s.narration, directive: s.visual.directive,
    }));
    process.stdout.write(
      "===== SYSTEM =====\n" + ENRICH_SYSTEM_PROMPT +
      "\n\n===== USER =====\n" + buildEnrichUserPrompt(storyboard.topic, sceneInputs) + "\n"
    );
    return;
  }

  const llmEnrichMap = args.llmJson
    ? JSON.parse(await readFile(resolve(args.llmJson), "utf8"))
    : undefined;

  console.error(`Enriching "${storyboard.topic}"${llmEnrichMap ? " (injected LLM JSON)" : ""} ...\n`);
  const { storyboard: out, enriched, skipped, quotaHit, notes } =
    await enrichStoryboard(storyboard, { llmEnrichMap });

  for (const n of notes) console.error(`  · ${n}`);

  const validated = StoryboardSchema.parse(out);
  await writeFile(outPath, JSON.stringify(validated, null, 2) + "\n", "utf8");

  console.error(`\n✓ Enriched ${enriched} scene(s) → ${outPath}`);
  if (quotaHit) {
    console.error(`  ⚠ Gemini quota exhausted — ${skipped} scene(s) left un-enriched. Re-run on ${relative(process.cwd(), outPath)} after reset.`);
  } else if (skipped > 0) {
    console.error(`  · ${skipped} scene(s) could not be enriched`);
  }
}

main().catch((err) => {
  console.error("\n✗ Enrich failed:\n" + (err as Error).message);
  process.exit(1);
});
