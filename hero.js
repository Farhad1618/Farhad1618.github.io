// Chessboard hero: the live scene. On capable devices it is the first thing shown (the poster is only the
// fallback). Everything is baked in Blender (blender/build_hero.py) from the camera's point of view, so the
// light, shadows, sheen and the glow of thin alabaster and ivory are in the textures. Nothing here is lit:
// pieces are their baked texture plus a faint matcap sheen, the board is one baked texture. The light is
// fixed and nothing moves it, hover included, so it can be faked as convincingly as possible.
// Frame: scene (4x MSAA) -> fog, shadowed per step by the pieces (a third of the size) -> depth of field +
// fog composite (depth-aware upsample) -> bloom (a quarter and an eighth of the size) -> FXAA + bloom +
// dither to the screen. Colours are raw display values end to end, so the scene matches the bakes exactly.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const IDS = ["cyrus", "zagros", "onepharma", "pearl", "falah", "nids"];
const BASE = new URL("./assets/hero/", import.meta.url).href;
const INK = [12 / 255, 12 / 255, 14 / 255];
const HAZE = [0.011, 0.019, 0.044];      // what distance fades to: deep blue-black
// The one light in blender/hero/scene.py, hidden behind the Cyrus Cylinder at the barrel's height.
// Blender (0, 1.5, 0.36 + 0.35 + 0.80) in this scene's axes (x, z, -y). The fog is lit by it, live.
const LIGHT = [0, 1.51, -1.5];
const LIGHT_COL = [6.6, 7.1, 8.3];        // cold moonlight: the smoke round the light is blue-grey, never pure white
const FOG_AMB = [0.022, 0.036, 0.070];    // what the fog shows away from the light: a faint deep blue
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
const TILE = 1.5, REACH = 0.8;            // blender/hero/scene.py TILE and REACH: a piece's platform is the one tile under it, or the two it stands astride
const LIFT = 0.16;                         // how far a hovered piece rises, with its plinth and the tiles under it
const LIFT_BY = { cyrus: 0.06 };             // Cyrus, the centre piece, barely rises (Farhad: not as high as the rest)
const DEG = Math.PI / 180;
const ZS = "60.0";                          // the camera's far plane: scene alpha = view depth / ZS
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

// RIG: a piece with moving parts (see blender/hero/pieces.py, "moving parts"). COLOR_0 red = part / 8; per part
// uRigP = pivot and mode (w 0 turns, 1 hangs), uRigA = axis and angle (radians), uRigH = anchor and the part
// it hangs from. A turning part rotates about its pivot; a hanging part follows its anchor without tilting.
const PIECE_VS = `
varying vec2 vUv; varying vec3 vN; varying float vDepth; varying vec3 vWorld;
#ifdef RIG
uniform vec4 uRigP[3]; uniform vec4 uRigA[3]; uniform vec4 uRigH[3];
vec3 rotA(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
#endif
void main(){
  vec3 pos = position, nrm = normal;
#ifdef RIG
  int k = int(color.r * 8.0 + 0.5) - 1;
  if (k >= 0 && k < 3) {
    vec4 P = uRigP[k], A = uRigA[k];
    if (P.w < 0.5) { pos = P.xyz + rotA(pos - P.xyz, A.xyz, A.w); nrm = rotA(nrm, A.xyz, A.w); }
    else {
      vec4 H = uRigH[k], Pj = uRigP[int(H.w + 0.5)], Aj = uRigA[int(H.w + 0.5)];
      pos += Pj.xyz + rotA(H.xyz - Pj.xyz, Aj.xyz, Aj.w) - H.xyz;
    }
  }
#endif
  vUv = uv; vN = normalize(normalMatrix * nrm);
  vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const PIECE_FS = `
uniform sampler2D map; uniform sampler2D matcap; uniform float uSheen; uniform vec3 uHaze;
varying vec2 vUv; varying vec3 vN; varying float vDepth;
void main(){
  vec3 n = normalize(vN);
  // the bake already holds the view's sheen and translucency: the matcap only adds a faint live glint
  vec3 c = texture2D(map, vUv).rgb + texture2D(matcap, n.xy * 0.5 + 0.5).rgb * uSheen;
  gl_FragColor = vec4(c, vDepth / ${ZS});     // alpha: view depth, averaged by the MSAA resolve (see POST_FS)
}`;
// The board. The tiles under a piece rise with it on hover: only their top corners move (aLift = the piece's
// index, -1 elsewhere), so the block's sides stretch down to where they always ended and nothing opens beneath.
const BOARD_VS = `
attribute float aLift; uniform float uLiftAmt[6];
attribute vec3 aIn; uniform float uInT;      // entrance: a block's top starts aIn.x off its height, settles after aIn.y s over aIn.z s
attribute vec2 aScr; uniform float uScroll; uniform float uNearZ;   // scroll: a free block's top moves aScr.y, starting at aScr.x
varying vec2 vUv; varying vec3 vWN; varying vec3 vWorld; varying float vBaseY; varying float vDepth;
void main(){
  vUv = uv; vWN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vBaseY = w.y;
  if (aLift > -0.5) w.y += uLiftAmt[int(aLift + 0.5)];
  if (aIn.z > 0.0) { float x = 1.0 - clamp((uInT - aIn.y) / aIn.z, 0.0, 1.0); w.y += aIn.x * x * x * x; }
  // the ripple; blocks right in front of the lens stay put (they would loom), fading in from uNearZ back
  if (aScr.y != 0.0) { float s = smoothstep(aScr.x, aScr.x + 0.35, uScroll); w.y += aScr.y * s * (1.0 - smoothstep(uNearZ - 3.0, uNearZ, w.z)); }
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const BOARD_FS = `
uniform sampler2D map; uniform vec3 uHaze; uniform vec2 uCentre; uniform vec2 uHalf; uniform vec3 uLight; uniform float uMatte; uniform float uLightK;
varying vec2 vUv; varying vec3 vWN; varying vec3 vWorld; varying float vBaseY; varying float vDepth;
void main(){
  vec3 c = texture2D(map, vUv).rgb;
  c = c / (1.0 + max(c.r, max(c.g, c.b)) * 1.1);      // keep the moon's reflection from burning out
  // A block's sides are honed stone, drawn here and not from the bake: their cells in the texture are a few
  // pixels each and bled into one another, which read as pale glass under the pieces. Dark, matte, a touch
  // of the one light where a side faces it, darker toward the bottom.
  vec3 n = normalize(vWN);
  // The tops: the bake holds the light's mirror image in the stone, a colourless sheen that read as glass.
  // Take most of that grey part out; the warm stone and the brass inlay keep their colour.
  c -= min(c.r, min(c.g, c.b)) * uMatte;
  if (n.y < 0.5) {
    vec3 q = uLight - vWorld; float d2 = dot(q, q);
    float lam = max(dot(n, q * inversesqrt(d2)), 0.0) / (1.0 + d2 * 0.35);
    c = (vec3(0.0075, 0.0085, 0.0115) + vec3(0.014, 0.016, 0.021) * lam * uLightK) * (0.45 + 0.55 * smoothstep(-0.5, 0.3, vWorld.y));
  }
  // the board has no edge: its outer blocks sink into the fog
  vec2 e = abs(vWorld.xz - uCentre) / uHalf;
  c = mix(c, uHaze, smoothstep(0.72, 0.97, max(e.x, e.y)));
  gl_FragColor = vec4(c, vDepth / ${ZS});
}`;
// Fog: a short march from the eye to whatever the pixel shows, through a field of drifting noise.
// Density pools low and in banks; the one light behind the Cyrus Cylinder lights them, strongly when you
// look toward it (fog scatters forward), and each bank shades itself. Output: rgb = sqrt(light scattered
// toward the eye), a = how much of the scene behind still gets through.
// Light shafts come from the march itself: at every step the way to the light is tested against the six
// pieces (each a soft upright footprint of its bounding box, up to its top), so a piece throws its shadow
// through the fog in front of it and only there. Fog beside or behind a piece, and above it, stays lit.
// Each fog pixel marches to the depth of one exact full-size pixel (texelFetch at px * DIV + DIV / 2), so
// the composite can tell, for every full-size pixel, which fog texels saw the same surface.
// The banks drift like smoke in still air: the broad shapes one way, the fine detail another, and the fine
// detail is pushed around by the broad shapes, so the fog churns slowly instead of sliding as one sheet.
const LIGHT_VIS = `
// how much of the light reaches p past the pieces. uOcc = footprint centre (x, z) and half size; uOccY = bottom
// and top. Where the segment p -> light passes closest to a footprint, is it inside it, and below the top?
float lightVis(vec3 p){
  float v = 1.0;
  for (int k = 0; k < 6; k++) {
    vec2 u = (p.xz - uOcc[k].xy) / uOcc[k].zw, w = (uLight.xz - p.xz) / uOcc[k].zw;
    float s = clamp(-dot(u, w) / max(dot(w, w), 1e-6), 0.0, 1.0);
    float y = p.y + (uLight.y - p.y) * s;
    float occ = (1.0 - smoothstep(0.7, 1.1, length(u + w * s)))
              * (1.0 - smoothstep(uOccY[k].y - 0.15, uOccY[k].y + 0.1, y)) * smoothstep(uOccY[k].x - 0.1, uOccY[k].x, y)
              * smoothstep(0.0, 0.05, s);         // fog on the light's side of a piece is not behind it
    v *= 1.0 - occ;
  }
  return v;
}`;
// The cursor's wake in the fog. Each recent cursor position is a line of sight from the eye (uWakeD: direction,
// strength) with a push (uWakeV: how far it moved the fog, and the radius of the cut, which widens as it fades).
// Returns how much fog it cuts at p, and the push there. The fog pass and the dust both use it.
const WAKE_N = 16;
const WAKE_GLSL = `
uniform vec4 uWakeD[${WAKE_N}]; uniform vec4 uWakeV[${WAKE_N}]; uniform float uWakeOn;
float wake(vec3 p, vec3 ro, out vec3 drag){
  drag = vec3(0.0);
  float s = 0.0;
  if (uWakeOn <= 0.0) return 0.0;
  for (int i = 0; i < ${WAKE_N}; i++) {
    vec4 d = uWakeD[i], v = uWakeV[i];
    vec3 q = p - ro, r = q - d.xyz * dot(q, d.xyz);
    float w = d.w * exp(-dot(r, r) / (v.w * v.w));
    s += w; drag += v.xyz * w;
  }
  drag /= max(s, 1.0);           // overlapping lines share one push, they do not stack
  return s;
}`;
const FOG_FS = `
precision highp sampler3D;
uniform sampler2D tDepth; uniform sampler3D tNoise;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec2 uFull;
uniform float uNear; uniform float uFar; uniform float uTime; uniform float uDrift;
uniform vec3 uP[6]; uniform vec3 uLight; uniform vec3 uLightCol; uniform vec3 uAmb;
uniform vec4 uOcc[6]; uniform vec2 uOccY[6]; uniform float uShadowFloor; uniform float uKnee; uniform float uJitT;
uniform float uDense; uniform float uRise; uniform float uLightK;     // scroll: thicker, taller banks; the light going down
varying vec2 vUv;
const int STEPS = 16;
${LIGHT_VIS}
${WAKE_GLSL}
const float TOP = 3.2;          // no fog above this height
// broad banks: about 0.17 units a second along x, a little toward the eye, a slow rise and fall
float low(vec3 p){
  float tt = uTime * uDrift;
  return texture(tNoise, p * 0.060 + vec3(tt * 0.0105, 0.012 * sin(tt * 0.045), tt * 0.0042)).r;
}
// fine detail: the other way across, drifting back and rising, warped by the broad banks
float fine(vec3 p, float lo){
  float tt = uTime * uDrift;
  vec3 w = vec3(lo - 0.5, 0.0, 0.5 - lo) * 1.6;
  return texture(tNoise, p * vec3(0.26, 0.40, 0.26) + w + vec3(-tt * 0.020, tt * 0.0095, 0.37 - tt * 0.031)).r;
}
float bank(vec3 p, float lo, float hi){
  float top = 0.5 + 2.8 * smoothstep(0.40, 0.72, lo);       // a thick bank also stands taller
  float h = 1.0 - smoothstep(0.0, top + uRise, p.y);        // TOP still caps it
  // more of it lies behind the pieces than between them and the eye
  return smoothstep(0.40, 0.68, lo * 0.62 + hi * 0.38) * h * h * mix(0.08, 1.0, smoothstep(1.5, -4.0, p.z));
}
void main(){
  ivec2 lp = ivec2(gl_FragCoord.xy);
  ivec2 fp = min(lp * DIV + DIV / 2, ivec2(uFull) - 1);
  vec2 uv = (vec2(fp) + 0.5) / uFull;
  float d = texelFetch(tDepth, fp, 0).x;
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dv = normalize(v.xyz / v.w);
  vec3 rd = normalize((uCamWorld * vec4(dv, 0.0)).xyz);
  vec3 ro = uCamWorld[3].xyz;
  float z = 2.0 * uNear * uFar / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
  float tEnd = min(z / max(-dv.z, 1e-4), 42.0), t0 = 0.0;
  if (rd.y > 1e-4) { if (ro.y >= TOP) tEnd = 0.0; else tEnd = min(tEnd, (TOP - ro.y) / rd.y); }
  else if (ro.y > TOP) t0 = rd.y < -1e-4 ? (TOP - ro.y) / rd.y : tEnd;
  vec3 Sa = vec3(0.0), Sl = vec3(0.0); float T = 1.0;
  if (tEnd > t0) {
    // jitter per pixel; held still in time (uJitT 0), because moving it every frame read as rain
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + floor(uTime * 60.0) * 0.6180339 * uJitT);
    // Steps are not evenly spaced: they crowd where the ray passes the light (equal angles as seen from the
    // light), because that is where the glow changes fastest. Even steps were far too coarse there, and the
    // moving jitter showed as rain in the bright fog seen through narrow gaps.
    float tl = dot(uLight - ro, rd), Dl = max(length(ro + rd * tl - uLight), 0.08);
    float thA = atan((t0 - tl) / Dl), thB = atan((tEnd - tl) / Dl), ta = t0;
    for (int i = 0; i < STEPS; i++) {
      float tb = i == STEPS - 1 ? tEnd : tl + Dl * tan(mix(thA, thB, float(i + 1) / float(STEPS)));
      float dt = tb - ta;
      vec3 p = ro + rd * (tl + Dl * tan(mix(thA, thB, (float(i) + jit) / float(STEPS))));
      ta = tb;
      float part = 0.0;
      for (int k = 0; k < 6; k++) { vec3 q = p - uP[k]; float w = 1.0 / (1.0 + dot(q.xz, q.xz) * 1.6); part += w * w; }
      // the cursor's wake: the fog is pushed the way the cursor went and parts round where it passed
      vec3 drag; float wk = wake(p, ro, drag);
      vec3 pn = p - drag;
      // two scales moving at different speeds, so banks change shape as they drift instead of sliding
      float lo = low(pn);
      float hi = fine(pn, lo);
      // fog thins where it meets a piece, as it does around anything standing in moving air
      float b = bank(p, lo, hi) * uDense * (1.0 - 0.55 * min(part, 1.0));
      // wisps: a third, finer layer eats into the banks and drifts faster, so their edges fray like smoke
      float tw = uTime * uDrift;
      b *= 0.45 + 1.1 * texture(tNoise, pn * vec3(0.85, 1.25, 0.85) + vec3(lo * 0.8 + tw * 0.045, -tw * 0.018, tw * 0.028)).r;
      // the cut is frayed by the fine noise, so it parts like smoke, not a clean tube
      float cut = smoothstep(0.0, 1.0, clamp(wk * (0.5 + 0.8 * hi), 0.0, 1.0));
      b *= 1.0 - 0.6 * cut;
      vec3 q = uLight - p; float d2 = dot(q, q); vec3 ld = q * inversesqrt(d2);
      // a thin haze always hangs round the light, so the cylinder always has its halo
      // the thin haze, like the banks, lies mostly behind the pieces: the foreground keeps its blacks
      float sigma = (0.011 * exp(-max(p.y, 0.0) * 0.45) * mix(0.2, 1.0, smoothstep(4.0, -2.0, p.z)) + 0.05 * exp(-d2 * 0.55)) * (1.0 - 0.2 * cut) + 0.95 * b;
      float cs = dot(rd, ld);
      float ph = 0.6975 / pow(1.3025 - 1.1 * cs, 1.5);        // looking toward the light, fog glows
      vec3 ps = p + ld * 0.6;
      float shade = exp(-bank(ps, low(ps), hi) * 3.2);        // the bank's own thickness shades it
      float a = 1.0 - exp(-sigma * dt);
      Sl += T * a * ph * shade * mix(uShadowFloor, 1.0, lightVis(p)) / (1.3 + d2);   // a soft core: a sharper one turns the march jitter into sparkle by the light
      Sa += T * a * (0.45 + 0.55 * shade);
      T *= 1.0 - a;
      if (T < 0.03) break;
    }
  }
  // fog in a piece's shadow is near black, as in Blender: the dim ambient is almost all that is left there
  vec3 S = uAmb * Sa + uLightCol * uLightK * Sl;
  // a shoulder: a bank drifting across the light glows, it never burns out to a white patch that travels
  S /= 1.0 + dot(S, vec3(0.3333)) * uKnee;
  gl_FragColor = vec4(sqrt(S), T);
}`;
const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uPx; uniform float uNear; uniform float uFar;
uniform float uFocus; uniform float uAperture; uniform float uMaxR; uniform float uFade; uniform vec3 uInk;
uniform sampler2D tFog; uniform vec2 uFogSize; uniform vec2 uFull; uniform float uDepthTol;
varying vec2 vUv;
float linZ(float d){ d = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - d * (uFar - uNear)); }
float viewZ(vec2 uv){ return linZ(texture2D(tDepth, uv).x); }
// the near field is capped lower, so the foreground softens without smearing
float coc(float z){ float d = 1.0 / uFocus - 1.0 / z; return clamp(abs(d) * uAperture, 0.0, d < 0.0 ? 0.6 : 1.0) * uMaxR; }
// Depth-aware upsample of the fog. For this full-size pixel, look at the 3x3 fog texels around the nearest
// one; each was marched to the depth of a known full-size pixel (texel tc at pixel tc * DIV + DIV / 2), so
// weight it by how close it sits and by how alike that depth is to this pixel's. Fog never bleeds across a
// silhouette, and the jittered march is smoothed on each side of it. If no texel saw this surface (a thin
// edge), take the one whose depth is nearest. Positions come from the pixel index, the same mapping the fog
// pass used, so they line up at any buffer size, not only multiples of DIV.
vec4 fogAt(vec2 uv, float z){
  vec2 f = (uv * uFull - 0.5 - float(DIV / 2)) / float(DIV);
  // from DIV 4 up a fog texel is wide enough that 3x3 of them, centred on the nearest, smooths as much as
  // 4x4 does at DIV 3: fewer fetches where there are the most pixels
#if DIV >= 4
  vec2 b = floor(f + 0.5), fr = f - b;
  const int K0 = -1, K1 = 1;
#else
  vec2 b = floor(f), fr = f - b;
  const int K0 = -1, K1 = 2;
#endif
  ivec2 full = ivec2(uFull) - 1, lim = ivec2(uFogSize) - 1;
  vec4 sum = vec4(0.0), best = vec4(0.0, 0.0, 0.0, 1.0); float wsum = 0.0, bestD = 1e9;
  // a 4x4 soft kernel: wide enough to average away the march jitter, which a 3x3 left as a dot grid
  for (int j = K0; j <= K1; j++) for (int i = K0; i <= K1; i++) {
    ivec2 tc = clamp(ivec2(b) + ivec2(i, j), ivec2(0), lim);
    float zi = linZ(texelFetch(tDepth, min(tc * DIV + DIV / 2, full), 0).x);
    vec4 fi = texelFetch(tFog, tc, 0);
    vec2 dd = vec2(float(i), float(j)) - fr;
    float rel = abs(zi - z) / z;
    float w = exp(-dot(dd, dd) * 0.42) * exp(-rel * rel * uDepthTol);
    sum += fi * w; wsum += w;
    float dz = rel + dot(dd, dd) * 1e-3;
    if (dz < bestD) { bestD = dz; best = fi; }
  }
  return (sum + best * 1e-4) / (wsum + 1e-4);
}
void main(){
  float z = viewZ(vUv), r0 = coc(z);
  // A pixel on a silhouette is a resolved blend of a piece and what lies behind it, but its depth is one or
  // the other. Where the depth says "behind" and a nearer, sharper piece is next to it (P, at offset o), blur
  // the background at its full strength and then lay the piece's share of the pixel back on top, so the
  // smooth MSAA edge survives without leaving a sharp ring of background around the piece.
  vec2 dx = vec2(uPx.x, 0.0), dy = vec2(0.0, uPx.y), o = vec2(0.0); float zn = z, zf = z, zk;
  zk = viewZ(vUv + dx); if (zk < zn) { zn = zk; o = dx; } zf = max(zf, zk);
  zk = viewZ(vUv - dx); if (zk < zn) { zn = zk; o = -dx; } zf = max(zf, zk);
  zk = viewZ(vUv + dy); if (zk < zn) { zn = zk; o = dy; } zf = max(zf, zk);
  zk = viewZ(vUv - dy); if (zk < zn) { zn = zk; o = -dy; } zf = max(zf, zk);
  bool edge = zn < z * 0.97 && coc(zn) + 1.0 < r0;
  vec4 C4 = texture2D(tColor, vUv);
  vec3 C = C4.rgb, G = edge ? texture2D(tColor, vUv - o).rgb : C;
  vec3 acc = G; float wsum = 1.0;
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
  if (edge) {
    // the piece's share: where this pixel sits between its unblurred background G and the piece P
    vec3 P = texture2D(tColor, vUv + o).rgb, d = P - G;
    c = mix(c, P, clamp(dot(C - G, d) / max(dot(d, d), 1e-6), 0.0, 1.0));
  }
  // The fog is added by depth, and a pixel's depth is one sample: on a silhouette it is all piece or all
  // background, so the glow behind a piece came in whole pixels and the smooth MSAA edge turned into steps.
  // The scene writes its view depth to alpha, which the MSAA resolve averages: where the near and far
  // surfaces meet, that average says how much of this pixel the near one covers. Blend the two finished
  // composites by it (not the fog values: they are stored as square roots, and a half-covered pixel got a
  // quarter of the glow, which still read as a hard step).
  if (zf > zn * 1.03) {
    float cov = clamp((zf - C4.a * ${ZS}) / (zf - zn), 0.0, 1.0);
    vec4 fF = fogAt(vUv, zf), fN = fogAt(vUv, zn);
    c = mix(c * fF.a + fF.rgb * fF.rgb, c * fN.a + fN.rgb * fN.rgb, cov);
  } else {
    vec4 fog = fogAt(vUv, z);
    c = c * fog.a + fog.rgb * fog.rgb;
  }
  c = mix(uInk, c, uFade);
#ifdef DITHER_POST
  // 8-bit frame buffer (no half float): dither here too, before the composite is rounded
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
#endif
  gl_FragColor = vec4(c, 1.0);
}`;
// Bloom, as the posters have it (output.py _glow): everything above 0.38 bleeds into the fog, a wide soft
// glow plus a tight one. Bright pass at a quarter of the size (tight), an eighth (wide), blurred there.
// Each output texel averages four bilinear taps, so a 2x step down sees every source pixel.
const DOWN_FS = `
uniform sampler2D tIn; uniform vec2 uSrcPx; uniform float uThresh;
varying vec2 vUv;
vec3 tap(vec2 o){ return max(texture2D(tIn, vUv + o * uSrcPx).rgb - uThresh, 0.0); }
void main(){ gl_FragColor = vec4((tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25, 1.0); }`;
const BLUR_FS = `
uniform sampler2D tIn; uniform vec2 uStep;
varying vec2 vUv;
void main(){
  vec3 s = vec3(0.0); float ws = 0.0;
  for (int i = -7; i <= 7; i++) { float x = float(i) * 0.4, w = exp(-0.5 * x * x); s += texture2D(tIn, vUv + uStep * float(i)).rgb * w; ws += w; }
  gl_FragColor = vec4(s / ws, 1.0);
}`;
// Last pass: FXAA (after Lottes, 3.11 quality, trimmed) over the finished frame, then bloom and dither. The depth-driven
// passes above decide per pixel, from a depth that is one sample, so they can put back a stair step on an
// outline that MSAA had smoothed; this finds edges by contrast and blends along them. Luma is taken on
// sqrt(colour) so the dark edges against the fog are found too.
const FXAA_FS = `
uniform sampler2D tIn; uniform vec2 uPx; uniform float uSubpix; uniform float uEdge; uniform float uEdgeMin;
uniform sampler2D tTight; uniform sampler2D tWide; uniform vec2 uTightPx; uniform float uTightK; uniform float uWideK; uniform vec3 uTint; uniform vec3 uShadow; uniform float uIgnite;
uniform sampler2D tGrain; uniform float uGrainPx; uniform float uGrain; uniform float uGrainSoft; uniform float uGrainSplit;
varying vec2 vUv;
// film grain (the grainy-gradients skill): the same feTurbulence tile its CSS uses, laid over the frame in
// screen space. Centred on mid-grey, so overlay / soft-light leave the average brightness alone.
vec3 toLin(vec3 v){ return mix(v / 12.92, pow((v + 0.055) / 1.055, vec3(2.4)), step(0.04045, v)); }
vec3 toSrgb(vec3 v){ return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v)); }
vec3 overlayB(vec3 b, vec3 n){ return mix(2.0 * b * n, 1.0 - 2.0 * (1.0 - b) * (1.0 - n), step(0.5, b)); }
vec3 softB(vec3 b, vec3 n){
  vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
  return mix(b - (1.0 - 2.0 * n) * b * (1.0 - b), b + (2.0 * n - 1.0) * (d - b), step(0.5, n));
}
float lum(vec2 uv){ return sqrt(max(dot(texture2D(tIn, uv).rgb, vec3(0.299, 0.587, 0.114)), 0.0)); }
vec3 fxaa(){
  vec3 cM = texture2D(tIn, vUv).rgb;
  float lM = sqrt(max(dot(cM, vec3(0.299, 0.587, 0.114)), 0.0));
  float lN = lum(vUv + vec2(0.0, uPx.y)), lS = lum(vUv - vec2(0.0, uPx.y));
  float lE = lum(vUv + vec2(uPx.x, 0.0)), lW = lum(vUv - vec2(uPx.x, 0.0));
  float lMax = max(lM, max(max(lN, lS), max(lE, lW))), lMin = min(lM, min(min(lN, lS), min(lE, lW)));
  float range = lMax - lMin;
  if (range < max(uEdgeMin, lMax * uEdge)) return cM;
  float lNE = lum(vUv + uPx), lSW = lum(vUv - uPx);
  float lNW = lum(vUv + vec2(-uPx.x, uPx.y)), lSE = lum(vUv + vec2(uPx.x, -uPx.y));
  float avg = (2.0 * (lN + lS + lE + lW) + lNE + lNW + lSE + lSW) / 12.0;
  float sub = smoothstep(0.0, 1.0, clamp(abs(avg - lM) / range, 0.0, 1.0));
  sub = sub * sub * uSubpix;
  float eH = abs(lNW + lSW - 2.0 * lW) + 2.0 * abs(lN + lS - 2.0 * lM) + abs(lNE + lSE - 2.0 * lE);
  float eV = abs(lSW + lSE - 2.0 * lS) + 2.0 * abs(lW + lE - 2.0 * lM) + abs(lNW + lNE - 2.0 * lN);
  bool horz = eH >= eV;
  float l1 = horz ? lS : lW, l2 = horz ? lN : lE;
  float g1 = abs(l1 - lM), g2 = abs(l2 - lM);
  bool neg = g1 >= g2;
  float grad = 0.25 * max(g1, g2);
  float stp = horz ? uPx.y : uPx.x;
  float lLocal = 0.5 * ((neg ? l1 : l2) + lM);
  if (neg) stp = -stp;
  vec2 cur = vUv + (horz ? vec2(0.0, stp * 0.5) : vec2(stp * 0.5, 0.0));
  vec2 off = horz ? vec2(uPx.x, 0.0) : vec2(0.0, uPx.y);
  vec2 u1 = cur - off, u2 = cur + off;
  float e1 = lum(u1) - lLocal, e2 = lum(u2) - lLocal;
  bool r1 = abs(e1) >= grad, r2 = abs(e2) >= grad;
  for (int i = 0; i < 10; i++) {
    if (r1 && r2) break;
    float q = i < 3 ? 1.0 : (i < 6 ? 1.5 : (i < 8 ? 2.0 : 4.0));
    if (!r1) { u1 -= off * q; e1 = lum(u1) - lLocal; r1 = abs(e1) >= grad; }
    if (!r2) { u2 += off * q; e2 = lum(u2) - lLocal; r2 = abs(e2) >= grad; }
  }
  float d1 = horz ? vUv.x - u1.x : vUv.y - u1.y, d2 = horz ? u2.x - vUv.x : u2.y - vUv.y;
  bool near1 = d1 < d2;
  float pix = 0.5 - min(d1, d2) / (d1 + d2);
  bool good = ((near1 ? e1 : e2) < 0.0) != (lM < lLocal);
  float o = max(good ? pix : 0.0, sub);
  return texture2D(tIn, vUv + (horz ? vec2(0.0, o * stp) : vec2(o * stp, 0.0))).rgb;
}
void main(){
  vec3 c = fxaa();
  // bloom: the tight glow gets four more taps, so it is round and as wide as the posters' (~h/300)
  vec3 tight = texture2D(tTight, vUv + uTightPx * vec2(-1.5, -1.5)).rgb + texture2D(tTight, vUv + uTightPx * vec2(1.5, -1.5)).rgb
             + texture2D(tTight, vUv + uTightPx * vec2(-1.5, 1.5)).rgb + texture2D(tTight, vUv + uTightPx * vec2(1.5, 1.5)).rgb;
  c += texture2D(tWide, vUv).rgb * uWideK + tight * 0.25 * uTightK;
  // the light coming on: everything here is lit by it, so the frame scales with it. The dim parts come up
  // later than the bright core (they go as its square), so the halo is there first and the shafts fan out.
  float l0 = dot(c, vec3(0.299, 0.587, 0.114));
  c *= uIgnite * mix(uIgnite, 1.0, smoothstep(0.02, 0.5, l0));
  // grade: the dark and the mid tones lean deep blue, the lit ivory keeps its own colour
  float l = dot(c, vec3(0.299, 0.587, 0.114)), k = 1.0 - smoothstep(0.22, 0.85, l);
  c = mix(c, c * uTint, k) + uShadow * k * (1.0 - smoothstep(0.0, 0.25, l));
  // dark, smooth fog on an 8-bit screen: break the bands up with a little noise
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  if (uGrain > 0.0 && gl_FragCoord.x >= uGrainSplit) {
    vec3 b = clamp(c, 0.0, 1.0), n = texture2D(tGrain, gl_FragCoord.xy / uGrainPx).rgb;
    // mode 2, even: the noise moves L* (perceived lightness) by the same amount everywhere, so the sky, the
    // lit floor and the ivory all get the same grain. Added as neutral grey in linear light; hue is kept.
    if (uGrainSoft > 1.5) {
      vec3 lin = toLin(b);
      float Y = dot(lin, vec3(0.2126, 0.7152, 0.0722));
      float L = Y > 0.008856 ? 116.0 * pow(Y, 1.0 / 3.0) - 16.0 : 903.3 * Y;
      float L2 = max(L + (n.r - 0.5) * uGrain * smoothstep(0.5, 4.0, L), 0.0);   // true black stays black
      float Y2 = L2 > 8.0 ? pow((L2 + 16.0) / 116.0, 3.0) : L2 / 903.3;
      c = toSrgb(max(lin + (Y2 - Y), 0.0));
    } else c = mix(c, mix(overlayB(b, n), softB(b, n), uGrainSoft), uGrain);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// Dust hanging in the air round the light. Lit only by it: bright where you look toward the light, dark in a
// piece's shadow (the same footprint test as the fog), so the motes show the shafts. The cursor's wake pushes
// them too. Each flake tumbles, so it catches the light now and then. Drawn after the depth of field (which
// would smear a 2-pixel mote to nothing): each mote tests the scene depth itself and grows into its own soft
// disc by its own circle of confusion, keeping its total light.
const MOTE_VS = `
uniform float uTime; uniform float uScale; uniform vec3 uLight; uniform vec4 uOcc[6]; uniform vec2 uOccY[6];
uniform vec3 uLo; uniform vec3 uSize; uniform float uFocus; uniform float uAperture; uniform float uMaxR;
attribute vec4 aSeed;
varying float vI; varying float vZ; varying float vSharp;
${LIGHT_VIS}
${WAKE_GLSL}
void main(){
  float k = aSeed.w;
  // still air: a slow rise and a lazy wander, wrapped inside the box round the light
  vec3 p = aSeed.xyz * uSize;
  // two octaves of slow wander per axis, never in step, so no mote moves on a visible loop
  float T = uTime;
  p.y += T * (0.006 + 0.012 * k) + sin(T * 0.11 + k * 17.0) * 0.05;
  p.x += sin(T * (0.031 + 0.02 * k) + k * 40.0) * 0.22 + sin(T * 0.13 + k * 63.0) * 0.04;
  p.z += cos(T * (0.023 + 0.02 * k) + k * 23.0) * 0.22 + cos(T * 0.17 + k * 31.0) * 0.04;
  p = uLo + mod(p, uSize);
  vec3 e = min(p - uLo, uLo + uSize - p);
  float edge = smoothstep(0.0, 0.4, min(min(e.x, e.y), e.z));      // no pop where the box wraps
  vec3 drag; wake(p, cameraPosition, drag);
  p += drag * 1.4;
  vec3 q = uLight - p; float d2 = dot(q, q);
  float cs = dot(normalize(p - cameraPosition), q * inversesqrt(d2));
  float ph = 0.6975 / pow(1.3025 - 1.1 * cs, 1.5);
  // a flake turns slowly, so its glint swells and fades over seconds, never blinks
  float tw = 0.6 + 0.4 * sin(T * (0.15 + 0.25 * k) + k * 91.0);
  // only the air close to the light is bright enough to show dust: the light falls off steeply
  float fall = 1.0 / ((0.35 + d2) * (0.35 + d2));
  vI = ph * tw * edge * lightVis(p) * fall;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vZ = -mv.z;
  float px = (0.004 + 0.008 * fract(k * 7.13) * fract(k * 7.13)) * uScale / vZ;
  vI *= min(1.0, px / 1.5);           // below a pixel and a half they dim instead of shrinking
  px = max(px, 1.5);
  float d = 1.0 / uFocus - 1.0 / vZ;
  float coc = clamp(abs(d) * uAperture, 0.0, 1.0) * uMaxR;
  // never a hard dot: the lens and the haze always soften it a little
  float sz = px * 1.6 + 2.0 * coc + 1.5;
  vI *= (px * px) / (sz * sz);        // out of focus: the same light spread over a bigger disc
  vSharp = px / sz;
  gl_PointSize = sz;
}`;
const MOTE_FS = `
uniform vec3 uCol; uniform float uGain; uniform float uLightK; uniform sampler2D tDepth; uniform vec2 uFull; uniform float uNear; uniform float uFar;
varying float vI; varying float vZ; varying float vSharp;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float d = texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).x * 2.0 - 1.0;
  float z = 2.0 * uNear * uFar / (uFar + uNear - d * (uFar - uNear));
  if (vZ > z + 0.05) discard;         // behind a piece or the board
  // in focus a soft dot; out of focus a flat disc with a soft rim, like a lens draws it
  float a = mix(1.0 - smoothstep(0.5, 1.0, r2), exp(-r2 * 4.0) * 2.5, vSharp);
  gl_FragColor = vec4(uCol * (vI * uGain * uLightK * a), 1.0);
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
  const pieces = {}, state = {}, liftAmt = new Float32Array(6);
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
        vertexShader: BOARD_VS, fragmentShader: BOARD_FS,
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
      vertexShader: PIECE_VS, fragmentShader: PIECE_FS,
      // the pearl's gloss is baked like everything else, so it gets the same faint glint, not a second highlight
    uniforms: { map: { value: map }, matcap: { value: matcapTex }, uSheen: { value: /^plinth-/.test(o.name) ? 0.16 : o.name === "piece-cyrus" ? 0.03 : 0.06 }, uHaze: hazeU },
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
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 60);
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3();
  let focusNow = 0;

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
  // post: depth of field + fog composite into a full-size buffer, then FXAA + bloom + dither to the screen
  const frameRT = plainRT(THREE.LinearFilter);
  const postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    defines: halfFloat ? { DIV: FOG_DIV } : { DIV: FOG_DIV, DITHER_POST: 1 },
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uPx: { value: new THREE.Vector2() },
      uNear: { value: camera.near }, uFar: { value: camera.far }, uFocus: { value: 10 }, uAperture: { value: 25 },
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
  let wideSigma = 1;            // the wide glow's sigma, in eighth-size texels
  disposables.push(rt, rt.depthTexture, frameRT, postMat, fxaaMat, postGeo,
    tightRT, wideRT, wideTmp, brightMat, down8Mat, blurMat);

  // fog: marched at 1/FOG_DIV of the size (it has no fine detail). Read texel by texel (texelFetch), so no
  // filtering is needed. Each piece shadows it through a soft footprint of its bounding box (piece + plinth).
  const fogRT = plainRT(THREE.NearestFilter);
  const occ = IDS.map(id => { const b = state[id].box;
    return new THREE.Vector4((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, (b.max.x - b.min.x) * 0.375, (b.max.z - b.min.z) * 0.375); });
  const occY = IDS.map(id => new THREE.Vector2(state[id].box.min.y, state[id].box.max.y));
  const noiseTex = noiseVolume();
  // the cursor's wake (see WAKE_GLSL): shared by the fog and the dust
  const wakeD = Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, -1, 0));
  const wakeV = Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, 0, 1));
  const wakeU = { uWakeD: { value: wakeD }, uWakeV: { value: wakeV }, uWakeOn: { value: 0 } };
  const fogMat = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: FOG_FS, depthTest: false, depthWrite: false,
    defines: { DIV: FOG_DIV },
    uniforms: {
      uFull: postMat.uniforms.uFull,
      uDrift: { value: 0.75 },         // 0 holds the fog still, 2 doubles its drift
      tDepth: { value: rt.depthTexture }, tNoise: { value: noiseTex },
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
      ...wakeU,
    },
  });
  const fogScene = pass(fogMat);

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
    vertexShader: MOTE_VS, fragmentShader: MOTE_FS,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: fogMat.uniforms.uTime, uScale: { value: 1000 }, uLight: fogMat.uniforms.uLight,
      uOcc: fogMat.uniforms.uOcc, uOccY: fogMat.uniforms.uOccY,
      uLo: { value: new THREE.Vector3(-1.9, 0.3, -3.4) }, uSize: { value: new THREE.Vector3(3.8, 2.6, 4.0) },
      uCol: { value: new THREE.Vector3(0.80, 0.86, 1.0) }, uGain: { value: 1.2 }, uLightK: lightK,
      uFocus: postMat.uniforms.uFocus, uAperture: postMat.uniforms.uAperture, uMaxR: postMat.uniforms.uMaxR,
      tDepth: { value: rt.depthTexture }, uFull: postMat.uniforms.uFull, uNear: { value: camera.near }, uFar: { value: camera.far },
      ...wakeU,
    },
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  const moteScene = new THREE.Scene();
  moteScene.add(motes);
  disposables.push(moteGeo, moteMat);
  postMat.uniforms.tFog.value = fogRT.texture;
  disposables.push(fogRT, noiseTex, fogMat);

  let W = 1, H = 1, current = null, phone = 0, panLo = 0, panHi = 0, boxesDirty = true;
  const camV = new THREE.Vector3();
  function setOrientation(o) {
    current = o;
    const v = layout[o], c = v.camera, aspect = W / H;
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
    const fpx = postMat.uniforms.uFull.value.y / (2 * Math.tan((camera.fov * DEG) / 2));
    const k = o === "landscape" ? postMat.uniforms.uFull.value.y / 1080 : fpx / FOCAL_REF;
    postMat.uniforms.uMaxR.value = 13 * k;           // shared with the motes
    wideSigma = (1080 * k) / 60 / 8;                  // the posters' wide glow: sigma ~ h/60 at 16:9, in eighth-size texels
    moteMat.uniforms.uScale.value = fpx;
  }
  const FOCAL_REF = 1080 / (2 * Math.tan((layout.landscape.camera.fovY * DEG) / 2));
  let level = LADDER[0], fogDiv = FOG_DIV, readout = null, fpsAvg = 60, picked = true;
  function showReadout() {
    const i = LADDER.indexOf(level), names = ["full", "medium", "low"];
    readout.textContent = "SHARPNESS " + (i + 1) + "/" + LADDER.length + " (" + names[i] + (picked ? ", auto" : ", forced") + ")\n"
      + canvas.width + " x " + canvas.height + "  ·  screen " + (window.devicePixelRatio || 1).toFixed(2) + "x\n"
      + Math.round(fpsAvg) + " fps  ·  keys 1 2 3 switch";
  }
  let lastW = 0, lastH = 0, lastPr = 0;
  function resize() {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    // a soft, foggy image hides the difference; the GPU does not. Cap the pixel ratio, and the total pixel
    // count too, so a big window or a 4K screen costs no more than ~2160x1390.
    const pr = Math.min(window.devicePixelRatio || 1, level[0], Math.sqrt(level[1] / (w * h)));
    // iOS fires resize whenever the Safari toolbar shows or hides while scrolling, though the svh stage keeps
    // its size. setSize would clear and reallocate the drawing buffer (and drop a tap hover) each time. A level
    // change always passes: it changes pr.
    if (w === lastW && h === lastH && pr === lastPr && current === orientation()) return;
    W = lastW = w; H = lastH = h; lastPr = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    fxaaMat.uniforms.uGrainPx.value = Math.round(200 * pr); drawGrain(200 * pr);   // the CSS tile (200 CSS px) in backing pixels
    const bw = Math.round(W * pr), bh = Math.round(H * pr);
    rt.setSize(bw, bh);
    frameRT.setSize(bw, bh);
    const div = Math.max(FOG_DIV, Math.ceil(Math.sqrt((bw * bh) / FOG_MAX)));
    if (div !== fogDiv) {
      fogDiv = div;
      for (const m of [fogMat, postMat]) { m.defines.DIV = div; m.needsUpdate = true; }
    }
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
    setOrientation(orientation());        // also sizes the depth of field, the wide glow and the motes
    Object.assign(handle, { pr, buf: canvas.width + "x" + canvas.height, phone: Math.round(phone * 100) / 100 });
    if (typeof hoverFromPointer === "function" && hoverId) { touchHover = null; hoverFromPointer(null); }
  }

  // ---- behaviour state
  const ndc = new THREE.Vector2(), pointer = new THREE.Vector2(), drift = new THREE.Vector2();
  const fine = matchMedia("(pointer:fine)");
  const ray = new THREE.Raycaster(), hit = new THREE.Vector3(), tmp = new THREE.Vector3();
  let hoverId = null, scrollP = 0, scrollNow = 0, scrollFed = false, pickS = 0, touchHover = null, touchTimer = 0;
  const lastMouse = { clientX: 0, clientY: 0 };
  let pointerIn = false, wakeSpeed = 0, igT = 0, igHold = -1;
  const wakeAge = new Float32Array(WAKE_N).fill(99), wakePeak = new Float32Array(WAKE_N);
  const wakeAt = new THREE.Vector2(), wakePrev = new THREE.Vector3(), wakeTmp = new THREE.Vector3();
  let running = false, raf = 0, last = 0, t = 0, disposed = false, visible = true;
  // the phone pan (see PHONE_CAM): the look turns about the camera's own position. panGoal is where the
  // finger (or the glide after it) puts it, panNow eases after; radians, positive looks right.
  let panGoal = 0, panNow = 0, panVel = 0, drag = null, nudge = -1, boxKey = NaN, boxAt = 0;
  const UP = new THREE.Vector3(0, 1, 0);
  // render state for ?why: the rung ladder, scene target MSAA and half float (post targets checked apart)
  const handle = { canvas, pieces, camera, frameCount: 0, ladder: COARSE ? "touch" : "desk",
    msaa: Math.min(rt.samples, renderer.capabilities.maxSamples), half: rt.texture.type === THREE.HalfFloatType, halfPost: halfFloat };

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
    opts.onHover(id, (tmp.x * 0.5 + 0.5) * W, (-tmp.y * 0.5 + 0.5) * H - 6);
  }
  function hoverFromPointer(id) {
    if (id === hoverId) return;
    setHover(id); labelAt(id);
  }
  function clearTouch() { clearTimeout(touchTimer); touchHover = null; hoverFromPointer(null); }

  let down = null;
  // A sideways drag turns the view where the phone framing leaves pieces outside the frame (panLo/panHi).
  // The canvas keeps touch-action:pan-y, so an upright drag still scrolls the page: the browser takes it and
  // sends pointercancel. Past 8 px, mostly sideways, it is a drag and no longer a tap.
  on(canvas, "pointermove", e => {
    if (!down || down.id !== e.pointerId || panLo + panHi <= 0) return;
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
    const per = (2 * Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect)) / W;
    panGoal = Math.min(panHi, Math.max(-panLo, drag.from - (e.clientX - drag.x) * per));
    panVel += ((-(e.clientX - drag.px) * per * 1000) / Math.max(1, now - drag.pt) - panVel) * 0.5;
    drag.px = e.clientX; drag.pt = now;
  });
  on(canvas, "pointermove", e => {
    if (e.pointerType !== "mouse" || drag) return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    lastMouse.clientX = e.clientX; lastMouse.clientY = e.clientY; pickS = scrollNow;
    if (!pointerIn) { pointerIn = true; wakeAt.copy(pointer); wakePrev.set(0, 0, 0); }
    hoverFromPointer(pick(e));
  });
  on(canvas, "pointerleave", e => { if (e.pointerType === "mouse") { pointer.set(0, 0); pointerIn = false; hoverFromPointer(null); } });
  on(canvas, "pointerdown", e => {
    if (e.button !== 0 || e.isPrimary === false) { down = null; return; }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, id: e.pointerId };
    if (!drag) panVel = 0;                           // a touch catches the glide
  });
  on(canvas, "pointerup", e => {
    if (!down) return;
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
  on(window, "resize", () => resize());

  function exit(reason) {
    if (disposed) return;
    dispose();
    if (opts.onLost) opts.onLost(reason);
  }
  on(canvas, "webglcontextlost", e => { e.preventDefault(); exit("context lost"); });

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
    fxaaMat.uniforms.uIgnite.value = igniteAt(igT);
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
        // the push: how far the line of sight swept, at about the depth of the pieces
        if (wakePrev.lengthSq() > 0) wakeTmp.copy(dir).sub(wakePrev).multiplyScalar(9 * 1.2);
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
    postMat.uniforms.uFocus.value = focusNow;
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
    const out = {};
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
  function render() {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(fogRT);
    renderer.render(fogScene, postCam);
    renderer.setRenderTarget(frameRT);
    renderer.render(postScene, postCam);
    renderer.autoClear = false;
    renderer.render(moteScene, camera);
    renderer.autoClear = true;
    // bloom
    renderer.setRenderTarget(tightRT);
    renderer.render(brightScene, postCam);
    renderer.setRenderTarget(wideRT);
    renderer.render(down8Scene, postCam);
    const bu = blurMat.uniforms, k = wideSigma * 0.4;
    bu.tIn.value = wideRT.texture; bu.uStep.value.set(k / wideRT.width, 0);
    renderer.setRenderTarget(wideTmp);
    renderer.render(blurScene, postCam);
    bu.tIn.value = wideTmp.texture; bu.uStep.value.set(0, k / wideRT.height);
    renderer.setRenderTarget(wideRT);
    renderer.render(blurScene, postCam);
    renderer.setRenderTarget(null);
    renderer.render(fxaaScene, postCam);
    handle.frameCount++;
  }

  function frame(now) {
    raf = 0;
    if (!running || disposed) return;
    // never negative: the first frame after the mount test can carry a timestamp from before it, which ran
    // the entrance clock backwards by half a second
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0.016));
    if (last) { fpsAvg += (1000 / Math.max(now - last, 1) - fpsAvg) * 0.05; stepDown(now - last, now); }
    last = now;
    update(dt); render();
    if (readout && handle.frameCount % 20 === 0) showReadout();
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
    handle.setLevel(i + 1); handle.stepped = (handle.stepped || 0) + 1;
  }
  function start() {
    if (running || disposed || !visible || document.hidden) return;
    running = true; last = performance.now(); badSince = 0;
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
    canvas.remove(); if (readout) readout.remove();
  }

  // tuning from the console: heroLive.fog, .post (depth of field, fog upsample), .fxaa (also the bloom
  // weights uTightK, uWideK, and uIgnite), .bright (bloom threshold uThresh), .motes (uGain, uCol); .ignite() replays the light
  Object.assign(handle, { setOrientation, setHover, setScroll, render, start, stop, dispose, resize, boxes,
    ignite: s => { igHold = typeof s === "number" ? s : -1; if (igHold < 0) igT = 0; }, grain: setGrain, motes: moteMat.uniforms,
    setLevel: i => { level = LADDER[i] || level; handle.level = LADDER.indexOf(level); resize(); },
    board: boardMesh.material.uniforms, fog: fogMat.uniforms, post: postMat.uniforms, fxaa: fxaaMat.uniforms, bright: brightMat.uniforms });

  stage.appendChild(canvas);
  resize();
  if (new URLSearchParams(location.search).has("compare")) grainCompare();

  // ?compare: a before/after slider over the live hero. Left of the line has no grain, right has the
  // chosen level; the buttons switch the level. A review tool only, never shown without the parameter.
  function grainCompare() {
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;inset:0;z-index:5;pointer-events:none;font:11px/1 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#ECE7DC";
    box.innerHTML = '<div data-line style="position:absolute;top:0;bottom:0;width:1px;background:#E9A03B;box-shadow:0 0 0 .5px rgba(0,0,0,.4)">'
      + '<div data-knob style="position:absolute;top:50%;left:-18px;width:36px;height:36px;margin-top:-18px;border-radius:50%;border:1px solid #E9A03B;background:rgba(12,12,14,.7);cursor:ew-resize;pointer-events:auto;touch-action:none;display:grid;place-items:center;color:#E9A03B">&#8596;</div></div>'
      + '<div style="position:absolute;left:24px;bottom:24px">Before &middot; no grain</div>'
      + '<div data-levels style="position:absolute;right:24px;bottom:24px;display:flex;gap:6px;pointer-events:auto"></div>';
    stage.appendChild(box);
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
    const drag = e => { const r = stage.getBoundingClientRect(); frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); place(); };
    knob.addEventListener("pointerdown", e => { knob.setPointerCapture(e.pointerId); drag(e); e.preventDefault(); e.stopPropagation(); });
    knob.addEventListener("pointermove", e => { if (knob.hasPointerCapture(e.pointerId)) drag(e); });
    on(window, "resize", place);
    paint(); place();
  }
  update(0); render();          // first frame is on screen before the caller fades the stage in
  // Does this GPU keep up? Time real frames, forced to finish by a 1-pixel readback. Frame
  // intervals are no use here: a throttled or background tab would look like a slow device.
  {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    let ms = 0;
    for (let i = 0; i < LADDER.length; i++) {
      if (i) { level = LADDER[i]; resize(); }
      // two warm-ups (shader compile, uploads, new buffers after a level change), then the median of seven
      // frames: one late frame (another tab, a compile finishing) must not send a good GPU to the poster
      const one = () => { const t0 = performance.now(); render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      one(); one();
      ms = Array.from({ length: 7 }, one).sort((a, b) => a - b)[3];
      if (ms <= level[2]) break;
    }
    handle.level = LADDER.indexOf(level); handle.mountMs = ms;
    if (ms > level[2]) throw new Error("too slow");
  }
  // On localhost only: a small readout in the corner (which sharpness level, the buffer size, frames a
  // second) and keys 1 / 2 / 3 to switch level, so the levels can be compared by eye. Off unless
  // localStorage.heroReadout = "1".
  let wantReadout = false;
  try { wantReadout = localStorage.getItem("heroReadout") === "1"; } catch (e) {}
  if (wantReadout && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    readout = document.createElement("div");
    readout.style.cssText = "position:absolute;left:12px;bottom:12px;z-index:5;font:11px/1.4 'IBM Plex Mono',monospace;letter-spacing:.06em;color:#A8A49C;background:rgba(12,12,14,.7);padding:6px 9px;pointer-events:none;white-space:pre";
    stage.appendChild(readout);
    on(window, "keydown", e => {
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i < 0 || i >= LADDER.length || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      picked = false; handle.setLevel(i); showReadout();
    });
    showReadout();
  }
  start();
  return handle;
  } catch (e) { cleanup(); throw e; }
}
