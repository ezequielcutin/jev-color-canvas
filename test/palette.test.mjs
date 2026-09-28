import { test } from "node:test";
import assert from "node:assert/strict";
import { ORDER, PALETTE, GLOSS, COLOR_NAMES, colourCriteria } from "../palette.mjs";

const ORIGINAL = {
  black: "#000000",
  white: "#fcfcfc",
  gray: "#969696",
  cream: "#e4decc",
  brown: "#964e00",
  red: "#d81806",
  orange: "#f67800",
  yellow: "#fccc00",
  green: "#009624",
  teal: "#00c09c",
  "deep-teal": "#004254",
  blue: "#0078f6",
  indigo: "#2a3cd2",
  purple: "#7818ae",
  pink: "#fc84cc",
  lilac: "#fcb4fc",
};

function oklab(hex) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = lin(parseInt(hex.slice(1, 3), 16) / 255);
  const g = lin(parseInt(hex.slice(3, 5), 16) / 255);
  const b = lin(parseInt(hex.slice(5, 7), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

test("the palette is 64 named swatches in slot order", () => {
  assert.equal(ORDER.length, 64);
  assert.equal(new Set(ORDER).size, 64);
  assert.deepEqual(COLOR_NAMES, ORDER);
  assert.deepEqual(Object.keys(PALETTE), ORDER);
  assert.deepEqual(Object.keys(GLOSS), ORDER);
});

test("the original 16 swatches keep their hexes", () => {
  for (const [name, hex] of Object.entries(ORIGINAL)) {
    assert.equal(PALETTE[name], hex);
  }
});

test("every swatch has a hex and a gloss, and choice text shows both", () => {
  const criteria = colourCriteria();
  for (const name of ORDER) {
    assert.match(PALETTE[name], /^#[0-9a-f]{6}$/);
    assert.ok(GLOSS[name].length > 0);
    assert.equal(criteria[name], `${name} (${GLOSS[name]}, ${PALETTE[name]})`);
  }
});

test("no two swatches are nearly the same colour", () => {
  const labs = ORDER.map((name) => oklab(PALETTE[name]));
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = Math.hypot(labs[i][0] - labs[j][0], labs[i][1] - labs[j][1], labs[i][2] - labs[j][2]);
      assert.ok(d >= 0.04, `${ORDER[i]} and ${ORDER[j]} are ${d.toFixed(3)} apart`);
    }
  }
});
