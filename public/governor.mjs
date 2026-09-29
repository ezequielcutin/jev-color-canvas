// Decides how sharp to render so the picture stays smooth on any device.
// Pure (no DOM, no timers): feed it frame times, it returns a render scale.
// Runs in the browser (served from public/) and in Node tests.
//
// The picture is soft, so drawing it at 0.5 scale and letting the browser
// upscale it costs about a quarter of the pixel work and looks nearly the same.
// Cost is proportional to pixels, i.e. to scale squared.
//
// Two ideas keep it honest:
//  * Overload jumps straight to the scale that should fit, not one step at a
//    time, because a device taking 100ms a frame cannot wait through six steps.
//  * Every move is verified. If shrinking does not make frames faster, the
//    limit is not pixels (the display caps at 50 Hz, or the CPU is the
//    bottleneck), so it goes back instead of shrinking forever.
//  * After every move it waits for the effect to show before judging. A queued
//    GPU shows a change a few frames late, and judging too soon would read
//    that lag as "shrinking did not help". If nothing ever shifts, it gives up
//    waiting and treats that as no help.
//  * Growing is cautious. A GPU with a queue shows the cost of a bigger size a
//    window or two late, so each step up dwells before the next, and any drop
//    caused by overload locks growing out for longer each time it happens.
//  * It learns the display's floor, the best frame time it has seen, but only
//    once that time has repeated across several windows. A 50 Hz display then
//    counts 20ms as healthy rather than as load, so it neither keeps probing
//    downward nor stays stuck low after a spike. A single overloaded window is
//    never taken for the display's limit.

export const LEVELS = [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.35];

export function createGovernor({
  hi = 18.5, // median frame ms above which we shrink (under ~54 fps)
  lo = 17.2, // median below which we may try growing (a healthy 60 fps)
  target = 15, // frame ms to aim for when jumping down
  minSamples = 4,
  minWindowMs = 450,
  ignoreAboveMs = 1000, // a frame this long is a tab waking up, not load
  downBackoffMs = 30000,
  upBackoffMs = 15000,
  maxSettleMs = 2500, // longest to wait for a move's effect to show up
  upDwellMs = 3000, // minimum time at a level before growing again
  stableResetMs = 120000, // this long without a change forgives past overloads
  severeFactor = 1.5, // this far over the limit, no lockout applies
  maxBackoffMs = 600000,
  levels = LEVELS,
} = {}) {
  const last = levels.length - 1;
  let level = 0;
  let ring = [];
  let windowStart = null;
  let verify = null; // { kind: "down" | "up", from, before }
  let downLockUntil = 0;
  let downLockSevere = false; // the failed probe behind the lock was itself a severe overload
  let upLockUntil = 0;
  let downBackoff = downBackoffMs;
  let upBackoff = upBackoffMs;
  let lastChangeAt = 0;
  let settling = null; // { since, before } after a move, until its effect shows
  let best = Infinity; // best window median seen so far
  let stable = 0; // consecutive windows within 8% of it: the floor is real when this is >= 2

  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  function evaluate(med, now) {
    if (settling) {
      const shifted = Math.abs(med - settling.before) / settling.before >= 0.1;
      if (!shifted && now - settling.since < maxSettleMs) return; // not visible yet
      settling = null;
    }
    // Judged against what the display can actually do, not a fixed 60 fps,
    // but only once that floor has proved itself.
    const trusted = stable >= 2;
    decide(med, now, trusted ? Math.max(hi, best * 1.12) : hi, trusted ? Math.max(lo, best * 1.06) : lo);
    if (med < best * 0.92) {
      best = med; // a real improvement: start proving the new floor
      stable = 0;
    } else if (med <= best * 1.08) {
      best = Math.min(best, med);
      stable++;
    } else {
      stable = 0;
    }
  }

  function decide(med, now, hiNow, loNow) {
    if (now - lastChangeAt >= stableResetMs) upBackoff = upBackoffMs;
    const before = level;
    decideMove(med, now, hiNow, loNow);
    if (level !== before) {
      lastChangeAt = now;
      settling = { since: now, before: med };
    }
  }

  function decideMove(med, now, hiNow, loNow) {
    if (verify) {
      const v = verify;
      verify = null;
      if (v.kind === "down" && med > hiNow && med > v.before * 0.92) {
        // Drawing less did not help: pixels are not the bottleneck.
        level = v.from;
        downLockUntil = now + downBackoff;
        downLockSevere = v.before > hiNow * severeFactor; // pixels are not the problem at all
        downBackoff = Math.min(downBackoff * 2, maxBackoffMs);
        return;
      }
      if (v.kind === "up") {
        if (med > hiNow) {
          level = v.from; // grew too far
          upLockUntil = now + upBackoff;
          upBackoff = Math.min(upBackoff * 2, maxBackoffMs);
          return;
        }
      }
    }

    // A lockout from a marginal probe (say 20ms on a 50 Hz display) must not
    // hold back a real overload that arrives soon after. But if the probe that
    // set it was itself severe and shrinking did not help, the lockout stands,
    // or a stuck main thread would make the resolution flicker forever.
    const severe = med > hiNow * severeFactor;
    if (med > hiNow && level < last && (now >= downLockUntil || (severe && !downLockSevere))) {
      const fits = levels[level] * Math.sqrt(target / med);
      let next = level + 1;
      while (next < last && levels[next] > fits) next++;
      verify = { kind: "down", from: level, before: med };
      level = next;
      // This level was too much. Do not climb back into it for a while, and a
      // longer while each time it happens.
      upLockUntil = Math.max(upLockUntil, now + upBackoff);
      upBackoff = Math.min(upBackoff * 2, maxBackoffMs);
      return;
    }
    if (med <= loNow && level > 0 && now >= upLockUntil) {
      verify = { kind: "up", from: level, before: med };
      level -= 1;
      upLockUntil = Math.max(upLockUntil, now + upDwellMs);
    }
  }

  return {
    // Feed every frame's duration (ms) with the current time (ms).
    // Returns the render scale to use.
    push(ms, now) {
      if (!(ms > 0) || ms > ignoreAboveMs) return levels[level];
      if (windowStart === null) windowStart = now - ms;
      ring.push(ms);
      if (ring.length >= minSamples && now - windowStart >= minWindowMs) {
        const med = median(ring);
        ring = [];
        windowStart = null;
        evaluate(med, now);
      }
      return levels[level];
    },
    get scale() {
      return levels[level];
    },
  };
}
