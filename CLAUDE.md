# Ayvan — Farhad Maleki's portfolio

Personal portfolio for Farhad Maleki, AI & Agentic Systems Engineer (CTO, OnePharma, Dubai).
Goal: win clients and employers. Inspired by camillemormal.com (studied it directly — see "Reference" below).

Live preview (Claude artifact, private until shared): https://claude.ai/artifact/2TVyGhJNC1EnD3yGFmDyBP

## Files

| File | Role |
|---|---|
| `site.html` | **Source of truth.** Body-only HTML (no doctype/head/body) so it can be published as a Claude artifact directly. |
| `build.sh` | Wraps `site.html` into `index.html` with doctype, meta, OG tags, favicon. Run after every edit. |
| `index.html` | Deployable standalone build. One file, zero dependencies. Never edit by hand. |
| `archive/v1-scroll.html` | v1: long scrolling page with hero knowledge graph. Superseded; kept for reference. |

Workflow: edit `site.html` → `./build.sh` → republish the artifact from `site.html`.
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

Type: **Bodoni Moda** (display: project titles, ledes), **Archivo** (body), **IBM Plex Mono** (labels, metrics, node names, uppercase + tracking).
Avoid: Inter/Space Grotesk, purple gradients, emoji, badge soup, cards-everywhere.

## Structure (v3, current)

- Preloader `000→100`, skipped by any input.
- Stage: `#plate` (canvas `#art` + vignette/centre scrim), `#titles` (slides), `#pgn`, `#strip` (filmstrip of real scene miniatures, text suppressed), `+` nav, Dubai GST clock.
- Input: wheel (threshold 55, 780ms lock), pointer drag/swipe, arrow keys, filmstrip, `+`.
- "Open project" → detail sheet (body, metrics, chips, links, prev/next). "About" → bio, track, research, stack, contact.

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

## Known weaknesses (why the next step matters)

- Transitions are `setTimeout` + CSS with a `busy` lock. Scrolling fast feels stuck. Not interruptible.
- Canvas 2D can't do displacement/ripple transitions; that's what makes the reference feel liquid.
- Scene rAF runs continuously, even when the tab is hidden. Pause on `visibilitychange`.
- Preview harness can't drive keyboard/scroll in the `data:` frame. Verify transitions by hand.
- Mobile layout untested at depth.

## Roadmap (agreed direction)

Stack decision: **GSAP + OGL, no framework.** Next.js was rejected: animation code fights React's render cycle, and Farhad's projects already prove React.

1. **GSAP rebuild (next).** Replace setTimeout choreography with one interruptible `gsap.timeline()`; remove the `busy` lock. SplitText per-character title reveals. GSAP is free including former Club plugins (verify terms before client work).
2. **OGL shader transitions.** Do NOT port scenes to WebGL. Render each Canvas 2D scene to an offscreen canvas → upload as texture → shader-blend outgoing/incoming (displacement / RGB shift). Shader runs only during transitions.
3. Move to **Vite + TypeScript**, static build, deploy to Vercel or Cloudflare Pages on Farhad's domain. Keep producing a single-file build for the artifact preview.

Artifact CSP: scripts only from cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, cdn.tailwindcss.com, code.jquery.com. GSAP and OGL are on those.

## Open questions for Farhad

- Should Black Pearl and OnePharma also get Persian-rooted display names for consistency?
- Are any real product screenshots NDA-safe to show (Cyrus, OnePharma)?
- Domain name for deployment.
- Zagros/Falah sub-lines ("Apache 2.0 · no external identity provider", "Live on the App Store"): still right?
