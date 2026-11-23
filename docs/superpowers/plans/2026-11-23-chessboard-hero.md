# Chessboard Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v6 hero with a dark marble chessboard whose six pieces are the six projects, rendered in Three.js from Blender-baked assets, with a still poster as first paint and fallback.

**Architecture:** A headless Blender script builds the six pieces and the board, renders two posters (landscape, portrait), bakes all lighting into textures, and writes `assets/hero/` plus a `layout.json` that carries cameras and piece screen positions. `site.html` shows the poster with six project links placed from `layout.json`; a lazy-loaded ES module `hero.js` mounts an unlit Three.js scene over the poster and adds drift, hover, focus pull and click-to-chapter. Any failure leaves the poster in place.

**Tech Stack:** Blender 5.2.3 (`/opt/homebrew/bin/blender`, Python API, Cycles), `@gltf-transform/cli` 4.1.0 via `npx` (meshopt + WebP), Three.js 0.170.0 as ESM from `cdn.jsdelivr.net/npm`, existing GSAP + ScrollTrigger, Node for check scripts.

**Spec:** `docs/superpowers/specs/2026-11-23-chessboard-hero-design.md`. Read it first; this plan does not repeat its reasoning. Mood reference: `docs/superpowers/specs/reference/chessboard-reference.png` (local only).

## Global Constraints

- The reference still is never committed, published, or copied into `assets/`. No human figures; no copy of its tile pattern or title.
- Scripts load only from `cdn.jsdelivr.net/npm` or cdnjs, pinned to exact versions. No Draco. No bundler, no framework.
- All files in `assets/hero/` together ≤ 2.5 MB; `poster.webp` and `poster-portrait.webp` ≤ 150 KB each.
- No real-time lights or shadow maps in the browser. Materials are unlit (baked texture + matcap).
- Nothing 3D is requested before the page is interactive; the existing inline script and GSAP reveals must not wait on it.
- Poster fallback when: `prefers-reduced-motion`, no WebGL, any import or asset failure, weak device, WebGL context loss.
- `site.html` stays body-only and is the source of truth; run `./build.sh` after every edit; never hand-edit `index.html`.
- `node scripts/check-site.mjs --all` and `node scripts/check-hero-assets.mjs` pass before every commit from Task 5 on.
- Palette: `--ink #0C0C0E`, `--bone #ECE7DC`, `--sig #E9A03B` only; JS `C` stays in sync with `:root`. No teal in the marble. No new accents.
- Piece ids are exactly `cyrus`, `zagros`, `onepharma`, `pearl`, `falah`, `nids` (the `.proj[data-id]` values). Hover labels use display names: Cyrus, Zagros, OnePharma, Black Pearl, Falah, Network Intrusion Detection.
- Each piece ≤ 15,000 triangles after export.
- Commit only on the work branch. Never push to `main`; a push to `main` is live.
- Farhad's uncommitted `.chroma` edits in `site.html` / `index.html` are his. Do not commit, stash or discard them without his answer (Task 0).

## Review Focus

1. **An asset 404s or stalls mid-load.** Expected: poster and links stay, no half-drawn canvas, one console warning at most. Test in Task 7.
2. **Rotation or resize across portrait ↔ landscape.** Expected: poster, link positions and live camera all switch to the matching orientation. Tests in Tasks 6 and 7.
3. **WebGL context lost** (mobile tab backgrounded, GPU reset). Expected: canvas removed, poster shown, links still work. Test in Task 7.
4. **Page loaded scrolled away from the hero** (`/#contact`, reload mid-page). Expected: no Three.js or asset requests until the hero is within one viewport of the screen. Test in Task 7.
5. **Pointer leaves the window or a touch scroll starts while a label is showing.** Expected: label clears, no piece left lifted, a scroll gesture never triggers navigation. Test in Task 8.

---

## File Structure

| Path | Responsibility |
|---|---|
| `blender/build_hero.py` | CLI entry. Parses `--stage` and `--draft`, calls the modules below. |
| `blender/hero/pieces.py` | Six mesh builders and the plinth builder. Geometry only. |
| `blender/hero/scene.py` | Board, inlay, marble materials, lights, the two cameras, world. |
| `blender/hero/output.py` | Renders posters, bakes textures, exports GLB, writes `layout.json`. |
| `blender/out/` | Scratch renders (git-ignored). |
| `assets/hero/` | Shipped assets (committed). |
| `scripts/check-hero-assets.mjs` | Asset contract and budget check. |
| `hero.js` | The live scene. One export: `mountHero`. |
| `site.html` | Hero markup, CSS, poster + links logic, lazy import of `hero.js`. |
| `scripts/check-site.mjs` | Updated hero assertions. |
| `.claude/launch.json` | Add `.webp`, `.glb` MIME types to the preview server. |

### Asset contract (`assets/hero/`)

| File | Content |
|---|---|
| `poster.webp` | 1920×1080 Cycles still, landscape camera |
| `poster-portrait.webp` | 1080×1920 Cycles still, portrait camera |
| `pieces.glb` | Nodes `piece-<id>` and `plinth-<id>` for the six ids, baked colour textures embedded as WebP, meshopt-compressed, Y-up |
| `board.webp` | 2048×2048 top-down bake of the board: inlay, light pools, contact shadows, blur increasing away from the focal line |
| `matcap.webp` | 256×256 soft studio matcap for the marble sheen |
| `haze.webp` | 512×512 soft alpha noise puff |
| `layout.json` | See below |

```json
{
  "focusId": "pearl",
  "board": { "center": [0, 0], "size": [12, 12] },
  "landscape": {
    "aspect": 1.7778,
    "camera": { "position": [0, 0, 0], "target": [0, 0, 0], "fovY": 30 },
    "pieces": { "cyrus": { "cx": 0.2, "cy": 0.5, "w": 0.1, "h": 0.3 } }
  },
  "portrait": { "aspect": 0.5625, "camera": {}, "pieces": {} }
}
```

Values shown are placeholders for shape only. `position`/`target` are in glTF space (Y up, metres): Blender `(x, y, z)` → `(x, z, -y)`. `fovY` is degrees. `cx, cy, w, h` are the piece-plus-plinth bounding box centre and size as fractions of the poster (origin top-left). `board.center` is `[x, z]`, `board.size` is `[width, depth]`.

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1: Ask Farhad** whether the uncommitted `.chroma` edits on `hero-name` are to be committed there first or stashed. Do not proceed without his answer.
- [ ] **Step 2: Apply his answer, then branch.**

```bash
git switch -c chessboard-hero
git status --short
```

Expected: clean tree apart from the untracked spec and plan under `docs/superpowers/`.

- [ ] **Step 3: Commit the spec and plan.**

```bash
git add docs/superpowers/specs/2026-11-23-chessboard-hero-design.md docs/superpowers/plans/2026-11-23-chessboard-hero.md
git commit -m "docs: chessboard hero design and plan"
```

---

### Task 1: Asset contract check

**Files:**
- Create: `scripts/check-hero-assets.mjs`
- Modify: `.gitignore` (add `blender/out/`)

**Interfaces:**
- Produces: `node scripts/check-hero-assets.mjs` exits 0 only when the asset contract above holds. Later tasks use it as their test.

- [ ] **Step 1: Write the script.** Same output style as `scripts/check-site.mjs` (`PASS`/`FAIL` lines, non-zero exit on any fail). Checks, each named:

  - `files present`: the seven files in the contract table exist.
  - `budget`: sum of all file sizes in `assets/hero/` ≤ 2,621,440 bytes; each poster ≤ 153,600 bytes.
  - `layout shape`: `focusId === "pearl"`; `board.center` and `board.size` are 2-number arrays; for both `landscape` and `portrait`: `aspect` number, `camera.position` and `camera.target` 3-number arrays, `camera.fovY` between 10 and 60, `pieces` has exactly the six ids, every `cx, cy` in `[0,1]`, every `w, h` in `(0, 0.6]`.
  - `no overlap hiding`: in each orientation, no piece's centre lies inside another piece's box (so every link is tappable).
  - `glb nodes`: parse the GLB JSON chunk (12-byte header, then chunk length + `JSON` type); `nodes[].name` contains `piece-<id>` and `plinth-<id>` for all six ids; `extensionsUsed` includes `EXT_meshopt_compression` and `EXT_texture_webp`.
  - `triangle cap`: for each `piece-<id>` mesh, sum of index accessor `count / 3` ≤ 15000.

- [ ] **Step 2: Run it.**

Run: `node scripts/check-hero-assets.mjs`
Expected: `FAIL files present` (directory does not exist), exit code 1.

- [ ] **Step 3: Commit.**

```bash
git add scripts/check-hero-assets.mjs .gitignore
git commit -m "test: hero asset contract check"
```

---

### Task 2: Blender pieces

**Files:**
- Create: `blender/build_hero.py`, `blender/hero/__init__.py`, `blender/hero/pieces.py`

**Interfaces:**
- Produces, in `pieces.py`: `build_cyrus()`, `build_zagros()`, `build_onepharma()`, `build_pearl()`, `build_falah()`, `build_nids()`, each `-> bpy.types.Object` named `piece-<id>`, origin at the base centre, standing on z=0, height between 1.0 and 1.3 m, UV-unwrapped (smart project, no overlaps); `build_plinth(piece_id: str) -> bpy.types.Object` named `plinth-<id>`, a bevelled square block 0.9 × 0.9 × 0.35 m; `PIECE_IDS: list[str]` in the Global Constraints order; `BUILDERS: dict[str, Callable]`.
- Produces, in `build_hero.py`: `blender --background --factory-startup --python blender/build_hero.py -- --stage <pieces|stills|export|all> [--draft]`. `--stage pieces` writes `blender/out/pieces-sheet.png`.

Piece forms (spec "Pieces" table is authoritative):
- `cyrus`: barrel (lathe profile, widest at the middle) lying on a two-saddle cradle; 14–18 shallow incised rings along its length broken by short vertical nicks, so it reads as lines of text. Displacement or geometry, not legible glyphs.
- `zagros`: hexagonal prism with a bevelled lid and a visible seam; five key bows on short shafts spaced around the six faces (one face empty), three rotated 90° about their shaft.
- `onepharma`: 9–12 spheres of two sizes joined by thin rods into an irregular but balanced lattice, on a slim stem with a round foot.
- `pearl`: rectangular block with a sphere emerging from its top half; concentric stepped grooves on the block around the sphere (toolpath). Tagged for the dark marble material.
- `falah`: central column on a round foot, horizontal beam, two hanging pans level, three thin rods per pan (not chains).
- `nids`: round tapered tower with a crenellated gallery and an open lantern top on four posts.

- [ ] **Step 1: Write `build_hero.py`** with the argument parsing after `--` and a `pieces` stage that clears the scene, builds all six pieces and plinths in a row 1.6 m apart, adds a neutral clay material, one area light and a camera, and renders `blender/out/pieces-sheet.png` at 2400×800 with Cycles (64 samples). After building, it prints one line per piece: `<id> tris=<n> height=<m>` and exits non-zero if any piece exceeds 15,000 triangles (after modifiers applied) or is outside the height range.
- [ ] **Step 2: Run it before the builders exist.**

Run: `blender --background --factory-startup --python blender/build_hero.py -- --stage pieces`
Expected: fails with `ImportError`/`AttributeError` for `hero.pieces`.

- [ ] **Step 3: Write `pieces.py`** with the seven builders. Use bevel modifiers and weighted normals so no hard polygon edges show; shade smooth.
- [ ] **Step 4: Run it.**

Run: same command.
Expected: six `tris=` lines all ≤ 15000, exit 0, `blender/out/pieces-sheet.png` written.

- [ ] **Step 5: Look at the sheet** (Read the PNG). Each piece must be identifiable from its silhouette alone and must not look like stacked primitives. Iterate on `pieces.py` until it does; if a piece cannot get there, note which and why for the Task 4 checkpoint.
- [ ] **Step 6: Commit.**

```bash
git add blender/
git commit -m "feat(hero): blender builders for the six project pieces"
```

---

### Task 3: Blender scene, posters, layout

**Files:**
- Create: `blender/hero/scene.py`, `blender/hero/output.py`
- Modify: `blender/build_hero.py` (add `stills` stage)

**Interfaces:**
- Consumes: `PIECE_IDS`, `BUILDERS`, `build_plinth` from Task 2.
- Produces, in `scene.py`: `build_scene() -> dict` returning `{"pieces": {id: Object}, "plinths": {id: Object}, "board": Object, "cam_landscape": Object, "cam_portrait": Object}`; `PLACEMENT: dict[str, tuple[float, float, float]]` (x, y, yaw degrees per id).
- Produces, in `output.py`: `render_posters(scene_objs, draft: bool)` and `write_layout(scene_objs)`.
- Produces on disk: `assets/hero/poster.webp`, `assets/hero/poster-portrait.webp`, `assets/hero/layout.json`.

Scene decisions:
- Board: 12 × 12 m plane, 8 × 8 tiles of 1.5 m, alternating two near-black stones (roughness 0.25 and 0.4) so tiles separate only by reflection. Inlay: an original girih star-and-kite pattern as an emission-free brass-tinted line layer (base colour near `#E9A03B` at low value, metallic) on the lighter tiles only, built procedurally in the shader or as a generated image texture. Look at `concepts/a-girih` for the construction; do not copy the reference image.
- Marble: pale = bone-white base `#ECE7DC`, faint warm-grey veining (noise + wave), subsurface weight about 0.3, roughness 0.35. Dark (`pearl` only) = `#18181C` base, pale thin veins, roughness 0.2.
- Placement (landscape): `pearl` at the origin on the focal plane; the other five alternating left and right at distances 2–5.5 m from centre and depths from −4 m (far) to +3 m (near), no two at the same depth, none hiding another from either camera. Order left to right is free.
- Light: one large warm area light above and behind centre (about 3200 K), a faint cool fill from camera left, world colour `#0C0C0E` at low strength. Volume scatter for haze in the poster only (density low enough that far pieces still read).
- Landscape camera: about 0.9 m above the board, 9–10 m back, 50–70 mm lens, depth of field on with focus object `piece-pearl`, f/1.8–2.8. Leave the top third of frame as empty darkness for the title.
- Portrait camera: same focus, pulled back and raised slightly so all six pieces fit 1080×1920 with the top quarter empty.
- Render: Cycles, 256 samples + denoise, Filmic/AgX "medium high contrast"; `--draft` = 64 samples at 50% size. Save WebP quality tuned so each poster is ≤ 150 KB.
- `write_layout`: project each piece-plus-plinth bounding box through each camera with `bpy_extras.object_utils.world_to_camera_view`, flip y to top-left origin, and write the schema above with the axis conversion.

- [ ] **Step 1: Add the `stills` stage** to `build_hero.py`: `build_scene()`, `render_posters()`, `write_layout()`.
- [ ] **Step 2: Run the contract check to see the right failures.**

Run: `blender --background --factory-startup --python blender/build_hero.py -- --stage stills --draft && node scripts/check-hero-assets.mjs`
Expected before `scene.py`/`output.py` exist: Blender import error. After Step 3: `PASS layout shape`, `PASS no overlap hiding`; `FAIL files present` (GLB, board, matcap, haze not made yet).

- [ ] **Step 3: Write `scene.py` and `output.py`** (poster and layout parts).
- [ ] **Step 4: Compare the draft poster with the reference** (Read both images). Check: overall darkness, pale marble against black, visible blur on nearest and farthest pieces, haze, empty top third. Adjust light, lens and placement until the mood matches.
- [ ] **Step 5: Final-quality run.**

Run: `blender --background --factory-startup --python blender/build_hero.py -- --stage stills && node scripts/check-hero-assets.mjs`
Expected: both posters written, `PASS layout shape`, `PASS no overlap hiding`, and the two poster sizes within budget (the `budget` line may still fail only because files are missing).

- [ ] **Step 6: Commit.**

```bash
git add blender/ assets/hero/poster.webp assets/hero/poster-portrait.webp assets/hero/layout.json
git commit -m "feat(hero): blender scene, posters and layout export"
```

---

### Task 4: Checkpoint with Farhad

**Files:** none.

- [ ] **Step 1: Send Farhad** `assets/hero/poster.webp`, `assets/hero/poster-portrait.webp` and `blender/out/pieces-sheet.png`, with one line per piece saying what it is. Name any piece you judge weak and offer the alternatives from the spec (simpler form, or he hand-finishes it in Blender).
- [ ] **Step 2: Stop.** Do not start Task 5 until he approves the pieces and the mood. If he changes a piece, redo Tasks 2–3 for it and return here.

---

### Task 5: Bakes and export

**Files:**
- Modify: `blender/hero/output.py`, `blender/build_hero.py` (add `export` stage; `all` = `stills` + `export`)

**Interfaces:**
- Consumes: `build_scene()` result.
- Produces, in `output.py`: `bake_pieces(scene_objs)`, `bake_board(scene_objs)`, `write_sprites()`, `export_glb(scene_objs)`.
- Produces on disk: `pieces.glb`, `board.webp`, `matcap.webp`, `haze.webp` in `assets/hero/`. After this task `node scripts/check-hero-assets.mjs` exits 0.

Decisions:
- Piece and plinth bake: Cycles bake type `COMBINED` with glossy direct/indirect off (view-independent light, subsurface and occlusion only), 1024×1024 per piece, 512×512 per plinth, margin 8 px. Haze volume disabled during bakes. After baking, each object gets a single emission-only material using its baked image, so the glTF exporter writes it as an unlit-ready base colour.
- Board bake: `COMBINED` minus glossy onto the board plane at 2048×2048 with pieces and plinths present, so their contact shadows are in the texture. Then blur with numpy (bundled with Blender): radius 0 within 1.5 m of the focal line through `pearl`, rising linearly to about 24 px at the far and near edges; fade the outer 15% to `#0C0C0E`.
- `matcap.webp`: render a sphere with the pale marble's glossy component only under the scene lights, orthographic, 256×256, black background. It is added on top of the baked colour in the browser.
- `haze.webp`: numpy-generated soft radial noise puff, white RGB, alpha falloff to 0 at the edge.
- GLB: export pieces and plinths at their scene positions (`export_yup=True`, `export_apply=True`, normals on, tangents off, no cameras or lights) to `blender/out/pieces.raw.glb`, then:

```bash
npx --yes @gltf-transform/cli@4.1.0 optimize blender/out/pieces.raw.glb assets/hero/pieces.glb --compress meshopt --texture-compress webp --texture-size 1024
```

  Run this from `output.py` with `subprocess.run(check=True)`. If `optimize` renames or merges nodes, add its flags to keep names (`--join false --flatten false --instance false --palette false`); the check script will tell you.

- [ ] **Step 1: Add the `export` stage.**
- [ ] **Step 2: Run and check.**

Run: `blender --background --factory-startup --python blender/build_hero.py -- --stage export && node scripts/check-hero-assets.mjs`
Expected: every line `PASS`, exit 0. If `budget` fails, lower piece texture size to 768 before touching geometry.

- [ ] **Step 3: Look at `board.webp` and one piece texture** (Read them): no black bake seams, shadows present under plinths, blur ramps smoothly.
- [ ] **Step 4: Commit.**

```bash
git add blender/ assets/hero/
git commit -m "feat(hero): baked marble, board texture and compressed GLB"
```

---

### Task 6: Poster hero in `site.html`

**Files:**
- Modify: `site.html` (font link line 4, `--name` token line 15, hero CSS lines 43–52, hero markup lines 172–179, hero JS lines 336–393, GSAP lines 879–880)
- Modify: `scripts/check-site.mjs:121-131`, `.claude/launch.json`
- Regenerate: `index.html`

**Interfaces:**
- Consumes: `assets/hero/poster.webp`, `poster-portrait.webp`, `layout.json`.
- Produces (DOM): `section.hero#top` containing `picture.hero-poster > img`, `h1.hero-title` (text `Farhad`), `p.mono.sub` (`Software Developer`), `nav.hero-pieces[aria-label="Projects"]` with six `a[data-piece="<id>"][href="#proj-<id>"]` whose text is the display name, `span.mono.hero-label[aria-hidden]`, `div.hero-stage` (empty mount point for the canvas), and the existing `span.mono.cue`.
- Produces (DOM): each `.proj[data-id]` section gains `id="proj-<id>"`.
- Produces (JS, inline script): `window.heroLayout` (the parsed `layout.json`, or `null`), `function heroOrientation() -> "landscape" | "portrait"` (portrait when the section is taller than wide), `function heroCover(aspect) -> { scale, dx, dy }` mapping poster fractions to section pixels under `object-fit: cover`, and a `CustomEvent("hero-layout")` dispatched on `window` after links are placed or re-placed.

- [ ] **Step 1: Update `scripts/check-site.mjs`** hero check. Remove the `heroField` assertion. Add assertions:
  - `<h1 class="hero-title"` exists and contains `Farhad`; `name-xl`, `id="field"`, `data-hero-figure`, `heroField` and `Anton` do not appear anywhere in `site.html`.
  - `nav.hero-pieces` contains exactly six `data-piece` links, one per id, each `href="#proj-<id>"`, and each of the six `id="proj-<id>"` exists exactly once.
  - `assets/hero/poster.webp` and `assets/hero/poster-portrait.webp` are referenced; the portrait source has `media="(orientation: portrait)"`.
  - No `<script` in `site.html` before the first `<header` has a `src` containing `three`.

- [ ] **Step 2: Run it.**

Run: `node scripts/check-site.mjs --all`
Expected: `FAIL hero and who copy present` listing the new assertions.

- [ ] **Step 3: Rewrite the hero.**
  - Markup per Interfaces. `picture` has `<source media="(orientation: portrait)" srcset="assets/hero/poster-portrait.webp">` and `<img src="assets/hero/poster.webp" alt="" fetchpriority="high">`.
  - CSS: section keeps `height:100svh; min-height:560px`, background `var(--ink)`. Poster and `.hero-stage` are `position:absolute; inset:0`, poster `object-fit:cover`. `.hero-title`: Bodoni Moda 400, `font-variant-caps: small-caps` fallback via `text-transform:uppercase`, `letter-spacing:.42em`, `font-size:clamp(20px,2.6vw,40px)`, colour `--bone`, centred at about 22% from the top; `.sub` directly beneath in the existing mono style. A bottom gradient from transparent to `--ink` over the last 18% so the hero meets the next chapter with no seam.
  - Links: by default `.hero-pieces` is visually hidden but focusable (clip pattern). When `window.heroLayout` loads, add class `placed` to the nav: each link becomes `position:absolute`, transparent, sized and positioned from its piece box through `heroCover`, text hidden with the same clip; `:hover` and `:focus-visible` put the display name into `.hero-label`, positioned above the box, and focus shows a 1px `--sig` outline.
  - JS: delete `heroField`, the `#field` IIFE, `heroMouse`, and the hero-figure IIFE. Add an IIFE that fetches `assets/hero/layout.json`, sets `window.heroLayout`, places links, re-places on `resize`, and dispatches `hero-layout`. On fetch failure leave the nav in its hidden-list state.
  - GSAP: replace the two `.name-xl` tweens with a fade-and-rise of `.hero-title` and `.sub` on load. Keep the `.line>span` rule working or remove the `.line` wrappers from the hero; do not leave dead selectors.
  - Remove `family=Anton&` from the font link and the `--name` token.
- [ ] **Step 4: Add MIME types** `'.webp':'image/webp'` and `'.glb':'model/gltf-binary'` to the map in `.claude/launch.json`.
- [ ] **Step 5: Build and check.**

Run: `./build.sh && node scripts/check-site.mjs --all`
Expected: all `PASS`.

- [ ] **Step 6: Verify in the preview** (`preview_start {name:"portfolio"}`).
  - Console has no errors; network shows `poster.webp` and `layout.json` 200 and no request to `cdn.jsdelivr.net/npm/three`.
  - `document.querySelectorAll(".hero-pieces.placed a").length === 6`; for each link, `getBoundingClientRect()` lies inside the hero and its centre is over the matching piece in a screenshot.
  - Clicking the `falah` link scrolls `#proj-falah` to the top of the viewport.
  - Review Focus 2: `resize_window` to 375×812, reload; the portrait poster is the one loaded, six links are placed and none is off-screen; no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`).
  - Tab through the page: the six links take focus in order and show their names.
- [ ] **Step 7: Commit.**

```bash
git add site.html index.html scripts/check-site.mjs .claude/launch.json
git commit -m "feat(hero): chessboard poster hero with project links"
```

---

### Task 7: Live scene (static)

**Files:**
- Create: `hero.js`
- Modify: `site.html` (importmap before `<header>`, lazy loader in the inline script), `scripts/check-site.mjs`
- Regenerate: `index.html`

**Interfaces:**
- Consumes: `window.heroLayout`, `heroOrientation()`, the `hero-layout` event, `div.hero-stage`, asset files.
- Produces: `export async function mountHero(stage: HTMLElement, layout: object, opts: { orientation: () => "landscape"|"portrait" }): Promise<HeroHandle>` where `HeroHandle = { canvas: HTMLCanvasElement, pieces: Record<string, THREE.Object3D>, camera: THREE.PerspectiveCamera, setOrientation(o), render(), start(), stop(), dispose() }`. Rejects on any load or WebGL failure. Task 8 adds behaviour on top of this handle inside `hero.js`.
- Produces (site.html): `window.heroLive` set to the handle once mounted, `null` otherwise; `section.hero` gets class `live` after the first frame is drawn.

Decisions:
- Importmap in `site.html` above `<header>`: `"three"` → `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`, `"three/addons/"` → `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/`. `hero.js` imports `GLTFLoader` and `MeshoptDecoder` from `three/addons/`.
- Loader gate, in the inline script. Mount only if all hold: not `reduced`; a WebGL2 context can be created on a scratch canvas; not weak (`weak = (matchMedia("(pointer:coarse)").matches && Math.min(screen.width, screen.height) < 768) || navigator.deviceMemory < 4 || navigator.hardwareConcurrency < 4`); `window.heroLayout` is set. Then wait for `load` plus `requestIdleCallback` (fallback `setTimeout 300`), and for the hero to be within one viewport of the screen (IntersectionObserver, `rootMargin:"100% 0px"`), then `import("./hero.js")`. Any rejection: `console.warn` once, leave the poster.
- Renderer: `antialias:true`, `alpha:false`, clear colour `#0C0C0E`, `outputColorSpace = SRGBColorSpace`, pixel ratio `min(devicePixelRatio, 2)`, canvas appended to `.hero-stage`, `aria-hidden="true"`.
- Materials: one `ShaderMaterial` type for pieces and plinths: `baked.rgb + matcap(viewNormal).rgb * uSheen` (`uSheen` 0.35 pale, 0.6 for `pearl`), plus `uLift` (brightness multiplier, default 1). Board: a quad at y=0 sized from `layout.board`, `MeshBasicMaterial` with `board.webp`. No lights in the scene.
- Camera: from `layout[orientation].camera`. To match the poster's `object-fit: cover`: if viewport aspect ≥ layout aspect, keep the horizontal field of view (`fovY = 2·atan(tan(fovY₀/2)·aspect₀/aspect)`); otherwise keep `fovY₀`.
- Depth of field: render the scene to a half-resolution `WebGLRenderTarget` with a `DepthTexture`, then one full-screen pass that blurs by circle of confusion from linearised depth around `uFocus` (distance from camera to the focus piece), 8 taps on a disc, max radius about 10 px at full resolution. Full-resolution sharp render for fragments inside the focal band is not required; half-res overall is acceptable if the focus piece looks crisp at pixel ratio 2, otherwise render sharp at full res and composite blur over it by CoC.
- Fade: when textures and GLB are ready, draw one frame, add `live` to the section; CSS cross-fades `.hero-stage` from opacity 0 to 1 over 900 ms above the poster. The poster stays in the DOM beneath.
- Slow-device exit: measure the first 60 frames after start; if mean frame time > 28 ms, `dispose()`, remove `live`, set `window.heroLive = null`.
- Context loss: on `webglcontextlost`, do the same exit.
- `dispose()` removes the canvas, disposes geometries, materials, textures and render targets, and removes all listeners `hero.js` added.

- [ ] **Step 1: Extend `scripts/check-site.mjs`:** an importmap script exists before `<header` and maps `three` to a URL matching `cdn\.jsdelivr\.net/npm/three@\d+\.\d+\.\d+/`; `site.html` contains `import("./hero.js")` and no static `<script type="module" src`; `hero.js` exists and contains `export async function mountHero`.
- [ ] **Step 2: Run it.** `node scripts/check-site.mjs --all` → `FAIL` on the three new assertions.
- [ ] **Step 3: Write `hero.js`** (`mountHero`, static scene, DOF pass, orientation, dispose) and the loader gate in `site.html`.
- [ ] **Step 4: Build and check.** `./build.sh && node scripts/check-site.mjs --all` → all `PASS`.
- [ ] **Step 5: Verify in the preview.**
  - Desktop size: after load, `document.querySelector(".hero").classList.contains("live")` is true, `Object.keys(window.heroLive.pieces).length === 6`, console clean.
  - Screenshot before and after the fade: pieces sit within a few pixels of their poster positions (compare each `piece` projected centre with `heroLayout.landscape.pieces[id]` through `heroCover`; tolerance 2% of hero width).
  - Network: every `assets/hero/*` request is 200; total transferred for `assets/hero/` ≤ 2.5 MB.
  - Review Focus 1: temporarily rename `assets/hero/pieces.glb`, reload: no `live` class, poster and six links intact, exactly one console warning. Restore the file.
  - Review Focus 2: resize from 1280×800 to 600×900 without reload: `window.heroLive.camera.fov` changes to the portrait camera's value and the links re-place.
  - Review Focus 3: `window.heroLive.canvas.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()`: canvas is removed, `live` class gone, links still navigate.
  - Review Focus 4: load `http://localhost:4173/#contact`: no request to `three@` or `pieces.glb` until scrolling back to within one viewport of the top.
  - Reduced motion (`resize_window` cannot set it; run `matchMedia` override by loading with the OS setting, or temporarily force `reduced = true` in the console build): no Three.js request.
- [ ] **Step 6: Commit.**

```bash
git add hero.js site.html index.html scripts/check-site.mjs
git commit -m "feat(hero): live three.js scene over the poster with fallbacks"
```

---

### Task 8: Behaviour

**Files:**
- Modify: `hero.js`, `site.html` (hover label wiring, scroll-out tween)
- Regenerate: `index.html`

**Interfaces:**
- Consumes: `HeroHandle` from Task 7, `nav.hero-pieces a[data-piece]`, `span.hero-label`.
- Produces: `HeroHandle` gains `setHover(id: string | null)` and `setScroll(p: number)` (0 = hero fully in view, 1 = hero scrolled out). `mountHero` `opts` gains `onPick(id: string)` and `onHover(id: string | null, screenX: number, screenY: number)`.

Decisions:
- Loop: one `requestAnimationFrame` loop inside `hero.js`. Runs only while the hero intersects the viewport and `!document.hidden`; `stop()` otherwise. Time-based, not frame-based.
- Drift: pointer position over the hero, normalised to −1..1, moves the camera on a small arc around its target: ±2.5° yaw, ±1° pitch, eased with a 0.06 lerp per frame at 60 fps (make it frame-rate independent). On coarse pointers, no drift.
- Idle: each piece yaws ±2° on its own period (11–19 s, different per piece, sine). Three haze sprites (`haze.webp`, additive-free normal blending, opacity ≤ 0.12, tinted `#ECE7DC`) between camera and far pieces drift sideways on 40–70 s periods.
- Picking: raycast pointer against six invisible boxes (piece + plinth bounds), not the meshes.
- Hover: `setHover(id)` tweens that piece's y by +0.06 m and `uLift` to 1.25 over 350 ms, and tweens `uFocus` to that piece's camera distance over 600 ms (a focus pull). `setHover(null)` reverses all three and returns focus to `layout.focusId`. Calls `onHover` so `site.html` puts the display name in `.hero-label` at the piece's top; cursor `pointer`.
- The DOM links stay in place under the canvas for keyboard users: focusing a link calls `setHover(id)`, blur calls `setHover(null)`. While `live`, the canvas takes pointer events and the links take none.
- Click (fine pointer): `onPick(id)` → `site.html` scrolls to `#proj-<id>` with the page's existing smooth-scroll behaviour.
- Touch: a tap (pointerdown→pointerup under 300 ms and under 10 px of travel) on a piece that is not hovered calls `setHover(id)`; a tap on the hovered piece calls `onPick(id)`; a tap elsewhere, or 4 s without a tap, calls `setHover(null)`. Canvas has `touch-action: pan-y` so vertical scroll always works.
- Scroll-out: `site.html` drives `setScroll(p)` from a ScrollTrigger on `.hero` (`start:"top top"`, `end:"bottom top"`, scrub). `setScroll` lowers the camera by `0.5·p` m and tilts it up slightly; CSS/GSAP fades `.hero-stage` and the poster to opacity `1 − p`. Without GSAP, an IntersectionObserver only starts and stops the loop.
- `pointerleave` on the canvas, `blur` on the window, and the start of any scroll (`scroll` event while a touch label is showing) call `setHover(null)`.

- [ ] **Step 1: Implement drift, idle motion, haze and the visibility-gated loop.**
- [ ] **Step 2: Implement picking, `setHover`, focus pull, label, click and touch rules.**
- [ ] **Step 3: Implement `setScroll` and wire ScrollTrigger.**
- [ ] **Step 4: Build and check.** `./build.sh && node scripts/check-site.mjs --all && node scripts/check-hero-assets.mjs` → all `PASS`.
- [ ] **Step 5: Verify in the preview.**
  - Hover each of the six pieces (move the pointer to its link-box centre): `.hero-label` text equals that piece's display name; a screenshot shows it lifted and in focus while `pearl` softens.
  - Click each piece: `location.hash`/scroll position lands on `#proj-<id>` for all six.
  - Scroll to the Work chapter, then check the loop has stopped: sample `window.heroLive.renderer?.info.render.frame` (expose `frameCount` on the handle for this) twice 500 ms apart; values equal. Scroll back; it advances.
  - Review Focus 5: hover a piece, then dispatch `pointerleave` on the canvas: label empty, piece y back to 0 within 400 ms. At 375×812 with the weak-device gate bypassed (`localStorage.heroForce = "1"`, honoured only on `localhost`): tap a piece → label shows, no scroll; swipe vertically starting on a piece → page scrolls, label clears, no navigation; second tap on the same piece → navigates.
  - Performance: with the hero in view at 1440×900, mean frame time over 300 frames ≤ 16.7 ms on this Mac (expose via `performance.now()` sampling in the console).
- [ ] **Step 6: Commit.**

```bash
git add hero.js site.html index.html
git commit -m "feat(hero): drift, hover focus pull, click-to-chapter and scroll-out"
```

---

### Task 9: Docs and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`.**
  - Files table: add `hero.js`, `assets/hero/`, `blender/`, `scripts/check-hero-assets.mjs`; change `index.html` from "One file, zero dependencies" to say it depends on `hero.js` and `assets/hero/`.
  - Workflow: republish the artifact passing `research.html`, `research-model.js`, `hero.js` and every file in `assets/hero/` as `files`; deploy those with `index.html`. Note the artifact may show the poster only, which is accepted.
  - Structure (v6): hero is the chessboard; the hero rAF now lives in `hero.js`; list the fallback conditions; `node scripts/check-hero-assets.mjs` joins the pre-commit checks.
  - Design system: Anton removed; add the Blender rebuild command.
  - History: the giant-name hero (branch `hero-name`) was replaced by the chessboard hero on 2026-11-23.
  - Projects table: add each project's piece.
  - Known weaknesses: replace the stale lines with what Step 2 actually finds.
- [ ] **Step 2: Full pass in the preview**, against the spec's Verification section: console clean; assets within budget; six hovers and clicks; reduced-motion shows poster with title and links; forced WebGL failure shows poster; 375×812 has no horizontal scroll and a readable title; a screenshot beside the reference still for mood. Record anything that falls short in `CLAUDE.md` "Known weaknesses" rather than leaving it unsaid.
- [ ] **Step 3: Try the artifact path** only if Farhad asks for the artifact to be republished; publishing is his call.
- [ ] **Step 4: Run all checks and commit.**

```bash
./build.sh && node scripts/check-site.mjs --all && node scripts/check-hero-assets.mjs
git add CLAUDE.md index.html
git commit -m "docs: chessboard hero in CLAUDE.md"
```

- [ ] **Step 5: Hand back to Farhad** with screenshots (desktop, portrait, hover state). Merging to `main` and pushing are his decisions.
