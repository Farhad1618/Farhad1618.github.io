# Ayvan — Farhad Maleki's portfolio

Personal portfolio for Farhad Maleki, AI & Agentic Systems Engineer (CTO, OnePharma, Dubai).
Goal: win clients and employers. Inspired by camillemormal.com (studied it directly — see "Reference" below).

Live preview of v4 (Claude artifact, private until shared): https://claude.ai/artifact/5rwmSVjGjYqqRrsiqyCY9h
v3 preview, kept for comparison: https://claude.ai/artifact/2TVyGhJNC1EnD3yGFmDyBP
Repo: github.com/Farhad1618/Farhad1618.github.io. GitHub Pages serves `main`, so a push to main is live.

## v5 "Farsh" (live since Oct 21, 2026)

Farhad rejected v4 and three concepts (in `concepts/`), then approved **Farsh** (carpet), built from their references: Persian tiles and carpets, dark multi-colour glazes, one continuous 3D film, big message text.

- `site.html` is now Farsh (body-only, `<!-- body -->` marker after the style block); `./build.sh` makes `index.html`. Source preview also at `concepts/d-farsh.html`.
- Three.js r149 from jsdelivr (`three.min.js` UMD). No GSAP. Scroll progress over a 1300vh spacer drives keyframes `K` (tile layout, camera, background).
- ~900 tiles as one InstancedMesh per design; each design is a rosette drawn on a canvas by `tile()`. Layouts in `L`: carpet, fly, net, gone, ring (Zagros 3-of-5), bars (Falah). Cyrus scene is a Lathe "Cyrus Cylinder" with a canvas cuneiform texture.
- Text acts are `.act` sections with `data-a`/`data-b` progress ranges.
- v4 is kept at `/archive/v4/` (its own `index.html` + `site.html`). The v4 notes below describe that archived build.
- Farhad wants to work on another version later.

## Files (v4, archived)

| File | Role |
|---|---|
| `site.html` | **Source of truth.** Body-only HTML (no doctype/head/body) so it can be published as a Claude artifact directly. |
| `build.sh` | Wraps `site.html` into `index.html` with doctype, meta, OG tags, favicon. Splits head/body at the `<!-- body -->` marker line in `site.html`. Run after every edit. |
| `index.html` | Deployable standalone build. One file, zero dependencies. Never edit by hand. |
| `archive/v1-scroll.html` | v1: long scrolling page with hero knowledge graph. Superseded; kept for reference. |

Workflow: edit `site.html` → `./build.sh` → republish the artifact from `site.html`.
Fonts load from Google Fonts, GSAP 3.13.0 core from cdnjs; everything else is inline.

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

Type: **Bodoni Moda** (display: project titles, ledes), **Archivo** (body), **IBM Plex Mono** (labels, metrics, node names, uppercase + tracking).
Avoid: Inter/Space Grotesk, purple gradients, emoji, badge soup, cards-everywhere.

## Structure (v4, current)

- Preloader `000→100` (GSAP counter, waits ≤2.5s for fonts), then an intro timeline: plate opens from an inset card, title chars rise, chrome fades in. Any input fast-forwards.
- Stage: `#plate` (2D canvas `#art`, WebGL canvas `#gl`, vignette), `#titles` (slides, h2 split into word > mask > char spans by a small in-file splitter, no SplitText dependency), `#pgn`, `#strip`, `+` nav, Dubai GST clock.
- Transition `go()`: one `gsap.timeline()` per move. Plate shrinks to a card and grows back; meanwhile both scenes render into CSS-pixel offscreen buffers, upload as textures, and a fragment shader does an fbm-noise wavefront wipe with displacement, RGB shift and an amber seam. GL is shown only during transitions. No WebGL or reduced motion: crossfade.
- Interruptible: input during a transition queues the newest target and speeds the running timeline up (timeScale 2.4); it chains on completion. No `busy` lock.
- Wheel: steps on a fresh gesture (gap >180ms or a delta that jumps up); trackpad inertia tails are ignored, a sustained strong stream re-steps after 750ms.
- Render loop is on `gsap.ticker`, removed on `visibilitychange` hidden, and draws nothing while About covers the stage.
- Detail sheet has a live banner of the project's scene (the loop draws there instead of the stage while it's open). Sheets open with a clip-path wipe; the stage scales back behind them. Prev/next inside the sheet swaps content in place. Focus moves to Close and returns on close.
- Mobile: `touch-action:none` on body so swipes reach pointer handlers (sheets use `pan-y`), "Swipe to browse" hint, tighter title padding, stronger centre scrim, NIDS verdict trays clamp to the viewport.

## Projects (display name → real name / repo)

Farhad renamed projects for the site. Use the display names in all visible copy.

| # | Display | Was | GitHub repo | Scene |
|---|---|---|---|---|
| 01 | **Cyrus** | Onyxs | `Farhad1618/onyxs` | Bilingual AR/EN document field resolving into classification bands under an amber scan line; hash chain along the base |
| 02 | **Zagros** | SR-71 Blackbird | `Farhad1618/SR-71-BLACKBIRD` | Genesis ceremony: 5 constitutional keys, 3 turned, charges into a sealed hex core, radar sweep |
| 03 | OnePharma | — | `Farhad1618/onepharma` | Force-directed knowledge graph of the real ontology (36 nodes, ~60 edges), query pulses on edges |
| 04 | Black Pearl | — | `Farhad1618/black-pearl` | Three oscilloscope traces + CNC toolpath drawing itself, X/Y/Z mm readouts |
| 05 | **Falah** | Purple Finance | `Farhad1618/Falah` | Spend vs dashed budget target; Feb breaks it and flares amber; income particles |
| 06 | Network Intrusion Detection | — | — | Packets through conv gates; bad 3% flare amber into verdict trays (97% / ICNGN 2023) |

Internal graph node ids still use `onyxs` / `sr71` / `purple`. Only labels changed. Don't "fix" them without updating `GE`.

All copy comes from Farhad's CV (`FindJob/Farhad_Maleki_CV.pdf` on his Mac, not in this repo).
Contact: farhad.maleki1618@outlook.com · +971 58 558 1618 · github.com/Farhad1618 · linkedin.com/in/farhad-maleki

## Known weaknesses

- Wheel heuristics were tested with synthetic events only; tune thresholds on a real trackpad and mouse.
- Detail banner re-lays out scene caches (graph, Cyrus docs) when switching between stage and banner sizes. Cheap, but the graph re-settles.
- Zagros "SEALED" label sits under the subtitle line; Cyrus docs crowd at banner height.
- No `<noscript>` or static fallback if the GSAP CDN fails (page skips the preloader and shows nothing animated).

## Roadmap (agreed direction)

Stack decision: **GSAP + OGL, no framework.** Next.js was rejected: animation code fights React's render cycle, and Farhad's projects already prove React.

1. **GSAP rebuild (done in v4).** Replace setTimeout choreography with one interruptible `gsap.timeline()`; remove the `busy` lock. SplitText per-character title reveals. GSAP is free including former Club plugins (verify terms before client work).
2. **Shader transitions (done in v4, raw WebGL instead of OGL, ~60 lines).** Do NOT port scenes to WebGL. Render each Canvas 2D scene to an offscreen canvas → upload as texture → shader-blend outgoing/incoming (displacement / RGB shift). Shader runs only during transitions.
3. Move to **Vite + TypeScript**, static build, deploy to Vercel or Cloudflare Pages on Farhad's domain. Keep producing a single-file build for the artifact preview.

Artifact CSP: scripts only from cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, cdn.tailwindcss.com, code.jquery.com. GSAP and OGL are on those.

## Copy facts confirmed by Farhad (Oct 20, 2026)

- Falah: Supabase backend (follow the code), not live on the App Store yet.
- Cyrus: Palantir Foundry-style ontology platform for any industry, first modelled on pharma, no real users yet. Describe the hard problem and how it solves it, not pipeline internals.
- Zagros: private repo, enterprise governance/auth. No Apache 2.0, no public source link.

## Open questions for Farhad

- Should Black Pearl and OnePharma also get Persian-rooted display names for consistency?
- Are any real product screenshots NDA-safe to show (Cyrus, OnePharma)?
- Domain name for deployment.
