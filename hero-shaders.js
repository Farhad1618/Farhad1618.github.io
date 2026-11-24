// Every GLSL string of the live scene (hero.js, hero-core.js, hero-solo.js). Shared by every world: the
// chessboard hero and the solo pieces. What differs per world is passed in, never baked in:
//   ZS   the camera's far plane (#define): scene alpha = view depth / ZS, read back by POST_FS
//   NOCC how many pieces shadow the fog and lift tiles (#define): the arrays uOcc, uOccY, uP, uLiftAmt.
//        Never pad those arrays with zero-size occluders (uOcc.zw divides): size NOCC to the world.
//   DIV  the fog's size divisor (#define), kept in step by the core's resize
// and the fog's world scale is uniforms (uTop, uBankZ, uHazeZ, uHalo, uTEnd), set by the world.
// Each builder returns { vertexShader, fragmentShader, defines } for a ShaderMaterial.

// a JS number as a GLSL float literal (60 -> "60.0")
export const glslFloat = v => (Number.isInteger(v) ? v.toFixed(1) : String(v));

// RIG: a piece with moving parts (see blender/hero/pieces.py, "moving parts"). COLOR_0 red = part / 8; per part
// uRigP = pivot and mode (w 0 turns, 1 hangs), uRigA = axis and angle (radians), uRigH = anchor and the part
// it hangs from. A turning part rotates about its pivot; a hanging part follows its anchor without tilting.
const PIECE_VS_SRC = `
varying vec2 vUv; varying vec3 vN; varying float vDepth; varying vec3 vWorld;
#ifdef SOLO
varying vec3 vWN;
#endif
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
#ifdef SOLO
  vWN = mat3(modelMatrix) * nrm;
#endif
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const PIECE_FS_SRC = `
uniform sampler2D map; uniform sampler2D matcap; uniform float uSheen; uniform vec3 uHaze;
varying vec2 vUv; varying vec3 vN; varying float vDepth;
#ifdef GAIN
uniform float uGain;
#endif
#ifdef SOLO
// solo pieces: the bake holds only what does not depend on the view, so the highlight is drawn here, from the
// one light. emissiveMap is the baked mask: r gloss, g how much of the light reaches the surface (no glint
// inside a baked shadow), b how strong the surface's highlight is.
uniform sampler2D emissiveMap; uniform vec3 uLight; uniform vec3 uLightCol; uniform float uSpecK;
varying vec3 vWN; varying vec3 vWorld;
#endif
void main(){
  vec3 n = normalize(vN);
  vec3 b = texture2D(map, vUv).rgb;
#ifdef GAIN
  // presented on the phone tour (hero.js TOUR.gain): the dim side of the bake comes up, the bright faces stay
  // where they are, so nothing clips. No light is added. uGain 1 multiplies by exactly 1.
  b *= 1.0 + (uGain - 1.0) * (1.0 - smoothstep(0.35, 0.9, max(b.r, max(b.g, b.b))));
#endif
  // the bake already holds the view's sheen and translucency: the matcap only adds a faint live glint
  vec3 c = b + texture2D(matcap, n.xy * 0.5 + 0.5).rgb * uSheen;
#ifdef SOLO
  vec3 m = texture2D(emissiveMap, vUv).rgb;
  vec3 q = uLight - vWorld; float d2 = dot(q, q);
  vec3 N = normalize(vWN), h = normalize(q * inversesqrt(d2) + normalize(cameraPosition - vWorld));
  c += m.b * m.g * pow(max(dot(N, h), 0.0), mix(8.0, 400.0, m.r * m.r)) * (m.r * 0.9 + 0.1) * uLightCol * uSpecK / max(d2, 0.5);
#endif
  gl_FragColor = vec4(c, vDepth / ZS);     // alpha: view depth, averaged by the MSAA resolve (see POST_FS)
}`;
// The board. The tiles under a piece rise with it on hover: only their top corners move (aLift = the piece's
// index, -1 elsewhere), so the block's sides stretch down to where they always ended and nothing opens beneath.
const BOARD_VS_SRC = `
attribute float aLift; uniform float uLiftAmt[NOCC];
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
const BOARD_FS_SRC = `
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
  gl_FragColor = vec4(c, vDepth / ZS);
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
  for (int k = 0; k < NOCC; k++) {
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
export const WAKE_N = 16;
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
const FOG_FS_SRC = `
precision highp sampler3D;
uniform sampler2D tDepth; uniform sampler3D tNoise;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec2 uFull;
uniform float uNear; uniform float uFar; uniform float uTime; uniform float uDrift;
uniform vec3 uP[NOCC]; uniform vec3 uLight; uniform vec3 uLightCol; uniform vec3 uAmb;
uniform vec4 uOcc[NOCC]; uniform vec2 uOccY[NOCC]; uniform float uShadowFloor; uniform float uKnee; uniform float uJitT;
uniform float uDense; uniform float uRise; uniform float uLightK;     // scroll: thicker, taller banks; the light going down
// the world's own scale: no fog above uTop; banks and haze lie mostly behind the pieces (smoothstep over z from
// .x to .y); uHalo is the haze always round the light; uTEnd caps the march
uniform float uTop; uniform vec2 uBankZ; uniform vec2 uHazeZ; uniform float uHalo; uniform float uTEnd;
varying vec2 vUv;
const int STEPS = 16;
${LIGHT_VIS}
${WAKE_GLSL}
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
  float h = 1.0 - smoothstep(0.0, top + uRise, p.y);        // uTop still caps it
  // more of it lies behind the pieces than between them and the eye
  return smoothstep(0.40, 0.68, lo * 0.62 + hi * 0.38) * h * h * mix(0.08, 1.0, smoothstep(uBankZ.x, uBankZ.y, p.z));
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
  float tEnd = min(z / max(-dv.z, 1e-4), uTEnd), t0 = 0.0;
  if (rd.y > 1e-4) { if (ro.y >= uTop) tEnd = 0.0; else tEnd = min(tEnd, (uTop - ro.y) / rd.y); }
  else if (ro.y > uTop) t0 = rd.y < -1e-4 ? (uTop - ro.y) / rd.y : tEnd;
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
      for (int k = 0; k < NOCC; k++) { vec3 q = p - uP[k]; float w = 1.0 / (1.0 + dot(q.xz, q.xz) * 1.6); part += w * w; }
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
      float sigma = (0.011 * exp(-max(p.y, 0.0) * 0.45) * mix(0.2, 1.0, smoothstep(uHazeZ.x, uHazeZ.y, p.z)) + uHalo * exp(-d2 * 0.55)) * (1.0 - 0.2 * cut) + 0.95 * b;
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
export const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const POST_FS = `
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
    float cov = clamp((zf - C4.a * ZS) / (zf - zn), 0.0, 1.0);
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
export const DOWN_FS = `
uniform sampler2D tIn; uniform vec2 uSrcPx; uniform float uThresh;
varying vec2 vUv;
vec3 tap(vec2 o){ return max(texture2D(tIn, vUv + o * uSrcPx).rgb - uThresh, 0.0); }
void main(){ gl_FragColor = vec4((tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25, 1.0); }`;
export const BLUR_FS = `
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
export const FXAA_FS = `
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
const MOTE_VS_SRC = `
uniform float uTime; uniform float uScale; uniform vec3 uLight; uniform vec4 uOcc[NOCC]; uniform vec2 uOccY[NOCC];
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
const MOTE_FS_SRC = `
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

// Builders. zs is the world camera's far plane; nocc its number of shadowing pieces.
// solo: the live highlight (uniforms emissiveMap, uLight, uLightCol, uSpecK); only for a mesh with a baked mask
export function pieceShaders({ rig = false, solo = false, zs = 60 } = {}) {
  const defines = { ZS: glslFloat(zs) };
  if (rig) defines.RIG = 1;
  if (solo) defines.SOLO = 1;
  return { vertexShader: PIECE_VS_SRC, fragmentShader: PIECE_FS_SRC, defines };
}
export function boardShaders({ nocc = 6, zs = 60 } = {}) {
  return { vertexShader: BOARD_VS_SRC, fragmentShader: BOARD_FS_SRC, defines: { NOCC: nocc, ZS: glslFloat(zs) } };
}
export function fogShader({ nocc = 6, div = 3 } = {}) {
  return { vertexShader: POST_VS, fragmentShader: FOG_FS_SRC, defines: { DIV: div, NOCC: nocc } };
}
export function moteShader({ nocc = 6 } = {}) {
  return { vertexShader: MOTE_VS_SRC, fragmentShader: MOTE_FS_SRC, defines: { NOCC: nocc } };
}
