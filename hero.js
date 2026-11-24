// Chessboard hero: the live scene. On capable devices it is the first thing shown (the poster is only the
// fallback). Everything is baked in Blender (blender/build_hero.py) from the camera's point of view, so the
// light, shadows, sheen and the glow of thin alabaster and ivory are in the textures. Nothing here is lit:
// pieces are their baked texture plus a faint matcap sheen, the board is one baked texture. The light is
// fixed and nothing moves it, hover included, so it can be faked as convincingly as possible.
// Frame: scene (4x MSAA) -> fog, shadowed per step by the pieces (a third of the size) -> depth of field +
// fog composite (depth-aware upsample) -> bloom (a quarter and an eighth of the size) -> FXAA + bloom +
// dither to the screen. Colours are raw display values end to end, so the scene matches the bakes exactly.
// Split in three: hero-shaders.js (every GLSL string), hero-core.js (canvas, context, post chain, sharpness
// levels, mount test, loop) and this file, the hero world (scene, camera, pieces, input, choreography) plus
// mountHero, which joins the two. The core renders one world at a time and can carry its canvas between stages.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { WAKE_N, pieceShaders, boardShaders, fogShader, moteShader } from "./hero-shaders.js";
import { createCore, raw } from "./hero-core.js";

const IDS = ["cyrus", "zagros", "onepharma", "pearl", "falah", "nids"];
const BASE = new URL("./assets/hero/", import.meta.url).href;
const INK = [12 / 255, 12 / 255, 14 / 255];
const HAZE = [0.011, 0.019, 0.044];      // what distance fades to: deep blue-black
// The one light in blender/hero/scene.py, hidden behind the Cyrus Cylinder at the barrel's height.
// Blender (0, 1.5, 0.36 + 0.35 + 0.80) in this scene's axes (x, z, -y). The fog is lit by it, live.
const LIGHT = [0, 1.51, -1.5];
const LIGHT_COL = [6.6, 7.1, 8.3];        // cold moonlight: the smoke round the light is blue-grey, never pure white
const FOG_AMB = [0.022, 0.036, 0.070];    // what the fog shows away from the light: a faint deep blue
const TILE = 1.5, REACH = 0.8;            // blender/hero/scene.py TILE and REACH: a piece's platform is the one tile under it, or the two it stands astride
const LIFT = 0.16;                         // how far a hovered piece rises, with its plinth and the tiles under it
const LIFT_BY = { cyrus: 0.06 };             // Cyrus, the centre piece, barely rises (Farhad: not as high as the rest)
const DEG = Math.PI / 180;
const ZS = 60;                              // the camera's far plane: scene alpha = view depth / ZS
const DRIFT_YAW = 2.5, DRIFT_PITCH = 1.0;    // camera arc with the mouse, degrees at the canvas edge
// Phones: the poster's portrait camera fits all six across the width, so on a phone each piece was about 46 px
// wide and far off (Farhad, Nov 24). Narrow portrait gets a closer, lower camera instead (pieces ~1.8x, the
// band at ~34-56% of the height, the board filling the lower half), and the row, now wider than the screen, is
// reached by a sideways drag that turns the view in place. Turning in place keeps every piece at the angle it
// was baked from; orbiting would swing the camera ~2 m off the bake view. Fully on at aspect PHONE_AT[0] and
// below, back to the poster's camera by PHONE_AT[1], so portrait tablets (0.7 and up) still see all six.
// Phones in Safari are 0.55-0.6 (svh, toolbars shown); an iPhone SE at the 560 px min-height is ~0.67.
const PHONE_CAM = { position: [0, 1.45, 8.6], target: [0, 0.35, -1.0], hfov: 32 };
const PHONE_AT = [0.6, 0.72];
const PAN_MARGIN = 5;                        // degrees a drag can turn past the outer pieces' edges
const PAN_NUDGE = [6, 2.4, 3.2];             // the hint on first view: [degrees right and back, seconds, start s]
// Scroll. Where the live scene runs the hero is pinned for 0.7 of a screen, and site.html feeds 0..1 over the
// first 0.7 of that stretch (setScroll). All in the scene's own language, nothing flashy: the camera leans in,
// the stone blocks answer in a ripple out from the Cyrus Cylinder while the pieces rise a little on their
// platforms, then the fog banks thicken and rise and the one light goes down. update() reads it through
// scrollNow, which eases after the page, so a flick of the finger still moves the scene smoothly.
const SCROLL = {
  dolly: 0.14,          // how much nearer the camera comes, a share of its distance to the target: small, the bakes are view-dependent
  dip: 0.25,            // how far the look drops as it leans in
  ease: 5,              // per second: how fast the scene catches up with the page
  rise: 0.18,           // how far a piece rises with its platform; Cyrus no more than LIFT_BY (the light hides behind it)
  block: [0.06, 0.36],  // how far a free block's top moves, least and most; three in ten sink (0.6 of it) instead
  reach: 14,            // the ripple: a block this far from the cylinder or more starts last
  fog: [0.35, 0.5, 0.6], // the fog: [starts at, extra density, extra height of the banks]
  dim: [0.55, 0.55],    // the light: [starts at, how much of it goes]
};
const WAKE_LIFE = 1.4;                       // seconds for the cursor's wake in the fog to close to a third
const WAKE_STEP = 0.08;                      // spacing of the wake along the cursor's path, in canvas halves
const MOTES = 420;                           // dust in the air round the light

// The entrance, s seconds after the scene starts. The light comes up once, smoothly (no flicker: Farhad
// did not like the light trying to catch). Five pieces rise into place from a little below, each with its own
// delay, distance and time: two pairs start almost together, the shield lands last. Cyrus stands still.
// Some board blocks start a little high or low and settle once (see "aIn" below). The light is mostly up before anything moves, so the motion is seen. All done by about 3.6 s.
function igniteAt(s) {
  const x = Math.min(1, Math.max(0, (s - 0.15) / 1.3));
  return x * x * (3 - 2 * x);
}
const ENTER = {                                // [delay s, distance below rest, seconds to rise]
  pearl: [0.6, 0.30, 1.6], onepharma: [0.7, 0.36, 1.7], zagros: [1.0, 0.42, 1.9],
  falah: [1.45, 0.26, 1.5], nids: [1.55, 0.45, 2.0],
};
const TILE_IN = { share: 0.36, min: 0.05, max: 0.2, delay: [0.5, 1.9], dur: [1.2, 1.9] };
const outCubic = x => { x = Math.min(1, Math.max(0, x)); return 1 - (1 - x) * (1 - x) * (1 - x); };
const smooth = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };

// The hero world: the chessboard with its six pieces, rendered by the core (hero-core.js). Owns the scene,
// the camera and its framing, the fog and dust materials (the core's fog pass and dust pass draw them), the
// pieces' state and rigs, the board's attributes, the hover / tap / pan input on the canvas, the scroll
// choreography and the entrance. gltf is the loaded pieces.glb.
function createHeroWorld(core, gltf, layout, opts = {}) {
  const orientation = opts.orientation || (() => "landscape");
  const { canvas, renderer } = core;
  const disposables = [];
  const listeners = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); listeners.push([t, e, f, o]); };

  const scene = new THREE.Scene();
  const hazeU = { value: new THREE.Vector3(...HAZE) };
  const lightK = { value: 1 };          // the light's strength under scroll (SCROLL.dim): fog, block sides and dust share it

  // backdrop: the night behind the board, blue-black at the horizon melting up into the ground colour.
  // The fog pass lights it around the hidden light.
  const backGeo = new THREE.PlaneGeometry(2, 2);
  const backMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uHaze: hazeU, uInk: { value: new THREE.Vector3(...INK) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }",
    fragmentShader: "uniform vec3 uHaze; uniform vec3 uInk; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(uHaze, uInk, smoothstep(0.30, 0.95, vUv.y)), 1.0); }",      // alpha 1: as far as it goes
  });
  const back = new THREE.Mesh(backGeo, backMat);
  back.frustumCulled = false; back.renderOrder = -10;
  scene.add(back);
  disposables.push(backGeo, backMat);

  // pieces and plinths: swap the exported materials for the unlit baked shader
  const pieces = {}, state = {}, liftAmt = new Float32Array(IDS.length);
  let boardMesh = null;
  scene.add(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const src = o.material, map = raw(src.map);
    if (o.name === "board") {
      // blocks of stone at uneven heights, one baked texture (reflections included)
      map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      boardMesh = o;
      o.material = new THREE.ShaderMaterial({
        ...boardShaders({ nocc: IDS.length, zs: ZS }),
        uniforms: { map: { value: map }, uHaze: hazeU, uLiftAmt: { value: liftAmt }, uInT: { value: 0 }, uMatte: { value: 0.0 },
          uScroll: { value: 0 }, uNearZ: { value: 99 }, uLightK: lightK, uLight: { value: new THREE.Vector3(...LIGHT) },
          uCentre: { value: new THREE.Vector2(layout.board.center[0], layout.board.center[1]) },
          uHalf: { value: new THREE.Vector2(layout.board.size[0] / 2, layout.board.size[1] / 2) } },
      });
      disposables.push(o.geometry, o.material, map);
      src.dispose();
      return;
    }
    map.anisotropy = 4;
    o.material = new THREE.ShaderMaterial({
      ...pieceShaders({ zs: ZS }),
      // the pearl's gloss is baked like everything else, so it gets the same faint glint, not a second highlight
      uniforms: { map: { value: map }, matcap: { value: core.matcap }, uSheen: { value: /^plinth-/.test(o.name) ? 0.16 : o.name === "piece-cyrus" ? 0.03 : 0.06 }, uHaze: hazeU },
    });
    disposables.push(o.geometry, o.material, map);
    src.dispose();
  });
  for (const id of IDS) {
    const p = gltf.scene.getObjectByName("piece-" + id), pl = gltf.scene.getObjectByName("plinth-" + id);
    if (!p || !pl) throw new Error("pieces.glb is missing " + id);
    pieces[id] = p;
    const box = new THREE.Box3().setFromObject(p).union(new THREE.Box3().setFromObject(pl));
    state[id] = {
      box, baseRot: p.rotation.y, plinth: pl, pieceY: p.position.y, plinthY: pl.position.y, lift: 0,
      at: new THREE.Box3().setFromObject(pl).getCenter(new THREE.Vector3()),
      period: 11 + (IDS.indexOf(id) * 8) / 5, phase: IDS.indexOf(id) * 1.7,
      top: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2),
      centre: box.getCenter(new THREE.Vector3()),
    };
  }

  // moving parts: each piece's rig comes from the node extras (pieces.py _rig); its parts are marked in COLOR_0
  const rigs = {};
  for (const id of IDS) {
    let parts = [];
    try { parts = JSON.parse(pieces[id].userData.rig || "[]"); } catch (_) { parts = []; }
    if (!parts.length) continue;
    const P = [0, 1, 2].map(() => new THREE.Vector4()), A = [0, 1, 2].map(() => new THREE.Vector4(0, 1, 0, 0));
    const H = [0, 1, 2].map(() => new THREE.Vector4());
    for (const r of parts) {
      const i = r.part - 1;
      if (i < 0 || i > 2) continue;
      if (r.mode === "hang") { P[i].w = 1; H[i].set(r.anchor[0], r.anchor[1], r.anchor[2], r.of - 1); }
      else { P[i].set(r.pivot[0], r.pivot[1], r.pivot[2], 0); A[i].set(r.axis[0], r.axis[1], r.axis[2], 0); }
    }
    let rigged = false;
    pieces[id].traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.color) return;
      Object.assign(o.material.uniforms, { uRigP: { value: P }, uRigA: { value: A }, uRigH: { value: H } });
      o.material.defines = { ...o.material.defines, RIG: 1 };
      o.material.vertexColors = true;
      o.material.needsUpdate = true;
      rigged = true;
    });
    if (rigged) rigs[id] = { parts: parts.map(r => ({ r, x: 0, v: 0 })), A, t: 99, was: false };
  }

  // which board corners rise with which piece: the tops of the tiles its platform is made of
  {
    if (!boardMesh) throw new Error("pieces.glb is missing the board");
    const pos = boardMesh.geometry.attributes.position, v = new THREE.Vector3(), a = new Float32Array(pos.count).fill(-1);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(boardMesh.matrixWorld);
      if (v.y < -0.3) continue;                       // the foot of a block stays where it is
      const cx = Math.round(v.x / TILE) * TILE, cz = Math.round(v.z / TILE) * TILE;
      IDS.forEach((id, k) => { const c = state[id].at; if (Math.abs(cx - c.x) < REACH && Math.abs(cz - c.z) < REACH) a[i] = k; });
    }
    boardMesh.geometry.setAttribute("aLift", new THREE.BufferAttribute(a, 1));
    // the entrance: about a third of the free blocks start a little high or low and settle once. Picked by a
    // fixed hash of the tile, so it is the same composition every visit. Platforms (Cyrus's too) stay out.
    const ain = new Float32Array(pos.count * 3), T = TILE_IN;
    // the scroll ripple: every free block, starting later the farther it is from the cylinder, each by its own
    // amount, most up and some down. Worked out here in float64 and stored: a GPU sin-hash would not match.
    const ascr = new Float32Array(pos.count * 2), c0 = state.cyrus.at, S = SCROLL;
    const hash = (x, z, n) => { const h = Math.sin(x * 127.1 + z * 311.7 + n * 74.7) * 43758.5453; return h - Math.floor(h); };
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(boardMesh.matrixWorld);
      if (v.y < -0.3) continue;
      const ix = Math.round(v.x / TILE), iz = Math.round(v.z / TILE);
      if (IDS.some(id => Math.abs(ix * TILE - state[id].at.x) < REACH && Math.abs(iz * TILE - state[id].at.z) < REACH)) continue;
      const amp = S.block[0] + (S.block[1] - S.block[0]) * hash(ix, iz, 6);
      ascr[i * 2] = Math.min(1, Math.hypot(ix * TILE - c0.x, iz * TILE - c0.z) / S.reach) * 0.5 + 0.15 * hash(ix, iz, 5);
      ascr[i * 2 + 1] = hash(ix, iz, 7) < 0.3 ? -0.6 * amp : amp;
      if (hash(ix, iz, 0) > T.share) continue;
      const mag = T.min + (T.max - T.min) * hash(ix, iz, 1);
      ain[i * 3] = hash(ix, iz, 2) < 0.5 ? -mag : mag;
      ain[i * 3 + 1] = T.delay[0] + (T.delay[1] - T.delay[0]) * hash(ix, iz, 3);
      ain[i * 3 + 2] = T.dur[0] + (T.dur[1] - T.dur[0]) * hash(ix, iz, 4);
    }
    boardMesh.geometry.setAttribute("aIn", new THREE.BufferAttribute(ain, 3));
    boardMesh.geometry.setAttribute("aScr", new THREE.BufferAttribute(ascr, 2));
    // the pieces rise as the ripple reaches their platforms
    for (const id of IDS) state[id].riseAt = Math.min(1, Math.hypot(state[id].at.x - c0.x, state[id].at.z - c0.z) / S.reach) * 0.5 + 0.05;
  }

  // camera
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, ZS);
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3();
  let focusNow = 0;
  // what the core's post pass reads from this world, shared by reference while it is attached (the dust too)
  const postU = {
    uNear: { value: camera.near }, uFar: { value: camera.far }, uFocus: { value: 10 }, uAperture: { value: 25 },
    uMaxR: { value: 14 },
  };

  // fog: marched by the core at 1/DIV of the size. Each piece shadows it through a soft footprint of its
  // bounding box (piece + plinth).
  const occ = IDS.map(id => { const b = state[id].box;
    return new THREE.Vector4((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, (b.max.x - b.min.x) * 0.375, (b.max.z - b.min.z) * 0.375); });
  const occY = IDS.map(id => new THREE.Vector2(state[id].box.min.y, state[id].box.max.y));
  // the cursor's wake (see WAKE_GLSL): shared by the fog and the dust
  const wakeD = Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, -1, 0));
  const wakeV = Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, 0, 1));
  const wakeU = { uWakeD: { value: wakeD }, uWakeV: { value: wakeV }, uWakeOn: { value: 0 } };
  const fogMat = new THREE.ShaderMaterial({
    ...fogShader({ nocc: IDS.length, div: core.fogDiv }), depthTest: false, depthWrite: false,
    uniforms: {
      uFull: core.uFull,
      uDrift: { value: 0.75 },         // 0 holds the fog still, 2 doubles its drift
      tDepth: { value: core.rt.depthTexture }, tNoise: { value: core.noiseTex },
      uOcc: { value: occ }, uOccY: { value: occY },
      uKnee: { value: 1.1 },
      uJitT: { value: 0 },             // 1 moves the march jitter every frame: smoother stills, but it shimmers like rain in bright fog
      uShadowFloor: { value: 0.02 },   // what a piece's shadow lets through: near black, as in Blender
      uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld },
      uNear: { value: camera.near }, uFar: { value: camera.far }, uTime: { value: 0 },
      uP: { value: IDS.map(id => state[id].centre) },
      uLight: { value: new THREE.Vector3(...LIGHT) },
      uLightCol: { value: new THREE.Vector3(...LIGHT_COL) }, uLightK: lightK,
      uDense: { value: 1 }, uRise: { value: 0 },
      uAmb: { value: new THREE.Vector3(...FOG_AMB) },
      // this world's scale: no fog above uTop, banks and haze mostly behind the pieces, the halo, the march cap
      uTop: { value: 3.2 }, uBankZ: { value: new THREE.Vector2(1.5, -4.0) }, uHazeZ: { value: new THREE.Vector2(4.0, -2.0) },
      uHalo: { value: 0.05 }, uTEnd: { value: 42.0 },
      // the cursor's push, read in update() (not by the shader): how far a sweep of the line of sight moves the
      // fog, about the distance to the pieces
      uWakePush: { value: 9 * 1.2 },
      ...wakeU,
    },
  });
  disposables.push(fogMat);

  // dust motes round the light, added to the frame after the depth of field (see MOTE_VS)
  const moteGeo = new THREE.BufferGeometry();
  {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const a = new Float32Array(MOTES * 4);
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    moteGeo.setAttribute("aSeed", new THREE.BufferAttribute(a, 4));
  }
  const moteMat = new THREE.ShaderMaterial({
    ...moteShader({ nocc: IDS.length }),
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: fogMat.uniforms.uTime, uScale: { value: 1000 }, uLight: fogMat.uniforms.uLight,
      uOcc: fogMat.uniforms.uOcc, uOccY: fogMat.uniforms.uOccY,
      // a box round the light
      uLo: { value: new THREE.Vector3(-1.9, 0.3, -3.4) }, uSize: { value: new THREE.Vector3(3.8, 2.6, 4.0) },
      uCol: { value: new THREE.Vector3(0.80, 0.86, 1.0) }, uGain: { value: 1.2 }, uLightK: lightK,
      uFocus: postU.uFocus, uAperture: postU.uAperture, uMaxR: postU.uMaxR,
      tDepth: { value: core.rt.depthTexture }, uFull: core.uFull, uNear: { value: camera.near }, uFar: { value: camera.far },
      ...wakeU,
    },
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  const moteScene = new THREE.Scene();
  moteScene.add(motes);
  disposables.push(moteGeo, moteMat);

  let current = null, phone = 0, panLo = 0, panHi = 0, boxesDirty = true;
  const camV = new THREE.Vector3();
  function setOrientation(o) {
    current = o;
    const v = layout[o], c = v.camera, aspect = core.W / core.H;
    // match the poster, which always fits the width: keep the horizontal view at every aspect
    const fitH = 2 * Math.atan(Math.tan((c.fovY * DEG) / 2) * v.aspect);
    // narrow portrait: blend to the closer phone camera (PHONE_CAM), horizontal view and all
    const x = o === "portrait" ? Math.min(1, Math.max(0, (PHONE_AT[1] - aspect) / (PHONE_AT[1] - PHONE_AT[0]))) : 0;
    phone = x * x * (3 - 2 * x);
    camBase.fromArray(c.position).lerp(camV.fromArray(PHONE_CAM.position), phone);
    camTarget.fromArray(c.target).lerp(camV.fromArray(PHONE_CAM.target), phone);
    const hfov = fitH + (PHONE_CAM.hfov * DEG - fitH) * phone;
    camera.fov = (2 * Math.atan(Math.tan(hfov / 2) / aspect)) / DEG;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    // how far a drag may turn each way: until the outermost piece's edge is PAN_MARGIN inside the frame
    panLo = panHi = 0;
    if (phone > 0) {
      const look = Math.atan2(camTarget.x - camBase.x, camBase.z - camTarget.z);
      for (const id of IDS) {
        const b = state[id].box;
        for (const bx of [b.min.x, b.max.x]) for (const bz of [b.min.z, b.max.z]) {
          const a = Math.atan2(bx - camBase.x, camBase.z - bz) - look;
          panHi = Math.max(panHi, a + PAN_MARGIN * DEG - hfov / 2);
          panLo = Math.max(panLo, -a + PAN_MARGIN * DEG - hfov / 2);
        }
      }
    }
    panGoal = Math.min(panHi, Math.max(-panLo, panGoal));
    boxesDirty = true;
    // depth of field and the wide glow are sized by the focal length in backing pixels, not the buffer
    // height: a portrait phone shows the board at its width, so a height rule blurred it ~3x too much there.
    // FOCAL_REF is the landscape camera's focal length at 1080 px high, so a 16:9 window is as before.
    // Landscape keeps the old height rule exactly, so a 16:10 desktop looks as it did.
    const fpx = core.uFull.value.y / (2 * Math.tan((camera.fov * DEG) / 2));
    const k = o === "landscape" ? core.uFull.value.y / 1080 : fpx / FOCAL_REF;
    postU.uMaxR.value = 13 * k;                       // shared with the motes
    core.wideSigma = (1080 * k) / 60 / 8;             // the posters' wide glow: sigma ~ h/60 at 16:9, in eighth-size texels
    moteMat.uniforms.uScale.value = fpx;
  }
  const FOCAL_REF = 1080 / (2 * Math.tan((layout.landscape.camera.fovY * DEG) / 2));
  // the core resized the buffer (or stale() asked): frame the camera again
  function resize() {
    setOrientation(orientation());        // also sizes the depth of field, the wide glow and the motes
    if (hoverId) { touchHover = null; hoverFromPointer(null); }
  }

  // ---- behaviour state
  const ndc = new THREE.Vector2(), pointer = new THREE.Vector2(), drift = new THREE.Vector2();
  const fine = matchMedia("(pointer:fine)");
  const ray = new THREE.Raycaster(), hit = new THREE.Vector3(), tmp = new THREE.Vector3();
  let hoverId = null, scrollP = 0, scrollNow = 0, scrollFed = false, pickS = 0, touchHover = null, touchTimer = 0;
  const lastMouse = { clientX: 0, clientY: 0 };
  let pointerIn = false, wakeSpeed = 0, igT = 0, igHold = -1, t = 0, disposed = false;
  const wakeAge = new Float32Array(WAKE_N).fill(99), wakePeak = new Float32Array(WAKE_N);
  const wakeAt = new THREE.Vector2(), wakePrev = new THREE.Vector3(), wakeTmp = new THREE.Vector3();
  // the phone pan (see PHONE_CAM): the look turns about the camera's own position. panGoal is where the
  // finger (or the glide after it) puts it, panNow eases after; radians, positive looks right.
  let panGoal = 0, panNow = 0, panVel = 0, drag = null, nudge = -1, boxKey = NaN, boxAt = 0;
  const UP = new THREE.Vector3(0, 1, 0);

  function setHover(id) { hoverId = id && state[id] ? id : null; }
  // the raw scroll position (0..1 of the pinned stretch); the first one is taken as is, so a reload partway down
  // starts where the page is
  function setScroll(p) { scrollP = Math.min(1, Math.max(0, p || 0)); if (!scrollFed) { scrollFed = true; scrollNow = scrollP; } }
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = null, bestD = Infinity;
    for (const id of IDS) {
      if (ray.ray.intersectBox(state[id].box, hit)) {
        const d = hit.distanceTo(camera.position);
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    return best;
  }
  function labelAt(id) {
    if (!opts.onHover) return;
    if (!id) return opts.onHover(null, 0, 0);
    tmp.copy(state[id].top); tmp.y += state[id].up || 0; tmp.project(camera);
    opts.onHover(id, (tmp.x * 0.5 + 0.5) * core.W, (-tmp.y * 0.5 + 0.5) * core.H - 6);
  }
  function hoverFromPointer(id) {
    if (id === hoverId) return;
    setHover(id); labelAt(id);
  }
  function clearTouch() { clearTimeout(touchTimer); touchHover = null; hoverFromPointer(null); }

  // input on the shared canvas: only while this world is the one attached
  const mine = () => core.world === world;
  let down = null;
  // A sideways drag turns the view where the phone framing leaves pieces outside the frame (panLo/panHi).
  // The canvas keeps touch-action:pan-y, so an upright drag still scrolls the page: the browser takes it and
  // sends pointercancel. Past 8 px, mostly sideways, it is a drag and no longer a tap.
  on(canvas, "pointermove", e => {
    if (!mine() || !down || down.id !== e.pointerId || panLo + panHi <= 0) return;
    if (e.pointerType === "mouse" && !(e.buttons & 1)) return;
    const now = performance.now();
    if (!drag) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      drag = { x: e.clientX, from: Math.min(panHi, Math.max(-panLo, panNow)), px: e.clientX, pt: now };
      nudge = -2; panVel = 0;                        // they found it: no hint
      if (e.pointerType === "mouse") { try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } }
    }
    // the board stays under the finger: the canvas width is the horizontal view
    const per = (2 * Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect)) / core.W;
    panGoal = Math.min(panHi, Math.max(-panLo, drag.from - (e.clientX - drag.x) * per));
    panVel += ((-(e.clientX - drag.px) * per * 1000) / Math.max(1, now - drag.pt) - panVel) * 0.5;
    drag.px = e.clientX; drag.pt = now;
  });
  on(canvas, "pointermove", e => {
    if (!mine() || e.pointerType !== "mouse" || drag) return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    lastMouse.clientX = e.clientX; lastMouse.clientY = e.clientY; pickS = scrollNow;
    if (!pointerIn) { pointerIn = true; wakeAt.copy(pointer); wakePrev.set(0, 0, 0); }
    hoverFromPointer(pick(e));
  });
  on(canvas, "pointerleave", e => { if (mine() && e.pointerType === "mouse") { pointer.set(0, 0); pointerIn = false; hoverFromPointer(null); } });
  on(canvas, "pointerdown", e => {
    if (!mine()) return;
    if (e.button !== 0 || e.isPrimary === false) { down = null; return; }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, id: e.pointerId };
    if (!drag) panVel = 0;                           // a touch catches the glide
  });
  on(canvas, "pointerup", e => {
    if (!mine() || !down) return;
    if (drag) {
      // let go: it glides on (update()) unless the finger had stopped
      if (performance.now() - drag.pt > 80) panVel = 0;
      drag = null; down = null;
      return;
    }
    const quick = down.type === "mouse" || performance.now() - down.t < 300;
    const tap = quick && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10;
    const type = down.type; down = null;
    if (!tap) return;
    const id = pick(e);
    if (type === "mouse") { if (id && opts.onPick) opts.onPick(id); return; }
    // touch: first tap names the piece, second tap on the same piece opens it
    if (id && id === touchHover) { clearTouch(); if (opts.onPick) opts.onPick(id); return; }
    clearTimeout(touchTimer);
    touchHover = id; hoverFromPointer(id);
    if (id) touchTimer = setTimeout(clearTouch, 4000);
  });
  on(canvas, "pointercancel", () => { down = null; drag = null; });
  on(window, "blur", () => { pointer.set(0, 0); pointerIn = false; clearTouch(); });
  on(window, "scroll", () => { if (touchHover) clearTouch(); }, { passive: true });

  function update(dt) {
    t += dt;
    // camera: a small arc with the mouse (DRIFT_YAW / DRIFT_PITCH degrees at the canvas edge), easing behind it,
    // and it leans in as the hero is scrolled (SCROLL.dolly, SCROLL.dip), from wherever the base camera is
    // (phone framing included; camBase itself never moves). The arc is a few degrees about the target, small
    // enough that the view-dependent bakes still hold; the light stays put in the world, so the halo moves as
    // parallax would.
    const sWas = scrollNow;
    scrollNow += (scrollP - scrollNow) * (1 - Math.exp(-dt * SCROLL.ease));
    if (Math.abs(scrollP - scrollNow) < 1e-4) scrollNow = scrollP;
    const sp = scrollNow, se = sp < 0.5 ? 4 * sp * sp * sp : 1 - Math.pow(2 - 2 * sp, 3) / 2;
    const de = 1 - Math.exp(-dt * 3.5), canDrift = fine.matches;
    drift.x += ((canDrift ? pointer.x : 0) - drift.x) * de;
    drift.y += ((canDrift ? pointer.y : 0) - drift.y) * de;
    tmp.copy(camBase).sub(camTarget);
    const radius = tmp.length() * (1 - SCROLL.dolly * se);
    const yaw = Math.atan2(tmp.x, tmp.z) - drift.x * DRIFT_YAW * DEG;
    const pitch = Math.asin(tmp.y / radius) + drift.y * DRIFT_PITCH * DEG;
    camera.position.set(
      camTarget.x + radius * Math.cos(pitch) * Math.sin(yaw),
      camTarget.y + radius * Math.sin(pitch),
      camTarget.z + radius * Math.cos(pitch) * Math.cos(yaw));
    tmp.copy(camTarget); tmp.y -= SCROLL.dip * se;
    camera.lookAt(tmp);
    // the phone pan: a glide after the finger lets go, then the look turns about the camera's own position.
    // The hint on first view (PAN_NUDGE) turns it a few degrees right and back, once, unless they drag first.
    if (!drag && panVel) {
      const g = panGoal + panVel * dt;
      panGoal = Math.min(panHi, Math.max(-panLo, g));
      panVel = g !== panGoal || Math.abs(panVel) < 1e-3 ? 0 : panVel * Math.exp(-dt * 5);
    }
    let hint = 0;
    if (nudge === -1 && panHi > 0 && igT >= PAN_NUDGE[2]) nudge = matchMedia("(prefers-reduced-motion: reduce)").matches ? -2 : 0;
    if (nudge >= 0) {
      nudge += dt;
      const x = nudge / PAN_NUDGE[1];
      if (x >= 1) nudge = -2;
      else hint = Math.min(panHi, PAN_NUDGE[0] * DEG) * (0.5 - 0.5 * Math.cos(2 * Math.PI * x));
    }
    const panWas = panNow;
    panNow += (panGoal + hint - panNow) * (drag || hint ? 1 : 1 - Math.exp(-dt * 12));
    if (Math.abs(panNow) < 1e-6) panNow = 0;
    if (panNow) camera.rotateOnWorldAxis(UP, -panNow);
    camera.updateMatrixWorld();
    if (hoverId && (Math.abs(drift.x - pointer.x) + Math.abs(drift.y - pointer.y) > 1e-3 || Math.abs(panNow - panWas) > 1e-5
      || Math.abs(scrollNow - sWas) > 1e-4)) labelAt(hoverId);
    // the wheel moves the scene under a still mouse: look again at what is under it
    if (pointerIn && canDrift && !drag && Math.abs(scrollNow - pickS) > 2e-3) { pickS = scrollNow; hoverFromPointer(pick(lastMouse)); }
    // the scroll's board and air: the ripple (none right in front of the lens), the banks thicken and rise
    // from SCROLL.fog[0], the light goes down from SCROLL.dim[0]
    const bu = boardMesh.material.uniforms, fc = smooth(SCROLL.fog[0], 1, sp);
    bu.uScroll.value = sp; bu.uNearZ.value = camera.position.z - 1.5;
    fogMat.uniforms.uDense.value = 1 + SCROLL.fog[1] * fc;
    fogMat.uniforms.uRise.value = SCROLL.fog[2] * fc;
    lightK.value = 1 - SCROLL.dim[1] * smooth(SCROLL.dim[0], 1, sp);

    // the entrance: the light comes up, pieces rise, blocks settle (replay from the console: heroLive.ignite(); heroLive.ignite(1.5) holds it at 1.5 s)
    igT = igHold >= 0 ? igHold : igT + dt;
    core.fxaa.uIgnite.value = igniteAt(igT);
    boardMesh.material.uniforms.uInT.value = igT;

    // the cursor's wake: while the mouse moves over the hero it lays a trail of lines of sight, evenly spaced
    // along the path it took (WAKE_STEP apart, filled in when the mouse jumps), so the trail is one smooth
    // stroke, not beads. Each eases in, pushes the fog the way the cursor went, then fades (WAKE_LIFE) and
    // widens so the fog closes back in. A new one takes the faintest slot, so nothing strong ever vanishes.
    let wakeSum = 0;
    for (let i = 0; i < WAKE_N; i++) {
      wakeAge[i] += dt;
      const a = wakeAge[i], s = wakePeak[i] * Math.min(1, a / 0.18) * Math.exp(-a / WAKE_LIFE);
      wakeD[i].w = s < 0.004 ? 0 : s;
      wakeV[i].w = 0.6 + Math.min(a, 2) * 0.45;
      wakeSum += wakeD[i].w;
    }
    // how fast the cursor goes (canvas halves a second), smoothed: a fast stroke parts the fog more
    const mv = Math.hypot(pointer.x - wakeAt.x, pointer.y - wakeAt.y);
    wakeSpeed += ((pointerIn && canDrift ? mv / Math.max(dt, 1e-3) : 0) - wakeSpeed) * (1 - Math.exp(-dt * 8));
    if (pointerIn && canDrift && mv > WAKE_STEP) {
      const n = Math.min(4, Math.floor(mv / WAKE_STEP));
      const peak = Math.min(0.7, 0.2 + wakeSpeed * 0.25);
      for (let j = 1; j <= n; j++) {
        const f = j / n;
        ndc.set(wakeAt.x + (pointer.x - wakeAt.x) * f, -(wakeAt.y + (pointer.y - wakeAt.y) * f));
        ray.setFromCamera(ndc, camera);
        const dir = ray.ray.direction;
        let k = 0;
        for (let i = 1; i < WAKE_N; i++) if (wakeD[i].w < wakeD[k].w) k = i;
        wakeD[k].set(dir.x, dir.y, dir.z, 0);
        wakeAge[k] = 0; wakePeak[k] = peak;
        // the push: how far the line of sight swept, at about the depth of the pieces (uWakePush)
        if (wakePrev.lengthSq() > 0) wakeTmp.copy(dir).sub(wakePrev).multiplyScalar(fogMat.uniforms.uWakePush.value);
        else wakeTmp.set(0, 0, 0);
        if (wakeTmp.length() > 0.7) wakeTmp.setLength(0.7);
        wakeV[k].set(wakeTmp.x, wakeTmp.y, wakeTmp.z, 0.5);
        wakePrev.copy(dir);
      }
      wakeAt.copy(pointer);
      wakeSum += 1;
    }
    fogMat.uniforms.uWakeOn.value = wakeSum > 0 ? 1 : 0;

    // The hovered piece rises a little, with its plinth and the tiles under it, and the focus goes to it; with
    // nothing hovered the focus rests on Cyrus. The light never moves. The idle sway is one degree, too little
    // to move the baked light visibly.
    const ease = 1 - Math.exp(-dt * 6);
    IDS.forEach((id, k) => {
      // entrance: the piece starts below its place and rises once; hover waits until it has landed
      const en = ENTER[id], landed = !en || igT >= en[0] + en[2];
      const sunk = en && !landed ? -en[1] * (1 - outCubic((igT - en[0]) / en[2])) : 0;
      const s = state[id], to = id === hoverId && landed ? (LIFT_BY[id] ?? LIFT) : 0;
      if (Math.abs(to - s.lift) > 1e-4) {
        s.lift += (to - s.lift) * ease;
        if (id === hoverId) labelAt(id);
      } else s.lift = to;
      // the scroll: the piece rises with its platform as the ripple reaches it. Cyrus only as high as its hover,
      // and the two do not add: the light is hidden right behind the cylinder and must stay hidden.
      const capped = id in LIFT_BY, rise = (capped ? Math.min(SCROLL.rise, LIFT_BY[id]) : SCROLL.rise) * smooth(s.riseAt, s.riseAt + 0.35, sp);
      const up = (capped ? Math.max(s.lift, rise) : s.lift + rise) + sunk;
      s.up = up; liftAmt[k] = up;
      pieces[id].position.y = s.pieceY + up; s.plinth.position.y = s.plinthY + up;
      occY[k].y = s.box.max.y + up;
      pieces[id].rotation.y = s.baseRot + Math.sin((t / s.period) * Math.PI * 2 + s.phase) * 1 * DEG;
      // its moving parts: a turn springs to its angle while hovered and back after; a quiver shakes once
      const rg = rigs[id];
      if (rg) {
        const hov = id === hoverId;
        if (hov && !rg.was) rg.t = 0;
        rg.was = hov; rg.t += dt;
        for (const L of rg.parts) {
          const r = L.r, i = r.part - 1;
          if (r.mode === "turn") {
            const to = hov ? r.angle : 0, kk = r.k || 20, cc = r.c || 9, n = Math.ceil(dt / 0.008), h = dt / n;
            for (let j = 0; j < n; j++) { L.v += (kk * (to - L.x) - cc * L.v) * h; L.x += L.v * h; }
            rg.A[i].w = L.x * DEG;
          } else if (r.mode === "quiver") {
            rg.A[i].w = r.angle * DEG * Math.exp(-rg.t * r.decay) * Math.sin(rg.t * r.freq);
          }
        }
      }
    });
    // from where the camera is now (phone framing, scroll, drift), so Cyrus stays sharp wherever it stands
    const focusTo = camera.position.distanceTo(state[hoverId || layout.focusId].centre);
    focusNow = focusNow ? focusNow + (focusTo - focusNow) * (1 - Math.exp(-dt * 4)) : focusTo;
    postU.uFocus.value = focusNow;
    fogMat.uniforms.uTime.value = t;
    // the page's link boxes follow the live view: at once after a resize, then at most every 0.12 s while the
    // pan, the scroll or a piece's rise moves them (the last move always lands: the key still differs)
    if (opts.onBoxes) {
      let key = panNow + scrollNow * 10;
      for (const id of IDS) key += (state[id].up || 0) * 3;
      if (boxesDirty || (Math.abs(key - boxKey) > 1e-4 && t - boxAt > 0.12)) {
        boxesDirty = false; boxKey = key; boxAt = t;
        opts.onBoxes(boxes());
      }
    }
  }
  // each piece's box (piece and plinth, risen by its lift) through the live camera, in CSS px of the stage.
  // on: its centre is inside the stage
  function boxes() {
    const out = {}, W = core.W, H = core.H;
    for (const id of IDS) {
      const b = state[id].box, up = state[id].up || 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        tmp.set(i & 1 ? b.max.x : b.min.x, (i & 2 ? b.max.y : b.min.y) + up, i & 4 ? b.max.z : b.min.z).project(camera);
        const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      out[id] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, on: cx >= 0 && cx <= W && cy >= 0 && cy <= H };
    }
    return out;
  }

  // freeze(t): every time-dependent input held still for pixel-exact refactor checks (scripts/hero-snapshot.md).
  // Scene time t, ignite (fully lit, entrance done), wake, drift, hover, scroll, phone pan and rig springs are
  // set to rest, and the core steps with dt 0, so every frame is identical. freeze(null) lets time run again
  // and gives back the ignite hold from before the freeze.
  let frozenT = null, igHoldWas = -1;
  function hold() {
    if (frozenT === null) return;
    t = frozenT; igHold = frozenT;
    pointer.set(0, 0); drift.set(0, 0); pointerIn = false; hoverId = null; touchHover = null;
    scrollP = scrollNow = 0;
  }
  function freeze(tv) {
    if (typeof tv !== "number") {
      if (frozenT !== null) igHold = igHoldWas;
      frozenT = null; core.setFrozen(false); return;
    }
    if (frozenT === null) igHoldWas = igHold;
    frozenT = tv; hold(); core.setFrozen(true);
    wakeAge.fill(99); wakePeak.fill(0); wakeSpeed = 0;
    for (let i = 0; i < WAKE_N; i++) { wakeD[i].set(0, 0, -1, 0); wakeV[i].set(0, 0, 0, 1); }
    panGoal = panNow = panVel = 0; drag = null; nudge = -2; focusNow = 0;
    for (const id of IDS) {
      state[id].lift = 0;
      const rg = rigs[id];
      if (rg) { rg.t = 99; rg.was = false; for (const L of rg.parts) { L.x = 0; L.v = 0; rg.A[L.r.part - 1].w = 0; } }
    }
    update(0); t = tv;
  }

  function ignite(s) { igHold = typeof s === "number" ? s : -1; if (igHold < 0) igT = 0; }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(touchTimer);
    for (const [tg, e, f, o] of listeners) tg.removeEventListener(e, f, o);
    for (const d of disposables) { try { d.dispose(); } catch (_) { /* already gone */ } }
  }

  const world = {
    scene, camera, zs: camera.far, fogMat, moteMat, moteScene,
    update, postUniforms: () => postU, ignite, resize, dispose, hold,
    stale: () => current !== orientation(),
    // the hero's own surface (heroLive)
    pieces, setOrientation, setHover, setScroll, boxes, freeze,
    board: boardMesh.material.uniforms,
    get phone() { return phone; },
  };
  return world;
}

export async function mountHero(stage, layout, opts = {}) {
  // the core (renderer, matcap) and pieces.glb load side by side
  const gl = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let core = null;
  const [coreR, gltfR] = await Promise.allSettled([
    createCore({ onLost: reason => { if (opts.onLost) opts.onLost(reason); } }),
    gl.loadAsync(BASE + "pieces.glb"),
  ]);
  if (coreR.status === "fulfilled") core = coreR.value;
  if (gltfR.status === "rejected") { if (core) core.dispose(); throw gltfR.reason; }
  if (!core) throw coreR.reason;
  let world = null;
  try {
    world = createHeroWorld(core, gltfR.value, layout, opts);
    // render state for ?why: the rung ladder, scene target MSAA and half float (post targets checked apart)
    const handle = {
      canvas: core.canvas, pieces: world.pieces, camera: world.camera, ladder: core.ladderName,
      msaa: core.msaa, half: core.half, halfPost: core.halfFloat, core, world,
      setOrientation: world.setOrientation, setHover: world.setHover, setScroll: world.setScroll,
      render: core.render, start: core.start, stop: core.stop, dispose: core.dispose, resize: core.resize, boxes: world.boxes,
      // tuning from the console: heroLive.fog, .post (depth of field, fog upsample), .fxaa (also the bloom
      // weights uTightK, uWideK, and uIgnite), .bright (bloom threshold uThresh), .motes (uGain, uCol); .ignite() replays the light
      ignite: world.ignite, grain: core.grain, motes: world.moteMat.uniforms, freeze: world.freeze, hash: core.hash, sig: core.sig,
      setLevel: core.setLevel,
      board: world.board, fog: world.fogMat.uniforms, post: core.post, fxaa: core.fxaa, bright: core.bright,
    };
    // live values from the core and the world
    for (const k of ["frameCount", "level", "mountMs", "pr", "buf"]) Object.defineProperty(handle, k, { get: () => core[k], enumerable: true });
    Object.defineProperty(handle, "stepped", { get: () => core.stepped || undefined, enumerable: true });
    Object.defineProperty(handle, "phone", { get: () => Math.round(world.phone * 100) / 100, enumerable: true });

    core.attach(stage, world);
    if (new URLSearchParams(location.search).has("compare")) core.grainCompare();
    world.update(0, core); core.render();          // first frame is on screen before the caller fades the stage in
    core.mountTest(world);
    core.initReadout();
    core.start();
    return handle;
  } catch (e) { if (world && core.world !== world) world.dispose(); core.dispose(); throw e; }
}
