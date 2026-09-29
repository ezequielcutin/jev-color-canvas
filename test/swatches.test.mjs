import { test } from "node:test";
import assert from "node:assert/strict";
import { pickerOptions } from "../public/swatches.mjs";

const palette = {
  red: "#d81806",
  crimson: "#dc143c",
  coral: "#ff7f50",
  blue: "#0078f6",
  navy: "#0c1f5c",
  teal: "#008080",
};

test("the current colour comes first", () => {
  assert.equal(pickerOptions({ winner: "red", jev: [], palette, count: 4 })[0], "red");
});

test("Jev's ideas come right after it, ahead of neighbours", () => {
  const out = pickerOptions({ winner: "red", jev: ["navy"], palette, count: 4 });
  assert.deepEqual(out.slice(0, 2), ["red", "navy"]);
});

test("the rest is filled with the nearest colours, not far-off ones", () => {
  const out = pickerOptions({ winner: "red", jev: [], palette, count: 3 });
  assert.equal(out.length, 3);
  assert.ok(!out.includes("blue") && !out.includes("navy") && !out.includes("teal"), out.join());
});

test("no duplicates, nothing outside the palette, never more than count", () => {
  const out = pickerOptions({ winner: "red", jev: ["red", "coral", "mystery", "coral"], palette, count: 5 });
  assert.equal(new Set(out).size, out.length);
  assert.ok(out.every((n) => n in palette));
  assert.ok(out.length <= 5);
  assert.deepEqual(out.slice(0, 2), ["red", "coral"]);
});

test("a small palette just returns what it has", () => {
  assert.equal(pickerOptions({ winner: "red", jev: [], palette: { red: "#d81806", blue: "#0078f6" }, count: 8 }).length, 2);
});
