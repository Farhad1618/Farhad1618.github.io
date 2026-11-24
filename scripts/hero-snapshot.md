# Hero snapshot (pixel-exact refactor check)

`heroLive.freeze(t)` holds every time input still (scene time, ignite fully lit, wake, drift, hover, scroll,
phone pan, rig springs); `freeze(null)` releases. `heroLive.hash()` renders once and returns the FNV-1a hex of
the full framebuffer (RGBA8). `heroLive.sig()` returns a 64x40 grid of block-averaged RGB (7680 numbers).

Run:
1. `./build.sh`, start the `portfolio` preview server, `resize_window` 1440x900 (DPR 2), open
   `/index.html?why`, set `localStorage.heroForce = "1"`, reload and wait about 5 s (if the mount test says
   "too slow", reload again; it is timing-dependent).
2. In the page:
   `for (const i of [0,1,2]) { heroLive.setLevel(i); heroLive.freeze(5); out[i] = {hash: heroLive.hash(), sig: heroLive.sig()}; }`
3. Compare with `blender/out/hero-baseline.json` (git-ignored, machine-specific:
   `{"0":{"hash","sig"},"1":...,"2":...,"viewport":[w,h]}`). Pass on an exact hash, or a max absolute
   `sig` difference of 1.0 or less.
