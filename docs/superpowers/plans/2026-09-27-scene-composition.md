# Scene Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Jev decide *where* colours go, not just which colours, so "sunset" renders as a sky over dark ground with a glow on the horizon and "jellyfish" renders as a glowing centre on deep blue.

**Architecture:** Seven more questions go into the existing single Jev call (they run in parallel, so latency barely changes). A pure server module turns the answers into a `scene` object: background/foreground/light colours, light position, composition, horizon height, glow. A pure client module turns the scene into shader numbers. The shader blends a structured "scene layer" (sky/ground split, centred subject, or vertical columns) under the existing watercolour paint layer, then adds a glow at the light position.

**Tech Stack:** Node 22 (ESM, `node:test` built in), `@typesafe-ai/sdk` (Jev), WebGL2 / GLSL ES 3.00, no bundler.

**Spec:** No separate spec file. The design was agreed in chat on 2026-09-27 and is captured in full in the **Design** section below; treat that section as the spec.

## Global Constraints

- One Jev call per query. New questions are added to the existing `questions` object in `backends.mjs`; never add a second request.
- Scene colours come from the fixed 16-colour palette in `palette.mjs` (names such as `"deep-teal"`), never free hex values.
- No new npm dependencies. Tests use the built-in `node:test` runner.
- Stripes mode (the replica of the original demo) must look and behave exactly as before.
- The Claude backend keeps working. It has no scene questions, so it returns no scene and the server fills in `DEFAULT_SCENE` (a "field" composition that renders exactly like today's shader).
- API keys stay server-side. The browser only ever talks to `/api/palette`.
- Everything that animates must ease continuously. No value may snap between frames (see commit `9b104ae` for why).
- Commit messages end with the line: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

## Design

### New Jev questions (added to the existing call)

| id | type | asks | used as |
|---|---|---|---|
| `background` | Choice over the 16 colours | the sky, the far distance, or the space around the subject | colour of the background region |
| `foreground` | Choice over the 16 colours | the ground, the nearest things, or the main subject | colour of the foreground region |
| `light` | Choice over the 16 colours | the brightest light or glow | glow colour |
| `lightPos` | Choice: `top`, `upper-left`, `upper-right`, `horizon`, `centre`, `bottom`, `none` | where the light comes from | glow position (probability-weighted) |
| `composition` | Choice: `horizon`, `centre`, `vertical`, `field` | how the scene is laid out | which background/foreground mask is used |
| `horizon` | Score, 5 levels, very low → very high | where the dividing line sits | horizon height |
| `glow` | Score, 4 levels, none → blazing | how strong the light is | glow strength |

### Rendering

- **Paint layer:** today's shader output (bands, forms, watercolour edges), unchanged except that under a `horizon` composition the liquid stripes turn horizontal so they stack like layers of sky.
- **Scene layer:** `mix(foreground, background, mask)`. The mask is 1 where the background shows:
  - `horizon`: above a softly wobbling horizontal line at the horizon height.
  - `centre`: outside a wobbly disc in the middle (the subject is the foreground).
  - `vertical`: gaps between noisy columns that rise from the bottom, with open sky at the top.
  - `field`: no mask. A field composition shows the pure paint layer, which is exactly today's look.
- **Blend:** `col = mix(paint, scene, SCENE_MIX * (1 - field))`, with `SCENE_MIX = 0.55` to start (tuned in Task 5).
- **Glow:** added in linear light at the light position: a tight core plus a wide soft bloom, scaled by `glow * (1 - P(none))`.
- **Easing:** every new value is eased on the client like the existing ones. Colours ease in sRGB; the shader converts to linear.

### Coordinate conventions (shader `p`-space)

`p = (fragCoord - 0.5 * res) / res.y`, so `y` runs from -0.5 (bottom) to 0.5 (top), and `x` from about -0.9 to 0.9 on a 16:9 screen.

Light anchors: `top` (0, 0.55), `upper-left` (-0.7, 0.45), `upper-right` (0.7, 0.45), `centre` (0, 0), `bottom` (0, -0.6), `horizon` (0, horizonY). `none` contributes no position and reduces strength. Horizon height maps as `horizonY = -0.4 + 0.8 * horizon`, so score 0 ("mostly sky") puts the line low.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scene.mjs` | create | Scene question definitions, `sceneFromAnswers`, `DEFAULT_SCENE`. Server-side and pure. |
| `scene-uniforms.mjs` | create | Scene → shader numbers: light position, light strength, composition vector, horizon Y. Pure; served to the browser and tested in Node. |
| `test/scene.test.mjs` | create | Unit tests for `scene.mjs`. |
| `test/scene-uniforms.test.mjs` | create | Unit tests for `scene-uniforms.mjs`. |
| `scripts/scene-report.mjs` | create | Queries a running server with sample words and reports whether compositions and lights match expectations. |
| `backends.mjs` | modify | Adds the scene questions to the Jev call and returns `scene`. |
| `server.mjs` | modify | Passes `scene` through (defaulting it); serves `/scene-uniforms.mjs`. |
| `index.html` | modify | New uniforms, eased scene state, scene layer and glow in the shader, HUD lines. |
| `package.json` | modify | Adds a `test` script. |

---

### Task 1: Scene questions and answer mapping (`scene.mjs`)

**Files:**
- Create: `scene.mjs`
- Create: `test/scene.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `choice(instructions, criteria)` and `score(instructions, criteria)` from `@typesafe-ai/sdk`. Each returns a plain question object with `type` set to `"choice"` or `"score"`, plus `instructions` and `criteria`.
- Produces:
  - `sceneQuestions(colourCriteria: Record<string,string>) => Record<string, Question>` with keys `background`, `foreground`, `light`, `lightPos`, `composition`, `horizon`, `glow`.
  - `sceneFromAnswers(answers) => Scene`, where `Scene = { background: string, foreground: string, light: string, lightPos: Record<string,number>, composition: Record<string,number>, horizon: number /*0..1*/, glow: number /*0..1*/ }`.
  - `DEFAULT_SCENE: Scene`
  - `COMPOSITIONS`, `LIGHT_POSITIONS` (label → description maps), `HORIZON_LEVELS`, `GLOW_LEVELS` (string arrays).

- [ ] **Step 1: Add the test script to `package.json`**

Replace the `scripts` block with:

```json
  "scripts": {
    "start": "node --env-file-if-exists=.env server.mjs",
    "test": "node --test \"test/*.test.mjs\""
  }
```

- [ ] **Step 2: Write the failing test** at `test/scene.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sceneQuestions,
  sceneFromAnswers,
  DEFAULT_SCENE,
  COMPOSITIONS,
  LIGHT_POSITIONS,
  HORIZON_LEVELS,
  GLOW_LEVELS,
} from "../scene.mjs";

const criteria = { red: "red (#d81806)", blue: "blue (#0078f6)" };

test("sceneQuestions defines the seven scene questions with the right types", () => {
  const q = sceneQuestions(criteria);
  assert.deepEqual(Object.keys(q).sort(), [
    "background", "composition", "foreground", "glow", "horizon", "light", "lightPos",
  ]);
  for (const id of ["background", "foreground", "light"]) {
    assert.equal(q[id].type, "choice");
    assert.deepEqual(q[id].criteria, criteria);
  }
  assert.equal(q.lightPos.type, "choice");
  assert.deepEqual(q.lightPos.criteria, LIGHT_POSITIONS);
  assert.equal(q.composition.type, "choice");
  assert.deepEqual(q.composition.criteria, COMPOSITIONS);
  assert.equal(q.horizon.type, "score");
  assert.deepEqual(q.horizon.criteria, HORIZON_LEVELS);
  assert.equal(q.glow.type, "score");
  assert.deepEqual(q.glow.criteria, GLOW_LEVELS);
});

test("every scene question refers to the subject by its state path", () => {
  for (const q of Object.values(sceneQuestions(criteria))) {
    assert.match(q.instructions, /`subject`/);
  }
});

test("sceneFromAnswers picks colour choices and normalises scores to 0..1", () => {
  const answers = {
    background: { type: "choice", choice: "orange", probabilities: {} },
    foreground: { type: "choice", choice: "black", probabilities: {} },
    light: { type: "choice", choice: "yellow", probabilities: {} },
    lightPos: { type: "choice", choice: "horizon", probabilities: { horizon: 0.8, top: 0.2 } },
    composition: { type: "choice", choice: "horizon", probabilities: { horizon: 0.9, centre: 0.1 } },
    horizon: { type: "score", score: 1 },
    glow: { type: "score", score: 3 },
  };
  assert.deepEqual(sceneFromAnswers(answers), {
    background: "orange",
    foreground: "black",
    light: "yellow",
    lightPos: { horizon: 0.8, top: 0.2 },
    composition: { horizon: 0.9, centre: 0.1 },
    horizon: 1 / (HORIZON_LEVELS.length - 1),
    glow: 3 / (GLOW_LEVELS.length - 1),
  });
});

test("DEFAULT_SCENE is a field composition with no light", () => {
  assert.deepEqual(DEFAULT_SCENE.composition, { field: 1 });
  assert.equal(DEFAULT_SCENE.glow, 0);
  assert.deepEqual(DEFAULT_SCENE.lightPos, { none: 1 });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../scene.mjs'`.

- [ ] **Step 4: Write the implementation** at `scene.mjs`

```js
import { choice, score } from "@typesafe-ai/sdk";

// Scene questions tell the shader *where* colours go. They ride along in the
// same Jev call as the palette questions, so they cost almost no latency.

export const COMPOSITIONS = {
  horizon: "A landscape split into sky above and ground below, like a sunset, beach, desert or field",
  centre: "One subject in the middle surrounded by space, like a jellyfish, an eye, a flower or the moon",
  vertical: "Tall vertical elements side by side, like a forest, a city skyline, a waterfall or rain",
  field: "An even all-over pattern with no focal point, like camouflage, confetti, static or a crowd",
};

export const LIGHT_POSITIONS = {
  top: "Overhead, from above",
  "upper-left": "From the upper left",
  "upper-right": "From the upper right",
  horizon: "Low on the horizon, like a rising or setting sun",
  centre: "From the middle; the subject itself glows",
  bottom: "From below, like firelight or lava",
  none: "No distinct light source",
};

export const HORIZON_LEVELS = [
  "Very low; the scene is mostly sky",
  "Low",
  "In the middle",
  "High",
  "Very high; the scene is mostly ground",
];

export const GLOW_LEVELS = [
  "No visible light or glow",
  "Soft, diffuse light",
  "A clear, bright light source",
  "Blazing, radiant, blinding light",
];

export function sceneQuestions(colourCriteria) {
  return {
    background: choice(
      "Which colour is the background of a scene depicting `subject`: the sky, the far distance, or the space around it?",
      colourCriteria,
    ),
    foreground: choice(
      "Which colour is the foreground of a scene depicting `subject`: the ground, the nearest things, or the main subject itself?",
      colourCriteria,
    ),
    light: choice("Which colour is the brightest light or glow in a scene depicting `subject`?", colourCriteria),
    lightPos: choice("Where does the light come from in a scene depicting `subject`?", LIGHT_POSITIONS),
    composition: choice("How is a scene depicting `subject` composed?", COMPOSITIONS),
    horizon: score("Where does the horizon or dividing line sit in a scene depicting `subject`?", HORIZON_LEVELS),
    glow: score("How strong is the light in a scene depicting `subject`?", GLOW_LEVELS),
  };
}

export function sceneFromAnswers(answers) {
  return {
    background: answers.background.choice,
    foreground: answers.foreground.choice,
    light: answers.light.choice,
    lightPos: answers.lightPos.probabilities,
    composition: answers.composition.probabilities,
    horizon: answers.horizon.score / (HORIZON_LEVELS.length - 1),
    glow: answers.glow.score / (GLOW_LEVELS.length - 1),
  };
}

// Used when a backend has no scene questions (the Claude fallback). A field
// composition with no light renders exactly like the pre-scene shader.
export const DEFAULT_SCENE = {
  background: "white",
  foreground: "black",
  light: "white",
  lightPos: { none: 1 },
  composition: { field: 1 },
  horizon: 0.5,
  glow: 0,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json scene.mjs test/scene.test.mjs
git commit -m "Add scene questions and answer mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Ask the scene questions and return `scene` from the API

**Files:**
- Modify: `backends.mjs` (the `jevBackend` function)
- Modify: `server.mjs` (imports, `analyze`, static module route)

**Interfaces:**
- Consumes: `sceneQuestions`, `sceneFromAnswers`, `DEFAULT_SCENE` from Task 1.
- Produces: `GET /api/palette?q=...` JSON gains a `scene: Scene` field (shape from Task 1), always present. `GET /scene-uniforms.mjs` serves that file (the file itself is created in Task 3; until then the route returns 404).

- [ ] **Step 1: Add the scene questions to the Jev call.** In `backends.mjs`, add the import at the top:

```js
import { sceneQuestions, sceneFromAnswers } from "./scene.mjs";
```

In `jevBackend`, spread the scene questions into the existing `questions` object, straight after `form`:

```js
    form: choice("What kind of shapes or motion best fit `subject`?", FORMS),
    ...sceneQuestions(criteria),
  };
```

In `analyze`, add `scene` to the returned object, straight after `confidence`:

```js
        confidence: answers.main.confidence,
        scene: sceneFromAnswers(answers),
      };
```

- [ ] **Step 2: Pass the scene through the server with a default.** In `server.mjs`, add the import:

```js
import { DEFAULT_SCENE } from "./scene.mjs";
```

In `analyze`, destructure `scene` from the backend result:

```js
  const { weights, motion, form, confidence, scene } = await backend.analyze(key);
```

and add it to `result`, after `confidence`:

```js
    confidence: confidence ?? 0.8,
    scene: scene ?? DEFAULT_SCENE,
  };
```

- [ ] **Step 3: Serve browser modules from a whitelist.** In `server.mjs`, replace the `/palette.mjs` route block:

```js
  if (req.method === "GET" && url.pathname === "/palette.mjs") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(await readFile(new URL("./palette.mjs", import.meta.url)));
    return;
  }
```

with:

```js
  if (req.method === "GET" && BROWSER_MODULES.has(url.pathname)) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(await readFile(new URL(`.${url.pathname}`, import.meta.url)));
    return;
  }
```

and add this constant under `DEFAULT_FORM`:

```js
// Pure modules the page imports directly. Whitelisted so the server never
// serves arbitrary files (like .env) from disk.
const BROWSER_MODULES = new Set(["/palette.mjs", "/scene-uniforms.mjs"]);
```

- [ ] **Step 4: Run the unit tests** (nothing here should break them)

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify against real Jev.** Restart the server. Check what is listening first and stop only this project's `node ... server.mjs`, never another process:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Then run `npm start` in the background and:

```bash
curl -s "localhost:5173/api/palette?q=sunset" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.ms+"ms",JSON.stringify(r.scene,null,1))})'
curl -s -o /dev/null -w "%{http_code}\n" "localhost:5173/.env"
curl -s -o /dev/null -w "%{http_code}\n" "localhost:5173/palette.mjs"
```

Expected:
- `scene` has all seven fields; for "sunset", `composition.horizon` is the largest composition probability; `ms` is under about 600.
- `/.env` returns `404`.
- `/palette.mjs` returns `200`.

- [ ] **Step 6: Commit**

```bash
git add backends.mjs server.mjs
git commit -m "Ask Jev scene questions and return scene from the API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Scene → shader numbers (`scene-uniforms.mjs`)

**Files:**
- Create: `scene-uniforms.mjs`
- Create: `test/scene-uniforms.test.mjs`

**Interfaces:**
- Consumes: the `Scene` shape from Task 1 (as JSON from the API).
- Produces (all pure, no DOM):
  - `COMPOSITION_ORDER = ["horizon", "centre", "vertical", "field"]` (the order of the shader's `u_comp` vec4)
  - `LIGHT_ANCHORS: Record<string, [number, number]>`
  - `horizonY(horizon: number) => number` (0..1 → -0.4..0.4)
  - `lightPosition(lightPos: Record<string,number>, horizon: number) => [x, y]`
  - `lightStrength(lightPos: Record<string,number>, glow: number) => number`
  - `compositionVector(composition: Record<string,number>) => [h, c, v, f]`, summing to 1

- [ ] **Step 1: Write the failing test** at `test/scene-uniforms.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPOSITION_ORDER,
  LIGHT_ANCHORS,
  horizonY,
  lightPosition,
  lightStrength,
  compositionVector,
} from "../scene-uniforms.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

test("horizonY maps 0..1 onto -0.4..0.4 (low score means a low line)", () => {
  close(horizonY(0), -0.4);
  close(horizonY(0.5), 0);
  close(horizonY(1), 0.4);
});

test("lightPosition returns the anchor for a certain answer", () => {
  assert.deepEqual(lightPosition({ "upper-left": 1 }, 0.5), LIGHT_ANCHORS["upper-left"]);
});

test("lightPosition puts a horizon light on the horizon line", () => {
  const [x, y] = lightPosition({ horizon: 1 }, 0.25);
  close(x, 0);
  close(y, horizonY(0.25));
});

test("lightPosition blends anchors by probability and ignores 'none'", () => {
  const [x, y] = lightPosition({ "upper-left": 0.5, "upper-right": 0.5, none: 0.9 }, 0.5);
  close(x, 0);
  close(y, 0.45);
});

test("lightPosition falls back to the centre when there is no light", () => {
  assert.deepEqual(lightPosition({ none: 1 }, 0.5), [0, 0]);
  assert.deepEqual(lightPosition({}, 0.5), [0, 0]);
});

test("lightStrength scales glow by the chance there is a light at all", () => {
  close(lightStrength({ top: 1 }, 0.8), 0.8);
  close(lightStrength({ top: 0.25, none: 0.75 }, 0.8), 0.2);
  close(lightStrength({ none: 1 }, 1), 0);
});

test("compositionVector follows COMPOSITION_ORDER and normalises", () => {
  assert.deepEqual(COMPOSITION_ORDER, ["horizon", "centre", "vertical", "field"]);
  assert.deepEqual(compositionVector({ centre: 2, field: 2 }), [0, 0.5, 0, 0.5]);
});

test("compositionVector defaults to pure field when empty", () => {
  assert.deepEqual(compositionVector({}), [0, 0, 0, 1]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../scene-uniforms.mjs'`.

- [ ] **Step 3: Write the implementation** at `scene-uniforms.mjs`

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 12 tests (4 from Task 1 + 8 here).

- [ ] **Step 5: Commit**

```bash
git add scene-uniforms.mjs test/scene-uniforms.test.mjs
git commit -m "Add scene-to-shader mapping for light, composition and horizon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Render the scene in the shader

**Files:**
- Modify: `index.html`, in four places: the module imports (line 131), the fragment shader (`FRAG`, lines ~179–307), `createShader` (uniform lookups and `draw`, lines ~339–371), and the state, `setTarget` and `frame` code (lines ~374–434).

**Interfaces:**
- Consumes: `horizonY`, `lightPosition`, `lightStrength`, `compositionVector` from Task 3; `data.scene` from Task 2; `PALETTE` from `palette.mjs`.
- Produces: new shader uniforms `u_bg`, `u_fg`, `u_light` (vec3, sRGB 0..1), `u_lightPos` (vec2, p-space), `u_glow` (float), `u_comp` (vec4 in `COMPOSITION_ORDER`), `u_horizonY` (float). Also `window.__scene = { current, target }`, a debug handle used by the verification step.

The shader has no unit-test harness, so this task is verified in the browser: it must compile, pixel checks must match the scene, and the smoothness benchmark must stay under 0.1%.

- [ ] **Step 1: Import the scene helpers.** Replace line 131:

```js
    import { PALETTE } from "/palette.mjs";
```

with:

```js
    import { PALETTE } from "/palette.mjs";
    import { horizonY, lightPosition, lightStrength, compositionVector } from "/scene-uniforms.mjs";
```

Then move the `rgb` helper out of `createShader` so the state code can use it. Delete this line inside `createShader`:

```js
      const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
```

and add it at module level, directly above `const ORDER = [`:

```js
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
```

- [ ] **Step 2: Declare the new uniforms in `FRAG`.** Directly after `uniform float u_conf;`, add:

```glsl
uniform vec3 u_bg;         // scene background colour (sRGB)
uniform vec3 u_fg;         // scene foreground colour (sRGB)
uniform vec3 u_light;      // glow colour (sRGB)
uniform vec2 u_lightPos;   // glow centre in p-space
uniform float u_glow;      // glow strength 0..1
uniform vec4 u_comp;       // horizon, centre, vertical, field
uniform float u_horizonY;  // horizon line in p-space
```

- [ ] **Step 3: Add the background mask function.** Directly above `void main() {` in `FRAG`, add:

```glsl
// 1 where the scene shows its background, 0 where it shows the foreground.
// Each composition has its own mask; they blend by Jev's probabilities.
float backgroundMask(vec2 p, float t) {
  // Horizon: background above a softly wobbling line.
  float line = u_horizonY + (fbm(vec2(p.x * 1.5, t * 0.2)) - 0.5) * 0.12;
  float mHorizon = smoothstep(line - 0.06, line + 0.06, p.y);

  // Centre: the subject is a wobbly disc; background surrounds it.
  float r = length(p * vec2(0.9, 1.1)) + (fbm(p * 3.0 + t * 0.3) - 0.5) * 0.15;
  float mCentre = smoothstep(0.12, 0.5, r);

  // Vertical: noisy columns rise from the bottom, with open background above.
  float cols = noise(vec2(p.x * 5.0 + (fbm(p * 2.0) - 0.5) * 0.8, 0.5 + t * 0.05));
  float tops = p.y + (noise(vec2(p.x * 9.0, 1.0)) - 0.5) * 0.4;
  float mVertical = max(smoothstep(0.4, 0.6, cols), smoothstep(0.1, 0.5, tops));

  float structured = u_comp.x + u_comp.y + u_comp.z;
  return (u_comp.x * mHorizon + u_comp.y * mCentre + u_comp.z * mVertical) / max(structured, 1e-4);
}
```

- [ ] **Step 4: Turn liquid stripes horizontal under a horizon composition.** Replace:

```glsl
  float fLiquid = uv.x + amp * (w.x - 0.5) * 2.0 + 0.35 * amp * (fbm(p * 2.5 + w * 2.0) - 0.5);
```

with:

```glsl
  // Under a horizon composition the stripes lie down and stack like sky layers.
  float across = mix(uv.x, 1.0 - uv.y, u_comp.x);
  float fLiquid = across + amp * (w.x - 0.5) * 2.0 + 0.35 * amp * (fbm(p * 2.5 + w * 2.0) - 0.5);
```

- [ ] **Step 5: Blend in the scene layer and the glow.** Directly after:

```glsl
  col *= 1.0 - 0.14 * rim * wet;
```

add:

```glsl
  // Scene layer: foreground/background regions under the paint. A pure
  // "field" composition keeps the paint layer as it was.
  const float SCENE_MIX = 0.55;
  vec3 sceneCol = mix(toLinear(u_fg), toLinear(u_bg), backgroundMask(p, t));
  col = mix(col, sceneCol, SCENE_MIX * (1.0 - u_comp.w));

  // Light: a tight core plus a wide bloom, added in linear light.
  vec2 dl = p - u_lightPos;
  float r2 = dot(dl, dl);
  col += toLinear(u_light) * u_glow * (exp(-r2 / 0.02) * 0.9 + exp(-r2 / 0.25) * 0.35);
```

- [ ] **Step 6: Look up and set the new uniforms.** In `createShader`, replace the `U` object with:

```js
      const U = {
        res: u("u_res"), time: u("u_time"), colors: u("u_colors"), weights: u("u_weights"),
        energy: u("u_energy"), texture: u("u_texture"), form: u("u_form"), conf: u("u_conf"),
        bg: u("u_bg"), fg: u("u_fg"), light: u("u_light"), lightPos: u("u_lightPos"),
        glow: u("u_glow"), comp: u("u_comp"), horizonY: u("u_horizonY"),
      };
```

In `draw`, directly after `gl.uniform1f(U.conf, s.conf);`, add:

```js
          gl.uniform3fv(U.bg, s.bg);
          gl.uniform3fv(U.fg, s.fg);
          gl.uniform3fv(U.light, s.light);
          gl.uniform2fv(U.lightPos, s.lightPos);
          gl.uniform1f(U.glow, s.glow);
          gl.uniform4fv(U.comp, s.comp);
          gl.uniform1f(U.horizonY, s.horizonY);
```

Also change the context creation line so pixels can be read back for verification:

```js
      const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
```

- [ ] **Step 7: Add scene fields to the eased state.** Replace the `current` and `target` declarations with:

```js
    // Current (eased) and target visual state.
    const initialState = () => ({
      weights: new Float32Array(16).fill(1 / 16),
      energy: 0.3, texture: 0.2, form: new Float32Array([1, 0, 0, 0]), conf: 0.5,
      bg: new Float32Array([1, 1, 1]), fg: new Float32Array([0, 0, 0]), light: new Float32Array([1, 1, 1]),
      lightPos: new Float32Array([0, 0]), glow: 0, comp: new Float32Array([0, 0, 0, 1]), horizonY: 0,
    });
    const current = initialState();
    const target = initialState();
    window.__scene = { current, target };   // debug handle for verification
```

- [ ] **Step 8: Set scene targets from the API.** In `setTarget`, directly after `target.conf = data.confidence;`, add:

```js
      const sc = data.scene;
      target.bg.set(rgb(PALETTE[sc.background]));
      target.fg.set(rgb(PALETTE[sc.foreground]));
      target.light.set(rgb(PALETTE[sc.light]));
      target.lightPos.set(lightPosition(sc.lightPos, sc.horizon));
      target.glow = lightStrength(sc.lightPos, sc.glow);
      target.comp.set(compositionVector(sc.composition));
      target.horizonY = horizonY(sc.horizon);
```

Replace the `hudEl.textContent = ...` statement with:

```js
      const topOf = (probs) => Object.entries(probs).reduce((a, b) => (b[1] > a[1] ? b : a));
      const [comp, compP] = topOf(sc.composition);
      const [lightAt] = topOf(sc.lightPos);
      hudEl.textContent =
        `energy   ${data.motion.energy.toFixed(2)}\n` +
        `texture  ${data.motion.texture.toFixed(2)}\n` +
        `form     ${topForm} ${(data.form[topForm] * 100).toFixed(0)}%\n` +
        `scene    ${comp} ${(compP * 100).toFixed(0)}%  ${sc.background} / ${sc.foreground}\n` +
        `light    ${sc.light} @ ${lightAt}  glow ${sc.glow.toFixed(2)}\n` +
        `conf     ${data.confidence.toFixed(2)}\n` +
        `jev      ${data.ms}ms`;
```

- [ ] **Step 9: Ease the scene fields each frame.** In `frame`, directly after `current.conf = lerp(current.conf, target.conf);`, add:

```js
        for (const key of ["bg", "fg", "light", "lightPos", "comp"]) {
          for (let i = 0; i < current[key].length; i++) current[key][i] = lerp(current[key][i], target[key][i]);
        }
        current.glow = lerp(current.glow, target.glow);
        current.horizonY = lerp(current.horizonY, target.horizonY);
```

- [ ] **Step 10: Verify it compiles and renders.** Restart the server (same safe check as Task 2 Step 5) and load `http://localhost:5173` in the browser pane at 1200×720. Then:

1. Read the console. Expected: no errors (a GLSL error would appear here, thrown from `createShader`).
2. Type `sunset`, wait 3 seconds, and take a screenshot. Expected: a warm background upper region over a darker foreground below, and a glow near the horizon line.
3. Type `jellyfish`, wait 3 seconds, and take a screenshot. Expected: a distinct central shape on a surrounding background, glowing from the centre.
4. Run this pixel check in the page. It forces a known horizon scene and samples the top and bottom of the canvas:

```js
const { target } = window.__scene;
target.comp.set([1, 0, 0, 0]); target.horizonY = 0; target.glow = 0;
target.bg.set([0, 0.47, 0.96]); target.fg.set([0, 0, 0]);
await new Promise((r) => setTimeout(r, 3000));
const c = document.getElementById("gl"), g = c.getContext("webgl2"), px = new Uint8Array(4);
g.readPixels(c.width >> 1, c.height - 5, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); const top = [...px];
g.readPixels(c.width >> 1, 5, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); const bottom = [...px];
({ top, bottom, ok: top[2] > bottom[2] + 40 });
```

Expected: `ok: true` (the top is noticeably bluer than the bottom). Note that WebGL's `readPixels` y axis starts at the bottom, which is why `c.height - 5` is the top.

5. Re-run the smoothness benchmark from commit `9b104ae` (it compiles `FRAG` into an offscreen canvas and counts pixels changing by more than 90/765 between 60fps frames at energy 0.8). Set the new uniforms to a horizon scene with glow 1 for the run. Expected: the worst frame is under 0.1% of pixels for every form.

6. Click the `stripes` toggle. Expected: identical to before this plan (weighted stripes, no scene layer).

- [ ] **Step 11: Commit**

```bash
git add index.html
git commit -m "Render Jev scenes: background/foreground regions and light glow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Scene sanity report and tuning

**Files:**
- Create: `scripts/scene-report.mjs`
- Modify (tuning only, if the report or screenshots call for it): `index.html` (`SCENE_MIX`, mask widths, glow radii) and `scene.mjs` (question wording)

**Interfaces:**
- Consumes: a running server at `http://localhost:5173` (override with the `URL` env var) returning `scene` (Task 2).
- Produces: a console report and exit code 0 when at least 6 of 8 expectations hold, 1 otherwise.

These are model judgments, not exact outputs, so the threshold allows a couple of reasonable disagreements. A failure means the question wording needs work.

- [ ] **Step 1: Write the report script** at `scripts/scene-report.mjs`

```js
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
```

- [ ] **Step 2: Run it**

Run: `node scripts/scene-report.mjs`
Expected: a line per word and `N/8 expectations met`, exiting 0 with N ≥ 6. If it exits 1, read the ✗ lines. Adjust the wording of the failing question in `scene.mjs` (for example, sharpen a `COMPOSITIONS` description with a better example), restart the server, and re-run. Don't change the expectations to make the report pass.

- [ ] **Step 3: Tune visually.** Screenshot `sunset`, `jellyfish`, `forest`, `confetti`, `campfire` and `ocean` in the browser pane at 1200×720. Adjust only these constants, one at a time, re-screenshotting after each change:
- `SCENE_MIX` (0.55): raise it if scenes read as "just paint", lower it if the watercolour detail disappears.
- The horizon edge width (`0.06` in `mHorizon`): raise it for a hazier horizon.
- The glow radii (`0.02` core, `0.25` bloom): raise them if the glow reads as a dot.

Then re-run the smoothness benchmark (Task 4 Step 10.5). Expected: still under 0.1% for every form.

- [ ] **Step 4: Run the unit tests one last time**

Run: `npm test`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/scene-report.mjs index.html scene.mjs
git commit -m "Add scene sanity report and tune scene rendering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Out of scope (possible follow-ups)

- A bigger palette (64+ colours). Scene colours would benefit, but it changes stripes mode.
- Sound driven by the scene (for example, a horizon glow becoming a swelling pad).
- More than one light, or cast shadows.
