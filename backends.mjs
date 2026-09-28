import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TypeSafeClient, choice, score } from "@typesafe-ai/sdk";
import { PALETTE, COLOR_NAMES } from "./palette.mjs";

// Each backend's analyze(text) returns
//   { weights: { name: w }, motion?: { energy, texture }, form?: { name: p }, confidence? }
// server.mjs normalises weights and fills defaults for anything missing.

export const FORMS = {
  liquid: "Flowing, fluid, wavy, melting",
  organic: "Rounded blobs, cells, ripples, natural growth",
  geometric: "Hard edges, grids, crystalline, architectural",
  glitch: "Digital, broken, pixelated, scanlines",
};

// How the three colour questions blend into one palette.
const ROLE_WEIGHTS = { main: 0.6, accent: 0.25, shadow: 0.15 };

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
  const criteria = Object.fromEntries(COLOR_NAMES.map((n) => [n, `${n} (${PALETTE[n]})`]));

  const questions = {
    main: choice("Which single colour from the palette does `subject` most evoke?", criteria),
    accent: choice(
      "Which colour from the palette is the accent or secondary colour of `subject`, not its main colour?",
      criteria,
    ),
    shadow: choice(
      "Which colour from the palette fills the shadows, background, or darkest areas of `subject`?",
      criteria,
    ),
    energy: score("How much energy or motion does `subject` evoke?", ENERGY_LEVELS),
    texture: score("What surface texture does `subject` evoke?", TEXTURE_LEVELS),
    form: choice("What kind of shapes or motion best fit `subject`?", FORMS),
  };

  return {
    name: "jev",
    async analyze(text) {
      const { answers } = await client.systemOne({ state: { subject: text }, questions });

      const weights = {};
      for (const [role, share] of Object.entries(ROLE_WEIGHTS)) {
        for (const [name, p] of Object.entries(answers[role].probabilities)) {
          weights[name] = (weights[name] ?? 0) + p * share;
        }
      }
      return {
        weights,
        motion: {
          energy: answers.energy.score / (ENERGY_LEVELS.length - 1),
          texture: answers.texture.score / (TEXTURE_LEVELS.length - 1),
        },
        form: answers.form.probabilities,
        confidence: answers.main.confidence,
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
  const system = `You map any word or phrase to a colour distribution over a fixed 16-colour palette.

Palette: ${COLOR_NAMES.map((n) => `${n} (${PALETTE[n]})`).join(", ")}.

Return the colours that a designer would associate with the input, each with a weight proportional to how much of the "visual area" it should take. Think about the actual thing: "tomato" is mostly red with a sliver of green stem; "browser" might evoke the logos and UI chrome of popular browsers; "80s" is pinks, purples, cyans. Use 1-10 colours, dominant first. Weights are relative (they will be normalised). Include small accent colours when they genuinely belong. Use each name at most once.`;

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
