import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TypeSafeClient, choice, score } from "@typesafe-ai/sdk";
import { COLOR_NAMES, colourCriteria } from "./public/palette.mjs";
import { sceneQuestions, sceneFromAnswers } from "./scene.mjs";

// Each backend's analyze(text) returns
//   { weights: { name: w }, motion?: { energy, texture }, form?: { name: p }, confidence? }
// analyze.mjs normalises weights and fills defaults for anything missing.

export const FORMS = {
  liquid: "Flowing, fluid, wavy, melting",
  organic: "Rounded blobs, cells, ripples, natural growth",
  geometric: "Hard edges, grids, crystalline, architectural",
  glitch: "Digital, broken, pixelated, scanlines",
};

// How the three colour questions blend into one palette.
const ROLE_WEIGHTS = { main: 0.6, accent: 0.25, shadow: 0.15 };

// A 64-way choice spreads leftover probability across near-cousins (navy,
// blue, cobalt, indigo). Keep the leader and anything at least half as
// likely, then renormalise, so a real split survives and a tail does not.
export function sharpenProbabilities(probabilities) {
  const entries = Object.entries(probabilities).filter(([, p]) => p > 0);
  if (entries.length === 0) return {};
  const top = Math.max(...entries.map(([, p]) => p));
  const kept = entries.filter(([, p]) => p * 2 >= top);
  const sum = kept.reduce((s, [, p]) => s + p, 0);
  return Object.fromEntries(kept.map(([name, p]) => [name, p / sum]));
}

export function blendRoleWeights(answers) {
  const weights = {};
  for (const [role, share] of Object.entries(ROLE_WEIGHTS)) {
    for (const [name, p] of Object.entries(sharpenProbabilities(answers[role].probabilities))) {
      weights[name] = (weights[name] ?? 0) + p * share;
    }
  }
  return weights;
}

const ENERGY_LEVELS = [
  "Still, silent, motionless",
  "Calm, slow drifting",
  "Moderate, steady movement",
  "Lively, bouncy, active",
  "Frantic, chaotic, explosive",
];
const TEXTURE_LEVELS = [
  "Perfectly smooth, glossy, clean",
  "Soft, matte",
  "Slightly rough, papery",
  "Gritty, grainy, noisy",
];

// Jev: every question runs in parallel in one call, so the motion questions
// are nearly free. A single Choice is accurate but peaky (ocean = 100% blue),
// so three colour roles are blended to give the palette some depth.
export function jevBackend() {
  const client = new TypeSafeClient();
  const criteria = colourCriteria();

  const questions = {
    main: choice(
      "Which single swatch does `subject` most evoke? Match the gloss in parentheses, not merely the most familiar colour name.",
      criteria,
    ),
    accent: choice(
      "Which swatch is the accent or secondary colour of `subject`, not its main colour? Match the gloss in parentheses.",
      criteria,
    ),
    shadow: choice(
      "Which swatch fills the shadows or darkest areas of `subject`? Match the gloss in parentheses.",
      criteria,
    ),
    energy: score("How much energy or motion does `subject` evoke?", ENERGY_LEVELS),
    texture: score("What surface texture does `subject` evoke?", TEXTURE_LEVELS),
    form: choice("What kind of shapes or motion best fit `subject`?", FORMS),
    ...sceneQuestions(criteria),
  };

  return {
    name: "jev",
    async analyze(text) {
      const { answers } = await client.systemOne({ state: { subject: text }, questions });

      return {
        weights: blendRoleWeights(answers),
        motion: {
          energy: answers.energy.score / (ENERGY_LEVELS.length - 1),
          texture: answers.texture.score / (TEXTURE_LEVELS.length - 1),
        },
        form: answers.form.probabilities,
        confidence: answers.main.confidence,
        scene: sceneFromAnswers(answers),
      };
    },
  };
}

// Claude: approximates the palette with structured output; motion uses defaults.
export function claudeBackend(model = "claude-opus-5") {
  const client = new Anthropic();
  const Schema = z.object({
    colors: z.array(z.object({ name: z.enum(COLOR_NAMES), weight: z.number() })),
  });
  const system = `You map any word or phrase to a colour distribution over a fixed palette of named colours.

Palette: ${COLOR_NAMES.map((n) => colourCriteria()[n]).join(", ")}.

Return the colours that a designer would associate with the input, each with a weight proportional to how much of the visual area it should take. Think about the actual thing: "tomato" is mostly red with a sliver of green stem; "Wes Anderson" is dusty pastels such as blush, mustard, cream and sage; "Miami" is hot-pink, aqua and navy. Prefer the specific name when two colours sit in the same family. Use 2-8 colours, dominant first. Weights are relative (they will be normalised). Include small accent colours when they genuinely belong. Use each name at most once.`;

  return {
    name: `claude (${model})`,
    async analyze(text) {
      const response = await client.messages.parse({
        model,
        max_tokens: 2048,
        output_config: { effort: "low", format: zodOutputFormat(Schema) },
        system,
        messages: [{ role: "user", content: text }],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        throw new Error(`no palette (stop_reason: ${response.stop_reason})`);
      }
      const weights = {};
      for (const { name, weight } of response.parsed_output.colors) {
        weights[name] = (weights[name] ?? 0) + weight;
      }
      return { weights };
    },
  };
}
