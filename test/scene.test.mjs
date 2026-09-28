import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sceneQuestions,
  sceneFromAnswers,
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
  });
});

test("DEFAULT_SCENE is a field composition with no light", () => {
  assert.deepEqual(DEFAULT_SCENE.composition, { field: 1 });
  assert.equal(DEFAULT_SCENE.glow, 0);
  assert.deepEqual(DEFAULT_SCENE.lightPos, { none: 1 });
});
