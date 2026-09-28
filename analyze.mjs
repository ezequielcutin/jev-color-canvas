import { PALETTE } from "./public/palette.mjs";
import { DEFAULT_SCENE } from "./scene.mjs";
import { jevBackend, claudeBackend, FORMS } from "./backends.mjs";

// BACKEND=jev|claude; defaults to Jev when a TypeSafe key is present.
const BACKEND = process.env.BACKEND ?? (process.env.TYPESAFE_API_KEY ? "jev" : "claude");
const backend = BACKEND === "jev" ? jevBackend() : claudeBackend(process.env.MODEL);

const DEFAULT_MOTION = { energy: 0.4, texture: 0.25 };
const DEFAULT_FORM = { liquid: 1 };

const cache = new Map();

export function backendName() {
  return backend.name;
}

// Drop non-positive weights, normalise, sort dominant-first.
export async function analyze(text) {
  const key = text.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const { weights, motion, form, confidence, scene } = await backend.analyze(key);

  const entries = Object.entries(weights).filter(([name, w]) => w > 0 && name in PALETTE);
  const total = entries.reduce((sum, [, w]) => sum + w, 0) || 1;
  const colors = entries
    .map(([name, w]) => ({ name, hex: PALETTE[name], weight: w / total }))
    .sort((a, b) => b.weight - a.weight);

  const result = {
    colors,
    motion: { ...DEFAULT_MOTION, ...motion },
    form: Object.fromEntries(Object.keys(FORMS).map((f) => [f, (form ?? DEFAULT_FORM)[f] ?? 0])),
    confidence: confidence ?? 0.8,
    scene: scene ?? DEFAULT_SCENE,
  };
  cache.set(key, result);
  return result;
}

export async function writePaletteResponse(res, url) {
  const q = (url.searchParams.get("q") ?? "").slice(0, 200);
  if (!q.trim()) {
    res.writeHead(400).end();
    return;
  }
  const started = performance.now();
  try {
    const result = await analyze(q);
    const ms = Math.round(performance.now() - started);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ q, ms, ...result }));
  } catch (err) {
    console.error(`[palette] "${q}":`, err.message);
    res.writeHead(err.status ?? 502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}
