// Asks the running server about words with an obvious scene and reports
// whether Jev's composition and light match. Usage:
//   node scripts/scene-report.mjs            (server on localhost:5173)
//   URL=http://localhost:5199 node scripts/scene-report.mjs

const BASE = process.env.URL ?? "http://localhost:5173";

const EXPECTATIONS = [
  { q: "sunset", composition: "horizon", light: ["horizon"] },
  { q: "beach", composition: "horizon" },
  { q: "jellyfish", composition: "centre" },
  { q: "full moon", composition: "centre", light: ["centre", "top"] },
  { q: "forest", composition: "vertical" },
  { q: "city skyline at night", composition: "vertical" },
  { q: "confetti", composition: "field" },
  { q: "campfire", light: ["bottom", "centre"] },
];

const top = (probs) => Object.entries(probs).reduce((a, b) => (b[1] > a[1] ? b : a))[0];

let passed = 0;
for (const e of EXPECTATIONS) {
  const res = await fetch(`${BASE}/api/palette?q=${encodeURIComponent(e.q)}`);
  const { scene, ms, error } = await res.json();
  if (error) throw new Error(`${e.q}: ${error}`);

  const comp = top(scene.composition);
  const light = top(scene.lightPos);
  const ok =
    (!e.composition || comp === e.composition) &&
    (!e.light || e.light.includes(light));
  if (ok) passed++;

  console.log(
    `${ok ? "✓" : "✗"} ${e.q.padEnd(22)} ${String(ms).padStart(4)}ms  ` +
      `comp=${comp.padEnd(8)} light=${light.padEnd(11)} ` +
      `bg=${scene.background} fg=${scene.foreground} glow=${scene.glow.toFixed(2)} horizon=${scene.horizon.toFixed(2)}`,
  );
}

console.log(`\n${passed}/${EXPECTATIONS.length} expectations met`);
process.exit(passed >= 6 ? 0 : 1);
