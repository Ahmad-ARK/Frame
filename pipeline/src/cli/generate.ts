import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateStoryboard } from "../script/generateScript.js";
import { slugify } from "../shared/storyboardIO.js";

type Args = {
  topic?: string;
  thesis?: string;
  angle?: string;
  scenes?: number;
  channel: string;
  out?: string;
  dryRun: boolean;
};

// Accepts both "--flag value" and "--flag=value" so it survives npm's arg
// mangling (npm intercepts bare "--flag" tokens as its own config).
function parseArgs(argv: string[]): Args {
  const args: Args = { channel: "documentary-dark", dryRun: false };
  const positional: string[] = [];
  const take = (i: number, inline?: string): [string, number] =>
    inline !== undefined ? [inline, i] : [argv[++i], i];

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const key = eq >= 0 ? raw.slice(0, eq) : raw;
    const inline = eq >= 0 ? raw.slice(eq + 1) : undefined;

    if (key === "--thesis") [args.thesis, i] = take(i, inline);
    else if (key === "--angle") [args.angle, i] = take(i, inline);
    else if (key === "--scenes") { let v; [v, i] = take(i, inline); args.scenes = Number(v); }
    else if (key === "--channel") [args.channel, i] = take(i, inline);
    else if (key === "--out") [args.out, i] = take(i, inline);
    else if (key === "--dry-run") args.dryRun = true;
    else if (!raw.startsWith("--")) positional.push(raw);
  }
  args.topic = positional.join(" ").trim() || undefined;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.topic) {
    console.error(
      [
        'Usage: npx tsx src/cli/generate.ts "<topic>" [options]',
        "",
        "  NOTE: run via `npx tsx` directly. `npm run generate -- --flag` does NOT work —",
        "        npm strips --flag tokens before they reach the script.",
        "",
        "  --thesis  <string>   One-sentence POV/argument (optional)",
        "  --angle   <string>   The angle to take on the topic (optional)",
        "  --scenes  <number>   Target scene count (default: 8)",
        "  --channel <string>   Channel/style-guide id (default: documentary-dark)",
        "  --out     <path>     Output JSON path (default: ./out/<topic-slug>.storyboard.json)",
        "  --dry-run            Print the parsed config and exit (no API call)",
      ].join("\n")
    );
    process.exit(1);
  }

  const outPath = resolve(
    args.out ?? `out/${slugify(args.topic)}.storyboard.json`
  );

  if (args.dryRun) {
    console.error("DRY RUN — parsed config (no API call):");
    console.error(`  topic:   ${args.topic}`);
    console.error(`  thesis:  ${args.thesis ?? "(none)"}`);
    console.error(`  angle:   ${args.angle ?? "(none)"}`);
    console.error(`  scenes:  ${args.scenes ?? 8}`);
    console.error(`  channel: ${args.channel}`);
    console.error(`  out:     ${outPath}`);
    return;
  }

  console.error(`Generating script for "${args.topic}" ...`);
  const { storyboard } = await generateStoryboard({
    channelId: args.channel,
    topic: args.topic,
    thesis: args.thesis,
    angle: args.angle,
    targetScenes: args.scenes,
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(storyboard, null, 2) + "\n", "utf8");

  const unsourced = storyboard.scenes.reduce(
    (n, s) => n + s.sources.filter((src) => src.sourceUrl.trim() === "").length,
    0
  );
  console.error(`\n✓ ${storyboard.scenes.length} scenes written to ${outPath}`);
  console.error(`  thesis: ${storyboard.thesis}`);
  for (const s of storyboard.scenes) {
    console.error(`  ${s.id.padEnd(24)} ${s.visual.type.padEnd(11)} ${s.narration.slice(0, 52)}…`);
  }
  if (unsourced > 0) {
    console.error(`\n  ⚠ ${unsourced} claim(s) need sourcing at Gate 1 (sourceUrl empty).`);
  }
}

main().catch((err) => {
  console.error("\n✗ Generation failed:\n" + (err as Error).message);
  process.exit(1);
});
