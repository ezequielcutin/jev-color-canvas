## Learned User Preferences

- Iterate on the `cooking` branch; commit when asked, then keep building.
- Search bar is the primary interaction — keep it creatively, subtly polished; outside click/tap and Escape should blur focus.
- Transient status flashes must not steal focus or count as clicks on the search field.
- When asked to preview, replace/restart the full stack on the local default port rather than leaving a stale process.
- Performance under load matters for distribution; target impressively smooth playback beyond the Cursor embedded browser (e.g. Brave/retina).

## Learned Workspace Facts

- Local stack: `npm start` (default port 5173, override with `PORT`); tests via `npm test`; Node 22 ESM.
- Local HTTP is `server.mjs`; Vercel uses `api/`; shared analysis lives in `analyze.mjs`, `backends.mjs`, and `scene.mjs`; client is mainly `public/index.html` plus modules under `public/`.
- Client HTML updates apply on reload; server-side modules such as `scene.mjs` need a process restart.
- Live typing keeps one in-flight palette request (pipeline, do not abort-starve updates); scene handoffs use dissolves, not parameter interpolation.
- Ambiguity: `runnerUp` in `scene.mjs` keeps second-place background/foreground/light; the shader paints rivals; tap-to-settle and a sure-role swatch picker let users override.
- Shader perf: compact active palette loop, skip unused terms, CPU linearization; adaptive resolution is governed by `public/governor.mjs`.
