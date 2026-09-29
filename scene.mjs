import { choice, score } from "@typesafe-ai/sdk";

// Scene questions tell the shader *where* colours go. They ride along in the
// same Jev call as the palette questions, so they cost almost no latency.

export const COMPOSITIONS = {
  horizon: "A landscape split into sky above and ground below, like a sunset, beach, desert or field",
  centre: "One subject in the middle surrounded by space, like a jellyfish, an eye, a flower or the moon",
  vertical: "Tall vertical elements side by side, like a forest, a city skyline, a waterfall or rain",
  field: "An even all-over pattern with no focal point, like camouflage, confetti, static or a crowd",
};

export const LIGHT_POSITIONS = {
  top: "Overhead, from above",
  "upper-left": "From the upper left",
  "upper-right": "From the upper right",
  horizon: "Low on the horizon, like a rising or setting sun",
  centre: "From the middle; the subject itself glows",
  bottom: "From below, like firelight or lava",
  none: "No distinct light source",
};

export const HORIZON_LEVELS = [
  "Very low; the scene is mostly sky",
  "Low",
  "In the middle",
  "High",
  "Very high; the scene is mostly ground",
];

export const GLOW_LEVELS = [
  "No visible light or glow",
  "Soft, diffuse light",
  "A clear, bright light source",
  "Blazing, radiant, blinding light",
];

export function sceneQuestions(colourCriteria) {
  return {
    background: choice(
      "Which colour is the background of a scene depicting `subject`: the sky, the far distance, or the space around it?",
      colourCriteria,
    ),
    foreground: choice(
      "Which colour depicts the foreground in a scene depicting `subject`? For landscapes, choose the ground or dark silhouettes below the sky. For a single central subject, choose its visible body colour contrasted with the surrounding space; for translucent luminous creatures, choose the pale body rather than the surrounding water.",
      colourCriteria,
    ),
    light: choice("Which colour is the brightest light or glow in a scene depicting `subject`?", colourCriteria),
    lightPos: choice("Where does the light come from in a scene depicting `subject`?", LIGHT_POSITIONS),
    composition: choice("How is a scene depicting `subject` composed?", COMPOSITIONS),
    horizon: score("Where does the horizon or dividing line sit in a scene depicting `subject`?", HORIZON_LEVELS),
    glow: score("How strong is the light in a scene depicting `subject`?", GLOW_LEVELS),
  };
}

// Ambiguity: when Jev splits its vote ("bank" is river-green *and* vault-grey),
// keep the second candidate and its share of the area instead of dropping it.
// The renderer paints the two side by side, so an unsure answer looks unsure.
const MIN_RUNNER_UP = 0.15; // below this the second place is a tail, not a rival
const MAX_RUNNER_SHARE = 0.5; // one colour always leads
const MAX_IDEAS = 5;

// Everything Jev gave real probability to besides the winner, best first. A
// certain answer has none (its tail is exactly zero); the swatch picker fills
// in with neighbouring colours.
function otherIdeas(probabilities, winner) {
  return Object.entries(probabilities ?? {})
    .filter(([name, p]) => name !== winner && p > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_IDEAS)
    .map(([name]) => name);
}

export function runnerUp(probabilities, winner) {
  const options = otherIdeas(probabilities, winner);
  const rivals = Object.entries(probabilities ?? {})
    .filter(([name, p]) => name !== winner && p >= MIN_RUNNER_UP)
    .sort((a, b) => b[1] - a[1]);
  if (rivals.length === 0) return { colour: winner, share: 0, options };
  const [colour, p2] = rivals[0];
  const p1 = probabilities[winner] ?? 0;
  const share = Math.min(p2 / (p1 + p2), MAX_RUNNER_SHARE);
  return { colour, share, options };
}

export function sceneFromAnswers(answers) {
  return {
    background: answers.background.choice,
    foreground: answers.foreground.choice,
    light: answers.light.choice,
    lightPos: answers.lightPos.probabilities,
    composition: answers.composition.probabilities,
    horizon: answers.horizon.score / (HORIZON_LEVELS.length - 1),
    glow: answers.glow.score / (GLOW_LEVELS.length - 1),
    ambiguity: {
      background: runnerUp(answers.background.probabilities, answers.background.choice),
      foreground: runnerUp(answers.foreground.probabilities, answers.foreground.choice),
      light: runnerUp(answers.light.probabilities, answers.light.choice),
    },
  };
}

// Used when a backend has no scene questions (the Claude fallback). A field
// composition with no light renders exactly like the pre-scene shader.
export const DEFAULT_SCENE = {
  background: "white",
  foreground: "black",
  light: "white",
  lightPos: { none: 1 },
  composition: { field: 1 },
  horizon: 0.5,
  glow: 0,
  ambiguity: {
    background: { colour: "white", share: 0, options: [] },
    foreground: { colour: "black", share: 0, options: [] },
    light: { colour: "white", share: 0, options: [] },
  },
};
