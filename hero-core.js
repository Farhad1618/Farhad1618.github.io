// The live scene's core: one canvas, one WebGL2 context and the post chain every world shares. A world
// (the chessboard hero in hero.js, later the solo pieces) brings its scene, camera, fog and dust; the core
// renders whichever world is attached, on whichever stage holds the canvas. Moving the canvas between stages
// keeps its context, so the page never needs a second one (each would cost its own ~0.5 GB of targets).
// Frame: scene (4x MSAA) -> fog (the world's fogMat, 1/DIV of the size) -> depth of field + fog composite ->
// the world's dust -> bloom (a quarter and an eighth of the size) -> FXAA + bloom + grade + dither + grain.
//
// The world contract (what the core calls):
//   world = { scene, camera, zs /* = camera.far */, fogMat, moteMat, moteScene,
//             update(dt, core), postUniforms() /* { uNear, uFar, uFocus, uAperture, uMaxR } uniform objects */,
//             ignite(s), resize(bw, bh, pr), dispose(),
//             attached?() /* called after every attach (the solo worlds replay their ignite; the hero does not) */,
//             stale?() /* true: resize the world even if the buffer did not change */,
//             hold?() /* re-apply a freeze after update */ }
// postUniforms() objects are shared by reference into the post pass while the world is attached, so the
// world's dust and the depth of field read the same focus. The world owns the light coming up: its update()
// sets core.fxaa.uIgnite every frame, so a world the canvas returns to carries on where it was.
import * as THREE from "three";
import { POST_VS, POST_FS, DOWN_FS, BLUR_FS, FXAA_FS, glslFloat } from "./hero-shaders.js";

const BASE = new URL("./assets/hero/", import.meta.url).href;
const INK = [12 / 255, 12 / 255, 14 / 255];
const FOG_DIV = 3;                         // fog is marched at 1/fogDiv of the size: this at least, more on big buffers
const FOG_MAX = 0.34e6;                    // and never on more fog texels than this (the march is the dearest pass)
// Sharpness levels, best first: [pixel ratio cap, backing buffer cap, frame budget in ms at mount]. The first
// one this GPU renders inside its budget is used. A Retina screen needs its real pixels: at the old single
// 1.5x / 3.0 MP cap a large window was drawn below 1x and stretched, and every outline against the glow
// showed as stair steps (Farhad, Nov 24). The fog stays at FOG_MAX texels, so the top level costs the scene
// and the per-pixel post passes only. Every level keeps 4x MSAA: with 2x on the sharp levels Farhad found the
// old low level looked best, because 2x gives an outline only one in-between tone.
const LEVELS = [[2, 7.5e6, 11.5], [2, 5.0e6, 11.5], [1.5, 3.0e6, 20]];
// The same on touch screens (pointer:coarse), chosen once at mount. A phone used to get a flat 1.25x at every
// level, so an iPhone (3x) drew about 490 x 830 and the browser stretched it 2.4x: blurred, with stair-step
// outlines (Farhad, Nov 24). 2x is the top: 3x costs 2.25x the pixels for a gain lost in the fog and depth of
// field. The budgets are looser than on desktop; the runtime step-down (frame()) catches a phone that heats up.
const TOUCH_LEVELS = [[2, 1.6e6, 14], [1.6, 1.1e6, 16], [1.25, 0.6e6, 22]];

// A 64-cube of smooth noise that tiles in every direction: two octaves of value noise.
function noiseVolume(size = 64) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const data = new Float32Array(size * size * size);
  for (const [cells, amp] of [[4, 0.62], [8, 0.38]]) {
    const g = new Float32Array(cells * cells * cells).map(rnd);
    const idx = new Int32Array(size * 2), fr = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const u = (i / size) * cells, c = Math.floor(u), f = u - c;
      idx[i * 2] = c % cells; idx[i * 2 + 1] = (c + 1) % cells; fr[i] = f * f * (3 - 2 * f);
    }
    let o = 0;
    for (let z = 0; z < size; z++) {
      const z0 = idx[z * 2] * cells * cells, z1 = idx[z * 2 + 1] * cells * cells, fz = fr[z];
      for (let y = 0; y < size; y++) {
        const y0 = idx[y * 2] * cells, y1 = idx[y * 2 + 1] * cells, fy = fr[y];
        for (let x = 0; x < size; x++, o++) {
          const x0 = idx[x * 2], x1 = idx[x * 2 + 1], fx = fr[x];
          const a = g[z0 + y0 + x0] + (g[z0 + y0 + x1] - g[z0 + y0 + x0]) * fx;
          const b = g[z0 + y1 + x0] + (g[z0 + y1 + x1] - g[z0 + y1 + x0]) * fx;
          const c = g[z1 + y0 + x0] + (g[z1 + y0 + x1] - g[z1 + y0 + x0]) * fx;
          const d = g[z1 + y1 + x0] + (g[z1 + y1 + x1] - g[z1 + y1 + x0]) * fx;
          const lo = a + (b - a) * fy, hi = c + (d - c) * fy;
          data[o] += amp * (lo + (hi - lo) * fz);
        }
      }
    }
  }
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = Math.round(data[i] * 255);
  const tex = new THREE.Data3DTexture(bytes, size, size, size);
  tex.format = THREE.RedFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}

// The light coming up, s seconds after a world starts: once, smoothly, in about 1.4 s (no flicker: Farhad did
// not like the light trying to catch). Shared by every world.
export function igniteAt(s) {
  const x = Math.min(1, Math.max(0, (s - 0.15) / 1.3));
  return x * x * (3 - 2 * x);
}

export function raw(tex) { tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true; return tex; }

// opts: { onLost(reason) }. Resolves once the renderer exists and the matcap is loaded.
export async function createCore(opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); throw new Error("WebGL2 unavailable"); }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;      // raw values out
  renderer.setClearColor(new THREE.Color().setRGB(INK[0], INK[1], INK[2]), 1);
  const disposables = [renderer];
  const listeners = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); listeners.push([t, e, f, o]); };

  let matcap;
  try { matcap = raw(await new THREE.TextureLoader().loadAsync(BASE + "matcap.webp")); }
  catch (e) { renderer.dispose(); throw e; }
  disposables.push(matcap);

  // the scene: 4x MSAA. Three resolves colour (smooth outlines) and depth (one sample) into textures.
  // half float where it can render to it, so the view depth in alpha (see POST_FS) keeps its precision
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, depthBuffer: true,
    type: renderer.extensions.has("EXT_color_buffer_float") ? THREE.HalfFloatType : THREE.UnsignedByteType });
  rt.depthTexture = new THREE.DepthTexture(4, 4);
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
  const ext = renderer.extensions;
  const halfFloat = ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float");
  const plainRT = filter => {
    const r = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType });
    r.texture.minFilter = r.texture.magFilter = filter;
    return r;
  };
  // post: depth of field + fog composite into a full-size buffer, then FXAA + bloom + dither to the screen.
  // uNear, uFar, uFocus, uAperture and uMaxR are the attached world's own uniform objects (postUniforms()).
  const frameRT = plainRT(THREE.LinearFilter);
  const postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    defines: halfFloat ? { DIV: FOG_DIV, ZS: glslFloat(60) } : { DIV: FOG_DIV, ZS: glslFloat(60), DITHER_POST: 1 },
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uPx: { value: new THREE.Vector2() },
      uNear: { value: 0.5 }, uFar: { value: 60 }, uFocus: { value: 10 }, uAperture: { value: 25 },
      uMaxR: { value: 14 }, uFade: { value: 1 },
      uInk: { value: new THREE.Vector3(...INK) },
      tFog: { value: null }, uFogSize: { value: new THREE.Vector2(1, 1) }, uFull: { value: new THREE.Vector2(1, 1) },
      uDepthTol: { value: 600 },        // 1/tol^2: fog texels more than ~4% off this pixel's depth barely count
    },
  });
  // bloom: bright pass at a quarter of the size (the tight glow), down to an eighth, blurred both ways there
  const tightRT = plainRT(THREE.LinearFilter), wideRT = plainRT(THREE.LinearFilter), wideTmp = plainRT(THREE.LinearFilter);
  const downMat = (src, thresh) => new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: DOWN_FS, depthTest: false, depthWrite: false,
    uniforms: { tIn: { value: src }, uSrcPx: { value: new THREE.Vector2() }, uThresh: { value: thresh } },
  });
  const brightMat = downMat(frameRT.texture, 0.38), down8Mat = downMat(tightRT.texture, 0);
  const blurMat = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false,
    uniforms: { tIn: { value: null }, uStep: { value: new THREE.Vector2() } },
  });
  // grain tile: the skill's noise (feTurbulence fractalNoise 0.8, 3 octaves, 200 px, grey, opaque)
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = grainCanvas.height = 200;
  const grainTex = new THREE.CanvasTexture(grainCanvas);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.colorSpace = THREE.NoColorSpace; grainTex.generateMipmaps = false; grainTex.minFilter = grainTex.magFilter = THREE.NearestFilter;
  // drawn at the backing resolution (the SVG's viewBox keeps the noise the same as the 200 CSS px tile),
  // so it is sampled one texel per pixel and keeps its fine grain
  let grainSize = 0;
  function drawGrain(size) {
    size = Math.max(50, Math.round(size));
    if (size === grainSize) return;
    grainSize = size;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200"><filter id="n" color-interpolation-filters="sRGB">`
      + '<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/>'
      + '<feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter><rect width="200" height="200" filter="url(#n)"/></svg>';
    const img = new Image();
    img.onload = () => {
      if (disposed || size !== grainSize) return;
      grainCanvas.width = grainCanvas.height = size;
      grainCanvas.getContext("2d").drawImage(img, 0, 0, size, size);
      grainTex.dispose(); grainTex.needsUpdate = true; setGrain(grainLevel);
    };
    img.src = "data:image/svg+xml," + encodeURIComponent(svg);
  }
  // Levels hit the skill's targets (0.5 / 0.8 / 1.4 L*) measured on the live frame, Nov 24. Mode 2 is even:
  // it moves L* by the same amount on the sky, the lit floor and the ivory. Overlay (the skill's own pick for a
  // CSS layer, solved from colours read off this frame) gave the sky 0.86 but the lit floor 3.9, so it is
  // kept only to compare. Then opacity on standard / HDR screens / the high-contrast setting.
  // touch screens: one ladder for the whole mount, so `level` is always one of its entries (indexOf never -1)
  const COARSE = matchMedia("(pointer:coarse)").matches;
  const LADDER = COARSE ? TOUCH_LEVELS : LEVELS;
  const GRAIN = { subtle: [2, 5.5, 4.7, 3.85], medium: [2, 9.0, 7.65, 6.3], strong: [2, 16.0, 13.6, 11.2], overlay: [0, 0.96, 0.82, 0.67] };
  // phones default to subtle: one grain cell is ~1 CSS px at any pixel ratio, so 3 device px on a 3x screen
  let grainLevel = (new URLSearchParams(location.search).get("grain") || (COARSE ? "subtle" : "medium")).toLowerCase();
  let grainReady = false;
  function setGrain(level) {
    grainLevel = level in GRAIN || level === "off" ? level : "medium";
    grainReady = grainReady || !!grainCanvas.getContext("2d").getImageData(0, 0, 1, 1).data[3];
    const u = fxaaMat.uniforms, g = GRAIN[grainLevel];
    if (!g || !grainReady) { u.uGrain.value = 0; return grainLevel; }
    const col = matchMedia("(prefers-contrast: more)").matches ? 3 : matchMedia("(dynamic-range: high)").matches ? 2 : 1;
    u.uGrainSoft.value = g[0]; u.uGrain.value = g[col];
    return grainLevel;
  }
  const fxaaMat = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: FXAA_FS, depthTest: false, depthWrite: false,
    uniforms: { tIn: { value: frameRT.texture }, uPx: { value: new THREE.Vector2() },
      uSubpix: { value: 0.5 }, uEdge: { value: 0.125 }, uEdgeMin: { value: 0.03 },
      tTight: { value: tightRT.texture }, tWide: { value: wideRT.texture }, uTightPx: { value: new THREE.Vector2() },
      uTightK: { value: 0.0 }, uWideK: { value: 0.25 },
      uIgnite: { value: 0 },
      tGrain: { value: grainTex }, uGrainPx: { value: 200 }, uGrain: { value: 0 }, uGrainSoft: { value: 0 }, uGrainSplit: { value: 0 },
      uTint: { value: new THREE.Vector3(0.88, 0.95, 1.13) }, uShadow: { value: new THREE.Vector3(0.0, 0.002, 0.007) } },           // no tight glow: it rings each piece (Farhad asked for none); only a faint wide one
  });
  const postGeo = new THREE.PlaneGeometry(2, 2);
  const postCam = new THREE.Camera();
  const pass = mat => { const sc = new THREE.Scene(); sc.add(new THREE.Mesh(postGeo, mat)); return sc; };
  const postScene = pass(postMat), fxaaScene = pass(fxaaMat);
  const brightScene = pass(brightMat), down8Scene = pass(down8Mat), blurScene = pass(blurMat);
  // the fog pass draws the attached world's fogMat on this quad
  const fogScene = pass(null), fogQuad = fogScene.children[0];
  disposables.push(rt, rt.depthTexture, frameRT, postMat, fxaaMat, postGeo,
    tightRT, wideRT, wideTmp, brightMat, down8Mat, blurMat);

  // fog: marched at 1/fogDiv of the size (it has no fine detail). Read texel by texel (texelFetch), so no
  // filtering is needed.
  const fogRT = plainRT(THREE.NearestFilter);
  const noiseTex = noiseVolume();
  postMat.uniforms.tFog.value = fogRT.texture;
  disposables.push(fogRT, noiseTex);

  let world = null, stage = null, io = null;
  let level = LADDER[0], fogDiv = FOG_DIV, readout = null, fpsAvg = 60, picked = true;
  let running = false, raf = 0, last = 0, disposed = false, visible = true, frozen = false;
  let lastW = 0, lastH = 0, lastPr = 0;

  const core = {
    canvas, renderer, matcap, noiseTex, ladder: LADDER, ladderName: COARSE ? "touch" : "desk",
    rt, uFull: postMat.uniforms.uFull, halfFloat,
    msaa: Math.min(rt.samples, renderer.capabilities.maxSamples), half: rt.texture.type === THREE.HalfFloatType,
    post: postMat.uniforms, fxaa: fxaaMat.uniforms, bright: brightMat.uniforms,
    W: 1, H: 1, pr: 1, buf: "", level: 0, mountMs: 0, frameCount: 0, stepped: 0,
    wideSigma: 1,              // the wide glow's sigma, in eighth-size texels (the world sets it in resize)
    get world() { return world; }, get stage() { return stage; }, get fogDiv() { return fogDiv; },
    get disposed() { return disposed; },
  };

  function showReadout() {
    const i = LADDER.indexOf(level), names = ["full", "medium", "low"];
    readout.textContent = "SHARPNESS " + (i + 1) + "/" + LADDER.length + " (" + names[i] + (picked ? ", auto" : ", forced") + ")\n"
      + canvas.width + " x " + canvas.height + "  ·  screen " + (window.devicePixelRatio || 1).toFixed(2) + "x\n"
      + Math.round(fpsAvg) + " fps  ·  keys 1 2 3 switch";
  }

  function resize() {
    if (!stage || !world) return;
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    // a soft, foggy image hides the difference; the GPU does not. Cap the pixel ratio, and the total pixel
    // count too, so a big window or a 4K screen costs no more than ~2160x1390.
    const pr = Math.min(window.devicePixelRatio || 1, level[0], Math.sqrt(level[1] / (w * h)));
    // iOS fires resize whenever the Safari toolbar shows or hides while scrolling, though the svh stage keeps
    // its size. setSize would clear and reallocate the drawing buffer (and drop a tap hover) each time. A level
    // change always passes: it changes pr. The world may still ask (stale(): its framing changed).
    if (w === lastW && h === lastH && pr === lastPr && !(world.stale && world.stale())) return;
    core.W = lastW = w; core.H = lastH = h; lastPr = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    fxaaMat.uniforms.uGrainPx.value = Math.round(200 * pr); drawGrain(200 * pr);   // the CSS tile (200 CSS px) in backing pixels
    const bw = Math.round(w * pr), bh = Math.round(h * pr);
    rt.setSize(bw, bh);
    frameRT.setSize(bw, bh);
    const div = Math.max(FOG_DIV, Math.ceil(Math.sqrt((bw * bh) / FOG_MAX)));
    if (div !== fogDiv) { fogDiv = div; syncDefines(); }
    const lw = Math.ceil(bw / div), lh = Math.ceil(bh / div);
    fogRT.setSize(lw, lh);
    const qw = Math.ceil(bw / 4), qh = Math.ceil(bh / 4), ew = Math.ceil(bw / 8), eh = Math.ceil(bh / 8);
    tightRT.setSize(qw, qh); wideRT.setSize(ew, eh); wideTmp.setSize(ew, eh);
    brightMat.uniforms.uSrcPx.value.set(1 / bw, 1 / bh);
    down8Mat.uniforms.uSrcPx.value.set(1 / qw, 1 / qh);
    fxaaMat.uniforms.uTightPx.value.set(1 / qw, 1 / qh);
    postMat.uniforms.uFogSize.value.set(lw, lh);
    postMat.uniforms.uFull.value.set(bw, bh);
    postMat.uniforms.uPx.value.set(1 / bw, 1 / bh);
    fxaaMat.uniforms.uPx.value.set(1 / bw, 1 / bh);
    core.pr = pr; core.buf = canvas.width + "x" + canvas.height;
    world.resize(bw, bh, pr);        // the world frames its camera, sizes the depth of field, the wide glow and the dust
  }
  // the fog divisor and the far plane are #defines: keep the world's fog and the post pass in step (recompiles)
  function syncDefines() {
    const m = [postMat];
    if (world) m.push(world.fogMat);
    for (const x of m) if (x.defines.DIV !== fogDiv) { x.defines.DIV = fogDiv; x.needsUpdate = true; }
    const zs = glslFloat(world ? world.zs : 60);
    if (postMat.defines.ZS !== zs) { postMat.defines.ZS = zs; postMat.needsUpdate = true; }
  }

  // Put the canvas on a stage and render this world there. The world's post uniforms (near, far, focus,
  // aperture, blur radius) are shared into the post pass by reference while it is attached.
  function attach(st, w) {
    if (disposed) return;
    if (world !== w) lastW = lastH = 0;   // another world on the same stage: frame it again
    world = w;
    fogQuad.material = w.fogMat;
    Object.assign(postMat.uniforms, w.postUniforms());
    syncDefines();
    if (stage !== st) {
      stage = st;
      if (io) { io.disconnect(); io.observe(stage); }
      lastW = lastH = 0;             // a new stage: size again
    }
    stage.appendChild(canvas);
    if (readout) stage.appendChild(readout);
    resize();
    if (w.attached) w.attached(core);
  }
  function detach() {
    stop();
    canvas.remove(); if (readout) readout.remove();
    world = null; stage = null; lastW = lastH = 0;
  }

  function render() {
    const w = world;
    renderer.setRenderTarget(rt);
    renderer.render(w.scene, w.camera);
    renderer.setRenderTarget(fogRT);
    renderer.render(fogScene, postCam);
    renderer.setRenderTarget(frameRT);
    renderer.render(postScene, postCam);
    renderer.autoClear = false;
    renderer.render(w.moteScene, w.camera);
    renderer.autoClear = true;
    // bloom
    renderer.setRenderTarget(tightRT);
    renderer.render(brightScene, postCam);
    renderer.setRenderTarget(wideRT);
    renderer.render(down8Scene, postCam);
    const bu = blurMat.uniforms, k = core.wideSigma * 0.4;
    bu.tIn.value = wideRT.texture; bu.uStep.value.set(k / wideRT.width, 0);
    renderer.setRenderTarget(wideTmp);
    renderer.render(blurScene, postCam);
    bu.tIn.value = wideTmp.texture; bu.uStep.value.set(0, k / wideRT.height);
    renderer.setRenderTarget(wideRT);
    renderer.render(blurScene, postCam);
    renderer.setRenderTarget(null);
    renderer.render(fxaaScene, postCam);
    core.frameCount++;
  }

  // freeze support (scripts/hero-snapshot.md): while frozen every frame steps with dt 0 and the world re-holds
  // its frozen state after update, so every frame is identical
  function setFrozen(on) { frozen = !!on; if (!frozen) last = performance.now(); }
  // render once and read the whole default framebuffer (RGBA8)
  function readFrame() {
    if (frozen && world.hold) world.hold();
    render();
    const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { px, w, h };
  }
  function hash() {
    const { px } = readFrame();
    let x = 0x811c9dc5;
    for (let i = 0; i < px.length; i++) { x ^= px[i]; x = Math.imul(x, 0x01000193); }
    return (x >>> 0).toString(16).padStart(8, "0");
  }
  // 64x40 grid of block-averaged RGB (0-255), row-major from the top; tolerant check for a refactor
  function sig() {
    const { px, w, h } = readFrame(), GX = 64, GY = 40, out = new Array(GX * GY * 3).fill(0), cnt = new Array(GX * GY).fill(0);
    for (let y = 0; y < h; y++) {
      const gy = Math.min(GY - 1, Math.floor(((h - 1 - y) * GY) / h));
      for (let x = 0; x < w; x++) {
        const g = gy * GX + Math.min(GX - 1, Math.floor((x * GX) / w)), p = (y * w + x) * 4;
        out[g * 3] += px[p]; out[g * 3 + 1] += px[p + 1]; out[g * 3 + 2] += px[p + 2]; cnt[g]++;
      }
    }
    return out.map((v, i) => Math.round((v / cnt[(i / 3) | 0]) * 100) / 100);
  }

  function frame(now) {
    raf = 0;
    if (!running || disposed || !world) return;
    // never negative: the first frame after the mount test can carry a timestamp from before it, which ran
    // the entrance clock backwards by half a second
    const dt = frozen ? 0 : Math.max(0, Math.min(0.05, (now - last) / 1000 || 0.016));
    if (last && !frozen) { fpsAvg += (1000 / Math.max(now - last, 1) - fpsAvg) * 0.05; stepDown(now - last, now); }
    last = now;
    world.update(dt, core); if (frozen && world.hold) world.hold(); render();
    if (readout && core.frameCount % 20 === 0) showReadout();
    raf = requestAnimationFrame(frame);
  }
  // Runtime step-down: the mount test runs cold, and a phone that heats up later would stay on its level.
  // A smoothed frame interval that stays above 40 ms, or above 28 ms and erratic, for 3 s while drawing steps
  // one level down, at most once per 5 s, never past the last level (never to the poster). A steady 33 ms is
  // left alone: iOS Low Power Mode caps rAF at 30 fps on any GPU. Not while a level is forced by key.
  let ivAvg = 16.7, ivJit = 0, badSince = 0, lastStep = 0;
  function stepDown(iv, now) {
    if (iv > 250) { badSince = 0; return; }           // a stall (tab switch, alert): no evidence either way
    ivAvg += (iv - ivAvg) * 0.1; ivJit += (Math.abs(iv - ivAvg) - ivJit) * 0.1;
    const bad = ivAvg > 40 || (ivAvg > 28 && ivJit > 6);
    if (!bad) { badSince = 0; return; }
    if (!badSince) badSince = now;
    const i = LADDER.indexOf(level);
    if (now - badSince < 3000 || now - lastStep < 5000 || !picked || i < 0 || i >= LADDER.length - 1) return;
    lastStep = now; badSince = 0; ivAvg = 16.7; ivJit = 0;
    setLevel(i + 1); core.stepped++;
  }
  function start() {
    if (running || disposed || !visible || document.hidden || !world) return;
    running = true; last = performance.now(); badSince = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function setLevel(i) { level = LADDER[i] || level; core.level = LADDER.indexOf(level); resize(); }

  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; visible ? start() : stop(); });
  }
  on(document, "visibilitychange", () => (document.hidden ? stop() : start()));
  on(window, "resize", () => resize());
  function exit(reason) {
    if (disposed) return;
    dispose();
    if (opts.onLost) opts.onLost(reason);
  }
  on(canvas, "webglcontextlost", e => { e.preventDefault(); exit("context lost"); });

  // Does this GPU keep up? Time real frames, forced to finish by a 1-pixel readback. Frame
  // intervals are no use here: a throttled or background tab would look like a slow device.
  // Takes the first level inside its budget, starting from rung `from` (0, the sharpest, by default);
  // throws "too slow" if none is. A level forced by key (readout) is kept: only it is timed, never thrown.
  function mountTest(w, from = 0, force = false) {
    if (w && w !== world) throw new Error("mountTest: world not attached");
    const gl = renderer.getContext(), px = new Uint8Array(4);
    const i0 = picked ? Math.min(LADDER.length - 1, Math.max(0, from | 0)) : Math.max(0, LADDER.indexOf(level));
    const i1 = picked ? LADDER.length : i0 + 1;
    if (level !== LADDER[i0]) { level = LADDER[i0]; resize(); }
    let ms = 0;
    for (let i = i0; i < i1; i++) {
      if (i > i0) { level = LADDER[i]; resize(); }
      // two warm-ups (shader compile, uploads, new buffers after a level change), then the median of seven
      // frames: one late frame (another tab, a compile finishing) must not send a good GPU to the poster
      const one = () => { const t0 = performance.now(); render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      one(); one();
      ms = Array.from({ length: 7 }, one).sort((a, b) => a - b)[3];
      if (ms <= level[2]) break;
    }
    core.level = LADDER.indexOf(level); core.mountMs = ms;
    if (picked && ms > level[2] && !force) throw new Error("too slow");
    return ms;
  }
  // On localhost only: a small readout in the corner (which sharpness level, the buffer size, frames a
  // second) and keys 1 / 2 / 3 to switch level, so the levels can be compared by eye. Off unless
  // localStorage.heroReadout = "1".
  function initReadout() {
    if (readout || !stage) return;
    let want = false;
    try { want = localStorage.getItem("heroReadout") === "1"; } catch (e) {}
    if (!want || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    readout = document.createElement("div");
    readout.style.cssText = "position:absolute;left:12px;bottom:12px;z-index:5;font:11px/1.4 'IBM Plex Mono',monospace;letter-spacing:.06em;color:#A8A49C;background:rgba(12,12,14,.7);padding:6px 9px;pointer-events:none;white-space:pre";
    stage.appendChild(readout);
    on(window, "keydown", e => {
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i < 0 || i >= LADDER.length || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      picked = false; setLevel(i); showReadout();
    });
    showReadout();
  }

  // ?compare: a before/after slider over the live scene. Left of the line has no grain, right has the
  // chosen level; the buttons switch the level. A review tool only, never shown without the parameter.
  function grainCompare() {
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;inset:0;z-index:5;pointer-events:none;font:11px/1 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#ECE7DC";
    box.innerHTML = '<div data-line style="position:absolute;top:0;bottom:0;width:1px;background:#E9A03B;box-shadow:0 0 0 .5px rgba(0,0,0,.4)">'
      + '<div data-knob style="position:absolute;top:50%;left:-18px;width:36px;height:36px;margin-top:-18px;border-radius:50%;border:1px solid #E9A03B;background:rgba(12,12,14,.7);cursor:ew-resize;pointer-events:auto;touch-action:none;display:grid;place-items:center;color:#E9A03B">&#8596;</div></div>'
      + '<div style="position:absolute;left:24px;bottom:24px">Before &middot; no grain</div>'
      + '<div data-levels style="position:absolute;right:24px;bottom:24px;display:flex;gap:6px;pointer-events:auto"></div>';
    const st = stage;
    st.appendChild(box);
    const line = box.querySelector("[data-line]"), knob = box.querySelector("[data-knob]"), levels = box.querySelector("[data-levels]");
    let frac = 0.5, pick = grainLevel === "off" ? "medium" : grainLevel;
    const place = () => {
      line.style.left = (frac * 100) + "%";
      fxaaMat.uniforms.uGrainSplit.value = frac * canvas.width;
    };
    const paint = () => {
      setGrain(pick);
      levels.innerHTML = "<span style='opacity:.6;padding:7px 4px'>After &middot;</span>" + ["subtle", "medium", "strong", "overlay"].map(l =>
        `<button data-l="${l}" style="font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer;padding:6px 9px;border:1px solid ${l === pick ? "#E9A03B" : "#26262A"};background:rgba(12,12,14,.7);color:${l === pick ? "#E9A03B" : "#A8A49C"}">${l}</button>`).join("");
    };
    levels.addEventListener("click", e => { const b = e.target.closest("[data-l]"); if (b) { pick = b.dataset.l; paint(); } });
    const drag = e => { const r = st.getBoundingClientRect(); frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); place(); };
    knob.addEventListener("pointerdown", e => { knob.setPointerCapture(e.pointerId); drag(e); e.preventDefault(); e.stopPropagation(); });
    knob.addEventListener("pointermove", e => { if (knob.hasPointerCapture(e.pointerId)) drag(e); });
    on(window, "resize", place);
    paint(); place();
  }

  function dispose() {
    if (disposed) return;
    disposed = true; stop();
    if (io) io.disconnect();
    for (const [tg, e, f, o] of listeners) tg.removeEventListener(e, f, o);
    if (world) { try { world.dispose(); } catch (_) { /* gone */ } }
    for (const d of disposables) { try { d.dispose(); } catch (_) { /* already gone */ } }
    canvas.remove(); if (readout) readout.remove();
  }

  Object.assign(core, { attach, detach, render, start, stop, resize, setLevel, mountTest, dispose,
    grain: setGrain, initReadout, grainCompare, setFrozen, readFrame, hash, sig });
  return core;
}
