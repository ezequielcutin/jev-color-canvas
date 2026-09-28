// Turns a Jev scene into numbers the shader uses. Pure, so it runs in the
// browser (served by server.mjs) and in Node tests.
//
// Positions are in the shader's p-space: y from -0.5 (bottom) to 0.5 (top),
// x from about -0.9 to 0.9 on a 16:9 screen.

export const COMPOSITION_ORDER = ["horizon", "centre", "vertical", "field"];

export const LIGHT_ANCHORS = {
  top: [0, 0.55],
  "upper-left": [-0.7, 0.45],
  "upper-right": [0.7, 0.45],
  centre: [0, 0],
  bottom: [0, -0.6],
};

export function horizonY(horizon) {
  return -0.4 + 0.8 * horizon;
}

// Probability-weighted average of the anchors, so an uncertain answer puts
// the light between its candidates and changes glide instead of jumping.
export function lightPosition(lightPos, horizon) {
  let x = 0;
  let y = 0;
  let total = 0;
  for (const [name, p] of Object.entries(lightPos)) {
    if (name === "none" || !p) continue;
    const [ax, ay] = name === "horizon" ? [0, horizonY(horizon)] : (LIGHT_ANCHORS[name] ?? [0, 0]);
    x += ax * p;
    y += ay * p;
    total += p;
  }
  return total > 0 ? [x / total, y / total] : [0, 0];
}

export function lightStrength(lightPos, glow) {
  return glow * (1 - (lightPos.none ?? 0));
}

export function compositionVector(composition) {
  const v = COMPOSITION_ORDER.map((k) => composition[k] ?? 0);
  const sum = v.reduce((a, b) => a + b, 0);
  return sum > 0 ? v.map((x) => x / sum) : [0, 0, 0, 1];
}
