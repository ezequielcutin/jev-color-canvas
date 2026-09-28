import { test } from "node:test";
import assert from "node:assert/strict";
import { sharpenProbabilities, blendRoleWeights } from "../backends.mjs";

test("sharpenProbabilities drops cousins below half the leader and renormalises", () => {
  const kept = sharpenProbabilities({ navy: 0.55, blue: 0.1, cobalt: 0.1, indigo: 0.08, white: 0.02 });
  assert.deepEqual(Object.keys(kept), ["navy"]);
  assert.equal(kept.navy, 1);
});

test("sharpenProbabilities keeps a genuine split", () => {
  const kept = sharpenProbabilities({ terracotta: 0.4, rust: 0.35, cream: 0.05 });
  assert.deepEqual(Object.keys(kept).sort(), ["rust", "terracotta"]);
  assert.ok(Math.abs(kept.terracotta + kept.rust - 1) < 1e-9);
  assert.ok(kept.terracotta > kept.rust);
});

test("blendRoleWeights mixes sharpened roles at 60/25/15", () => {
  const weights = blendRoleWeights({
    main: { probabilities: { navy: 0.8, blue: 0.2 } },
    accent: { probabilities: { mustard: 1 } },
    shadow: { probabilities: { brown: 1 } },
  });
  assert.equal(weights.navy, 0.6);
  assert.equal(weights.blue, undefined);
  assert.equal(weights.mustard, 0.25);
  assert.equal(weights.brown, 0.15);
});
