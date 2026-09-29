// Which swatches the picker offers for a colour. Pure, so it runs in the
// browser (served from public/) and in Node tests.

// sRGB hex -> OKLab, so "near" means near to the eye, not near in hex digits.
function oklab(hex) {
  const lin = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// The colour itself first, then Jev's other ideas in its order, then the
// palette's nearest neighbours until there are `count`.
export function pickerOptions({ winner, jev = [], palette, count = 8 }) {
  const out = [];
  const add = (name) => {
    if (name in palette && !out.includes(name) && out.length < count) out.push(name);
  };
  add(winner);
  jev.forEach(add);
  const from = oklab(palette[winner]);
  Object.keys(palette)
    .filter((n) => !out.includes(n))
    .map((n) => [n, distance(from, oklab(palette[n]))])
    .sort((a, b) => a[1] - b[1])
    .forEach(([n]) => add(n));
  return out;
}
