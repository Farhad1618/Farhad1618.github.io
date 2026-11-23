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
| `assets/hero/` | Baked hero assets: two posters, `pieces.glb`, `board.webp`, `matcap.webp`, `haze.webp`, `layout.json` (cameras + piece screen boxes). About 1.1 MB. Generated; do not hand-edit. |
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

- Pieces: Cyrus = the Cyrus Cylinder, Zagros = hex vault with five keys (three turned), OnePharma = graph lattice, Black Pearl = a dark milled block holding an open ivory shell with a black pearl (centre), Falah = balance scale tilted, left pan down, Network Intrusion Detection = watchtower.
- The poster (`poster.webp`, or `poster-portrait.webp` under `(orientation: portrait)`) is the first paint and the fallback. It always fits the width, so no piece is cropped.
- Six `a[data-piece]` links in `nav.hero-pieces` are placed over the pieces from `layout.json`. They are the keyboard and screen-reader route and the tap targets when only the poster shows. Each goes to `#proj-<id>`.
- `hero.js` mounts over the poster only when: motion is allowed, WebGL2 exists, the device is not weak (coarse pointer under 768 px, under 4 GB or 4 cores), and the hero is within one viewport. It falls back to the poster on load failure, context loss, or if six timed frames at mount average over 20 ms (measured 3.5 ms at 2160×1215 on an M1 Pro). `localStorage.heroForce = "1"` bypasses the weak-device test on localhost only.
- Nothing is lit in the browser: baked colour + matcap sheen, one baked board texture, one depth-of-field pass. Hover lifts a piece and pulls focus to it; click (or second tap) scrolls to its chapter.
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
- Hero GPU cost was measured (3.5 ms a frame on an M1 Pro) but on-screen smoothness was not watched: the preview pane throttles hidden tabs. Check it by eye in a real browser.
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
