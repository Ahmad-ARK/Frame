// Run: npx tsx src/server/validate.test.ts
import assert from "node:assert/strict";
import { cleanErrorMessage, safeClientError } from "./validate.js";

const gem503 =
  '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}';

// dev-mode (cleaned, full): inner message extracted, no JSON blob
assert.equal(
  cleanErrorMessage(gem503),
  "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later."
);
// prod-mode (sanitized): friendly busy message
assert.equal(safeClientError(gem503), "The AI service is busy right now. Please try again in a moment.");
// quota
assert.match(safeClientError('{"error":{"code":429,"message":"RESOURCE_EXHAUSTED"}}'), /quota/i);
// validation message passes through
assert.equal(safeClientError("`script` is required for mode=import"), "`script` is required for mode=import");
// plain non-json stays as-is in dev
assert.equal(cleanErrorMessage('unknown storyboardId "x"'), 'unknown storyboardId "x"');

console.log("validate.test OK");
