# Ayvan — Farhad Maleki's portfolio

Personal portfolio for Farhad Maleki, AI & Agentic Systems Engineer (CTO, OnePharma, Dubai).
Goal: win clients and employers. Inspired by camillemormal.com (studied it directly — see "Reference" below).

Live preview (v6 story, Claude artifact, private until shared): https://claude.ai/artifact/5Ebg4aXP3fwZxvheKuLeRY
Repo: github.com/Farhad1618/Farhad1618.github.io. GitHub Pages serves `main`, so a push to main is live.

## History

- v5 "Farsh" (Three.js Persian-tile scroll film) was live Oct 21 – Nov 16, 2026. Archived at `archive/farsh/` (its own `site.html`, `index.html` and `build.sh`, which splits at a `<!-- body -->` marker).
- A separate v4 (GSAP + raw WebGL) is archived at `archive/v4/`. Design concepts live in `concepts/` (a-girih, b-index, c-cortex, d-farsh, e-hook).
- v3 viewer (GSAP + OGL fixed viewer) archived at `archive/v3-viewer/` on Nov 17, 2026. It was the live build Nov 16-17, 2026.
- The giant-name hero (branch `hero-name`) was replaced by the chessboard hero on Nov 23, 2026 (branch `chessboard-hero`).
- Current build is the v6 story page (one scrolling page, see "Structure (v6, current)"), plus the research case study.

## Files

| File | Role |
|---|---|
| `site.html` | **Source of truth.** Body-only HTML (no doctype/head/body) so it can be published as a Claude artifact directly. |
| `build.sh` | Wraps `site.html` into `index.html` with doctype, meta, OG tags, favicon. Run after every edit. |
| `index.html` | Deployable build. Never edit by hand. Needs `hero.js` and `assets/hero/` beside it. |
| `hero.js` | The live chessboard hero (Three.js 0.170.0, ES module, lazy-loaded). One export: `mountHero`. |
| `assets/hero/` | Baked hero assets: two posters, `pieces.glb` (six pieces, plinths and the board), `matcap.webp`, `layout.json` (cameras + piece screen boxes). About 1.1 MB. Generated; do not hand-edit. |
| `blender/` | `build_hero.py` + `hero/` modules that build the pieces, render the posters and bake everything in `assets/hero/`. |
| `scripts/check-hero-assets.mjs` | Asset contract and size budget (2.5 MB total, 150 KB per poster, 15k triangles per piece). |
| `research.html` | Standalone case study for the botnet paper (scrolling page, GSAP + ScrollTrigger). Full HTML doc; published as an artifact supporting file. Linked from project 06 and the About research row. |
| `research-model.js` | The NSL-KDD notebook CNN-RNN retrained (seed 42, all of KDDTrain+), float16 weights + plain-JS forward pass, 48 stratified KDDTest+ samples. Verdicts match Keras on all 22,544 test rows. Lazy-loaded by `research.html`. |
| `archive/v1-scroll.html` | v1: long scrolling page with hero knowledge graph. Superseded; kept for reference. |

Workflow: edit `site.html` → `./build.sh` → republish the artifact from `site.html`, passing `research.html`, `research-model.js`, `hero.js` and every file in `assets/hero/` as `files`. Deploy all of those plus `index.html`. If the artifact cannot fetch the binary assets it shows the poster only, which is accepted; GitHub Pages is the target.

Rebuild hero assets (about 10 minutes, needs Blender, `cwebp` and `npx`):
`blender --background --factory-startup --python blender/build_hero.py -- --stage all` (`--stage pieces` renders a clay contact sheet to `blender/out/`; `--draft` is fast and rough).
Fonts load from Google Fonts; everything else is inline.

## Concept

The CV's own line is the thesis: *"Most systems remember. I build systems that understand."*
Farhad's work (ontologies, graphs, governance layers) is not photographable, so instead of photos
each project's full-bleed plate is a **live generative Canvas 2D scene drawn in that project's own language**.
Never use stock imagery or abstract decoration. Every visual must be true to the work.

## Reference: camillemormal.com (inspected, not guessed)

- `document.body.scrollHeight === 0`. **No page scroll.** Fixed viewport, WebGL canvas full-bleed.
- Wheel/drag switches projects. Transition = plate **shrinks to an inset card → swaps → grows back** to full-bleed.
- Title centered, slides horizontally in the travel direction. `+` markers left/right = prev/next.
- Pagination `#h-pgn`: a digit column that rolls vertically, a `—` that scaleX-animates, and the total.
- Thumbnail filmstrip at the bottom. Percentage preloader.

## Design system

Committed dark, single theme (deliberate, not an omission).

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0C0C0E` | Ground. Near-black, per Farhad's request (was navy `#0A111A` in v1/v2). |
| `--ink-2` | `#18181C` | Lifted panels inside scenes |
| `--rule` / `--rule-soft` | `#26262A` / `#1B1B1E` | Hairlines |
| `--bone` | `#ECE7DC` | Primary text (warm titanium) |
| `--dim` / `--muted` | `#A8A49C` / `#716E68` | Secondary / tertiary. Warm-biased to sit with amber. |
| `--sig` | `#E9A03B` | Sodium amber. The only accent. |
| `--trace` | `#5FA8B8` | Mineral teal. Reserved for data (graph edges, packets, traces). |

The JS `C` palette object mirrors these and must stay in sync with `:root`.

Type: **Bodoni Moda** (display: hero title, project titles, ledes), **Archivo** (body), **IBM Plex Mono** (labels, metrics, node names, uppercase + tracking).
Avoid: Inter/Space Grotesk, purple gradients, emoji, badge soup, cards-everywhere.

## Structure (v6, current)

One scrolling story page in `site.html`. Six chapters:

1. Hero: a dark marble chessboard, one piece per project (see "Hero" below)
2. Who (01)
3. What drives me (02)
4. Work (03): six `.proj` chapters, one per project
5. Research (04)
6. Contact (05)

Key facts:
- One shared rAF drives all project plates; the hero has its own rAF inside `hero.js`.
- GSAP + ScrollTrigger reveals are gated by `html.motion`.
- `BOOKING_URL` (JS constant). Empty means the "Book a time" button is hidden.
- Photo slot: `data-photo` on `figure.photo`. Empty means the FM monogram shows.
- `node scripts/check-site.mjs --all` is the content/rules check and `node scripts/check-hero-assets.mjs` the asset check. Run both with `./build.sh` before committing.
- Local preview: the `portfolio` server in `.claude/launch.json` (node static server).

## Hero (chessboard)

Design: `docs/superpowers/specs/2026-11-23-chessboard-hero-design.md`. Mood reference is someone else's still, kept local and git-excluded; never commit it.

- Pieces: Cyrus = the Cyrus Cylinder, worn and broken at one end, in the centre (focus); Zagros = hex vault with five keys (three turned); OnePharma = graph lattice; Black Pearl = a dark milled block holding an open ivory shell with a black pearl; Falah = balance scale, tilted, coins on the low pan; Network Intrusion Detection = a round shield that has taken three arrows. The ivory is aged on purpose (grime, pitting, cracks). Farhad wants each piece to carry a story, not look clean.
- The board is blocks of stone at uneven heights (`build_board` in `blender/hero/scene.py`); each piece stands on the centre of one raised tile, or astride two (`PLACEMENT`, `PLATFORM`, `REACH`; Farhad: one tile rises on hover, two at most, never four). Tile heights step up to 0.44 so the levels throw shadows. The look is near-black with a hint of deep blue (Nov 24: Farhad asked for a dark blue feel; earlier he found a strong blue too much, so keep it a hint). In `hero.js` that is the fog colours (`LIGHT_COL`, `FOG_AMB`, `HAZE`) and a last grade (`heroLive.fxaa.uTint`, `uShadow`) that leaves the lit ivory alone. The fog has a shoulder (`heroLive.fog.uKnee`) so a bank crossing the light never burns to a white patch that travels: Farhad found that very bad. Block sides are drawn matte in `BOARD_FS`, not from the bake (their texture cells bled and read as glass), and the tops lose most of the baked grey mirror sheen (`heroLive.board.uMatte`); `uMatte` is 0 since the Nov 24 rebakes (the glass he meant was the mount, not the tiles). The fog is thick and frays at the edges (a third, finer noise layer, `FOG_FS` "wisps"); Farhad asked for it stronger and slowly passing. It lies mostly behind the pieces so the foreground keeps its blacks and the tile designs show. The march is equiangular (steps crowd where the ray passes the light) and its jitter is held still in time (`uJitT` 0): moving jitter read as rain in the bright fog under the cylinder. The bakes keep Blender's fog in (`bake_and_export`), because its scattered light is what lights the marble fronts; the tile inlay has a faint emission so designs read off the lit tiles. Polished marble (plinths, mount, the pearl's block: roughness about 0.2 with a clear coat, live `uSheen` 0.16) takes the light differently from satin ivory (0.06) and matte clay (0.03).
- One light only, hidden right behind the Cyrus Cylinder at the barrel's height (Farhad's call, after a reference still): the cylinder stands dark with a lit outline, rays fan through the fog, the sides fall to blue-black. No spots, no fill.
- Fog is low, patchy banks: a noise-driven volume in Blender, and in `hero.js` a live volume marched every frame (`FOG_FS`, at 1/`FOG_DIV` = a third of the size) lit by the same point light (`LIGHT`). The shafts come from the march itself: every step tests the way to the light against the six pieces (`lightVis`: a soft upright footprint of each piece's bounding box, up to its top), so a piece darkens only the fog between it and the camera on the far side from the light, never the fog beside, behind or above it. The old screen-space shaft pass is gone: it counted the near board as a blocker and blacked out all foreground fog. Fog in a piece's shadow is near black, as in Blender (ambient `FOG_AMB` is tiny; `uShadowFloor` 0.02 of the light gets through). The banks drift and churn slowly (broad and fine noise move in different directions, the fine one warped by the broad one); `heroLive.fog.uDrift` scales the speed. Don't go back to a flat pre-rendered fog image: Farhad found it read as a picture with pieces popping out. Bloom as in the posters (`output.py` `_glow`): above 0.38 bleeds out, a wide glow (sigma h/60, at an eighth of the size, weight 0.85) and a tight one (about h/300, a quarter of the size, 0.35), added in the last pass. Tune live through `window.heroLive.fog`, `.post`, `.fxaa` (also `uWideK`, `uTightK`) and `.bright` (`uThresh`). The backing buffer is capped at 3.0 MP (`MAX_PIXELS`) as well as by pixel ratio, because every pass but the scene scales with pixels: before the cap a 4K screen at DPR 1.5 would have cost about 26 ms and failed the mount test even on an M1 Pro.
- Smooth outlines: the scene renders with 4x MSAA. Each fog texel marches to the depth of one exact full-size pixel, and the composite upsamples the fog depth-aware (4x4 texels weighted by distance and depth likeness, nearest-depth fallback), so fog never bleeds blocks across a silhouette. Depth of field: where a blurred background pixel touches a nearer, sharper piece, it blurs at full strength and the piece's share of the pixel (estimated from the two neighbours across the edge) is laid back on top, so the MSAA edge survives with no sharp ring. The fog upsample takes 3x3 texels and works out each texel's position from the pixel index, so it lines up at any buffer size. A last FXAA pass (`FXAA_FS`, then bloom and dither) smooths what the single-sample depth puts back. Without half-float targets the frame buffer is 8-bit, so `POST_FS` dithers too (`DITHER_POST`).
- Materials differ on purpose: Cyrus is fired clay with uneven lengthwise lines of writing (a shader bump, `clay_lines`) on an opaque veined marble mount. Mounts, plinths and the pearl's block are marble, not translucent or glossy: Farhad found the old alabaster mount read as crystal (Nov 24). The ivory keeps only a little translucency (`sss` 0.14).
- The poster (`poster.webp`, or `poster-portrait.webp` under `(orientation: portrait)`) is only the fallback. A script before `<header>` runs the same device test as `boot()` before first paint: where the live scene will be tried it sets `html.hero-wait`, which hides the poster, so the hero starts dark and the scene fades in (`.hero-stage` transition). `heroPosterBack()` shows the poster again on any failure (load, context loss, too slow, no layout), after 6 s from first paint if the mount has not started, and 8 s after the mount starts if it is still not up. That script sits first in the page, right after the import map and before the font stylesheet, and on those devices it preloads `hero.js`, three.js, GLTFLoader, the meshopt decoder and `pieces.glb`, so they are fetched ahead of the hidden poster. `boot()` starts on `layout.json`, not on window `load`. The poster `<img>` carries no `fetchpriority`; on devices that never try the scene the same script adds `<link rel=preload as=image fetchpriority=high>` for the poster that fits the orientation, so it is still their fast first paint, while on the others the hidden poster does not compete with three.js and `pieces.glb`. Devices that never try (reduced motion, weak, no WebGL2) see the poster from first paint. It always fits the width, so no piece is cropped.
- Six `a[data-piece]` links in `nav.hero-pieces` are placed over the pieces from `layout.json`. They are the keyboard and screen-reader route and the tap targets when only the poster shows. Each goes to `#proj-<id>`.
- `hero.js` mounts only when: motion is allowed, WebGL2 exists, the device is not weak (coarse pointer under 768 px, under 4 GB or 4 cores), and the hero is within one viewport. It falls back to the poster on load failure, context loss, or if six timed frames at mount average over 20 ms. Frame cost (Nov 24, M1 Pro, Chrome, forced by a 1-pixel readPixels, all passes incl. bloom and FXAA): 5.6 ms at 2160x1350, 6.3 ms at the 3.0 MP cap (2309x1299, what a 1920x1080 or larger window at DPR 1.5 gets), 3.4 ms at 1536x1152. Every pass but the scene scales with pixels, so if `MAX_PIXELS` is raised, re-measure. `localStorage.heroForce = "1"` bypasses the weak-device test on localhost only.
- Nothing is lit in the browser. The pieces, plinths and board are baked in Blender from the camera's view, so shadows, sheen and the glow of thin alabaster and ivory are in the textures; the matcap adds only a faint glint (`uSheen` 0.06 on every piece, the pearl included: its gloss is baked) and the texture is used as is (no gain). The light is fixed and the camera does not follow the pointer. Hover (Nov 24, Farhad's call, replacing the earlier "hover only shows the label"): the piece rises `LIFT` (0.16) with its plinth and the tiles under it (`aLift` on the board; only the tiles' top corners move, so the sides stretch and nothing opens beneath), and the focus eases to that piece, back to Cyrus when nothing is hovered. Click (or second tap) scrolls to its chapter. Only scrolling the hero away moves the camera. The idle sway is 1 degree.
- Bakes are made from the landscape camera only. Live portrait (tablets of 768 px or wider, portrait desktop windows) uses the portrait camera, so its view-dependent highlights are slightly off from the portrait poster. Faces turned to the light clip to white in the piece bakes (see `blender/out/piece-cyrus.png`). Fixing either needs a rebake (a portrait texture set, or a highlight roll-off before 1.0 for the piece bakes); not done yet.
- Colours are raw display values end to end in `hero.js` (textures `NoColorSpace`, linear output). Don't "fix" the colour management.

## Projects (display name → real name / repo)

Farhad renamed projects for the site. Use the display names in all visible copy.

| # | Display | Was | GitHub repo | Scene |
|---|---|---|---|---|
| 01 | **Cyrus** | Onyxs | `Farhad1618/onyxs` | Bilingual AR/EN document field resolving into classification bands under an amber scan line; hash chain along the base |
| 02 | **Zagros** | SR-71 Blackbird | `Farhad1618/SR-71-BLACKBIRD` | Genesis ceremony: 5 constitutional keys, 3 turned, charges into a sealed hex core, radar sweep |
| 03 | OnePharma | — | `Farhad1618/onepharma` | Force-directed knowledge graph of the real ontology (36 nodes, ~60 edges), query pulses on edges |
| 04 | Black Pearl | — | `Farhad1618/black-pearl` | Three oscilloscope traces + CNC toolpath drawing itself, X/Y/Z mm readouts |
| 05 | **Falah** | Purple Finance | `Farhad1618/Falah` | Spend vs dashed budget target; Feb breaks it and flares amber; income particles |
| 06 | Network Intrusion Detection | — | `Farhad1618/Network-Intrusion-Detection-CNN` (NSL-KDD half only; no N-BaIoT code) | Packets through CONV / RNN / DENSE gates; bad packets flare amber into the BOTNET tray, the rest go to BENIGN |

Internal graph node ids still use `onyxs` / `sr71` / `purple`, and `torch` now carries the label TensorFlow. Only labels changed. Don't "fix" them without updating `GE`.

All copy comes from Farhad's CV (`FindJob/Farhad_Maleki_CV.pdf` on his Mac, not in this repo), except the paper details below, which override it.

Paper: "Deep Learning for Preventing Botnet Attacks on IoT", NEW2AN / ruSMART 2023, Springer LNCS, pp. 37-46, DOI `10.1007/978-3-031-60994-7_4`. Not ICNGN. Quote 99.34% only with "N-BaIoT, TCP removed"; 98.23% is NSL-KDD. The CV's 97% has no known source, so don't use it. The notebook is Keras/TensorFlow, not PyTorch.
Contact: farhad.maleki1618@outlook.com · +971 58 558 1618 · github.com/Farhad1618 · linkedin.com/in/farhad-maleki

## Known weaknesses (why the next step matters)

- Preview harness can't drive keyboard/scroll in the `data:` frame. Verify scroll reveals by hand.
- Mobile layout untested at depth. Phones get the still poster by design; the live scene on touch was only exercised with synthetic events.
- Hero GPU cost was measured (5.6 ms a frame at 2160x1350 on an M1 Pro, Nov 24) but on-screen smoothness was not watched: the preview pane throttles hidden tabs. Check it by eye in a real browser.
- The live hero in the Claude artifact is untested (binary supporting files).
- The pieces are script-built. If one reads as a tech demo, hand-finish it in Blender and re-run `--stage all`.

## Roadmap (agreed direction)

Stack decision: **GSAP + OGL, no framework.** Next.js was rejected: animation code fights React's render cycle, and Farhad's projects already prove React.

1. **GSAP rebuild (DONE; v3, archived: this describes v3 code no longer in site.html; GSAP 3.13.0 + SplitText from cdnjs).** `go()` builds one interruptible `gsap.timeline()` (kills the previous, no `busy` lock; `target` tracks destination, `cur` changes only at the `swap` label). SplitText per-character title reveals. Scene loop pauses on `visibilitychange`. Remaining: verify by hand with real wheel/drag, mobile. GSAP is free including former Club plugins (verify terms before client work).
2. **OGL shader transitions (DONE, but not used in v6; the code lives in `archive/v3-viewer/`).** OGL 1.0.11 has no UMD build; it loads as ESM from `cdn.jsdelivr.net/npm/ogl@1.0.11/+esm` via a trailing `<script type="module">` that sets `window.__OGL` and fires `ogl-ready`. `go()` freezes the on-screen frame (scene, or the half-finished transition canvas `#fx`) into offscreen canvas `offA`, renders only the incoming scene live into `offB`, and blends them in `FX_FS` (noise-edge wipe, displacement, RGB split). `#fx` is `display:none` outside transitions. Falls back to the plate shrink/fade if OGL fails to load, WebGL is missing, or reduced-motion is set. Tune the look in `FX_FS` and the `p` tween in `go()`.
3. Move to **Vite + TypeScript**, static build, deploy to Vercel or Cloudflare Pages on Farhad's domain. Keep producing a single-file build for the artifact preview.

Artifact CSP: scripts only from cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, cdn.tailwindcss.com, code.jquery.com. GSAP and OGL are on those.

## Copy facts confirmed by Farhad (Oct 20, 2026)

- Falah: Supabase backend (follow the code), not live on the App Store yet.
- Cyrus: Palantir Foundry-style ontology platform for any industry, first modelled on pharma, no real users yet. Describe the hard problem and how it solves it, not pipeline internals.
- Zagros: private repo, enterprise governance/auth. No Apache 2.0, no public source link.

## Content Farhad still owes

- Origin story.
- The moments he wants in his own words.
- Photos (portrait first).
- A booking URL (`BOOKING_URL`).

## Open questions for Farhad

- Should Black Pearl and OnePharma also get Persian-rooted display names for consistency?
- Are any real product screenshots NDA-safe to show (Cyrus, OnePharma)?
- Domain name for deployment.
