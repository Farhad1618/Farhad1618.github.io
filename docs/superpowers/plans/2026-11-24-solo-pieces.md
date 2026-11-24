# Solo Pieces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six Canvas 2D project plates with one shared live WebGL close-up that shows each project's detailed chess piece alone on a few board tiles, in the hero's foggy blue look, tilting toward the mouse.

**Architecture:**
- `hero.js` is split into a renderer core (one canvas and context, post chain, sharpness levels, rAF) and worlds (scene, camera, pieces, board, per-world uniforms). The hero is one world; each solo piece is another. The core moves its canvas into whichever stage is active.
- A new Blender stage builds a detailed model per piece and places it on a small tile patch. It bakes view-independent lighting plus a mask texture used for live highlights, and exports `assets/solo/<id>/`.
- `site.html` swaps the plates for poster + stage pairs and drives the active chapter.

**Tech Stack:** Three.js 0.170.0 (ES modules via the import map), GLSL ES 3.0, Blender 5.2 Cycles (Python), `@gltf-transform/cli@4.1.0`, `cwebp`, Node 20 scripts, GSAP 3.13 + ScrollTrigger.

**Spec:** `docs/superpowers/specs/2026-11-24-solo-pieces-design.md`

## Global Constraints

- One WebGL context for the hero and the chapters. Never construct a second `WebGLRenderer`.
- The hero must render the same pixels after the refactor. The hash from Task 1 must match at every level.
- `mountHero(stage, layout, opts)` keeps its signature and behaviour. `hero.js` keeps `export async function mountHero`, which `check-site` greps for.
- Same world scale as the hero; the close-up comes from a long lens.
- Moving part angles are the hero's: Cyrus roll 9°, Zagros fifth key 90°, OnePharma graph 40°, Pearl upper shell 11°, Falah beam 6° with hanging pans, first NIDS arrow quiver.
- Tilt: yaw ±20°, pitch ±6°, fine pointers only, eased. On touch, a self-driven drift of ±3° yaw and no finger tilt; a tap plays the part.
- Solo assets go in `assets/solo/<id>/{solo.glb, poster.webp, layout.json}`. Poster at most 150 KB; folder target 1.5 MB, hard cap 2.5 MB. Triangle cap is 120k per piece and 15k for the hero (unchanged).
- Colours are raw display values; textures use `NoColorSpace`. Don't add colour management.
- No new script hosts. No `<script type="module" src`. Load only through `import("./hero.js")`.
- New class names must not contain the word `proj` (for example `proj-stage`): the six-`.proj` check matches them. Use `plate-*` / `solo-*`.
- No forbidden copy in new text or comments: "CV", "97%", "Apache", "PyTorch", "Onyxs", "SR-71", "Purple Finance".
- Nothing is pushed to `main` until Farhad approves. Commit locally on branch `solo-pieces`.

## Review Focus

1. **Fast scroll through all six chapters.** Overlapping `setPiece` calls: the last one wins, earlier loads are dropped when they finish, no errors, no canvas left in a stale plate. Test in Task 7.
2. **Landing directly on `#proj-falah`** with the hero never mounted. The chapter mounts the core itself, through the same gate and speed test. Test in Task 7.
3. **Context loss while in a chapter.** Every plate and the hero go back to their posters, and nothing retries. Test in Task 7.
4. **Scrolling back to the hero.** The canvas returns and the hero carries on with no replayed ignite, and its hash at a frozen time still matches. Test in Task 7.
5. **Resizing or rotating while in a chapter.** The stage resizes and the framing still fits the piece in the plate's aspect (wide desktop plate and tall phone plate). Test in Task 6.

---

### Task 1: Hero snapshot hook and baseline

**Files:**
- Modify: `hero.js` (handle API near line 1389)
- Create: `scripts/hero-snapshot.md` (how to run it), `blender/out/hero-baseline.json` (git-excluded, machine-specific)

**Interfaces:**
- Produces: `heroLive.freeze(t: number|null)`. It fixes the scene time `t`, the ignite time, the pointer drift (0, 0), hover null and scroll 0; `null` releases.
- Produces: `heroLive.hash(): string`. It renders once and returns the FNV-1a hex of the full default framebuffer's `readPixels` (RGBA8).

- [ ] **Step 1: Write the check.** Open the preview (`portfolio` server, `?why`, `localStorage.heroForce="1"`) and run in the page:

```js
for (const i of [0, 1, 2]) {
  heroLive.setLevel(i); heroLive.freeze(5);
  out[i] = heroLive.hash();
}
```

Expected now: `heroLive.freeze is not a function`.

- [ ] **Step 2: Implement `freeze` and `hash`** in `hero.js`. `freeze` makes `frame()` use the fixed `t` and skip the time step. `hash` calls `render()` then `renderer.readPixels` on the drawing buffer. The renderer needs `preserveDrawingBuffer: false` (unchanged), so read straight after rendering.
- [ ] **Step 3: Run Step 1 twice.** Expected: the same three hashes both times. Save them to `blender/out/hero-baseline.json` as `{"0": "...", "1": "...", "2": "...", "viewport": [w, h]}`. Record the preview viewport size, which must be fixed with `resize_window` 1440x900.
- [ ] **Step 4: Commit** `feat(hero): freeze and hash for pixel-exact refactor checks`.

### Task 2: Split hero.js into core and worlds (hero unchanged)

**Files:**
- Create: `hero-shaders.js` (every GLSL string, now parameterised), `hero-core.js` (core)
- Modify: `hero.js` (becomes the hero world, plus `mountHero` and later `mountSolo`)
- Modify: `site.html` head preload list: add `modulepreload` for `hero-core.js` and `hero-shaders.js`

**Interfaces:**
- Produces in `hero-core.js`:

```js
export async function createCore(opts) // -> core
// opts: { onLost(reason) }
// core: { canvas, renderer, matcap, noiseTex, level, ladder,
//         attach(stage, world), detach(), render(), start(), stop(),
//         resize(), setLevel(i), mountTest(world), dispose(),
//         post, fxaa, bright, grain(level) }
```

- Produces the world contract that the core calls:

```js
world = { scene, camera, zs /* = camera.far */, fogMat, moteMat,
          update(dt, core), postUniforms() /* uNear,uFar,uFocus,uAperture,uMaxR */,
          ignite(s), resize(bw, bh, pr), dispose() }
```

- Produces in `hero-shaders.js`:
  - `pieceShaders({ rig, solo })`, `boardShaders()`, `fogShader({ nocc, div })`, `moteShader({ nocc })`, plus `POST_FS`, `FXAA_FS`, `DOWN_FS`, `BLUR_FS`.
  - `NOCC` and `ZS` become `#define`s.
  - The FOG_FS literals become uniforms with the hero's values: `uTop` 3.2, `uBankZ` (1.5, -4.0), `uHazeZ` (4.0, -2.0), `uHalo` 0.05, `uTEnd` 42.0.
  - The mote box becomes `uLo` / `uSize`, and the wake push is `uWakePush` (9 × 1.2).
- `mountHero(stage, layout, opts)`: same signature and handle as today, plus `world` and `core`.

- [ ] **Step 1: Write the check.** Task 1's three hashes, run again after the split, must equal `blender/out/hero-baseline.json`.
- [ ] **Step 2: Move** shaders, then the core, then the hero world. Rerun the hash after each move; it must match before the next move. Shared uniform objects (`uFull`, `uTime`, the wake arrays) stay shared by reference, as today.
- [ ] **Step 3: Run the hash check.** Expected: all three levels equal the baseline. Also run `./build.sh && node scripts/check-site.mjs --all && node scripts/check-hero-assets.mjs`. Expected: all pass.
- [ ] **Step 4: Commit** `refactor(hero): split into core and worlds; pixels unchanged`.

### Task 3: Parameterise the Blender scene (hero output unchanged)

**Files:**
- Modify: `blender/hero/scene.py`, `blender/hero/output.py`
- Create: `blender/tests/board_hash.py` (prints a SHA-1 of the board's vertex coordinates, rounded to 1e-5, plus the light and camera transforms)

**Interfaces:**
- Produces in `scene.py`:

```python
build_board(center=BOARD_CENTER, size=BOARD_SIZE, placement=PLACEMENT,
            platform=PLATFORM, seed=11, back=False, name="board")
make_materials() -> dict
assign(pid, piece_ob, plinth_ob, M)
add_light(loc, energy=900, soft=.12, color=(1,.92,.80)) -> ob
build_haze(loc=(0,0,4), scale=(40,44,8), noise_loc=(3.1,.7,0), dens=(.0035,.15)) -> ob
add_camera(name, pos, target, lens, res, focus_ob, fstop=FSTOP) -> ob
fov_y(lens, w, h) -> float
```

- Produces in `output.py`: `bake_and_export(objs, assets_dir, out_dir, draft, ids=PIECE_IDS, cam="landscape", sizes=None, glb_name="pieces.glb", mode="hero")`. `mode="solo"` arrives in Task 4.
- `build_scene()` calls these with today's constants.

- [ ] **Step 1: Record the baseline.** Run `blender --background --factory-startup --python blender/tests/board_hash.py` before any edit. Save the printed hash to `blender/out/board-baseline.txt`.
- [ ] **Step 2: Refactor.** Keep the board's `rng` call order identical.
- [ ] **Step 3: Rerun.** Expected: the same hash. Then run `--stage export --draft`. Expected: `assets/hero/layout.json` is byte-identical (`git diff --exit-code assets/hero/layout.json`). Restore `assets/hero/pieces.glb` with `git checkout`, since the draft overwrites it.
- [ ] **Step 4: Commit** `refactor(blender): parameterise board, materials, light, haze, camera`.

### Task 4: Solo bake pipeline and the detailed Cyrus

**Files:**
- Create: `blender/hero/solo.py` (the `SOLO` table and `build_solo`), `blender/hero/solo_pieces.py` (detailed builders; Cyrus first)
- Modify: `blender/build_hero.py` (stage `solo`, `--piece`, repeatable), `blender/hero/output.py` (`mode="solo"`)
- Modify: `scripts/check-hero-assets.mjs` (solo contract)
- Modify: `.gitignore` (`blender/out/solo/`)

**Interfaces:**
- `SOLO[pid] = dict(tiles=(5,4), light=(dx,dy,dz), energy=W, cam=dict(pos, target, lens), tex=dict(piece=2048, mask=1024, plinth=1024, board=2048), samples=256, tilt=(20,6))`.
  - The light offset is relative to the piece base: behind is +y 1.0–1.4, the side is dx ±0.6–0.9, and z is 0.7–0.9 of the piece height.
  - Energy is 900 × (d / 1.5)², keeping the hero's irradiance.
- `solo_pieces.BUILDERS[pid]()` returns an object with the hero mini's origin, height, yaw, rig pivots and part tags (parts 1..3, COLOR_0 red = part / 8).
- The glb contract that Task 5 reads, per `assets/solo/<id>/solo.glb`:
  - Nodes: `piece-<id>`, `plinth-<id>`, `board` (the board carries no COLOR_0).
  - Each material: `baseColorTexture` = the view-independent bake (diffuse + transmission + emit, direct and indirect, glossy off, fog on, `view_from ABOVE_SURFACE`), tonemapped with a soft shoulder from 0.8 to 1.0 and denoised.
  - Pieces only: `emissiveTexture` = a mask, R = gloss (1 − baked roughness), G = direct-light visibility (DIFFUSE DIRECT bake without colour, normalised by its 99th percentile), B = specular strength (EMIT bake of a per-material `spec` value: marble 0.9, ivory 0.35, clay 0.05, pearl 1.0).
- `layout.json`, in glTF axes:

```json
{ "id": "...", "camera": { "position": [x, y, z], "target": [x, y, z], "fovY": 0, "aspect": 1.15 },
  "light": [x, y, z], "lightCol": [r, g, b],
  "board": { "center": [x, z], "size": [w, d] },
  "piece": { "min": [...], "max": [...], "top": [...] },
  "tilt": [20, 6] }
```

- Run: `blender --background --factory-startup --python blender/build_hero.py -- --stage solo --piece cyrus [--draft]`.

- [ ] **Step 1: Write the failing check.** Extend `check-hero-assets.mjs`: for every folder in `assets/solo/` (and every id passed as `--solo <id>`), check:
  - the three files exist
  - the nodes exist, with both extensions
  - `piece-<id>` is at most 120k triangles and has an emissive texture
  - the poster is at most 153,600 B and the folder at most 2,621,440 B
  - the layout has `camera`, `light`, `board` and `tilt`, with fovY between 4 and 40

  Run `node scripts/check-hero-assets.mjs --solo cyrus`. Expected: FAIL, missing `assets/solo/cyrus/solo.glb`.
- [ ] **Step 2: Build the detailed Cyrus** in `solo_pieces.py`:
  - a barrel of about 160 rings × 256 segments
  - cuneiform as wedge-shaped dents displaced into the vertices, in uneven lengthwise registers
  - a broken end with flaking edges and 3–5 loose crumbs on the mount
  - chips and edge wear on the mount and saddles
  - the same rig and part tag as the hero version

  Render the clay contact sheet first (`--stage pieces` style, solo variant writing `blender/out/solo/cyrus/clay.png`) and look at it.
- [ ] **Step 3: Build `build_solo('cyrus')`.**
  - `make_materials`, the piece and plinth at the patch origin with the hero yaw (14°) and platform (0.36)
  - `build_board(center, size=(5×1.5, 4×1.5), placement={cyrus}, platform={cyrus: .36}, seed=hash('cyrus') & 0xffff, back=True)`
  - `build_haze` at about 12 × 12 × 5 round the patch, density × 1.6
  - `add_light(base + SOLO.light)` and `add_camera('cam-solo', …)`
- [ ] **Step 4: Solo export.**
  - Render the poster at 1600 × 1400, with glow, at most 150 KB.
  - Bake the base and mask maps as described in the contract, then swap to the bakes.
  - Export with emissive texture slots, then run gltf-transform webp (quality 82; mask quality 90) and meshopt.
  - Write `layout.json`.
- [ ] **Step 5: Run** the draft, then the full build, then the check. Expected: the check passes for cyrus and the hero checks still pass.
- [ ] **Step 6: Commit** `feat(blender): solo stage and detailed Cyrus`, including `assets/solo/cyrus/`.

### Task 5: Solo world and `mountSolo` in hero.js

**Files:**
- Create: `hero-solo.js` (the solo world)
- Modify: `hero.js` (export `mountSolo`), `hero-shaders.js` (piece shader `SOLO` define: live specular)

**Interfaces:**
- Consumes: `createCore` and the world contract (Task 2); the glb and layout contract (Task 4).
- Produces: `export async function mountSolo(opts)`, which returns `solo`.
  - opts: `{ core?, base: "./assets/solo/", onLost(reason), pointerTarget?: Element }`
  - solo: `{ core, setPiece(id, plate): Promise<boolean>, prefetch(id), stop(), returnTo(stage, world), setPointerTarget(el), box(): {x, y, w, h} /* piece box in canvas CSS px */, dispose(), live: { fog, motes, post, fxaa, spec } }`
- `setPiece` resolves `false` when a newer `setPiece` call superseded it before its load finished.
- If `opts.core` is missing, `mountSolo` creates the core and runs the mount test on the first solo world.
- Exposed as `window.soloLive`.
- Specular in PIECE_FS under `SOLO`:
  - Read the mask from `emissiveMap`.
  - `h = normalize(L + V)`.
  - `spec = mask.b * mask.g * pow(max(dot(N, h), 0), mix(8, 400, mask.r * mask.r)) * (mask.r * 0.9 + 0.1) * uLightCol * uSpecK / max(dist², 0.5)`, with `uSpecK` 0.012 to start (tune live).
- Camera:
  - Orbit the layout camera about `layout.piece` centre by drift × tilt, eased 3.5/s.
  - Fit framing per aspect: keep the piece box inside 80% of the height on wide plates and 80% of the width on tall ones, by adjusting fovY.
  - Touch: drift yaw = 3° × sin(t × 2π / 14).
- Hover: pointer over the projected piece box plays the rig. Tap plays it on touch.
- Ignite on every attach. `NOCC` 1.

- [ ] **Step 1: Write the check.** In the preview page (`/scratch-solo.html`, a throwaway test page in `blender/out/`, not deployed, with one 900 × 900 div as the plate), run:

```js
const m = await import("/hero.js");
const s = await m.mountSolo({});
ok = await s.setPiece("cyrus", plate);
// then: s.core.canvas.parentNode inside plate, heroLive-style hash non-blank,
// no console errors.
```

Expected now: `mountSolo is not exported`.
- [ ] **Step 2: Implement** `hero-solo.js` and `mountSolo`.
- [ ] **Step 3: Run the check.** Expected: `ok === true`, the canvas is in the plate, and there are no console errors. Take a screenshot.
- [ ] **Step 4: Supersede test.** Run `Promise.all([s.setPiece("cyrus", a), s.setPiece("cyrus", b)])`. Expected: `[false, true]` and the canvas in `b`.
- [ ] **Step 5: Resize test.** Resize the plate to 900 × 600 and then 500 × 900. Expected: the piece box projected into the canvas lies inside it for both (check `solo.box()` against the canvas size).
- [ ] **Step 6: Commit** `feat(hero): solo world, live specular, tilt, mountSolo`.

### Task 6: Plates in site.html

**Files:**
- Modify: `site.html`
  - plate markup at :281/:293/:305/:317/:329/:341
  - CSS :195-198 and the media block :230-237
  - delete JS :641-1100 and `mk` at :401
  - insert the solo block
  - fix the comments at :10/:405 (`<header>` → `<main>`)
- Modify: `scripts/check-site.mjs` (:76, :82-84, :138, :144), `build.sh:31` (marker `/^<main>/`)

**Interfaces:**
- Consumes: `mountSolo` (Task 5); `window.heroTry`; `window.heroLive.core` (Task 2).
- Plate markup:

```html
<div class="plate" data-solo="ID" role="img" aria-label="NAME: SHORT DESCRIPTION">
  <img class="plate-poster" src="assets/solo/ID/poster.webp" alt="" loading="lazy" decoding="async">
  <div class="plate-stage"></div>
  <div class="num" aria-hidden="true">0N</div>
</div>
```

- Until a piece's folder exists, its plate has no `data-solo`, keeps a plain dark plate, and has no poster. Only Cyrus is live after this task.

- [ ] **Step 1: Write the failing checks** in `check-site.mjs`:
  - each `.proj` has `class="plate"` and its `data-solo`, if present, equals the section's `data-id`
  - none of `SCENES`, `sceneCyrus`, `fitPlate`, `docsCache`, `drawPlate` remain
  - `hero.js` contains `export async function mountSolo`
  - `.proj .num` has a `z-index`
  - fix the head slices to `indexOf("<main")`

  Run `node scripts/check-site.mjs --all`. Expected: FAIL on the remnants.
- [ ] **Step 2: Implement** the markup and CSS:
  - poster and stage are absolute, inset 0; the poster is `object-fit: cover`
  - the stage fades in with `.plate.live`
  - `.num` gets z-index 3
  - desktop: `.proj .plate{position:sticky;top:0;height:100svh;align-self:start}`
  - at 860 px or less: `position:relative; height:56svh`
- [ ] **Step 3: Implement the solo block:**
  - gate on `window.heroTry`
  - start after the hero is up or has fallen back (a promise resolved in `boot()`'s then/fallBack), or immediately when the page loads with a `#proj-` hash
  - one IntersectionObserver over the plates, thresholds [0, .25, .5, .75, 1]; the active plate is the one with the highest ratio
  - on change: `setPiece`, then `.live` on the new plate after its first frame, and remove it from the old one
  - no plate visible: `stop()`
  - hero `#top` near view (rootMargin "100% 0px"): `returnTo(heroStage, heroWorld)` with no ignite
  - `onLost`: remove `.live` everywhere and call `heroPosterBack`
  - the hero links' `go(id)` also calls `prefetch(id)`
  - the pointer target is the active `.proj`
- [ ] **Step 4: Run** `./build.sh && node scripts/check-site.mjs --all && node scripts/check-hero-assets.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(site): solo plates replace the canvas scenes`.

### Task 7: Browser verification of the flows, then show Farhad Cyrus

**Files:** none. This is verification only; fixes go back to the owning task's files.

- [ ] **Step 1: Hero to Cyrus.** Use the preview at 1440 × 900 with `heroForce`. Scroll to `#proj-cyrus`. Expected:
  - the canvas is in the Cyrus plate and `.live` is set
  - `heroLive` stopped
  - no console errors
  - a screenshot
- [ ] **Step 2: Fast scroll.** Script `scrollTo` through all six chapters in 1 s. Expected: no errors, and the final active plate holds the canvas (or its poster if its folder is missing).
- [ ] **Step 3: Back to the hero.** `scrollTo(0)`. Expected: the canvas is in the hero stage and `uIgnite` stays at 1 (no replay). Then `heroLive.freeze(5); heroLive.hash()` equals the baseline for the current level.
- [ ] **Step 4: Deep link.** Load `/#proj-cyrus` fresh. Expected: the solo view mounts and the hero did not start first.
- [ ] **Step 5: Context loss.** In a chapter, run `core.renderer.getContext().getExtension("WEBGL_lose_context").loseContext()`. Expected: every `.live` is removed, the posters show, the hero has its poster class, and there is no retry.
- [ ] **Step 6: Phone.** Use `resize_window` mobile. Expected: the plate is above the text at 56svh and the piece is framed in it. Then reset to desktop.
- [ ] **Step 7: Show Farhad.** Send screenshots, and tune the light, fog, specular and tilt live with him through `soloLive.*`. Write the agreed values back to `SOLO.cyrus` and the defaults in `hero-solo.js`. Rebake if the light moved. Commit `tune(solo): cyrus per Farhad`.

### Tasks 8–12: Zagros, OnePharma, Black Pearl, Falah, Network Intrusion Detection

Each piece follows the same shape: a builder in `solo_pieces.py`, its `SOLO[pid]` entry, a clay sheet, a draft bake, the full bake, `check-hero-assets --solo <pid>`, `data-solo` and the poster in `site.html`, then show Farhad and tune, then commit `feat(solo): <pid>`. The detail for each piece comes from the spec:

- **Zagros:** bitting and wards on the keys, engraved rings round the vault, wear on the lid and knob, a scarred empty sixth face. The part is the fifth key, turning 90°.
- **OnePharma:** carved nodes with incised labels, thin bronze rods for edges (spec 0.8), a turned stem. The part is the graph, turning 40°.
- **Black Pearl:** milled tool paths on the block and terraces, growth ridges and nacre on the shells, a pearl with spec 1.0 and gloss 0.95. The part is the upper shell, opening 11°.
- **Falah:** linked chains, a pivot pin, stamped coin faces and milled edges, leaning stacks. The parts are the beam (6°) and the two pans hanging from it.
- **Network Intrusion Detection:** a hammered rim with bosses, arrowheads, nocks and fletching, a splintered snapped shaft, cracks radiating from each strike. The part is the first arrow's quiver.

Shape-defining segment counts stay as they are: Zagros hexagons (6), the Falah octagon base (8), the Falah square pointer (4).

### Task 13: Docs and the deploy list

**Files:**
- Modify: `CLAUDE.md`
  - the Files table: `hero-core.js`, `hero-shaders.js`, `hero-solo.js`, `assets/solo/`, `blender/hero/solo*.py`, `mark.js`, `mark-data.json`
  - the workflow `files` list
  - the Concept paragraph, the Structure bullet on the shared rAF, the Projects table's Scene column, and the GN/GE note (now gone)
  - a new "Solo pieces" section with the tuned values

- [ ] **Step 1:** Run `./build.sh && node scripts/check-site.mjs --all && node scripts/check-hero-assets.mjs`. Expected: all pass.
- [ ] **Step 2:** Commit `docs: solo pieces`. Ask Farhad before merging to `main` (it goes live).
