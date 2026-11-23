# Chessboard hero: design

Date: 2026-11-23. Status: awaiting Farhad's approval.

"Farhad decided" marks his decisions. "Call" marks a choice made on his behalf that he can overrule.

## Intent

Replace the v6 hero with a dark, cinematic 3D chessboard in the style of the reference still Farhad supplied ("How you Play: A Game"): pale marble pieces on ornate dark tiles, low camera, shallow depth of field, haze, soft pools of light, near-black surroundings.

Each piece is one of the six projects, sculpted as an object instead of a human figure. The hero becomes a single image of the whole body of work, and each piece is a door to its project. The site's goal is unchanged: win clients and employers. The scene must look expensive and load like it is cheap.

The reference still is at `docs/superpowers/specs/reference/chessboard-reference.png`. It is someone else's artwork, so it is excluded from git (`.git/info/exclude`) and must never be committed or published: the repo is public.

## Goals

- Match the reference's mood: darkness, marble quality, soft reflections, depth blur, haze.
- Six pieces, each recognisable as its project once the name is shown.
- Realistic look with faked lighting: nothing lit or shadowed live.
- Fast: page text is readable before any 3D arrives; the scene never blocks scrolling.

## Non-goals

- No free orbit camera, no physics, no playable chess.
- No change to the chapters below the hero, or to `research.html`.
- No framework or bundler. The Vite move stays a separate roadmap item.

## Anti-goals (these make it a failure even if it runs)

- It looks like a tech demo: plastic shading, hard real-time shadows, visible polygon edges, obvious looping motion.
- It delays or janks the first screen, or drains a phone.
- Pieces that are generic decoration. `CLAUDE.md` requires every visual to be true to the work.
- Human statues, or any copy of the reference's actual figures, title or tile pattern. The reference is a mood, not a source.

## Decisions

| Topic | Decision | Whose |
|---|---|---|
| Placement | Replaces the hero (`section.hero#top`) | Farhad decided |
| Build method | Hybrid (see Approaches) | Farhad decided |
| Title | Small title above the board, as in the reference. The giant Anton "FARHAD" goes. | Farhad decided |
| Falah's piece | A balance scale | Farhad decided |
| Other five pieces | See Pieces | Call (proposed to Farhad, not objected to) |
| Title type | "FARHAD" in Bodoni Moda, small caps, wide tracking, `--bone`; "Software Developer" beneath in IBM Plex Mono. Drop Anton from the font request and the `--name` token. | Call |
| Behaviour | See Behaviour | Call (proposed to Farhad, not objected to) |
| Models | Built by a Blender Python script run headless (Blender 5.2.3 is at `/opt/homebrew/bin/blender`), not hand-modelled | Call |

## Approaches

1. **Fully real-time 3D.** Board and pieces as geometry, live reflections, depth-of-field pass. Camera can go anywhere. Heaviest (about 3–5 MB) and the likeliest to stutter on phones.
2. **Pre-rendered layers.** Cycles renders stacked images; the browser parallax-shifts them. Most realistic and lightest (about 1 MB), but the camera moves only a few degrees and pieces can never turn or respond.
3. **Hybrid (picked by Farhad).** The six pieces are real 3D with baked shading, so they can turn and react. Everything else is pre-rendered or painted. Near the realism of 2 at roughly half the cost of 1, and the pieces stay interactive.

## The scene

### Composition

- Camera low, close to the pieces' eye level, looking across the board. Focal plane on the centre piece.
- Black Pearl sits in the centre in dark marble. The five pale marble pieces spread left and right at different depths, so the nearest and farthest fall out of focus.
- Each piece stands on a short dark plinth, as in the reference.
- Board: dark tiles with a faint ornamental inlay catching warm light. The inlay is an original Persian-geometric (girih) pattern; `concepts/a-girih` may be used as a starting point.
- Light: one soft warm key from above and slightly behind, cool dim fill, heavy falloff to black at the frame edges. Tint stays inside the design system: warm highlights lean toward `--sig`, nothing teal in the marble.
- Background is `--ink` (`#0C0C0E`) so the hero meets the next chapter with no seam.

### Pieces

All six are objects on plinths, similar in height (reference: chess pieces of one set), under about 15k triangles each.

| Project (`data-id`) | Piece | Marble |
|---|---|---|
| Cyrus (`cyrus`) | The Cyrus Cylinder: a barrel-shaped cylinder on a cradle, with incised bands suggesting lines of text. No legible or fake cuneiform is required; texture-level bands are enough. | Pale |
| Zagros (`zagros`) | A sealed hexagonal vault with five keys set around it, three turned a quarter turn | Pale |
| OnePharma (`onepharma`) | A lattice of spheres joined by rods (the knowledge graph), on a stem | Pale |
| Black Pearl (`pearl`) | A sphere half-milled out of a block, with concentric toolpath grooves left on the block | Dark, with pale veining |
| Falah (`falah`) | A balance scale, pans level | Pale |
| Network Intrusion Detection (`nids`) | A watchtower with a lantern top | Pale |

### Behaviour

- **Idle:** camera drifts a few degrees with the pointer (eased, small). Haze drifts slowly. Each piece turns a very small amount on its own period, so nothing loops visibly.
- **Hover (pointer devices):** the piece lifts slightly and brightens, and its project display name appears near it in IBM Plex Mono. Cursor becomes a pointer.
- **Click:** smooth-scrolls to that project's `.proj[data-id]` chapter.
- **Touch (call):** the first tap on a piece shows its name; a second tap on the same piece scrolls to its chapter. The name clears on a tap elsewhere or after 4 seconds.
- **Scroll out:** as the hero leaves, the camera sinks and the scene fades to `--ink`. Rendering stops when the hero is off-screen or the tab is hidden, as the current hero rAF does.
- **Keyboard and screen readers:** the canvas is `aria-hidden`. Six links to the project chapters sit in the hero so the pieces' navigation is reachable without a pointer (see the poster fallback below; over the live scene they are visually hidden but focusable).

### Portrait screens and the poster fallback (call)

- The same scene gets a second camera for portrait: pulled back and re-framed so all six pieces are in view, staggered in depth instead of spread wide. Blender renders a second still, `poster-portrait.webp` (also at or under 150 KB), and the live scene uses the matching camera when the viewport is taller than it is wide.
- Wherever the poster is shown instead of the live scene, the pieces still navigate. The Blender script exports each piece's projected screen position for both cameras (a small JSON), and the hero places six transparent tap targets over the poster from those positions, each a link to its chapter with the project name shown on hover or focus. These six links are the same ones used for keyboard and screen-reader access, so there is one set of links, not two.

### Removed and kept

- Removed: `#field` canvas and `heroField` code, `.glow`, `.name-xl` giant name and its GSAP tweens, the `img.figure` cut-out slot and its JS, the Anton font.
- Kept: the "Software Developer" line, the scroll cue, the top bar, the progress bar, and an `h1` containing "Farhad".

## How it is faked

These are the tricks the build relies on. The builder may swap one for an equivalent if it looks as good and costs no more.

- **Baked marble.** Blender (Cycles) bakes each piece's full lighting, including subsurface softness and ambient occlusion, into one colour texture. In the browser the piece is unlit: texture plus a matcap or tiny environment map for a moving sheen. No real-time lights.
- **Painted shadows.** Contact shadows under plinths are soft textured quads. No shadow maps.
- **Pre-rendered board and far field.** The board, its inlay and the surrounding darkness are rendered in Cycles. The far region is baked already blurred, so distance blur costs nothing.
- **Depth of field.** Only what remains (near and far pieces) needs blur. Use the cheapest thing that reads correctly: either one half-resolution depth-based blur pass, or pre-blurred textures for the pieces outside the focal band that swap to sharp on hover. Builder's choice.
- **Haze.** A few large, slowly moving alpha sprites. No volumetrics.
- **Poster first.** Cycles also renders the final camera view as a still (`poster.webp`). It is the hero's background image from first paint, the 3D fades in over it once ready, and it is the permanent fallback. The live scene's first frame should line up with the poster closely enough that the fade is not a jump.

## Constraints

- **Stack:** Three.js, no framework, no bundler. Loaded as ESM from `cdn.jsdelivr.net/npm` or cdnjs, pinned to an exact version. These are the only script hosts the Claude artifact CSP allows; the same rule previously applied to OGL (see `CLAUDE.md` roadmap item 2 for the working ESM pattern).
- **No Draco decoder from gstatic** (blocked by the CSP). Use meshopt compression, whose decoder ships in the three addons, or uncompressed geometry if the budget holds.
- **Assets are local files** under `assets/hero/`, referenced by relative path, so they work on GitHub Pages and as artifact supporting files.
- **Budget:** all hero assets (models, textures, poster) at or under 2.5 MB transferred; `poster.webp` at or under 150 KB. Three.js itself is on top of that and loads after first paint.
- **Loading:** nothing 3D is requested until the page is interactive. The Three.js import and assets must not block `site.html`'s existing inline script or the GSAP reveals.
- **Frame cost:** 60 fps on a recent laptop at device pixel ratio capped at 2; on phones cap the ratio lower.
- **Fallback to the still poster** when: `prefers-reduced-motion` is set, WebGL is unavailable, Three.js or an asset fails to load, or the device is judged weak (builder defines the test; err toward the poster on phones).
- **Source of truth stays `site.html`** (body-only), wrapped by `build.sh` into `index.html`. `node scripts/check-site.mjs --all` and `./build.sh` must pass; update the check script where it asserts on the old hero.
- **Palette:** the JS `C` object and `:root` stay in sync. No new accent colours.
- **Blender pipeline is reproducible:** one script (suggested `blender/build_hero.py`) builds the pieces, bakes, renders the board plates and poster, and writes `assets/hero/`. The script is committed; outputs are committed; a `.blend` file is optional.

- **Target is GitHub Pages.** In the Claude artifact preview the live scene is attempted with the same relative asset paths; if binary assets cannot be fetched there, the poster fallback is the accepted result. Do not repackage assets to make the artifact work.

## Order of work and checkpoint

1. Blender first: build the pieces, light the scene, render both posters.
2. **Checkpoint: Farhad sees the Cycles stills and approves the pieces and mood before any browser work.** A changed piece means a re-bake, so this is the cheap place to change one. If a scripted piece reads as a tech demo, say so at this checkpoint and offer alternatives (a simpler form, or Farhad hand-finishing it in Blender); do not ship it.
3. Browser: poster hero with links, then the live scene over it.

Branch: work on a new branch cut from `hero-name` once Farhad has dealt with his uncommitted edits there (see Open with Farhad). Nothing goes to `main` without his say; a push to `main` is live.

## Deliverables

- `site.html` hero rewritten; `index.html` rebuilt.
- `assets/hero/`: piece models, baked textures, board and far-field plates, shadow and haze sprites, `poster.webp`.
- The Blender script.
- `CLAUDE.md` updated: files table, structure, workflow (artifact publish must now pass `assets/hero/*` as `files`), the "zero dependencies" line, and the hero history.

## Verification

- Local preview via the `portfolio` server in `.claude/launch.json`: no console errors, assets within budget in the network panel, hover names and click-to-chapter work for all six pieces.
- Side-by-side screenshot against the reference still for mood: darkness, marble, blur, haze.
- Reduced-motion and a forced WebGL failure both show the poster with the title and links intact.
- Mobile viewport: poster or scene shows, title readable, no horizontal scroll.
- Known harness limit from `CLAUDE.md`: scroll-driven behaviour in the artifact `data:` frame must be checked by hand.

## Left to the builder

- Exact Three.js version, loader pattern, shader details, and which depth-of-field trick.
- Exact piece proportions, board size, camera lens, and positions, guided by the reference.
- Marble procedural settings, bake resolution, texture formats (WebP suggested).
- The weak-device test.
- Whether pieces are one GLB or six.

## Open with Farhad (do not block the build)

- Whether Black Pearl and OnePharma get Persian display names (existing open question); hover labels use current display names.
- The uncommitted `.chroma` copy edits in `site.html` and `index.html` on branch `hero-name` are Farhad's and unrelated. He decides whether they are committed first or stashed; the builder does not touch them without his answer.
