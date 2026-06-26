// Run: npx tsx src/llm/qwen.test.ts
// Verifies LLM_PROVIDER=qwen routes generateJson + generateVisionJson to the Qwen
// endpoint, against a LOCAL mock (no real Modal). Sets env before importing so the
// gemini client picks up the provider switch.
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

let lastBody: any = null;
const srv = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    lastBody = JSON.parse(raw || "{}");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: lastBody.images?.length ? '{"relevant":true}' : '{"scenes":{}}' }));
  });
});
srv.listen(0);
await once(srv, "listening");
const port = (srv.address() as any).port;

process.env.LLM_PROVIDER = "qwen";
process.env.QWEN_ENDPOINT = `http://127.0.0.1:${port}/`;
process.env.FLUX_MODAL_KEY = "test-key";
process.env.FLUX_MODAL_SECRET = "test-secret";
// No GEMINI_API_KEY set — proves the Qwen-only path needs no Gemini key.
delete process.env.GEMINI_API_KEY;

const { generateJson, generateVisionJson } = await import("../gemini/client.js");

// 1) text generation routes to Qwen and returns its text.
const out = await generateJson({ system: "sys", user: "make json", temperature: 0.2 });
assert.equal(out, '{"scenes":{}}', "generateJson routed to Qwen");
assert.equal(lastBody.user, "make json");
assert.equal((lastBody.images ?? []).length, 0, "no images for text call");

// 2) vision generation routes to Qwen WITH images.
const v = await generateVisionJson({
  system: "verify",
  user: "is this X?",
  images: [{ data: "QUJD", mimeType: "image/jpeg" }],
});
assert.equal(v, '{"relevant":true}', "generateVisionJson routed to Qwen");
assert.equal(lastBody.images.length, 1, "image passed through");
assert.equal(lastBody.images[0].mimeType, "image/jpeg");

srv.close();
console.log("qwen.test OK");
