import { generateJson } from "../gemini/client.js";
import { type Storyboard } from "../schema/storyboard.js";
import { finalizeAndValidate } from "../shared/storyboardIO.js";
import { SCRIPT_SYSTEM_PROMPT, buildUserPrompt, type GenerateContext } from "./prompt.js";

export type GenerateResult = {
  storyboard: Storyboard;
  rawResponse: string;
};

/**
 * Greenfield generation: a topic (+ optional thesis/angle) -> a full validated
 * Storyboard with narration written in the channel voice. The LLM emits JSON
 * only; it asserts factual claims with EMPTY sourceUrls (no fabricated URLs) —
 * sourcing is filled by the research stage / human at Gate 1.
 */
export async function generateStoryboard(
  ctx: GenerateContext
): Promise<GenerateResult> {
  if (ctx.topic.trim().length === 0) {
    throw new Error("Topic is empty.");
  }

  const rawResponse = await generateJson({
    system: SCRIPT_SYSTEM_PROMPT,
    user: buildUserPrompt(ctx),
    temperature: 0.7, // creative writing — looser than the importer's 0.2
  });

  const storyboard = finalizeAndValidate(rawResponse, {
    channelId: ctx.channelId,
    topic: ctx.topic,
    thesis: ctx.thesis,
    idPrefix: "sb-generated",
  });

  return { storyboard, rawResponse };
}
