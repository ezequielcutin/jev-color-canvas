import { test } from "node:test";
import assert from "node:assert/strict";
import { createGovernor, LEVELS } from "../public/governor.mjs";

// A fake GPU. One frame takes max(vsync, cost at this scale); cost scales with
// pixels, i.e. with scale squared. `capMs` models a display that cannot go
// faster than that no matter how little we draw (e.g. a 50 Hz browser view).
function simulate({
  costAtFull,
  fixedMs = 0, // per-frame cost that does not shrink with resolution (draw overhead)
  lagFrames = 0, // a queued GPU shows the effect of a scale change this many frames late
  vsync = 16.7,
  seconds = 30,
  cost = null,
  startNow = 0,
  governor = createGovernor(),
}) {
  let now = startNow;
  let changes = 0;
  let last = governor.scale;
  const trail = [];
  const history = [];
  while (now - startNow < seconds * 1000) {
    history.push(governor.scale);
    const felt = history[Math.max(0, history.length - 1 - lagFrames)];
    const c = cost ? cost(now - startNow, felt) : fixedMs + costAtFull * felt ** 2;
    const delta = Math.max(vsync, c);
    now += delta;
    const s = governor.push(delta, now);
    if (s !== last) {
      changes++;
      last = s;
    }
    trail.push({ now, scale: s, delta });
  }
  return { governor, changes, trail, now };
}

const settledDelta = (trail) => {
  const tail = trail.slice(-60).map((t) => t.delta).sort((a, b) => a - b);
  return tail[Math.floor(tail.length / 2)];
};

test("a light scene stays at full resolution", () => {
  const { governor, changes } = simulate({ costAtFull: 6, seconds: 20 });
  assert.equal(governor.scale, 1);
  assert.equal(changes, 0);
});

test("a heavy scene drops quickly to a scale that holds the frame rate", () => {
  const { governor, trail } = simulate({ costAtFull: 90, seconds: 12 });
  assert.ok(governor.scale < 0.6, `scale ${governor.scale}`);
  assert.ok(settledDelta(trail) <= 18.5, `settled at ${settledDelta(trail)}ms`);
});

test("a huge overload jumps straight down instead of stepping", () => {
  const { trail } = simulate({ costAtFull: 400, seconds: 4 });
  const firstDrop = trail.find((t) => t.scale < 1);
  const timeToFirstDrop = firstDrop.now;
  const atFourSeconds = trail[trail.length - 1].scale;
  assert.ok(timeToFirstDrop < 2000, `first drop at ${timeToFirstDrop}ms`);
  assert.ok(atFourSeconds <= 0.5, `scale ${atFourSeconds}`);
});

test("it never leaves the range of levels", () => {
  const { trail } = simulate({ costAtFull: 800, seconds: 30 });
  const min = Math.min(...LEVELS);
  assert.ok(trail.every((t) => t.scale >= min && t.scale <= 1));
  assert.equal(trail[trail.length - 1].scale, min);
});

test("a frame rate the display caps is not mistaken for load", () => {
  // 20ms whatever we draw: shrinking cannot help, so it must come back to full.
  const { governor, changes } = simulate({ costAtFull: 1, vsync: 20, seconds: 120 });
  assert.equal(governor.scale, 1);
  assert.ok(changes <= 2, `${changes} changes in two minutes`);
});

test("it learns the cap and stops probing", () => {
  const early = simulate({ costAtFull: 1, vsync: 20, seconds: 30 }).changes;
  const later = simulate({ costAtFull: 1, vsync: 20, seconds: 600 }).changes;
  assert.equal(later, early, `${early} changes early, ${later} over ten minutes`);
});

test("on a capped display it still climbs back after a load spike", () => {
  const spike = (t, scale) => (t < 8000 ? 90 * scale ** 2 : 6 * scale ** 2);
  const { governor } = simulate({ cost: spike, vsync: 20, seconds: 90 });
  assert.equal(governor.scale, 1);
});

test("it climbs back up when the load goes away", () => {
  const heavyThenLight = (t, scale) => (t < 8000 ? 90 * scale ** 2 : 6 * scale ** 2);
  const { governor } = simulate({ cost: heavyThenLight, seconds: 90 });
  assert.equal(governor.scale, 1);
});

test("a scale that only just fits does not flap", () => {
  // Cost 30ms at full: level 0.72 gives ~15.5ms (fits), 0.85 gives ~21.7 (does not).
  const { changes, governor } = simulate({ costAtFull: 30, seconds: 300 });
  assert.ok(governor.scale <= 0.72, `scale ${governor.scale}`);
  assert.ok(changes <= 14, `${changes} changes in five minutes`);
});

test("one enormous frame (a background tab waking up) is ignored", () => {
  const governor = createGovernor();
  simulate({ costAtFull: 6, seconds: 3, governor });
  governor.push(5000, 100000);
  const { governor: after } = simulate({ costAtFull: 6, seconds: 3, governor, startNow: 100000 });
  assert.equal(after.scale, 1);
});

test("sustained overload with a lagging GPU does not pulse the resolution", () => {
  // Live behaviour that the simple model missed: 40ms at full, 18ms at the
  // bottom, effects arriving ~0.6s late (30 frames). The picture must settle and stay.
  const { trail, changes } = simulate({ costAtFull: 25, fixedMs: 15, lagFrames: 30, vsync: 20, seconds: 180 });
  const slow = trail.filter((t) => t.delta > 25).length / trail.length;
  const climbsToFull = trail.filter((t, i) => t.scale === 1 && i > 0 && trail[i - 1].scale !== 1).length;
  assert.ok(slow < 0.15, `${(slow * 100).toFixed(0)}% of frames were over 25ms`);
  assert.ok(climbsToFull <= 1, `climbed back to full resolution ${climbsToFull} times`);
  assert.ok(changes <= 16, `${changes} changes in three minutes`);
});

test("after one overload the next climb waits longer", () => {
  const { trail } = simulate({ costAtFull: 25, fixedMs: 15, lagFrames: 30, vsync: 20, seconds: 240 });
  const drops = trail.filter((t, i) => i > 0 && t.scale < trail[i - 1].scale && t.delta > 25).map((t) => t.now);
  const gaps = drops.slice(1).map((t, i) => t - drops[i]);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] * 1.4, `gaps ${gaps.join(", ")}`);
});

test("real overload right after a cap probe is not held back by its lockout", () => {
  // A 50 Hz view probes once at startup and locks probing out for 30s. Heavy
  // load arriving 3s later must still be answered within a couple of seconds.
  const suddenLoad = (t, scale) => (t < 3000 ? scale ** 2 : 150 * scale ** 2);
  const { trail } = simulate({ cost: suddenLoad, vsync: 20, seconds: 12 });
  const afterLoad = trail.filter((t) => t.now > 3000);
  const firstShrink = afterLoad.find((t) => t.scale < 1 && t.delta > 25 || t.scale < 0.5);
  const lastSecond = trail.slice(-40);
  assert.ok(firstShrink && firstShrink.now < 6500, `first shrink at ${firstShrink?.now}ms`);
  assert.ok(lastSecond.every((t) => t.delta <= 25), `still ${Math.max(...lastSecond.map((t) => t.delta)).toFixed(0)}ms at the end`);
});

test("severe load that pixels cannot fix does not make it probe forever", () => {
  // The main thread is stuck at 150ms per frame whatever we draw.
  const { changes } = simulate({ cost: () => 150, vsync: 20, seconds: 240 });
  assert.ok(changes <= 8, `${changes} resolution changes in four minutes`);
});
