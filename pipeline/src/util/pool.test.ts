// Run: npx tsx src/util/pool.test.ts   (exits non-zero on failure)
import assert from "node:assert/strict";
import { mapPool, hostThrottle, hostOf } from "./pool.js";

async function testMapPoolOrderAndCap() {
  let active = 0;
  let maxActive = 0;
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = await mapPool(items, 3, async (x) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 15));
    active--;
    return x * 2;
  });
  assert.deepEqual(out, items.map((x) => x * 2), "preserves input order");
  assert.ok(maxActive <= 3, `concurrency cap respected (saw ${maxActive})`);
  assert.ok(maxActive >= 2, `actually ran in parallel (saw ${maxActive})`);
}

async function testThrottleSpacesSameHost() {
  const throttle = hostThrottle(50);
  const t0 = Date.now();
  const stamps: number[] = [];
  await Promise.all([0, 1, 2].map(async () => { await throttle("h"); stamps.push(Date.now() - t0); }));
  stamps.sort((a, b) => a - b);
  assert.ok(stamps[1] - stamps[0] >= 40, `same-host gap 1 too small (${stamps[1] - stamps[0]}ms)`);
  assert.ok(stamps[2] - stamps[1] >= 40, `same-host gap 2 too small (${stamps[2] - stamps[1]}ms)`);
}

async function testThrottleDifferentHostsFree() {
  const throttle = hostThrottle(200);
  await throttle("a"); // reserve a's slot
  const t = Date.now();
  await throttle("b"); // different host — should not wait on a
  assert.ok(Date.now() - t < 30, "different host should proceed immediately");
}

assert.equal(hostOf("https://api.wikimedia.org/core/v1/x"), "api.wikimedia.org");
assert.equal(hostOf("not a url"), "unknown");

await testMapPoolOrderAndCap();
await testThrottleSpacesSameHost();
await testThrottleDifferentHostsFree();
console.log("pool.test OK");
