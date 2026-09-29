import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sceneQuestions,
  sceneFromAnswers,
  runnerUp,
  DEFAULT_SCENE,
  COMPOSITIONS,
  LIGHT_POSITIONS,
  HORIZON_LEVELS,
  GLOW_LEVELS,
} from "../scene.mjs";

const criteria = { red: "red (#d81806)", blue: "blue (#0078f6)" };

test("sceneQuestions defines the seven scene questions with the right types", () => {
  const q = sceneQuestions(criteria);
  assert.deepEqual(Object.keys(q).sort(), [
    "background", "composition", "foreground", "glow", "horizon", "light", "lightPos",
  ]);
  for (const id of ["background", "foreground", "light"]) {
    assert.equal(q[id].type, "choice");
    assert.deepEqual(q[id].criteria, criteria);
  }
  assert.equal(q.lightPos.type, "choice");
  assert.deepEqual(q.lightPos.criteria, LIGHT_POSITIONS);
  assert.equal(q.composition.type, "choice");
  assert.deepEqual(q.composition.criteria, COMPOSITIONS);
  assert.equal(q.horizon.type, "score");
  assert.deepEqual(q.horizon.criteria, HORIZON_LEVELS);
  assert.equal(q.glow.type, "score");
  assert.deepEqual(q.glow.criteria, GLOW_LEVELS);
});

test("every scene question refers to the subject by its state path", () => {
  for (const q of Object.values(sceneQuestions(criteria))) {
    assert.match(q.instructions, /`subject`/);
  }
});

test("sceneFromAnswers picks colour choices and normalises scores to 0..1", () => {
  const answers = {
    background: { type: "choice", choice: "orange", probabilities: {} },
    foreground: { type: "choice", choice: "black", probabilities: {} },
    light: { type: "choice", choice: "yellow", probabilities: {} },
    lightPos: { type: "choice", choice: "horizon", probabilities: { horizon: 0.8, top: 0.2 } },
    composition: { type: "choice", choice: "horizon", probabilities: { horizon: 0.9, centre: 0.1 } },
    horizon: { type: "score", score: 1 },
    glow: { type: "score", score: 3 },
  };
  assert.deepEqual(sceneFromAnswers(answers), {
    background: "orange",
    foreground: "black",
    light: "yellow",
    lightPos: { horizon: 0.8, top: 0.2 },
    composition: { horizon: 0.9, centre: 0.1 },
    horizon: 1 / (HORIZON_LEVELS.length - 1),
    glow: 3 / (GLOW_LEVELS.length - 1),
    ambiguity: {
      background: { colour: "orange", share: 0, options: [] },
      foreground: { colour: "black", share: 0, options: [] },
      light: { colour: "yellow", share: 0, options: [] },
    },
  });
});

test("sceneFromAnswers reports a split light colour as ambiguity", () => {
  const answers = {
    background: { type: "choice", choice: "sky", probabilities: {} },
    foreground: { type: "choice", choice: "black", probabilities: {} },
    light: { type: "choice", choice: "gold", probabilities: { gold: 0.6, pink: 0.4 } },
    lightPos: { type: "choice", choice: "top", probabilities: { top: 1 } },
    composition: { type: "choice", choice: "field", probabilities: { field: 1 } },
    horizon: { type: "score", score: 2 },
    glow: { type: "score", score: 2 },
  };
  const { light } = sceneFromAnswers(answers).ambiguity;
  assert.equal(light.colour, "pink");
  assert.ok(Math.abs(light.share - 0.4) < 1e-9);
});

test("runnerUp reports a real second candidate as a share of the top two", () => {
  const r = runnerUp({ green: 0.55, grey: 0.35, blue: 0.1 }, "green");
  assert.equal(r.colour, "grey");
  assert.ok(Math.abs(r.share - 0.35 / 0.9) < 1e-9);
});

test("runnerUp ignores a settled answer and a thin tail", () => {
  assert.deepEqual(runnerUp({ green: 0.95, grey: 0.05 }, "green"), { colour: "green", share: 0, options: ["grey"] });
  assert.deepEqual(runnerUp({}, "green"), { colour: "green", share: 0, options: [] });
  assert.deepEqual(runnerUp(undefined, "green"), { colour: "green", share: 0, options: [] });
});

test("runnerUp never gives the runner-up more than half the area", () => {
  // A dead heat still has one winner; the split is at most 50/50.
  assert.equal(runnerUp({ green: 0.5, grey: 0.5 }, "green").share, 0.5);
  assert.equal(runnerUp({ green: 0.3, grey: 0.6 }, "green").share, 0.5);
});

test("runnerUp lists Jev's other ideas, best first, skipping the winner and zeros", () => {
  const r = runnerUp({ black: 0.92, orange: 0.07, charcoal: 0.01, yellow: 0, cream: 0 }, "black");
  assert.deepEqual(r.options, ["orange", "charcoal"]);
});

test("runnerUp keeps at most five ideas", () => {
  const probs = { a: 0.4, b: 0.2, c: 0.1, d: 0.1, e: 0.1, f: 0.05, g: 0.03, h: 0.02 };
  assert.deepEqual(runnerUp(probs, "a").options, ["b", "c", "d", "e", "f"]);
});

test("a certain answer has no ideas to offer", () => {
  assert.deepEqual(runnerUp({ red: 1, aqua: 0, blush: 0 }, "red").options, []);
});

test("DEFAULT_SCENE carries no ambiguity", () => {
  assert.equal(DEFAULT_SCENE.ambiguity.background.share, 0);
  assert.equal(DEFAULT_SCENE.ambiguity.foreground.share, 0);
  assert.equal(DEFAULT_SCENE.ambiguity.light.share, 0);
});

test("DEFAULT_SCENE is a field composition with no light", () => {
  assert.deepEqual(DEFAULT_SCENE.composition, { field: 1 });
  assert.equal(DEFAULT_SCENE.glow, 0);
  assert.deepEqual(DEFAULT_SCENE.lightPos, { none: 1 });
});
