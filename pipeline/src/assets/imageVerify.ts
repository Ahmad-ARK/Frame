// Vision verification for fetched STILL images. Keyword image search is more
// reliable than footage search, but still misfires: a person search returns the
// wrong person or a painting instead of a photo ("Louis Mountbatten portrait" → a
// painting), a document search returns a book-page scan, a place returns a map
// when a photo was wanted, etc. A vision model LOOKS at the downloaded image and
// confirms it authentically depicts the subject.

import { readFile } from "node:fs/promises";
import { generateVisionJson, type VisionImage } from "../gemini/client.js";
import { stripFences } from "../shared/storyboardIO.js";

export type ImageVerdict = { relevant: boolean; reason?: string };

/** Injectable so tests can supply a verdict without calling Gemini (quota). */
export type VisionJsonFn = (opts: {
  system: string;
  user: string;
  images: VisionImage[];
}) => Promise<string>;

const SYSTEM = [
  "You verify still images for a documentary. You are shown ONE image and a SUBJECT it is supposed to depict.",
  "Decide whether the image authentically and recognizably depicts that subject.",
  "REJECT (relevant=false) if: it shows the WRONG person/place/thing, it is a painting/illustration/cartoon when a real photograph is expected, it is a book-page or text/document scan when a photo of the subject was wanted, it is an unrelated map/diagram/chart, it is a generic placeholder, a logo, or it is too cropped/abstract to recognize the subject.",
  "ACCEPT (relevant=true) if the image genuinely and clearly depicts the subject.",
  "Output JSON only.",
].join(" ");

const mimeFor = (path: string): string =>
  /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg";

/**
 * Asks a vision model whether the image at `filePath` depicts `subject`.
 * `expectation` is an optional hint ("a real photograph of the person",
 * "a newspaper front page", "a document/memo") to sharpen the judgement.
 */
export async function verifyImage(
  filePath: string,
  subject: string,
  opts: { vision?: VisionJsonFn; expectation?: string } = {}
): Promise<ImageVerdict> {
  let data: string;
  try {
    data = (await readFile(filePath)).toString("base64");
  } catch {
    return { relevant: false, reason: "image could not be read" };
  }
  const user = [
    `SUBJECT: ${subject}`,
    opts.expectation ? `EXPECTED: ${opts.expectation}` : "",
    `Return JSON: {"relevant": boolean, "reason": string}.`,
  ].filter(Boolean).join("\n");

  const vision = opts.vision ?? generateVisionJson;
  const raw = await vision({ system: SYSTEM, user, images: [{ data, mimeType: mimeFor(filePath) }] });
  try {
    const parsed = JSON.parse(stripFences(raw));
    return { relevant: parsed?.relevant === true, reason: typeof parsed?.reason === "string" ? parsed.reason : undefined };
  } catch {
    return { relevant: false, reason: "verifier returned unparseable JSON" };
  }
}
