# Story Site (v6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v3 project viewer with one scrolling story page that markets Farhad first and uses the six projects as proof.

**Architecture:** `site.html` stays a single body-only file (styles + markup + one inline script), wrapped by `build.sh` into `index.html`. Six chapter canvases reuse the existing scene functions; one shared rAF loop draws only canvases on screen. GSAP + ScrollTrigger + SplitText add motion as progressive enhancement: content is fully visible if GSAP never loads.

**Tech Stack:** HTML/CSS, vanilla JS (ES5 style like today's file), GSAP 3.13.0 + ScrollTrigger + SplitText from cdnjs, Canvas 2D, Node 26 for the check script.

**Spec:** `docs/superpowers/specs/2026-11-17-story-site-design.md` (layout reference: `concepts/f-story/index.html`)

## Global Constraints

- Work on branch `v6-story`. Nothing merges to `main` until Farhad approves the artifact preview (Task 7 stops there).
- Tokens exactly: `--ink #0C0C0E`, `--ink-2 #18181C`, `--rule #26262A`, `--rule-soft #1B1B1E`, `--bone #ECE7DC`, `--dim #A8A49C`, `--muted #716E68`, `--sig #E9A03B`, `--trace #5FA8B8`. JS `C` must match.
- Fonts: Bodoni Moda (display), Archivo (body), IBM Plex Mono (labels). Google Fonts only.
- Scripts only from `cdnjs.cloudflare.com` or `cdn.jsdelivr.net/npm`. No OGL in v6.
- Display names only: Cyrus, Zagros, OnePharma, Black Pearl, Falah, Network Intrusion Detection.
- Claims are sourced only (CLAUDE.md, existing `PROJECTS` copy). No invented results. Never "97%", never "Apache", never "ICNGN", never "PyTorch". 99.34% always with "TCP removed"; 98.23% is NSL-KDD.
- No CV anywhere. Close = "Book a time" (hidden while `BOOKING_URL` is `""`) + "Email me" (`mailto:farhad.maleki1618@outlook.com`).
- Facts row label is "Featured systems", not "systems built".
- No visible placeholder text (`[Your …]`) in `site.html`. Photo slot shows the FM monogram until a photo exists.

## Review Focus

1. **GSAP CDN blocked/slow** → every section still readable. Hidden-before-reveal CSS applies only under `html.motion`, which JS adds after GSAP loads (check script + Task 6 browser test with GSAP blocked).
2. **Phone width 375px** → no horizontal scroll, plates stack above text, headlines don't overflow (Task 6: `scrollWidth === clientWidth`).
3. **`prefers-reduced-motion`** → no scroll-driven motion, scenes draw one still frame each (Task 6).
4. **Six live canvases** → only on-screen ones animate; hidden tab pauses the loop (Task 4: count draws per frame).
5. **Resize / rotate** → canvases re-fit and the graph scene re-lays out instead of collapsing (Task 4; the mockup hit this bug).

---

### Task 1: Branch, archive v3, check script, page shell

**Files:**
- Create: `archive/v3-viewer/site.html` (copy of current), `scripts/check-site.mjs`
- Modify: `site.html` (rewrite as shell)

**Interfaces:**
- Produces: `node scripts/check-site.mjs` (exit 0 = pass, prints each failed assertion). Section ids `top`, `who`, `drive`, `work`, `paper`, `contact`. CSS classes `.rv` (reveal target), `html.motion` gate. JS globals inside the IIFE: `C`, `rgba(hex,a)`, `mk(seed)`, `TAU`, `reduced`, copied verbatim from v3.

- [ ] **Step 1:** `git checkout -b v6-story && mkdir -p archive/v3-viewer && cp site.html archive/v3-viewer/site.html`
- [ ] **Step 2: Write the check script** `scripts/check-site.mjs`, reading `site.html`. Assertions (each a named check):
  - `:root` declares all nine tokens with the exact values above, and the JS `C` object has the same seven colours (`ink, ink2, bone, dim, muted, sig, trace`).
  - every `<script src>` host is `cdnjs.cloudflare.com` or `cdn.jsdelivr.net`.
  - ids `top who drive work paper contact` each appear once.
  - exactly 6 elements with `class="proj"` (fails until Task 4; mark it `pending` and skip unless `--all` passed).
  - forbidden substrings absent (case-sensitive, so internal ids like `onyxs` pass): `97%`, `Apache`, `ICNGN`, `PyTorch`, `[Your`, `CV`, `a week`, `Onyxs`, `SR-71`, `Purple Finance`.
  - every `99.34%` occurrence has `TCP removed` within 200 chars.
  - `mailto:farhad.maleki1618@outlook.com` present.
  - any CSS rule setting `opacity:0` on `.rv` is prefixed by `html.motion` / `.motion`.
- [ ] **Step 3:** Run `node scripts/check-site.mjs` against the old `site.html`. Expected: FAIL (missing `drive`, `paper` ids, etc.).
- [ ] **Step 4: Rewrite `site.html` as the shell:** fonts link, `<style>` with tokens, base, grain overlay, fixed header (name + About/Work/Research/Contact anchors), progress bar, six empty `<section>`s with the ids, footer; GSAP + ScrollTrigger + SplitText script tags (3.13.0, cdnjs); inline IIFE with palette helpers. Keep the first `<header class="topbar">` line, since `build.sh` splits head/body on it. Base visual language from the mockup.
- [ ] **Step 5:** `node scripts/check-site.mjs` → PASS (pending check skipped). `./build.sh` → `built index.html`.
- [ ] **Step 6:** Commit `chore: start v6 story page, archive v3 viewer, add site checks`.

### Task 2: Hero and Who

**Files:** Modify `site.html`, `scripts/check-site.mjs`

**Interfaces:**
- Produces: `heroField(g,w,h,t)` (node field from the mockup, cursor links), drawn on `#field`. Photo slot markup `<figure class="photo" data-photo=""><div class="ph"><span>FM</span></div>…</figure>`. When `data-photo` holds a URL, render `<img>` with `filter: grayscale(1) sepia(.35) contrast(1.05)` + amber screen overlay instead of the monogram.

- [ ] **Step 1: Add checks:** contains `Most systems remember.`, `I build systems that`, `understand`, `I don't imagine the future. I build it.`, `Featured systems`, `CTO, OnePharma`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Build Hero** per spec §1 (headline lines wrapped for a line-mask reveal; role line; rule + tagline + "Scroll ↓"). **Build Who** per spec §2: headline "I'm Farhad. I turn chaos into systems that think.", 2 short bio paragraphs from CLAUDE.md facts (CTO OnePharma Dubai; ontologies, knowledge graphs, governance layers), no origin line, facts: `6` Featured systems · `1` Springer paper · `AR/EN` Bilingual systems.
- [ ] **Step 4:** Run check → PASS. Open `index.html` (after `./build.sh`) in the browser pane: hero field animates, cursor links show amber, portrait slot shows FM.
- [ ] **Step 5:** Commit `feat(v6): hero and who chapters`.

### Task 3: What drives me

**Files:** Modify `site.html`, `scripts/check-site.mjs`

- [ ] **Step 1: Add checks:** contains `Obsessed with the` and `hardest`; exactly 4 `class="moment` elements.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Build the section** per spec §3, with these four sourced moments (stat · title · line):
  - `13` · Security as architecture · Cyrus holds 21 CFR Part 11, SOC 2 Type II and ISO 27001 with thirteen security layers and a hash-chained audit trail.
  - `3 / 5` · Power that needs a quorum · Zagros comes alive through a sealed Genesis ceremony: no single key can run it.
  - `99.34%` · Published, not just shipped · CNN-RNN botnet detection on N-BaIoT (TCP removed), Springer LNCS, NEW2AN 2023.
  - `0` · Demo without the machine · Black Pearl runs its whole CNC rig in a browser, and the same build drives the real factory floor.
- [ ] **Step 4:** Check → PASS; visual check at 1280px and 768px (4 → 2 columns).
- [ ] **Step 5:** Commit `feat(v6): what drives me`.

### Task 4: Six work chapters with live scenes

**Files:** Modify `site.html`, `scripts/check-site.mjs`

**Interfaces:**
- Consumes: `C`, `rgba`, `mk`, `TAU`, `reduced` (Task 1).
- Produces: `PROJECTS` array (v3 entries, ids `cyrus zagros onepharma pearl falah nids`) extended with `problem`, `built`, `matters` strings. `SCENES` = `[sceneCyrus, sceneZagros, sceneGraph, scenePearl, sceneFalah, sceneNids]` copied verbatim from `archive/v3-viewer/site.html` with their helpers (`docsCache`, `GN`, `GE`, `graphLayout`, `graphStep`, etc.; keep internal ids `onyxs`/`sr71`/`purple`). `plates`: array of `{cv, g, w, h, i, visible, enterT}`. `fitPlate(p)` resizes one canvas at DPR ≤ 2 and resets that scene's cache (`docsCache=null` for 0, `gSized=0` for 2).

- [ ] **Step 1: Add checks:** promote the 6×`class="proj"` check to always-on; each of the six display names appears in an `<h3>`; each `proj` contains `The problem`, `What I built`, `Why it matters`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Markup:** "The work." intro, then six `<section class="proj" data-i="N">`, each with plate canvas, outlined number `01`–`06`, eyebrow, title, the three rows, and links from `PROJECTS[i].links` (only nids has links: `research.html` and the DOI; none for Zagros). Copy for the three rows is the builder's, condensed from each v3 `body`, capability only, no new numbers.
- [ ] **Step 4: Loop:** one `requestAnimationFrame` loop over `plates` drawing only `visible` ones (IntersectionObserver, rootMargin `100px`) with `e` easing from `enterT` as in v3 `loop()`. Pause on `visibilitychange`. Resize → `fitPlate` all. Reduced motion → draw each plate once at `t=2, e=1`, no loop.
- [ ] **Step 5: Browser test** in the pane: scroll to each chapter; `javascript_tool` counts draws per frame (wrap `SCENES[i]` with a counter) → only on-screen indexes increment. Resize the window → graph still spread (not a line).
- [ ] **Step 6:** Check → PASS. Commit `feat(v6): six work chapters with live scenes`.

### Task 5: Research and Contact

**Files:** Modify `site.html`, `scripts/check-site.mjs`

**Interfaces:** Produces `var BOOKING_URL = "";` at the top of the script. `<a data-booking hidden>Book a time</a>` gets `href=BOOKING_URL` and loses `hidden` only when it is non-empty.

- [ ] **Step 1: Add checks:** contains `Deep Learning for Preventing Botnet Attacks on IoT`, `10.1007/978-3-031-60994-7_4`, `98.23%`, `NSL-KDD`, `href="research.html"`, `Bring me your`, `Email me`, `data-booking`, `BOOKING_URL`; `Book a time` element carries `hidden` in markup.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Build Research per spec §4 and Contact per spec §5 (headline links to mailto; two paths "Build with me" / "Hire me", each with Email me + Book a time); footer with email, GitHub `github.com/Farhad1618`, LinkedIn `linkedin.com/in/farhad-maleki`.
- [ ] **Step 4:** Check → PASS. In the pane, set `BOOKING_URL` via a temporary edit to `https://example.com` → buttons appear; revert to `""` → hidden.
- [ ] **Step 5:** Commit `feat(v6): research and contact`.

### Task 6: Motion, reduced motion, mobile

**Files:** Modify `site.html`

- [ ] **Step 1:** After GSAP loads, add `html.motion`, register ScrollTrigger + SplitText. Hero: SplitText line reveal on load. `.rv`: fade/rise on enter (ScrollTrigger batch). Work chapters: plate subtle parallax (yPercent ±6). Research number counts 0 → 99.34. Progress bar driven by scroll. Nothing pinned. Skip all of it when `reduced`.
- [ ] **Step 2: Browser tests** (pane):
  - 375×812: `document.documentElement.scrollWidth === clientWidth` → true; screenshot hero, a chapter, contact.
  - Reduced motion: temporarily set `reduced=true` in source, rebuild, reload → no `html.motion` class, plates are still frames; then revert.
  - GSAP blocked: temporarily change the GSAP src to a bad URL, rebuild, reload → every section visible (`getComputedStyle(.rv).opacity === "1"`), then revert.
- [ ] **Step 3:** `node scripts/check-site.mjs` → PASS. Commit `feat(v6): motion and mobile`.

### Task 7: Build, meta, preview

**Files:** Modify `build.sh` (meta description stays; add `og:description`/`twitter:description` = "Most systems remember. I build systems that understand." — already set, confirm), `CLAUDE.md` (Structure section → v6 story page; History adds v3 archive path)

- [ ] **Step 1:** `./build.sh` → `built index.html`; `node scripts/check-site.mjs` → PASS.
- [ ] **Step 2:** Check `research.html` back-links (`./`, "← Back to work") still make sense; change "← Back to work" to "← Back to site" if it now lands on the hero.
- [ ] **Step 3:** Publish the artifact preview from `site.html` with `files` `research.html` and `research-model.js` (update the existing artifact URL in CLAUDE.md). Screenshot desktop + 375px for Farhad.
- [ ] **Step 4:** Commit `docs: v6 structure in CLAUDE.md`. **Stop.** Merge `v6-story` into `main` (go-live) only after Farhad approves the preview.
