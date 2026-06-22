import { generateJson } from "../gemini/client.js";
import { type Storyboard } from "../schema/storyboard.js";
import { finalizeAndValidate } from "../shared/storyboardIO.js";
import { SYSTEM_PROMPT, buildUserPrompt, type ImportContext } from "./prompt.js";

export type ImportResult = {
  storyboard: Storyboard;
  rawResponse: string;
};

/**
 * Converts a finished prose voiceover script into a validated Storyboard.
 * The LLM emits JSON only; we parse, normalize, and gate it through zod.
 */
export async function importScript(
  scriptText: string,
  ctx: ImportContext
): Promise<ImportResult> {
  if (scriptText.trim().length === 0) {
    throw new Error("Script text is empty.");
  }

  const rawResponse = await generateJson({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(scriptText, ctx),
    temperature: 0.2,
  });

  const storyboard = finalizeAndValidate(rawResponse, {
    channelId: ctx.channelId,
    topic: ctx.topic,
    thesis: ctx.thesis,
    idPrefix: "sb-imported",
  });

  return { storyboard, rawResponse };
}
