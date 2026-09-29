import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSettle } from "../public/settle.mjs";

// sample = what the pick pass read under the finger, each 0..1:
//   bgMask   1 where the scene shows its background, 0 where its foreground
//   bgRival  1 where the background is showing its runner-up colour
//   fgRival  1 where the foreground is showing its runner-up colour
const open = { share: [0.4, 0.3], settled: [false, false] };

test("tapping a runner-up patch in the background hands the background to the runner-up", () => {
  const d = decideSettle({ bgMask: 1, bgRival: 1, fgRival: 0 }, open);
  assert.deepEqual(d, { role: 0, name: "background", action: "settle", to: 1 });
});

test("tapping the winner's colour settles the vote for the winner", () => {
  const d = decideSettle({ bgMask: 1, bgRival: 0, fgRival: 1 }, open);
  assert.deepEqual(d, { role: 0, name: "background", action: "settle", to: 0 });
});

test("the foreground is read when the tap lands on the foreground", () => {
  const d = decideSettle({ bgMask: 0, bgRival: 0, fgRival: 1 }, open);
  assert.deepEqual(d, { role: 1, name: "foreground", action: "settle", to: 1 });
});

test("a soft edge counts for whichever side it is closer to", () => {
  assert.equal(decideSettle({ bgMask: 0.6, bgRival: 0.4, fgRival: 0 }, open).role, 0);
  assert.equal(decideSettle({ bgMask: 0.4, bgRival: 0, fgRival: 0.7 }, open).to, 1);
});

test("a role Jev was sure about says so instead of doing nothing", () => {
  const d = decideSettle({ bgMask: 0, bgRival: 0, fgRival: 0 }, { share: [0.4, 0], settled: [false, false] });
  assert.deepEqual(d, { role: 1, name: "foreground", action: "sure" });
});

test("a role the user already settled says so", () => {
  const d = decideSettle({ bgMask: 1, bgRival: 1, fgRival: 0 }, { share: [0.4, 0.3], settled: [true, false] });
  assert.deepEqual(d, { role: 0, name: "background", action: "done" });
});
