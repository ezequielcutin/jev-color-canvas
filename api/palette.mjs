import { writePaletteResponse } from "../analyze.mjs";

// Vercel invokes this for GET /api/palette. Local `npm start` uses the same writer.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.writeHead(404).end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const q = req.query?.q;
  const fromQuery = Array.isArray(q) ? q[0] : q;
  if (!url.searchParams.get("q") && fromQuery) url.searchParams.set("q", String(fromQuery));
  await writePaletteResponse(res, url);
}
