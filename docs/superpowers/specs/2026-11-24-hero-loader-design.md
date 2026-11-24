# Hero loader (Nov 24, 2026)

**Why.** Visitors were getting a dark wait, a poster that popped in, or the poster for good when a timer or the
speed test gave up. Farhad wants them to wait once, see that the page is getting ready, and then get the whole
3D experience at once.

**What they see.** Only FARHAD, in the hero title's own place and style, sliding up as the title does. Under it
is a thin progress bar and the word "Loading". When the scene is ready the bar fades out, "Software Developer"
slides in, the mark grows and the scene fades in with its entrance. Scrolling is locked while the loader shows.
If the device looks too weak, the bar is replaced by two buttons: **Load full experience** and **Optimised for this device**.

**Goals.** Keep it very simple. Show real progress (downloads, then the mount). Make the switch from loading to
the hero seamless (the name never moves).
**Non-goals.** A percentage counter, or any change to the poster's look.
**Anti-goals.** A fake timer bar. A second copy of the name that jumps when the real one takes over.

## Approaches
1. **The hero is the loader (picked).** While `html.hero-loading` is set, the real `.hero-head` shows only the
   title, plus a `.hero-load` block (bar, label, choice) where the subtitle sits. Seamless by construction.
2. A separate full-screen overlay with its own copy of the name. It has to match the title's position at every
   size, and it doubles the name.
3. A fake timed bar. Ruled out: Farhad wants the page actually prepared.

## Decisions
- Who sees it: devices that try the live scene (motion allowed, WebGL2), when the URL has no `#hash`. Weak
  devices (under 4 GB or 4 cores) see the choice at once, before anything downloads. Reduced motion, no WebGL2,
  and `#` links behave as before (poster, or the old dark wait).
- The choice also appears when the mount speed test fails (`too slow`). "Full" mounts again with `force`: the
  lowest level, no speed limit. "Optimised" shows the poster.
- The loader drops the 6 s and 8 s give-up timers. Instead, if there has been no progress for 12 s, the choice
  shows: "Full" keeps waiting, "Optimised" shows the poster.
- Other failures (load error, context loss, WebGL2 refused) end the loader and show the poster: there is nothing to offer.
- Progress: resource timing for the hero modules and three.js, GLTFLoader bytes for `pieces.glb`, and the last
  part for the mount. The bar eases toward that target, and it is shown for at least 1.2 s so it never flashes.
