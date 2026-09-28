import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { PALETTE, COLOR_NAMES } from "./palette.mjs";

// Each backend returns raw { name: weight } for a query; server.mjs normalises.

const NOUL_FLOOR = 0.2;

// Jev, two ways to read a palette out of it (JEV_MODE):
//  - "choice": one Choice question; colours compete, so the distribution is
//    peaky (tomato ≈ all red). Likely what the reference demo does.
//  - "noul": one yes/no question per colour, run in parallel in the same call.
//    Colours don't compete, so secondary colours (the tomato's stem) survive.
export function jevBackend(mode = "choice") {
  const client = new TypeSafeClient();
  const describe = (n) => `${n} (${PALETTE[n]})`;

  const questions =
    mode === "noul"
      ? Object.fromEntries(
          COLOR_NAMES.map((n) => [
            n,
            {
              type: "noul",
              instructions: `Would a designer include ${describe(n)} in a colour palette for \`subject\`?`,
            },
          ]),
        )
      : {
          colour: choice(
            "Which colour from the palette does `subject` most evoke?",
            Object.fromEntries(COLOR_NAMES.map((n) => [n, describe(n)])),
          ),
        };

  return {
    name: `jev (${mode})`,
    async weigh(text) {
      const { answers } = await client.systemOne({ state: { subject: text }, questions });
      if (mode === "noul") {
        // Every colour gets some small P(yes); drop the clear "no"s so they
        // don't all render as slivers. Tune against real outputs.
        return Object.fromEntries(
          COLOR_NAMES.map((n) => [n, answers[n].noul]).filter(([, p]) => p >= NOUL_FLOOR),
        );
      }
      return answers.colour.probabilities;
    },
  };
}

// Claude: approximates the same distribution with structured output.
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
    async weigh(text) {
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
      return weights;
    },
  };
}
