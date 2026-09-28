import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPOSITION_ORDER,
  LIGHT_ANCHORS,
  horizonY,
  lightPosition,
  lightStrength,
  compositionVector,
} from "../scene-uniforms.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

test("horizonY maps 0..1 onto -0.4..0.4 (low score means a low line)", () => {
  close(horizonY(0), -0.4);
  close(horizonY(0.5), 0);
  close(horizonY(1), 0.4);
});

test("lightPosition returns the anchor for a certain answer", () => {
  assert.deepEqual(lightPosition({ "upper-left": 1 }, 0.5), LIGHT_ANCHORS["upper-left"]);
});

test("lightPosition puts a horizon light on the horizon line", () => {
  const [x, y] = lightPosition({ horizon: 1 }, 0.25);
  close(x, 0);
  close(y, horizonY(0.25));
});

test("lightPosition blends anchors by probability and ignores 'none'", () => {
  const [x, y] = lightPosition({ "upper-left": 0.5, "upper-right": 0.5, none: 0.9 }, 0.5);
  close(x, 0);
  close(y, 0.45);
});

test("lightPosition falls back to the centre when there is no light", () => {
  assert.deepEqual(lightPosition({ none: 1 }, 0.5), [0, 0]);
  assert.deepEqual(lightPosition({}, 0.5), [0, 0]);
});

test("lightStrength scales glow by the chance there is a light at all", () => {
  close(lightStrength({ top: 1 }, 0.8), 0.8);
  close(lightStrength({ top: 0.25, none: 0.75 }, 0.8), 0.2);
  close(lightStrength({ none: 1 }, 1), 0);
});

test("compositionVector follows COMPOSITION_ORDER and normalises", () => {
  assert.deepEqual(COMPOSITION_ORDER, ["horizon", "centre", "vertical", "field"]);
  assert.deepEqual(compositionVector({ centre: 2, field: 2 }), [0, 0.5, 0, 0.5]);
});

test("compositionVector defaults to pure field when empty", () => {
  assert.deepEqual(compositionVector({}), [0, 0, 0, 1]);
});
