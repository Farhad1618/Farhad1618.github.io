# Story site redesign (v6)

Date: 2026-11-17 · Status: draft for Farhad's approval · Mockup: `concepts/f-story/index.html`

## Intent and why

The current site (v3 viewer: fixed full-screen plates, one project at a time) is a showcase of projects with no person in it. Farhad says nothing about it is working for him. He wants the site to market **him**: who he is, how obsessed he is with the work, photos of him, and a memorable way of presenting himself, so that clients hire him and future employers want him. The ambition is Awwwards-level quality.

The tone he wants is mission-scale: "I don't just imagine the future, I build it", visionary, driven, aimed at the toughest problems. That is the **feeling** only. His real AI and agentic-systems work stays at the centre. No aerospace/defense positioning.

## Goals

- A visitor meets Farhad first, then sees the work as **proof** of his obsession.
- Every project answers: the hard problem → what I built → why it matters.
- Two clear end paths: clients ("Build with me") and employers ("Hire me").
- Polished enough to submit to Awwwards.

## Non-goals

- New stack (Vite/TS/WebGL rebuild). Stays GSAP + Canvas 2D, single file, same as today.
- Changing the design system (colours, fonts) or the project display names.
- Repositioning into aerospace/defense.

## Anti-goals (failure even if it works)

- Generic self-praise ("visionary", "passionate") without proof next to it.
- Stock imagery or abstract decoration. Every visual stays true to the work (CLAUDE.md rule).
- Photo slots that look broken or unfinished while Farhad has no photos yet.
- Heavy or expensive to maintain: Farhad asked to keep it simple.

## Constraints

- `site.html` stays body-only (artifact-publishable); `build.sh` wraps it into `index.html`; GitHub Pages serves `main`.
- Artifact CSP: scripts only from cdnjs / jsdelivr npm. Fonts from Google Fonts.
- Design tokens and fonts as in CLAUDE.md. `C` JS palette mirrors `:root`.
- Copy facts per CLAUDE.md (paper numbers, Zagros private, Falah on Supabase and not on App Store, etc.).
- Must work on mobile (current weakness) and with `prefers-reduced-motion`.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Add an "about you" intro chapter in front of the current viewer | Cheapest, but the site stays a project gallery and the intro feels bolted on |
| **B (picked)** | **One scrolling story page in chapters, reusing GSAP, the six Canvas scenes and the design system** | Moderate work; biggest change in how people see Farhad; format juries and clients read well |
| C | Full rebuild on Vite + TypeScript + WebGL | Most impressive technically, most work and cost; story no clearer than B; against "keep it simple" |

Farhad picked B and approved the mockup direction on 2026-11-17.

## The design (as approved in the mockup)

One vertically scrolling page. Fixed top bar (name left; About / Work / Research / Contact right), thin amber scroll-progress line, animated film grain over everything.

1. **Hero**: full viewport. Line: "Most systems remember. I build systems that *understand*." (amber italic on "understand"), line-by-line mask reveal. Role line above (AI & Agentic Systems Engineer · CTO, OnePharma · Dubai). Below a rule: "I don't imagine the future. I build it." Background: drifting node field, teal links, links to the cursor in amber.
2. **Who (01)**: portrait slot (4:5) + "I'm Farhad. I turn chaos into systems that think." + short bio + origin story + three facts (6 systems built, 1 Springer paper, AR/EN).
3. **What drives me (02)**: headline "Obsessed with the *hardest* problem in the room." + four "moments", each a big mono stat/time, a title and 1–2 lines. Moments are specific proof, not adjectives.
4. **The work (03)**: intro "The work." then **six full-viewport chapters**, one per project (Cyrus, Zagros, OnePharma, Black Pearl, Falah, Network Intrusion Detection). Each: live scene plate (left, ~7/12) with outlined big number, text column (right): label, title, problem / what I built / why it matters, link(s). Mobile: plate stacks above text.
5. **Research (04)**: giant amber "99.34%" with "N-BaIoT, TCP removed · 98.23% on NSL-KDD", paper title, venue, link to `research.html`.
6. **Contact (05)**: "Bring me your *hardest problem.*" (mailto) + two paths: For clients · Build with me; For teams · Hire me. Footer with email, GitHub, LinkedIn.

Note: the mockup shows one full project chapter plus a strip of the other five; the real build gives all six the full chapter (the strip was a mockup shortcut).

### Photos (none yet)

Every photo slot ships with an intentional placeholder: dark warm radial ground, italic Bodoni "FM" monogram, mono caption, grain. When photos arrive they drop into the same slot with one treatment: amber-warm duotone/grade + grain so they sit in the palette. Swapping a photo is a one-line change (an `<img>` in the slot). Slots: portrait in Who (required). Optional later: one wide "at work" photo between Drive and Work.

### Content Farhad still owes

- Origin story (2 sentences, his words).
- Moment 01 (a real night/moment, e.g. when Cyrus clicked) and Moment 04 (a habit or rule people notice).
- Photos (portrait first).

Until supplied, the build ships with **no** visible placeholder text: those moments are replaced by fact-based ones the builder can write from CLAUDE.md, and the origin line is omitted. Placeholders exist only in the mockup.

## Decided by Claude (Farhad can override)

- Reuse the six scene functions (`sceneCyrus`, `sceneZagros`, `sceneGraph`, `scenePearl`, `sceneFalah`, `sceneNids`; signature `(g,w,h,t,e)`) from the current `site.html`, one canvas per chapter, animating only while on screen.
- The old viewer moves to `archive/v3-viewer/` (same pattern as `archive/farsh/`). The new page replaces `site.html`.
- Drop: preloader, OGL shader transitions, filmstrip, detail sheets, About sheet. Project depth goes in the chapter itself; "Case study" links go to GitHub where public, and to `research.html` for project 06. Zagros has no public link.
- Motion: GSAP + ScrollTrigger (already used by `research.html`) for reveals and pinned/parallax touches; SplitText for headline reveals. Reduced motion: no scroll-driven motion, scenes render a still frame.
- Keep the hero line as the thesis; mission-scale tone in headlines, proof in body copy.

- **Claims stay sourced.** "Why it matters" lines and moments describe what each system does, using only facts in CLAUDE.md or supplied by Farhad. No invented results. The mockup's OnePharma "a week → one query" line and the Zagros origin moment get rewritten unless Farhad confirms them.
- **Facts row:** "6 systems built" becomes "6 featured systems", which is true whatever else he has built.
- **Launch:** v6 is built and published as the Claude artifact preview first. It replaces the live site on `main` only after Farhad approves the preview. Archiving v3, updating `build.sh` and OG tags, and checking `research.html` links happen at go-live.

- **Contact (Farhad, 2026-11-17):** no CV on the site. The close offers two actions: **Book a time** (booking link) and **Email me** (mailto). Both paths (clients and teams) use them; the "CV on request" line goes. Until Farhad gives a booking URL, Book a time is hidden and only Email me shows.
- **Results:** Farhad supplied no measured results, so per the sourced-claims rule above, "why it matters" lines describe capability only.

## Left to the builder

- Exact animation choreography per chapter (keep it restrained; one signature move per section).
- Bio and per-project problem/built/matters copy, sourced from CLAUDE.md facts and the existing site copy.
- Performance tactics (pause off-screen canvases, DPR cap).
- OG image/meta updates in `build.sh` if needed.
