// Chessboard hero: the live scene that mounts over the poster.
// Everything is baked in Blender (blender/build_hero.py). Nothing here is lit:
// pieces are a baked colour texture plus a matcap sheen, the board is one baked
// texture, and depth of field is a single post pass. Colours are handled as raw
// display values end to end, so the scene matches the bakes exactly.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const IDS = ["cyrus", "zagros", "onepharma", "pearl", "falah", "nids"];
const BASE = new URL("./assets/hero/", import.meta.url).href;
const INK = [12 / 255, 12 / 255, 14 / 255];
const HAZE = [0.040, 0.046, 0.062];      // smoke-grey fog with a little blue
const DEG = Math.PI / 180;

const PIECE_VS = `
varying vec2 vUv; varying vec3 vN; varying float vDepth; varying vec3 vWorld;
void main(){
  vUv = uv; vN = normalize(normalMatrix * normal);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const PIECE_FS = `
uniform sampler2D map; uniform sampler2D matcap; uniform float uSheen; uniform float uLift; uniform vec3 uHaze;
varying vec2 vUv; varying vec3 vN; varying float vDepth;
void main(){
  vec3 n = normalize(vN);
  vec3 c = texture2D(map, vUv).rgb * 0.94 * uLift + texture2D(matcap, n.xy * 0.5 + 0.5).rgb * uSheen;
  c = mix(c, uHaze, smoothstep(6.5, 20.0, vDepth) * 0.55);
  gl_FragColor = vec4(c, 1.0);
}`;
const BOARD_FS = `
uniform sampler2D map; uniform vec3 uHaze; uniform vec2 uCentre; uniform vec2 uHalf;
varying vec2 vUv; varying vec3 vN; varying float vDepth; varying vec3 vWorld;
void main(){
  vec3 c = texture2D(map, vUv).rgb;
  c = c / (1.0 + max(c.r, max(c.g, c.b)) * 1.1);      // keep the moon's reflection from burning out
  c = mix(c, uHaze, smoothstep(6.5, 20.0, vDepth) * 0.55);
  // the board has no edge: its outer blocks sink into the fog
  vec2 e = abs(vWorld.xz - uCentre) / uHalf;
  c = mix(c, uHaze, smoothstep(0.72, 0.97, max(e.x, e.y)));
  gl_FragColor = vec4(c, 1.0);
}`;
const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uPx; uniform float uNear; uniform float uFar;
uniform float uFocus; uniform float uAperture; uniform float uMaxR; uniform float uFade; uniform vec3 uInk;
varying vec2 vUv;
float viewZ(vec2 uv){
  float d = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - d * (uFar - uNear));
}
// the near field is capped lower, so the foreground softens without smearing
float coc(float z){ float d = 1.0 / uFocus - 1.0 / z; return clamp(abs(d) * uAperture, 0.0, d < 0.0 ? 0.6 : 1.0) * uMaxR; }
void main(){
  float r0 = coc(viewZ(vUv));
  vec3 acc = texture2D(tColor, vUv).rgb; float wsum = 1.0;
  if (r0 > 0.6) {
    for (int i = 1; i <= 14; i++) {
      float fi = float(i);
      float rr = sqrt(fi / 14.0) * r0, a = fi * 2.39996323;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * uPx;
      // a sharp sample must not smear into a blurred neighbour
      float w = smoothstep(0.0, 1.5, coc(viewZ(uv)) - rr * 0.6) + 0.06;
      acc += texture2D(tColor, uv).rgb * w; wsum += w;
    }
  }
  vec3 c = acc / wsum;
  // bloom: the bright marble bleeds softly into the fog
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = fi * 2.39996323, rr = (0.35 + 0.65 * sqrt((fi + 0.5) / 8.0)) * uMaxR * 2.6;
    glow += max(texture2D(tColor, vUv + vec2(cos(a), sin(a)) * rr * uPx).rgb - 0.52, 0.0);
  }
  c += glow / 8.0 * 0.7;
  gl_FragColor = vec4(mix(uInk, c, uFade), 1.0);
}`;

function raw(tex) { tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true; return tex; }

export async function mountHero(stage, layout, opts = {}) {
  const orientation = opts.orientation || (() => "landscape");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); throw new Error("WebGL2 unavailable"); }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;      // raw values out
  renderer.setClearColor(new THREE.Color().setRGB(INK[0], INK[1], INK[2]), 1);
  const disposables = [renderer];
  const listeners = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); listeners.push([t, e, f, o]); };

  let gltf, matcapTex, hazeTex;
  try {
    const tl = new THREE.TextureLoader();
    const gl = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    [gltf, matcapTex, hazeTex] = await Promise.all([
      gl.loadAsync(BASE + "pieces.glb"), tl.loadAsync(BASE + "matcap.webp"), tl.loadAsync(BASE + "haze.webp"),
    ]);
  } catch (e) { renderer.dispose(); throw e; }
  let cleanup = () => { for (const d of disposables) { try { d.dispose(); } catch (_) { /* gone */ } } canvas.remove(); };
  try {
  [matcapTex, hazeTex].forEach(raw);
  disposables.push(matcapTex, hazeTex);

  const scene = new THREE.Scene();
  const hazeU = { value: new THREE.Vector3(...HAZE) };

  // backdrop: the night behind the board, fog-blue at the horizon melting up into the ground colour.
  // It is drawn in the scene (not in the post pass) so the fog banks show in front of it.
  const backGeo = new THREE.PlaneGeometry(2, 2);
  const backMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uHaze: hazeU, uInk: { value: new THREE.Vector3(...INK) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }",
    fragmentShader: "uniform vec3 uHaze; uniform vec3 uInk; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(uHaze, uInk, smoothstep(0.36, 0.98, vUv.y)), 1.0); }",
  });
  const back = new THREE.Mesh(backGeo, backMat);
  back.frustumCulled = false; back.renderOrder = -10;
  scene.add(back);
  disposables.push(backGeo, backMat);

  // pieces and plinths: swap the exported materials for the unlit baked shader
  const pieces = {}, state = {};
  scene.add(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const src = o.material, map = raw(src.map);
    if (o.name === "board") {
      // blocks of stone at uneven heights, one baked texture (reflections included)
      map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      o.material = new THREE.ShaderMaterial({
        vertexShader: PIECE_VS, fragmentShader: BOARD_FS,
        uniforms: { map: { value: map }, uHaze: hazeU,
          uCentre: { value: new THREE.Vector2(layout.board.center[0], layout.board.center[1]) },
          uHalf: { value: new THREE.Vector2(layout.board.size[0] / 2, layout.board.size[1] / 2) } },
      });
      disposables.push(o.geometry, o.material, map);
      src.dispose();
      return;
    }
    map.anisotropy = 4;
    const isPearl = /pearl/.test(o.name) || /pearl/.test(o.parent && o.parent.name || "");
    o.material = new THREE.ShaderMaterial({
      vertexShader: PIECE_VS, fragmentShader: PIECE_FS,
      uniforms: { map: { value: map }, matcap: { value: matcapTex }, uSheen: { value: isPearl ? 0.55 : 0.22 }, uLift: { value: 1 }, uHaze: hazeU },
    });
    disposables.push(o.geometry, o.material, map);
    src.dispose();
  });
  for (const id of IDS) {
    const p = gltf.scene.getObjectByName("piece-" + id), pl = gltf.scene.getObjectByName("plinth-" + id);
    if (!p || !pl) throw new Error("pieces.glb is missing " + id);
    pieces[id] = p;
    const box = new THREE.Box3().setFromObject(p).union(new THREE.Box3().setFromObject(pl));
    const mats = [];
    p.traverse(o => { if (o.isMesh) mats.push(o.material); });
    state[id] = {
      box, mats, baseY: p.position.y, baseRot: p.rotation.y, lift: 0,
      period: 11 + (IDS.indexOf(id) * 8) / 5, phase: IDS.indexOf(id) * 1.7,
      top: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2),
      centre: box.getCenter(new THREE.Vector3()),
    };
  }

  // haze: three slow sprites between the pieces and the dark
  const hazeGeo = new THREE.PlaneGeometry(1, 1);
  // banks of low fog lying between the rows of pieces, each drifting at its own pace
  const hazes = [[-1.5, 1.0, 1.0, 11, 3.2, 47], [2.5, 0.9, -0.6, 10, 2.8, 61], [-3.0, 1.2, -1.6, 12, 3.6, 53],
    [1.0, 1.1, -3.0, 14, 4.0, 71], [0, 1.7, -6.5, 26, 6.5, 83], [-4.0, 0.8, 3.2, 9, 2.4, 43]].map(([x, y, z, w, h, period], i) => {
    const m = new THREE.MeshBasicMaterial({ map: hazeTex, transparent: true, depthWrite: false, opacity: 0.5 });
    m.color.setRGB(0.50, 0.54, 0.64);
    const s = new THREE.Mesh(hazeGeo, m);
    s.position.set(x, y, z); s.scale.set(w, h, 1); s.renderOrder = 10;
    s.userData = { x, period, phase: i * 2.1 };
    scene.add(s); disposables.push(m);
    return s;
  });
  disposables.push(hazeGeo);

  // camera
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 60);
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3();
  let focusBase = 10;

  // post: depth of field
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(4, 4);
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
  const postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uPx: { value: new THREE.Vector2() },
      uNear: { value: camera.near }, uFar: { value: camera.far }, uFocus: { value: 10 }, uAperture: { value: 25 },
      uMaxR: { value: 14 }, uFade: { value: 1 },
      uInk: { value: new THREE.Vector3(...INK) },
    },
  });
  const postGeo = new THREE.PlaneGeometry(2, 2);
  const postScene = new THREE.Scene(), postCam = new THREE.Camera();
  postScene.add(new THREE.Mesh(postGeo, postMat));
  disposables.push(rt, rt.depthTexture, postMat, postGeo);

  let W = 1, H = 1, current = null;
  function setOrientation(o) {
    current = o;
    const v = layout[o], c = v.camera, aspect = W / H;
    camBase.fromArray(c.position); camTarget.fromArray(c.target);
    // match the poster, which always fits the width: keep the horizontal view at every aspect
    const half = Math.tan((c.fovY * DEG) / 2);
    camera.fov = (2 * Math.atan((half * v.aspect) / aspect)) / DEG;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    focusBase = camBase.distanceTo(state[layout.focusId].centre);
  }
  function resize() {
    W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight);
    const coarse = matchMedia("(pointer:coarse)").matches;
    const pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);   // a soft, foggy image hides the difference; the GPU does not
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    const bw = Math.round(W * pr), bh = Math.round(H * pr);
    rt.setSize(bw, bh);
    postMat.uniforms.uPx.value.set(1 / bw, 1 / bh);
    postMat.uniforms.uMaxR.value = (bh / 1080) * 13;
    setOrientation(orientation());
    if (typeof hoverFromPointer === "function" && hoverId) { touchHover = null; hoverFromPointer(null); }
  }

  // ---- behaviour state
  const pointer = new THREE.Vector2(), drift = new THREE.Vector2(), ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster(), hit = new THREE.Vector3(), tmp = new THREE.Vector3();
  let hoverId = null, focusNow = 10, scrollP = 0, touchHover = null, touchTimer = 0;
  let running = false, raf = 0, last = 0, t = 0, disposed = false, visible = true;
  const handle = { canvas, pieces, camera, frameCount: 0 };

  function setHover(id) { hoverId = id && state[id] ? id : null; }
  function setScroll(p) { scrollP = Math.min(1, Math.max(0, p)); }
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
    tmp.copy(state[id].top).project(camera);
    opts.onHover(id, (tmp.x * 0.5 + 0.5) * W, (-tmp.y * 0.5 + 0.5) * H - 6);
  }
  function hoverFromPointer(id) {
    if (id === hoverId) return;
    setHover(id); labelAt(id);
  }
  function clearTouch() { clearTimeout(touchTimer); touchHover = null; hoverFromPointer(null); }

  const fine = () => matchMedia("(pointer:fine)").matches;
  let down = null;
  on(canvas, "pointermove", e => {
    if (e.pointerType !== "mouse") return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    hoverFromPointer(pick(e));
  });
  on(canvas, "pointerleave", e => { if (e.pointerType === "mouse") { pointer.set(0, 0); hoverFromPointer(null); } });
  on(canvas, "pointerdown", e => {
    if (e.button !== 0 || e.isPrimary === false) { down = null; return; }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
  });
  on(canvas, "pointerup", e => {
    if (!down) return;
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
  on(canvas, "pointercancel", () => { down = null; });
  on(window, "blur", () => { pointer.set(0, 0); clearTouch(); });
  on(window, "scroll", () => { if (touchHover) clearTouch(); }, { passive: true });
  on(window, "resize", resize);

  function exit(reason) {
    if (disposed) return;
    dispose();
    if (opts.onLost) opts.onLost(reason);
  }
  on(canvas, "webglcontextlost", e => { e.preventDefault(); exit("context lost"); });

  const ease = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
  function update(dt) {
    t += dt;
    // camera: small arc with the pointer, sinking as the hero scrolls away
    const canDrift = fine();
    drift.x = ease(drift.x, canDrift ? pointer.x : 0, 3.5, dt);
    drift.y = ease(drift.y, canDrift ? pointer.y : 0, 3.5, dt);
    tmp.copy(camBase).sub(camTarget);
    const radius = tmp.length();
    const yaw = Math.atan2(tmp.x, tmp.z) - drift.x * 2.5 * DEG;
    const pitch = Math.asin(tmp.y / radius) + drift.y * 1.0 * DEG;
    camera.position.set(
      camTarget.x + radius * Math.cos(pitch) * Math.sin(yaw),
      camTarget.y + radius * Math.sin(pitch) - 0.5 * scrollP,
      camTarget.z + radius * Math.cos(pitch) * Math.cos(yaw));
    tmp.copy(camTarget); tmp.y += 0.35 * scrollP;
    camera.lookAt(tmp);
    camera.updateMatrixWorld();

    for (const id of IDS) {
      const s = state[id], p = pieces[id];
      s.lift = ease(s.lift, hoverId === id ? 1 : 0, 9, dt);
      p.position.y = s.baseY + 0.06 * s.lift;
      p.rotation.y = s.baseRot + Math.sin((t / s.period) * Math.PI * 2 + s.phase) * 2 * DEG;
      for (const m of s.mats) m.uniforms.uLift.value = 1 + 0.14 * s.lift;
    }
    const focusTo = hoverId ? camera.position.distanceTo(state[hoverId].centre) : focusBase;
    focusNow = ease(focusNow, focusTo, 5, dt);
    postMat.uniforms.uFocus.value = focusNow;
    for (const h of hazes) {
      h.position.x = h.userData.x + Math.sin((t / h.userData.period) * Math.PI * 2 + h.userData.phase) * 2.6;
      h.quaternion.copy(camera.quaternion);
    }
  }
  function render() {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
    handle.frameCount++;
  }

  function frame(now) {
    raf = 0;
    if (!running || disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    update(dt); render();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || disposed || !visible || document.hidden) return;
    running = true; last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  cleanup = () => dispose();
  let io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? start() : stop(); });
    io.observe(stage);
  }
  on(document, "visibilitychange", () => (document.hidden ? stop() : start()));

  function dispose() {
    if (disposed) return;
    disposed = true; stop();
    clearTimeout(touchTimer);
    if (io) io.disconnect();
    for (const [tg, e, f, o] of listeners) tg.removeEventListener(e, f, o);
    for (const d of disposables) { try { d.dispose(); } catch (_) { /* already gone */ } }
    canvas.remove();
  }

  Object.assign(handle, { setOrientation, setHover, setScroll, render, start, stop, dispose, resize });

  stage.appendChild(canvas);
  resize();
  focusNow = focusBase;
  update(0); render();          // first frame is on screen before the caller fades the stage in
  // Does this GPU keep up? Time real frames, forced to finish by a 1-pixel readback. Frame
  // intervals are no use here: a throttled or background tab would look like a slow device.
  {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);      // warm-up: shader compile, uploads
    const t0 = performance.now();
    for (let i = 0; i < 6; i++) { render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    if ((performance.now() - t0) / 6 > 20) throw new Error("too slow");
  }
  start();
  return handle;
  } catch (e) { cleanup(); throw e; }
}
