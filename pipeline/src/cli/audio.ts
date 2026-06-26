// Replace TTS with a user's OWN narration recording. Given a storyboard (whose
// scene narrations match the recording) and an audio file, transcribe + align +
// slice per scene. Use after import/generate when the user recorded that script.
//   npx tsx src/cli/audio.ts <storyboard.json> <recording.mp3> [--model base] [--out path]
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { alignStoryboardToAudio } from "../audio/alignStoryboardAudio.js";

function parse(argv: string[]) {
  const pos: string[] = []; let model: string | undefined; let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const r = argv[i]; const eq = r.startsWith("--") ? r.indexOf("=") : -1;
    const key = eq >= 0 ? r.slice(0, eq) : r; const val = eq >= 0 ? r.slice(eq + 1) : argv[i + 1];
    if (key === "--model") { model = val; if (eq < 0) i++; }
    else if (key === "--out") { out = val; if (eq < 0) i++; }
    else if (!r.startsWith("--")) pos.push(r);
  }
  return { storyboard: pos[0], audio: pos[1], model, out };
}

async function main() {
  const { storyboard, audio, model, out } = parse(process.argv.slice(2));
  if (!storyboard || !audio) {
    console.error("Usage: npx tsx src/cli/audio.ts <storyboard.json> <recording.mp3> [--model base] [--out path]");
    process.exit(1);
  }
  const sbPath = resolve(storyboard);
  const sb = JSON.parse(await readFile(sbPath, "utf8"));
  console.error(`Aligning "${sb.topic ?? sb.id}" to ${audio} (whisper ${model ?? "base"}) ...`);
  await alignStoryboardToAudio(sb, resolve(audio), { model });
  const outPath = resolve(out ?? sbPath);
  await writeFile(outPath, JSON.stringify(sb, null, 2) + "\n", "utf8");
  let total = 0;
  for (const s of sb.scenes) { total += s.durationMs ?? 0; console.error(`  ✓ ${String(s.id).padEnd(26)} ${((s.durationMs ?? 0) / 1000).toFixed(1)}s · ${s.wordTimings?.length ?? 0} words`); }
  console.error(`\n✓ Aligned ${sb.scenes.length} scenes · ${(total / 1000).toFixed(1)}s → ${outPath}`);
}

main().catch((e) => { console.error("\n✗ Audio align failed:\n" + (e as Error).message); process.exit(1); });
