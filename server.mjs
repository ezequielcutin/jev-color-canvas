import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backendName, writePaletteResponse } from "./analyze.mjs";

const PORT = Number(process.env.PORT ?? 5173);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
]);

// Only files inside public/. Rejects ../ escapes so .env and server code stay unserved.
function publicPath(pathname) {
  let rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (!rel || rel.includes("\0")) return null;
  const file = path.resolve(PUBLIC_DIR, rel);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return null;
  return file;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/palette") {
    await writePaletteResponse(res, url);
    return;
  }

  if (req.method === "GET") {
    const file = publicPath(url.pathname);
    if (file) {
      try {
        const source = await readFile(file);
        const type = CONTENT_TYPES.get(path.extname(file)) ?? "application/octet-stream";
        res.writeHead(200, { "content-type": type });
        res.end(source);
        return;
      } catch (err) {
        if (err.code !== "ENOENT" && err.code !== "EISDIR") throw err;
      }
    }
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`colour canvas on http://localhost:${PORT} (backend: ${backendName()})`);
});
