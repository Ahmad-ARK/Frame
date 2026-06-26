// Run: npx tsx src/assets/flux.batch.test.ts
// Verifies generateFluxImages against LOCAL mock servers (never touches real
// Modal). Sets all FLUX_* env to the mocks up front so dotenv (loaded when
// flux.ts imports) can't pull real creds/endpoints in.
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

process.env.FLUX_MODAL_KEY = "test-key";
process.env.FLUX_MODAL_SECRET = "test-secret";

const tinyPngB64 = Buffer.from("\x89PNG\r\n\x1a\nFAKE").toString("base64");

// Batch mock: { prompts:[...] } -> { images:[b64,...] }, one per prompt.
let batchRequests = 0;
const batchSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    batchRequests++;
    const { prompts } = JSON.parse(body || "{}");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ images: (prompts ?? []).map(() => tinyPngB64) }));
  });
});

// Single-image mock: returns raw PNG bytes.
const singleSrv = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "image/png" });
  res.end(Buffer.from("\x89PNG\r\n\x1a\nONE"));
});

batchSrv.listen(0);
singleSrv.listen(0);
await Promise.all([once(batchSrv, "listening"), once(singleSrv, "listening")]);
const batchPort = (batchSrv.address() as any).port;
const singlePort = (singleSrv.address() as any).port;

// Import AFTER env is set so the module reads our mock config.
const { generateFluxImages, isFluxError } = await import("./flux.js");

// 1) Batch path: 5 prompts, chunk size 2 -> 3 requests (2+2+1), 5 buffers.
process.env.FLUX_BATCH_ENDPOINT = `http://127.0.0.1:${batchPort}/batch`;
const batchOut = await generateFluxImages(["a", "b", "c", "d", "e"], { batchSize: 2 });
assert.equal(batchOut.length, 5, "one result per prompt");
assert.ok(batchOut.every((r) => !isFluxError(r)), "all batch results are buffers");
assert.ok((batchOut[0] as Buffer).length > 0, "decoded a non-empty png");
assert.equal(batchRequests, 3, `chunked into 3 requests (got ${batchRequests})`);

// 2) Fallback path: no batch endpoint, single endpoint, concurrency 2.
delete process.env.FLUX_BATCH_ENDPOINT;
process.env.FLUX_ENDPOINT = `http://127.0.0.1:${singlePort}/`;
const fbOut = await generateFluxImages(["x", "y"], { concurrency: 2 });
assert.equal(fbOut.length, 2, "fallback returns one per prompt");
assert.ok(fbOut.every((r) => !isFluxError(r)), "fallback results are buffers");

// 3) Empty input -> empty output, no network.
assert.deepEqual(await generateFluxImages([]), []);

batchSrv.close();
singleSrv.close();
console.log("flux.batch.test OK");
