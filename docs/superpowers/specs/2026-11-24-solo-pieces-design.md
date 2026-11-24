# Solo pieces: a detailed live close-up for each project chapter

Date: 2026-11-24. Status: for Farhad's approval.

## Intent

The Work chapter (03) shows six projects. Each one has a Canvas 2D drawing on the left (`sceneCyrus` … `sceneNids` in `site.html`). Farhad wants those drawings gone. In their place, each chapter shows that project's chess piece from the hero, alone, live in 3D and in much more detail.

The hero shows six small pieces that share one light. A chapter shows only one piece, so the model and lighting can go much further. This turns the hero's six pieces into the thread of the whole page: you meet them small on the board, then up close one at a time, each next to its story.

## What Farhad decided

- The six Canvas 2D plates and their code go.
- Each chapter shows its piece live in WebGL, with the lighting baked in Blender. Detail is the point.
- The detailed pieces are separate models from the hero minis. The hero stays as it is.
- The look matches the hero: near-black with a hint of deep blue, one hidden point light, live fog banks with shafts, bloom, grain and dust. Only that one piece is on the board, on its raised tile with a few neighbouring tiles. No other pieces are visible.
- Motion: the view tilts toward the mouse by about ±20°. There is no free spin and no scroll-driven turn.
- The piece's moving part plays on hover, as in the hero.
- He wants to work on it together: show one piece early and iterate.

## Goals

- Each piece reads as an object with a story, up close: wear, marks, materials, the narrative detail (the broken Cylinder, three turned keys, coins on the low pan, three arrows).
- The chapter and the hero look like the same world.
- It runs smoothly where the hero runs. Where the hero shows its poster, the chapter does too.

## Non-goals

- Free orbit, turntables, scroll-driven rotation.
- Changing the hero's look, assets or behaviour. Its refactor must leave its pixels unchanged.
- New project copy.
- Running more than one live chapter at a time.

## Anti-goals (failure even if it works)

- Looks like a tech demo or a product render: clean, plastic, evenly lit.
- Baked highlights visibly sliding across the surface as the view tilts.
- Faces toward the light burned to flat white. This already happens in the hero bakes and shows up close.
- A second WebGL context that pushes the hero into losing its context, or a GPU spike when scrolling into Work.
- Any visual not true to the work. The pieces already encode each project, so they qualify.
- A flat pre-rendered fog image. Farhad rejected that in the hero.

## Approaches considered

1. **Live WebGL with Blender-baked lighting (chosen by Farhad).** Same pipeline as the hero, a detailed model per piece, one shared renderer. Interactive and alive. The baked lighting limits how far the view can move.
2. Pre-rendered Cycles turntable scrubbed by scroll. Best image quality. Rejected: Farhad wants a live 3D model.
3. A Cycles still with live overlays (dust, light sweep, parallax). Cheap and alive. Rejected for the same reason.

For motion, Farhad picked the ±20° mouse tilt over a scroll turn plus drag spin, or drag only. For lighting, he first chose a museum look, then corrected it to the hero's look, close up.

## Design

### Page

- Each `.proj` keeps its grid: the plate on the left (7fr), the text on the right (5fr). On screens 860 px wide or less, the plate sits above the text. The big outlined numeral stays, above the canvas.
- *My call:* on desktop the plate is sticky (100svh, `align-self:start`). The piece holds still while the text column scrolls. Two plates then never share the screen half-and-half at a chapter boundary.
- Each plate has a still poster of its piece (`assets/solo/<id>/poster.webp`). This is what shows before the live view mounts, and it is the whole view wherever the hero shows its poster (`window.heroTry` false: reduced motion, weak device, no WebGL2). There is no second device test.
- One live canvas serves all six chapters. It moves into whichever plate is most on screen, loads that piece (cached after the first load), plays the light coming up, then fades in over the poster. When no plate is on screen, it stops.
- The solo view starts loading only once the hero is up or has fallen back to its poster, so it never competes with the hero's first paint. Clicking a piece in the hero prefetches that chapter's piece.
- The text column keeps its GSAP reveal. The old 900 ms enter ease of the plates is replaced by the ignite.

### Renderer

- There is one WebGL context for the hero and the chapters. Each context costs about 0.35–0.5 GB of targets at the top sharpness level, and a second one risks the hero losing its context on phones.
- `hero.js` is split into:
  - a **core**: canvas, renderer, targets, the post chain (fog composite, depth of field, motes, bloom, FXAA, grade, grain), the noise volume, matcap, sharpness levels and mount test, the rAF, visibility and context loss;
  - **worlds**: scene, camera, pieces, board and the per-world uniforms.
- The hero is one world. Each solo piece is another. The core renders only the world whose stage holds the canvas, and moves the canvas between stages; the context survives a DOM move.
- `mountHero` keeps its signature and behaviour. A new export drives the chapters, for example `mountSolo(opts)` returning `{setPiece(id, plate), prefetch(id), stop(), …}`, exposed as `window.soloLive` for live tuning.
- Hard-coded six-piece and hero-world numbers become world config: occluder count (`NOCC` define), light position and colour, camera and its far plane (`ZS`), fog extents (`TOP`, bank and haze z-bias, `tEnd`), the mote box, wake push scale, depth-of-field aperture, drift angles, lift and enter tables, and the scroll ripple origin. Solo uses `NOCC 1`, which makes its fog march cheaper than the hero's.
- **Check:** the hero must render the same before and after the split. Compare a read-back frame at a forced ignite time and level.

### Look and lighting

- Same world scale as the hero, so the fog noise, dust and wake behave the same. The close-up comes from a long lens, not a nearer wide one.
- One hidden point light per piece, placed a little behind and to one side (set per piece in Blender), so a lit edge wraps onto the front where the new detail is. The light's energy is scaled to keep the hero's brightness at the piece.
- The live fog banks are lit by that light, with shafts where the piece blocks it. They lie mostly behind and beside the piece so the front keeps its blacks. Also live: dust near the light, the cursor's wake through the fog, bloom, grain, the blue grade, and ignite on arrival.
- The board patch: about 5 × 4 tiles round the piece's tile at uneven heights, back faces built, the outer tiles fading into fog and haze. The piece keeps its hero placement on the tile (centred, or astride two) and its hero yaw.

### Baking for a ±20° tilt

- The hero bakes everything, highlights included, from one camera. At ±20° that would make the highlights slide.
- Solo bakes only what doesn't depend on the view: diffuse, translucency, shadows, occlusion and fog-scattered light.
- Highlights are drawn live in the piece shader: one specular term from the known light position, with gloss per surface taken from a baked roughness mask. Polished marble is sharp and bright, ivory soft, clay almost none, the black pearl a tight hot point. Highlights are masked where the bake shows the surface in shadow from the light (a baked direct-light visibility channel), so nothing glints inside a shadow.
- The bake tonemap gets a soft shoulder before 1.0, so lit faces roll off instead of clipping to white.
- Bakes are denoised.

### Detailed models (`blender/hero/solo.py`, one stage per piece)

These are separate builders from the hero minis. They share sizes, origins and rig pivots with the minis, so the pieces read as the same objects. Procedural materials are in object coordinates, so the metric size must stay the same. Target is about 60–120k triangles per piece.

- **Cyrus:** real wedge-shaped cuneiform pressed into the clay in uneven lengthwise registers (geometry, so the outline breaks too), a break with flaking edges and loose crumbs, chips and wear in the marble mount and saddles.
- **Zagros:** bitting and wards cut into the keys, engraved rings round the vault, wear where hands touch the lid and knob, the empty sixth face scarred.
- **OnePharma:** carved nodes with small incised labels, thin bronze rods for the edges, a turned stem.
- **Black Pearl:** milled tool-path marks on the block and terraces, growth ridges and nacre on the shell, a pearl with real lustre (live specular).
- **Falah:** linked chains, a pivot pin, coins with stamped faces and milled edges, the coin stacks leaning.
- **Network Intrusion Detection:** a hammered metal rim with bosses, arrows with heads, nocks and fletching, splintered wood at the snapped one, cracks radiating from each strike.

The moving part (rig) is the same as the hero's: the Cylinder rolls 9°, the fifth key turns 90°, the graph turns 40°, the upper shell opens 11°, Falah's beam sinks 6° with the pans hanging, the first arrow quivers.

### Assets

- Per piece in `assets/solo/<id>/`:
  - `solo.glb`: nodes `piece-<id>`, `plinth-<id>`, `board`; meshopt plus webp, as the hero does
  - `poster.webp`, at most 150 KB
  - `layout.json`: camera, light, board centre and size, the piece box, tilt limits
- Budget: about 1.5 MB per folder. Loaded only when needed.
- The matcap is shared from `assets/hero`.
- Build with `blender … --stage solo --piece <id> [--draft]`, writing intermediates to `blender/out/solo/<id>/`. The hero stages must produce the same output as before (the board's random sequence is untouched).
- Checks: `scripts/check-hero-assets.mjs` gains the solo contract (files, nodes, extensions, triangle cap, budget). `scripts/check-site.mjs` drops its plate and `SCENES` rules and gains the new plate markup rules. While there, fix its `<header` slices to `<main`, and fix the stale `build.sh` `</head>` marker.

### Order of work (to iterate together)

1. Split `hero.js` into core and worlds. Prove the hero is unchanged.
2. Build the solo pipeline and the **Cyrus** solo piece. Wire one chapter end to end, with its poster fallback. **Show Farhad and tune** the light position, fog, detail and tilt.
3. The other five pieces, each shown to Farhad as it lands.
4. Clean up: remove the old plate code, update the checks, update CLAUDE.md, and deploy the file list (including the missing `mark.js` and `mark-data.json`).

## Calls settled after the builder check (mine, Farhad can overrule)

- **Review happens on localhost**, through the `portfolio` server in `.claude/launch.json`. Nothing goes to `main` (which is live) until Farhad approves the pieces. No feature switch is needed.
- **Hero hand-off.** The hero and Work are never on screen together. While the canvas is in a chapter, the hero stage is empty and off screen. When the hero comes near view again, the canvas moves back and the hero resumes quietly, with no replayed ignite or rising pieces. A chapter does replay its ignite every time the canvas arrives in it.
- **Touch screens.** There is no tilt from a finger: a swipe would fight page scrolling. Instead the view drifts very slowly by a few degrees on its own. A tap on the piece plays its moving part.
- **Runtime fallback.** If the hero falls back to its poster for any reason (speed test, context loss, timeout), the chapters show their posters too. If a visitor lands straight on a chapter (`#proj-…`) and the core is not mounted yet, the chapter mounts it itself, through the same gate (`heroTry`) and the same speed test.
- **Detail before bytes.** About 1.5 MB per piece is a target. If the detail needs more, the budget may grow up to 2.5 MB per piece, because only one loads at a time and only when it's needed. Bake resolution drops only past that.
- **Sticky plate on desktop**, as above. It's easy to undo if Farhad doesn't like it.
- **Board patch.** New tiles, not a copy of that spot on the hero board, but the same stone, heights, inlay and gaps, from their own seed. The hero board's random sequence is untouched.

## Constraints

- Three.js 0.170.0 from jsdelivr via the import map. No new script hosts.
- Colours are raw display values end to end. Don't add colour management.
- The `check-site` rules on forbidden words also apply to new comments and alt text.
- Don't name new classes `proj-*`: the six-`.proj` check matches them.

## Left to the builder

- Exact light positions, camera lenses, patch sizes, bake sizes and samples per piece, within the above.
- The specular model and how the roughness and visibility masks are packed.
- How the active plate is chosen at chapter boundaries.
- Whether the hovered part plays when the pointer is over the piece's box or anywhere on the plate.
