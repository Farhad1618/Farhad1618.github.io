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
const HAZE = [0.016, 0.021, 0.036];      // what distance fades to: blue-black
// The one light in blender/hero/scene.py, hidden behind the Cyrus Cylinder at the barrel's height.
// Blender (0, 1.5, 0.34 + 0.35 + 0.80) in this scene's axes (x, z, -y). The fog is lit by it, live.
const LIGHT = [0, 1.49, -1.5];
const LIGHT_COL = [8.0, 7.3, 6.3];        // warm, as in the posters
const FOG_AMB = [0.10, 0.125, 0.19];      // what the fog shows away from the light: cold, dim
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
  vec3 c = texture2D(map, vUv).rgb * 1.08 * uLift + texture2D(matcap, n.xy * 0.5 + 0.5).rgb * uSheen;
  gl_FragColor = vec4(c, 1.0);
}`;
const BOARD_FS = `
uniform sampler2D map; uniform vec3 uHaze; uniform vec2 uCentre; uniform vec2 uHalf;
varying vec2 vUv; varying vec3 vN; varying float vDepth; varying vec3 vWorld;
void main(){
  vec3 c = texture2D(map, vUv).rgb;
  c = c / (1.0 + max(c.r, max(c.g, c.b)) * 1.1);      // keep the moon's reflection from burning out
  // the board has no edge: its outer blocks sink into the fog
  vec2 e = abs(vWorld.xz - uCentre) / uHalf;
  c = mix(c, uHaze, smoothstep(0.72, 0.97, max(e.x, e.y)));
  gl_FragColor = vec4(c, 1.0);
}`;
// Light shafts: from each pixel, look along the screen toward the light and count how much of the way is
// clear. A piece standing in front of the light blocks it, so it throws a dark streak through the fog;
// the gaps between pieces let rays through. Lifting a piece moves its streak with it.
const SHAFT_FS = `
uniform sampler2D tDepth; uniform vec2 uLightUV; uniform float uLightZ; uniform float uNear; uniform float uFar;
varying vec2 vUv;
float viewZ(vec2 uv){
  float d = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - d * (uFar - uNear));
}
void main(){
  vec2 d = uLightUV - vUv;
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float vis = 0.0;
  for (int i = 0; i < 28; i++) {
    vec2 uv = vUv + d * ((float(i) + jit) / 28.0);
    bool inside = uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0;
    vis += inside ? step(uLightZ - 0.25, viewZ(uv)) : 1.0;
  }
  gl_FragColor = vec4(vis / 28.0);
}`;
// Fog: a short march from the eye to whatever the pixel shows, through a field of drifting noise.
// Density pools low and in banks; the one light behind the Cyrus Cylinder lights them, strongly when you
// look toward it (fog scatters forward), and each bank shades itself. Output: rgb = sqrt(light scattered
// toward the eye), a = how much of the scene behind still gets through.
const FOG_FS = `
precision highp sampler3D;
uniform sampler2D tDepth; uniform sampler2D tShaft; uniform sampler3D tNoise;
uniform mat4 uInvProj; uniform mat4 uCamWorld;
uniform float uNear; uniform float uFar; uniform float uTime;
uniform vec3 uP[6]; uniform vec3 uLight; uniform vec3 uLightCol; uniform vec3 uAmb;
varying vec2 vUv;
const int STEPS = 16;
const float TOP = 3.2;          // no fog above this height
float low(vec3 p){ return texture(tNoise, p * 0.060 + vec3(uTime * 0.0050, 0.0, uTime * 0.0016)).r; }
float bank(vec3 p, float lo, float hi){
  float top = 0.35 + 2.4 * smoothstep(0.40, 0.72, lo);      // a thick bank also stands taller
  float h = 1.0 - smoothstep(0.0, top, p.y);
  // more of it lies behind the pieces than between them and the eye
  return smoothstep(0.47, 0.62, lo * 0.66 + hi * 0.34) * h * h * mix(0.14, 1.0, smoothstep(6.0, -1.5, p.z));
}
void main(){
  float d = texture2D(tDepth, vUv).x;
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dv = normalize(v.xyz / v.w);
  vec3 rd = normalize((uCamWorld * vec4(dv, 0.0)).xyz);
  vec3 ro = uCamWorld[3].xyz;
  float z = 2.0 * uNear * uFar / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
  float tEnd = min(z / max(-dv.z, 1e-4), 42.0), t0 = 0.0;
  if (rd.y > 1e-4) { if (ro.y >= TOP) tEnd = 0.0; else tEnd = min(tEnd, (TOP - ro.y) / rd.y); }
  else if (ro.y > TOP) t0 = rd.y < -1e-4 ? (TOP - ro.y) / rd.y : tEnd;
  vec3 Sa = vec3(0.0), Sl = vec3(0.0); float T = 1.0;
  if (tEnd > t0) {
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float dt = (tEnd - t0) / float(STEPS);
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * (t0 + (float(i) + jit) * dt);
      float part = 0.0;
      for (int k = 0; k < 6; k++) { vec3 q = p - uP[k]; float w = 1.0 / (1.0 + dot(q.xz, q.xz) * 1.6); part += w * w; }
      // two scales moving at different speeds, so banks change shape as they drift instead of sliding
      float lo = low(p);
      float hi = texture(tNoise, p * vec3(0.26, 0.40, 0.26) + vec3(uTime * 0.0110, -uTime * 0.0045, 0.37)).r;
      // fog thins where it meets a piece, as it does around anything standing in moving air
      float b = bank(p, lo, hi) * (1.0 - 0.55 * min(part, 1.0));
      vec3 q = uLight - p; float d2 = dot(q, q); vec3 ld = q * inversesqrt(d2);
      // a thin haze always hangs round the light, so the cylinder always has its halo
      float sigma = 0.010 * exp(-max(p.y, 0.0) * 0.45) + 0.85 * b + 0.06 * exp(-d2 * 0.55);
      float cs = dot(rd, ld);
      float ph = 0.6975 / pow(1.3025 - 1.1 * cs, 1.5);        // looking toward the light, fog glows
      vec3 ps = p + ld * 0.6;
      float shade = exp(-bank(ps, low(ps), hi) * 3.2);        // the bank's own thickness shades it
      float a = 1.0 - exp(-sigma * dt);
      Sl += T * a * ph * shade / (0.6 + d2);
      Sa += T * a * (0.45 + 0.55 * shade);
      T *= 1.0 - a;
      if (T < 0.03) break;
    }
  }
  // what the pieces in front of the light hold back from the rays
  float vis = texture2D(tShaft, vUv).r;
  vec3 S = uAmb * Sa + uLightCol * Sl * mix(0.12, 1.0, vis * vis);
  gl_FragColor = vec4(sqrt(S), T);
}`;
const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uPx; uniform float uNear; uniform float uFar;
uniform float uFocus; uniform float uAperture; uniform float uMaxR; uniform float uFade; uniform vec3 uInk;
uniform sampler2D tFog;
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
  // the fog was marched at a third of the size with a jittered start: average the neighbours to smooth the
  // jitter, but not across the outline of a piece, where the amount of fog really does jump
  vec4 f0 = texture2D(tFog, vUv), fog = f0; float fw = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.78539816;
    vec4 f = texture2D(tFog, vUv + vec2(cos(a), sin(a)) * uPx * (mod(float(i), 2.0) < 0.5 ? 3.0 : 4.24));
    float w = exp(-abs(f.a - f0.a) * 14.0);
    fog += f * w; fw += w;
  }
  fog /= fw;
  c = c * fog.a + fog.rgb * fog.rgb;
  c = mix(uInk, c, uFade);
  // dark, smooth fog on an 8-bit screen: break the bands up with a little noise
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

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

  let gltf, matcapTex;
  try {
    const tl = new THREE.TextureLoader();
    const gl = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    [gltf, matcapTex] = await Promise.all([gl.loadAsync(BASE + "pieces.glb"), tl.loadAsync(BASE + "matcap.webp")]);
  } catch (e) { renderer.dispose(); throw e; }
  let cleanup = () => { for (const d of disposables) { try { d.dispose(); } catch (_) { /* gone */ } } canvas.remove(); };
  try {
  raw(matcapTex);
  disposables.push(matcapTex);

  const scene = new THREE.Scene();
  const hazeU = { value: new THREE.Vector3(...HAZE) };

  // backdrop: the night behind the board, blue-black at the horizon melting up into the ground colour.
  // The fog pass lights it around the hidden light.
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

  // camera
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 60);
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3();
  const lightP = new THREE.Vector3();
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
      tFog: { value: null },
    },
  });
  const postGeo = new THREE.PlaneGeometry(2, 2);
  const postScene = new THREE.Scene(), postCam = new THREE.Camera();
  postScene.add(new THREE.Mesh(postGeo, postMat));
  disposables.push(rt, rt.depthTexture, postMat, postGeo);

  // light shafts and fog: both marched at a third of the size (they have no fine detail)
  const ext = renderer.extensions;
  const lowRT = () => {
    const r = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false,
      type: ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float") ? THREE.HalfFloatType : THREE.UnsignedByteType });
    r.texture.minFilter = r.texture.magFilter = THREE.LinearFilter;
    return r;
  };
  const shaftRT = lowRT(), fogRT = lowRT();
  const shaftMat = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: SHAFT_FS, depthTest: false, depthWrite: false,
    uniforms: { tDepth: { value: rt.depthTexture }, uLightUV: { value: new THREE.Vector2(0.5, 0.5) }, uLightZ: { value: 10 },
      uNear: { value: camera.near }, uFar: { value: camera.far } },
  });
  const noiseTex = noiseVolume();
  const fogMat = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: FOG_FS, depthTest: false, depthWrite: false,
    uniforms: {
      tDepth: { value: rt.depthTexture }, tShaft: { value: shaftRT.texture }, tNoise: { value: noiseTex },
      uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld },
      uNear: { value: camera.near }, uFar: { value: camera.far }, uTime: { value: 0 },
      uP: { value: IDS.map(id => state[id].centre) },
      uLight: { value: new THREE.Vector3(...LIGHT) },
      uLightCol: { value: new THREE.Vector3(...LIGHT_COL) },
      uAmb: { value: new THREE.Vector3(...FOG_AMB) },
    },
  });
  const shaftScene = new THREE.Scene(), fogScene = new THREE.Scene();
  shaftScene.add(new THREE.Mesh(postGeo, shaftMat));
  fogScene.add(new THREE.Mesh(postGeo, fogMat));
  postMat.uniforms.tFog.value = fogRT.texture;
  disposables.push(shaftRT, fogRT, shaftMat, noiseTex, fogMat);

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
    shaftRT.setSize(Math.ceil(bw / 3), Math.ceil(bh / 3));
    fogRT.setSize(Math.ceil(bw / 3), Math.ceil(bh / 3));
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
    // where the light is on screen, and how far, for the shafts
    lightP.set(...LIGHT).applyMatrix4(camera.matrixWorldInverse);
    shaftMat.uniforms.uLightZ.value = -lightP.z;
    lightP.set(...LIGHT).project(camera);
    shaftMat.uniforms.uLightUV.value.set(lightP.x * 0.5 + 0.5, lightP.y * 0.5 + 0.5);
    fogMat.uniforms.uTime.value = t;
  }
  function render() {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(shaftRT);
    renderer.render(shaftScene, postCam);
    renderer.setRenderTarget(fogRT);
    renderer.render(fogScene, postCam);
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

  Object.assign(handle, { setOrientation, setHover, setScroll, render, start, stop, dispose, resize, fog: fogMat.uniforms });

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
