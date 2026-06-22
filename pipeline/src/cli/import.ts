import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { importScript } from "../importer/importScript.js";

type Args = {
  input?: string;
  out?: string;
  topic?: string;
  thesis?: string;
  channel: string;
};

// Accepts both "--flag value" and "--flag=value" so it survives npm's arg
// mangling (npm intercepts bare "--flag" tokens as its own config). When
// invoking through `npm run`, use the "--flag=value" form.
function parseArgs(argv: string[]): Args {
  const args: Args = { channel: "documentary-dark" };
  const positional: string[] = [];
  const take = (i: number, inline?: string): [string, number] =>
    inline !== undefined ? [inline, i] : [argv[++i], i];

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const key = eq >= 0 ? raw.slice(0, eq) : raw;
    const inline = eq >= 0 ? raw.slice(eq + 1) : undefined;

    if (key === "--out") [args.out, i] = take(i, inline);
    else if (key === "--topic") [args.topic, i] = take(i, inline);
    else if (key === "--thesis") [args.thesis, i] = take(i, inline);
    else if (key === "--channel") [args.channel, i] = take(i, inline);
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
        "Usage: npx tsx src/cli/import.ts <script.txt> [options]",
        "",
        "  NOTE: run via `npx tsx` directly. `npm run import -- --flag` does NOT work —",
        "        npm strips --flag tokens before they reach the script.",
        "",
        "  --topic   <string>   Topic title (default: derived from filename)",
        "  --thesis  <string>   One-sentence POV/argument (optional)",
        "  --channel <string>   Channel/style-guide id (default: documentary-dark)",
        "  --out     <path>     Output JSON path (default: ./out/<input>.storyboard.json)",
      ].join("\n")
    );
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  const scriptText = await readFile(inputPath, "utf8");
  const topic = args.topic ?? basename(inputPath).replace(/\.[^.]+$/, "");
  const outPath = resolve(
    args.out ?? `out/${basename(inputPath).replace(/\.[^.]+$/, "")}.storyboard.json`
  );

  console.error(`Importing "${topic}" from ${inputPath} ...`);
  const { storyboard } = await importScript(scriptText, {
    channelId: args.channel,
    topic,
    thesis: args.thesis,
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(storyboard, null, 2) + "\n", "utf8");

  console.error(
    `\n✓ ${storyboard.scenes.length} scenes written to ${outPath}`
  );
  for (const s of storyboard.scenes) {
    console.error(`  ${s.id.padEnd(22)} ${s.visual.type.padEnd(11)} ${s.narration.slice(0, 56)}…`);
  }
}

main().catch((err) => {
  console.error("\n✗ Import failed:\n" + (err as Error).message);
  process.exit(1);
});
