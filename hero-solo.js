// A solo world: one project's piece alone on a patch of the board, close up, for its chapter in Work (03).
// Rendered by the same core as the hero (hero-core.js), on the same canvas, moved into the chapter's plate.
// Same world scale as the hero, so the fog noise, dust and wake behave the same; the close-up is a long lens.
// The bake (blender/hero/solo.py) holds only what does not depend on the view: diffuse, translucency, shadow,
// occlusion and the fog's scattered light. The highlight is drawn live (PIECE_FS, SOLO) from the one light and
// the baked mask, so the view can tilt toward the mouse (layout.tilt degrees) without the bake sliding.
// Everything per piece comes from its layout.json (glTF axes = these axes): camera, light, board patch, piece
// box, tilt. The fog's extents are the hero's, measured from the piece instead of from the Cyrus Cylinder.
import * as THREE from "three";
import { WAKE_N, pieceShaders, boardShaders, fogShader, moteShader } from "./hero-shaders.js";
import { raw, igniteAt } from "./hero-core.js";

const INK = [12 / 255, 12 / 255, 14 / 255];
const HAZE = [0.011, 0.019, 0.044];          // the hero's: what distance fades to
const FOG_AMB = [0.022, 0.036, 0.070];       // the hero's: the fog away from the light
const HERO_LIGHT_COL = [6.6, 7.1, 8.3];      // the hero's fog light (900 W in Blender, 1.5 m from the cylinder)
const HERO_FOCUS = 10;                        // the hero camera's distance to the Cyrus Cylinder
const DEG = Math.PI / 180;
const ZS = 60;                                // far plane, as the hero's (the post pass's ZS define stays put)
const MOTES = 420;
const WAKE_LIFE = 1.4, WAKE_STEP = 0.08;     // as the hero's
// the hero landscape camera's focal length at 1080 px high: depth of field and the wide glow are sized by it
const FOCAL_REF = 1080 / (2 * Math.tan((25.361 * DEG) / 2));
// Defaults, tuned live with Farhad through soloLive (see mountSolo in hero.js)
export const SOLO_DEFAULTS = {
  specK: 0.012,          // the live highlight's strength (PIECE_FS SOLO), times the light's energy in watts
  sheen: { piece: 0.03, plinth: 0.16 },   // the faint matcap glint, as the hero's Cyrus and plinths
  fit: 0.8,              // the piece box stays inside this share of its part of the screen (below)
  // the plate is the whole screen with the copy over it: wide plates keep the piece in the left part, tall ones
  // (phones) in the upper part. [centre of that part, its size], as shares of the width or the height
  wide: [0.33, 0.62], tall: [0.36, 0.66],
  ease: 3.5,             // per second: how fast the tilt follows the pointer
  touch: [3, 14],        // touch screens: the view drifts this many degrees of yaw, over this many seconds
  tapHold: 2.2,          // a tap plays the moving part for this long, then it goes back
};

const TILE = 1.5;                             // as hero.js and blender/hero/scene.py
// Keeps the board triangles of the tiles under the plinth's centre (a plinth astride a seam keeps both).
function ownBlock(board, plinth) {
  if (!plinth) return;
  const g = board.geometry, pos = g.attributes.position, src = g.index;
  const c = new THREE.Box3().setFromObject(plinth).getCenter(new THREE.Vector3());
  const near = (v, at) => {                   // how far the tile holding v is from the plinth's centre, in tiles
    return Math.abs(Math.round(v / TILE) * TILE - at) < TILE / 2 + 0.05;
  };
  const v = new THREE.Vector3(), m = new THREE.Vector3(), keep = [];
  for (let i = 0; i < src.count; i += 3) {
    m.set(0, 0, 0);
    for (let j = 0; j < 3; j++) m.add(v.fromBufferAttribute(pos, src.getX(i + j)).applyMatrix4(board.matrixWorld));
    m.divideScalar(3);
    if (near(m.x, c.x) && near(m.z, c.z)) keep.push(src.getX(i), src.getX(i + 1), src.getX(i + 2));
  }
  if (keep.length) g.setIndex(keep);
}

// gltf: the loaded solo.glb; layout: its layout.json. opts: { pointerTarget }.
export function createSoloWorld(core, gltf, layout, opts = {}) {
  const { canvas, renderer } = core;
  const id = layout.id;
  const disposables = [];
  const listeners = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); listeners.push([t, e, f, o]); };
  const D = SOLO_DEFAULTS;

  const scene = new THREE.Scene();
  const hazeU = { value: new THREE.Vector3(...HAZE) };
  const lightK = { value: 1 };
  const light = new THREE.Vector3(...layout.light);
  const pMin = new THREE.Vector3(...layout.piece.min), pMax = new THREE.Vector3(...layout.piece.max);
  const pieceBox = new THREE.Box3(pMin, pMax), centre = pieceBox.getCenter(new THREE.Vector3());
  // the light's energy: Blender keeps the hero's irradiance at the piece, 900 W x (d / 1.5)^2 (solo.py)
  const dLight = light.distanceTo(centre), watts = 900 * (dLight / 1.5) ** 2;
  const specU = {
    uSpecK: { value: D.specK }, uLight: { value: light },
    uLightCol: { value: new THREE.Vector3(...(layout.lightCol || [1, 1, 1])).multiplyScalar(watts) },
  };

  // backdrop: the hero's night, blue-black low, melting up into the ground colour
  const backGeo = new THREE.PlaneGeometry(2, 2);
  const backMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uHaze: hazeU, uInk: { value: new THREE.Vector3(...INK) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }",
    fragmentShader: "uniform vec3 uHaze; uniform vec3 uInk; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(uHaze, uInk, smoothstep(0.30, 0.95, vUv.y)), 1.0); }",
  });
  const back = new THREE.Mesh(backGeo, backMat);
  back.frustumCulled = false; back.renderOrder = -10;
  scene.add(back);
  disposables.push(backGeo, backMat);

  let piece = null, boardMesh = null, rig = null;
  const sheenU = { piece: { value: D.sheen.piece }, plinth: { value: D.sheen.plinth } };
  try {
    scene.add(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const src = o.material, map = raw(src.map);
      if (o.name === "board") {
        map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        boardMesh = o;
        o.material = new THREE.ShaderMaterial({
          ...boardShaders({ nocc: 1, zs: ZS }),
          uniforms: { map: { value: map }, uHaze: hazeU, uLiftAmt: { value: new Float32Array(1) }, uInT: { value: 0 }, uMatte: { value: 0.0 },
            uScroll: { value: 0 }, uNearZ: { value: 99 }, uLightK: lightK, uLight: { value: light },
            uCentre: { value: new THREE.Vector2(layout.board.center[0], layout.board.center[1]) },
            uHalf: { value: new THREE.Vector2(layout.board.size[0] / 2, layout.board.size[1] / 2) } },
        });
        // The board shader reads three attributes the solo glb does not carry. A missing attribute reads 0, and
        // aLift 0 would lift every tile with piece 0: no tile lifts (-1), no entrance (aIn 0), no ripple (aScr 0).
        // Farhad: only the piece and the block it stands on. Every triangle whose tile is not under the plinth goes
        // (a tile is TILE wide, centred on a multiple of TILE in the board's own patch, with a gap between blocks).
        ownBlock(o, gltf.scene.getObjectByName("plinth-" + id));
        const n = o.geometry.attributes.position.count;
        o.geometry.setAttribute("aLift", new THREE.BufferAttribute(new Float32Array(n).fill(-1), 1));
        o.geometry.setAttribute("aIn", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        o.geometry.setAttribute("aScr", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        disposables.push(o.geometry, o.material, map);
        src.dispose();
        return;
      }
      map.anisotropy = 4;
      const plinth = /^plinth-/.test(o.name), mask = !plinth && src.emissiveMap ? raw(src.emissiveMap) : null;
      o.material = new THREE.ShaderMaterial({
        ...pieceShaders({ zs: ZS, solo: !!mask }),
        uniforms: { map: { value: map }, matcap: { value: core.matcap }, uSheen: plinth ? sheenU.plinth : sheenU.piece, uHaze: hazeU,
          ...(mask ? { emissiveMap: { value: mask }, ...specU } : {}) },
      });
      disposables.push(o.geometry, o.material, map);
      if (mask) disposables.push(mask);
      src.dispose();
    });
    piece = gltf.scene.getObjectByName("piece-" + id);
    if (!piece || !boardMesh || !gltf.scene.getObjectByName("plinth-" + id)) throw new Error("solo.glb for " + id + " is missing a node");
    // the moving part: the hero's rig (node extras, COLOR_0 red = part / 8)
    let parts = [];
    try { parts = JSON.parse(piece.userData.rig || "[]"); } catch (_) { parts = []; }
    if (parts.length) {
      const P = [0, 1, 2].map(() => new THREE.Vector4()), A = [0, 1, 2].map(() => new THREE.Vector4(0, 1, 0, 0));
      const H = [0, 1, 2].map(() => new THREE.Vector4());
      for (const r of parts) {
        const i = r.part - 1;
        if (i < 0 || i > 2) continue;
        if (r.mode === "hang") { P[i].w = 1; H[i].set(r.anchor[0], r.anchor[1], r.anchor[2], r.of - 1); }
        else { P[i].set(r.pivot[0], r.pivot[1], r.pivot[2], 0); A[i].set(r.axis[0], r.axis[1], r.axis[2], 0); }
      }
      let rigged = false;
      piece.traverse(o => {
        if (!o.isMesh || !o.geometry.attributes.color) return;
        Object.assign(o.material.uniforms, { uRigP: { value: P }, uRigA: { value: A }, uRigH: { value: H } });
        o.material.defines = { ...o.material.defines, RIG: 1 };
        o.material.vertexColors = true;
        o.material.needsUpdate = true;
        rigged = true;
      });
      if (rigged) rig = { parts: parts.map(r => ({ r, x: 0, v: 0 })), A, t: 99, was: false };
    }
  } catch (e) {
    for (const d of disposables) { try { d.dispose(); } catch (_) { /* already gone */ } }
    gltf.scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); } } });
    throw e;
  }

  // camera: the layout's, orbited about the piece's centre by the tilt; fovY widened to fit the plate
  const cam0 = layout.camera;
  const camera = new THREE.PerspectiveCamera(cam0.fovY, cam0.aspect || 1, 0.5, ZS);
  const basePos = new THREE.Vector3(...cam0.position), baseTarget = new THREE.Vector3(...cam0.target);
  const focus0 = basePos.distanceTo(centre);
  const postU = {
    uNear: { value: camera.near }, uFar: { value: camera.far }, uFocus: { value: focus0 },
    // the blur a depth difference makes grows as 1 / distance^2: the hero's 25 at its 10 m, scaled to this lens,
    // so the piece is as sharp front to back as Cyrus is in the hero and the far fog is soft
    uAperture: { value: 25 * (focus0 / HERO_FOCUS) ** 2 }, uMaxR: { value: 14 },
  };

  // fog: one occluder (piece and plinth), the hero's extents measured from this piece
  const all = new THREE.Box3().setFromObject(piece).union(new THREE.Box3().setFromObject(gltf.scene.getObjectByName("plinth-" + id)));
  const occ = [new THREE.Vector4((all.min.x + all.max.x) / 2, (all.min.z + all.max.z) / 2, (all.max.x - all.min.x) * 0.375, (all.max.z - all.min.z) * 0.375)];
  const occY = [new THREE.Vector2(all.min.y, all.max.y)];
  const wakeD = Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, -1, 0));
  const wakeV = Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, 0, 1));
  const wakeU = { uWakeD: { value: wakeD }, uWakeV: { value: wakeV }, uWakeOn: { value: 0 } };
  const z0 = centre.z;
  const fogMat = new THREE.ShaderMaterial({
    ...fogShader({ nocc: 1, div: core.fogDiv }), depthTest: false, depthWrite: false,
    uniforms: {
      uFull: core.uFull, uDrift: { value: 0.75 },
      tDepth: { value: core.rt.depthTexture }, tNoise: { value: core.noiseTex },
      uOcc: { value: occ }, uOccY: { value: occY },
      uKnee: { value: 1.1 }, uJitT: { value: 0 }, uShadowFloor: { value: 0.02 },
      uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld },
      uNear: { value: camera.near }, uFar: { value: camera.far }, uTime: { value: 0 },
      uP: { value: [centre] }, uLight: { value: light },
      // the hero's moonlight at the same irradiance: Blender's energy for this piece over the hero's 900 W
      uLightCol: { value: new THREE.Vector3(...HERO_LIGHT_COL).multiplyScalar(watts / 900) }, uLightK: lightK,
      uDense: { value: 1 }, uRise: { value: 0 },
      uAmb: { value: new THREE.Vector3(...FOG_AMB) },
      // the hero's numbers (3.2 / 1.5..-4 / 4..-2 from the cylinder at z 0), from this piece's top and centre
      uTop: { value: Math.max(3.2, pMax.y + 1.4) },
      uBankZ: { value: new THREE.Vector2(z0 + 1.5, z0 - 4.0) }, uHazeZ: { value: new THREE.Vector2(z0 + 4.0, z0 - 2.0) },
      uHalo: { value: 0.05 }, uTEnd: { value: 42.0 },
      uWakePush: { value: focus0 * 1.2 },          // the hero's rule: about the distance to the piece
      ...wakeU,
    },
  });
  disposables.push(fogMat);

  // dust: the hero's box round the light, moved to this light
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
    ...moteShader({ nocc: 1 }),
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: fogMat.uniforms.uTime, uScale: { value: 1000 }, uLight: fogMat.uniforms.uLight,
      uOcc: fogMat.uniforms.uOcc, uOccY: fogMat.uniforms.uOccY,
      uLo: { value: light.clone().add(new THREE.Vector3(-1.9, -1.21, -1.9)) }, uSize: { value: new THREE.Vector3(3.8, 2.6, 4.0) },
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

  // ---- framing: fovY so the piece box sits inside D.fit of the plate (height when wide, width when tall),
  // never narrower than the baked view's own fovY
  const tilt = { yaw: (layout.tilt || [20, 6])[0], pitch: (layout.tilt || [20, 6])[1] };
  const tmp = new THREE.Vector3();
  function frame() {
    const aspect = core.W / core.H;
    camera.position.copy(basePos); camera.up.set(0, 1, 0); camera.lookAt(baseTarget); camera.updateMatrixWorld();
    let ty = 0, tx = 0;
    for (let i = 0; i < 8; i++) {
      tmp.set(i & 1 ? pMax.x : pMin.x, i & 2 ? pMax.y : pMin.y, i & 4 ? pMax.z : pMin.z).applyMatrix4(camera.matrixWorldInverse);
      const z = Math.max(-tmp.z, 1e-3);
      ty = Math.max(ty, Math.abs(tmp.y) / z); tx = Math.max(tx, Math.abs(tmp.x) / z);
    }
    const isWide = aspect >= 1, [at, size] = isWide ? D.wide : D.tall;
    const half = Math.max(Math.tan((cam0.fovY * DEG) / 2), ty / (D.fit * (isWide ? 1 : size)), tx / (D.fit * aspect * (isWide ? size : 1)));
    // slide the picture, not the camera: the view (and so the bake's angle) stays the layout's
    camera.setViewOffset(core.W, core.H, isWide ? (0.5 - at) * core.W : 0, isWide ? 0 : (0.5 - at) * core.H, core.W, core.H);
    camera.fov = (2 * Math.atan(half)) / DEG;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const fpx = core.uFull.value.y / (2 * half), k = fpx / FOCAL_REF;
    postU.uMaxR.value = 13 * k;
    core.wideSigma = (1080 * k) / 60 / 8;
    moteMat.uniforms.uScale.value = fpx;
  }
  function resize() { frame(); }

  // ---- input: the tilt follows the pointer over the pointer target (the chapter, or the canvas); the
  // moving part plays while the pointer is over the piece's box; a tap plays it on touch
  const fine = matchMedia("(pointer:fine)");
  const pointer = new THREE.Vector2(), drift = new THREE.Vector2(), ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  let target = null, pointerIn = false, over = false, tapUntil = 0, igT = 0, igHold = -1, t = 0, disposed = false;
  const wakeAge = new Float32Array(WAKE_N).fill(99), wakePeak = new Float32Array(WAKE_N);
  const wakeAt = new THREE.Vector2(), wakePrev = new THREE.Vector3(), wakeTmp = new THREE.Vector3();
  const mine = () => core.world === world;
  const targetListeners = [];
  // is a client point over the piece's projected box (padded by pad of its size)?
  function overBox(cx, cy, pad = 0) {
    const r = canvas.getBoundingClientRect(), b = box();
    const px = b.w * pad, py = b.h * pad;
    const x = cx - r.left, y = cy - r.top;
    return x >= b.x - px && x <= b.x + b.w + px && y >= b.y - py && y <= b.y + b.h + py;
  }
  function onMove(e) {
    if (!mine() || e.pointerType !== "mouse") return;
    const r = (target || canvas).getBoundingClientRect();
    pointer.set(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)), Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)));
    if (!pointerIn) { pointerIn = true; wakeAt.copy(canvasNdc(e)); wakePrev.set(0, 0, 0); }
    over = overBox(e.clientX, e.clientY);
  }
  function onLeave(e) { if (e.pointerType === "mouse") { pointer.set(0, 0); pointerIn = false; over = false; } }
  let down = null;
  function onDown(e) { if (mine() && e.isPrimary !== false) down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType }; }
  function onUp(e) {
    if (!mine() || !down) return;
    const d = down; down = null;
    if (d.type === "mouse" || performance.now() - d.t > 400 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
    if (overBox(e.clientX, e.clientY, 0.15)) tapUntil = t + D.tapHold;
  }
  // the wake is laid in canvas coordinates, whatever the pointer target is
  const wakeNdc = new THREE.Vector2();
  function canvasNdc(e) {
    const r = canvas.getBoundingClientRect();
    return wakeNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  }
  let wakeGoal = new THREE.Vector2();
  function onMoveWake(e) { if (mine() && e.pointerType === "mouse") wakeGoal.copy(canvasNdc(e)); }
  function setPointerTarget(el) {
    for (const [tg, e, f, o] of targetListeners) tg.removeEventListener(e, f, o);
    targetListeners.length = 0;
    target = el || null;
    const tg = target || canvas;
    for (const [e, f, o] of [["pointermove", onMove], ["pointermove", onMoveWake], ["pointerleave", onLeave], ["pointerdown", onDown], ["pointerup", onUp], ["pointercancel", () => { down = null; }]]) {
      tg.addEventListener(e, f, o); targetListeners.push([tg, e, f, o]);
    }
    pointer.set(0, 0); pointerIn = false; over = false;
  }
  setPointerTarget(opts.pointerTarget || null);
  on(window, "blur", () => { if (mine()) { pointer.set(0, 0); pointerIn = false; over = false; } });

  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const tgt = new THREE.Vector3();
  function update(dt) {
    t += dt;
    // tilt: fine pointers follow the pointer, touch screens drift slowly on their own (no finger tilt: a swipe
    // would fight the page's scroll)
    const canTilt = fine.matches;
    const gx = canTilt ? pointer.x : Math.sin((t * 2 * Math.PI) / D.touch[1]) * (D.touch[0] / tilt.yaw);
    const gy = canTilt ? pointer.y : 0;
    const de = 1 - Math.exp(-dt * D.ease);
    drift.x += (gx - drift.x) * de; drift.y += (gy - drift.y) * de;
    // orbit the layout camera (position and target) about the piece's centre: yaw about up, pitch about the
    // view's own horizontal axis. The hero's signs: the camera swings away from the pointer's side.
    const yaw = -drift.x * tilt.yaw * DEG, pitch = drift.y * tilt.pitch * DEG;
    tmp.copy(baseTarget).sub(basePos); right.crossVectors(tmp, UP).normalize();
    q.setFromAxisAngle(UP, yaw).multiply(qa.setFromAxisAngle(right, -pitch));
    camera.position.copy(basePos).sub(centre).applyQuaternion(q).add(centre);
    tgt.copy(baseTarget).sub(centre).applyQuaternion(q).add(centre);
    camera.up.set(0, 1, 0); camera.lookAt(tgt);
    camera.updateMatrixWorld();
    postU.uFocus.value = camera.position.distanceTo(centre);

    // the light coming up, replayed on every arrival (attached())
    igT = igHold >= 0 ? igHold : igT + dt;
    core.fxaa.uIgnite.value = igniteAt(igT);

    // the cursor's wake, as the hero's
    let wakeSum = 0;
    for (let i = 0; i < WAKE_N; i++) {
      wakeAge[i] += dt;
      const a = wakeAge[i], s = wakePeak[i] * Math.min(1, a / 0.18) * Math.exp(-a / WAKE_LIFE);
      wakeD[i].w = s < 0.004 ? 0 : s;
      wakeV[i].w = 0.6 + Math.min(a, 2) * 0.45;
      wakeSum += wakeD[i].w;
    }
    const mv = Math.hypot(wakeGoal.x - wakeAt.x, wakeGoal.y - wakeAt.y);
    if (pointerIn && canTilt && mv > WAKE_STEP) {
      const n = Math.min(4, Math.floor(mv / WAKE_STEP)), peak = Math.min(0.7, 0.2 + (mv / Math.max(dt, 1e-3)) * 0.25);
      for (let j = 1; j <= n; j++) {
        const f = j / n;
        ndc.set(wakeAt.x + (wakeGoal.x - wakeAt.x) * f, -(wakeAt.y + (wakeGoal.y - wakeAt.y) * f));
        ray.setFromCamera(ndc, camera);
        const dir = ray.ray.direction;
        let k = 0;
        for (let i = 1; i < WAKE_N; i++) if (wakeD[i].w < wakeD[k].w) k = i;
        wakeD[k].set(dir.x, dir.y, dir.z, 0);
        wakeAge[k] = 0; wakePeak[k] = peak;
        if (wakePrev.lengthSq() > 0) wakeTmp.copy(dir).sub(wakePrev).multiplyScalar(fogMat.uniforms.uWakePush.value);
        else wakeTmp.set(0, 0, 0);
        if (wakeTmp.length() > 0.7) wakeTmp.setLength(0.7);
        wakeV[k].set(wakeTmp.x, wakeTmp.y, wakeTmp.z, 0.5);
        wakePrev.copy(dir);
      }
      wakeAt.copy(wakeGoal);
      wakeSum += 1;
    } else if (!pointerIn) wakeAt.copy(wakeGoal);
    fogMat.uniforms.uWakeOn.value = wakeSum > 0 ? 1 : 0;

    // the moving part: springs to its angle while the pointer is over the piece (or a tap holds it), back after
    if (rig) {
      const hov = over || t < tapUntil;
      if (hov && !rig.was) rig.t = 0;
      rig.was = hov; rig.t += dt;
      for (const L of rig.parts) {
        const r = L.r, i = r.part - 1;
        if (r.mode === "turn") {
          const to = hov ? r.angle : 0, kk = r.k || 20, cc = r.c || 9, n = Math.ceil(dt / 0.008), h = dt / n;
          for (let j = 0; j < n; j++) { L.v += (kk * (to - L.x) - cc * L.v) * h; L.x += L.v * h; }
          rig.A[i].w = L.x * DEG;
        } else if (r.mode === "quiver") {
          rig.A[i].w = r.angle * DEG * Math.exp(-rig.t * r.decay) * Math.sin(rig.t * r.freq);
        }
      }
    }
    fogMat.uniforms.uTime.value = t;
  }

  // the piece's box (layout.piece) through the live camera, in CSS px of the canvas
  function box() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      tmp.set(i & 1 ? pMax.x : pMin.x, i & 2 ? pMax.y : pMin.y, i & 4 ? pMax.z : pMin.z).project(camera);
      const x = (tmp.x * 0.5 + 0.5) * core.W, y = (-tmp.y * 0.5 + 0.5) * core.H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ignite(): replay the light coming up; ignite(1.5) holds it at 1.5 s
  function ignite(s) { igHold = typeof s === "number" ? s : -1; if (igHold < 0) igT = 0; }
  // every arrival in a chapter plays the light coming up (spec: a chapter replays its ignite every time)
  function attached() {
    ignite(); core.fxaa.uIgnite.value = 0;
    drift.set(0, 0); pointer.set(0, 0); pointerIn = false; over = false; tapUntil = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const [tg, e, f, o] of listeners) tg.removeEventListener(e, f, o);
    for (const [tg, e, f, o] of targetListeners) tg.removeEventListener(e, f, o);
    for (const d of disposables) { try { d.dispose(); } catch (_) { /* already gone */ } }
  }

  const world = {
    id, scene, camera, zs: camera.far, fogMat, moteMat, moteScene,
    update, postUniforms: () => postU, ignite, resize, dispose, attached,
    // the solo's own surface (soloLive)
    box, setPointerTarget, tilt, spec: specU, sheen: sheenU, piece, board: boardMesh.material.uniforms,
    get rigAngle() { return rig ? rig.parts.map(L => L.x) : []; },
  };
  return world;
}
