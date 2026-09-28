import http from "node:http";
import { readFile } from "node:fs/promises";
import { PALETTE } from "./palette.mjs";
import { jevBackend, claudeBackend } from "./backends.mjs";

const PORT = Number(process.env.PORT ?? 5173);
// BACKEND=jev|claude; defaults to Jev when a TypeSafe key is present.
const BACKEND = process.env.BACKEND ?? (process.env.TYPESAFE_API_KEY ? "jev" : "claude");
const backend = BACKEND === "jev" ? jevBackend(process.env.JEV_MODE) : claudeBackend(process.env.MODEL);

const cache = new Map();

async function paletteFor(text) {
  const key = text.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const weights = await backend.weigh(key);

  // Drop non-positive weights, normalise, sort dominant-first.
  const entries = Object.entries(weights).filter(([name, w]) => w > 0 && name in PALETTE);
  const total = entries.reduce((sum, [, w]) => sum + w, 0) || 1;
  const colors = entries
    .map(([name, w]) => ({ name, hex: PALETTE[name], weight: w / total }))
    .sort((a, b) => b.weight - a.weight);

  cache.set(key, colors);
  return colors;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(new URL("./index.html", import.meta.url)));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/palette") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 200);
    if (!q.trim()) {
      res.writeHead(400).end();
      return;
    }
    const started = performance.now();
    try {
      const colors = await paletteFor(q);
      const ms = Math.round(performance.now() - started);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ q, colors, ms }));
    } catch (err) {
      console.error(`[palette] "${q}":`, err.message);
      res.writeHead(err.status ?? 502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`colour canvas on http://localhost:${PORT} (backend: ${backend.name})`);
});
