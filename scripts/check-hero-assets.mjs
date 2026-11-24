// Asset contract and budget check for the chessboard hero, and for the solo close-ups (assets/solo/<id>/).
// Usage: node scripts/check-hero-assets.mjs [--solo <id>]...
//   Every folder in assets/solo/ is checked; --solo <id> also requires that piece's folder to exist.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "assets", "hero");
const IDS = ["cyrus", "zagros", "onepharma", "pearl", "falah", "nids"];
const FILES = ["poster.webp", "poster-portrait.webp", "pieces.glb", "matcap.webp", "layout.json"];
const BUDGET = 2621440, POSTER_MAX = 153600, TRI_MAX = 15000;

const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const has = f => fs.existsSync(path.join(dir, f));
const isNums = (a, n) => Array.isArray(a) && a.length === n && a.every(v => typeof v === "number" && Number.isFinite(v));

function readLayout() { return JSON.parse(fs.readFileSync(path.join(dir, "layout.json"), "utf8")); }
function readGlb(file = path.join(dir, "pieces.glb")) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const len = b.readUInt32LE(12), type = b.readUInt32LE(16);
  if (type !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  return JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
}

check("files present", () => FILES.filter(f => !has(f)).map(f => `missing assets/hero/${f}`));

check("budget", () => {
  const errs = [];
  if (!fs.existsSync(dir)) return ["assets/hero missing"];
  let total = 0;
  for (const f of fs.readdirSync(dir)) total += fs.statSync(path.join(dir, f)).size;
  if (total > BUDGET) errs.push(`assets/hero is ${total} bytes, over ${BUDGET}`);
  for (const p of ["poster.webp", "poster-portrait.webp"]) {
    if (!has(p)) { errs.push(`missing ${p}`); continue; }
    const s = fs.statSync(path.join(dir, p)).size;
    if (s > POSTER_MAX) errs.push(`${p} is ${s} bytes, over ${POSTER_MAX}`);
  }
  if (!errs.length) console.log(`      total ${(total / 1024).toFixed(0)} KB`);
  return errs;
});

check("layout shape", () => {
  if (!has("layout.json")) return ["missing layout.json"];
  const L = readLayout(), errs = [];
  if (!IDS.includes(L.focusId)) errs.push("focusId must be one of the six piece ids");
  if (!L.board || !isNums(L.board.center, 2) || !isNums(L.board.size, 2)) errs.push("board.center / board.size must be 2-number arrays");
  for (const o of ["landscape", "portrait"]) {
    const v = L[o];
    if (!v) { errs.push(`${o} missing`); continue; }
    if (typeof v.aspect !== "number") errs.push(`${o}.aspect not a number`);
    const c = v.camera || {};
    if (!isNums(c.position, 3) || !isNums(c.target, 3)) errs.push(`${o}.camera.position/target must be 3-number arrays`);
    if (!(c.fovY >= 10 && c.fovY <= 70)) errs.push(`${o}.camera.fovY ${c.fovY} outside 10..70`);
    const ids = Object.keys(v.pieces || {}).sort();
    if (ids.join() !== [...IDS].sort().join()) errs.push(`${o}.pieces ids are [${ids}]`);
    for (const id of ids) {
      const p = v.pieces[id];
      if (!(p.cx >= 0 && p.cx <= 1 && p.cy >= 0 && p.cy <= 1)) errs.push(`${o}.${id} centre outside 0..1`);
      if (!(p.w > 0 && p.w <= 0.6 && p.h > 0 && p.h <= 0.6)) errs.push(`${o}.${id} size outside (0,0.6]`);
    }
  }
  return errs;
});

check("no overlap hiding", () => {
  if (!has("layout.json")) return ["missing layout.json"];
  const L = readLayout(), errs = [];
  for (const o of ["landscape", "portrait"]) {
    const P = (L[o] && L[o].pieces) || {};
    for (const a of Object.keys(P)) for (const b of Object.keys(P)) {
      if (a === b) continue;
      const A = P[a], B = P[b];
      if (Math.abs(A.cx - B.cx) < B.w / 2 && Math.abs(A.cy - B.cy) < B.h / 2) errs.push(`${o}: centre of ${a} is inside ${b}`);
    }
  }
  return errs;
});

check("glb nodes", () => {
  if (!has("pieces.glb")) return ["missing pieces.glb"];
  const g = readGlb(), errs = [], names = (g.nodes || []).map(n => n.name);
  for (const id of IDS) for (const k of ["piece-", "plinth-"]) if (!names.includes(k + id)) errs.push(`node ${k}${id} missing`);
  if (!names.includes("board")) errs.push("node board missing");
  for (const e of ["EXT_meshopt_compression", "EXT_texture_webp"]) if (!(g.extensionsUsed || []).includes(e)) errs.push(`${e} not used`);
  return errs;
});

check("triangle cap", () => {
  if (!has("pieces.glb")) return ["missing pieces.glb"];
  const g = readGlb(), errs = [];
  for (const id of IDS) {
    const node = (g.nodes || []).find(n => n.name === "piece-" + id);
    if (!node || node.mesh === undefined) { errs.push(`piece-${id} has no mesh`); continue; }
    let tris = 0;
    for (const pr of g.meshes[node.mesh].primitives) tris += g.accessors[pr.indices].count / 3;
    if (tris > TRI_MAX) errs.push(`piece-${id} has ${tris} triangles, over ${TRI_MAX}`);
  }
  return errs;
});

// ---------------------------------------------------------------- solo close-ups
const SOLO_DIR = path.join(root, "assets", "solo");
const SOLO_FILES = ["solo.glb", "poster.webp", "layout.json"];
const SOLO_TRI_MAX = 120000;
const argv = process.argv.slice(2);
const soloIds = new Set(fs.existsSync(SOLO_DIR) ? fs.readdirSync(SOLO_DIR).filter(f => fs.statSync(path.join(SOLO_DIR, f)).isDirectory()) : []);
for (let i = 0; i < argv.length; i++) if (argv[i] === "--solo" && argv[i + 1]) soloIds.add(argv[++i]);

for (const id of [...soloIds].sort()) {
  const d = path.join(SOLO_DIR, id);
  const at = f => path.join(d, f);
  check(`solo ${id}: files`, () => SOLO_FILES.filter(f => !fs.existsSync(at(f))).map(f => `missing assets/solo/${id}/${f}`));
  check(`solo ${id}: budget`, () => {
    if (!fs.existsSync(d)) return [`assets/solo/${id} missing`];
    const errs = [];
    let total = 0;
    for (const f of fs.readdirSync(d)) total += fs.statSync(at(f)).size;
    if (total > BUDGET) errs.push(`assets/solo/${id} is ${total} bytes, over ${BUDGET}`);
    if (fs.existsSync(at("poster.webp"))) {
      const s = fs.statSync(at("poster.webp")).size;
      if (s > POSTER_MAX) errs.push(`solo ${id} poster.webp is ${s} bytes, over ${POSTER_MAX}`);
    }
    if (!errs.length) console.log(`      total ${(total / 1024).toFixed(0)} KB`);
    return errs;
  });
  check(`solo ${id}: glb`, () => {
    if (!fs.existsSync(at("solo.glb"))) return [`missing assets/solo/${id}/solo.glb`];
    const g = readGlb(at("solo.glb")), errs = [], names = (g.nodes || []).map(n => n.name);
    for (const n of [`piece-${id}`, `plinth-${id}`, "board"]) if (!names.includes(n)) errs.push(`node ${n} missing`);
    for (const e of ["EXT_meshopt_compression", "EXT_texture_webp"]) if (!(g.extensionsUsed || []).includes(e)) errs.push(`${e} not used`);
    const node = (g.nodes || []).find(n => n.name === `piece-${id}`);
    if (node && node.mesh !== undefined) {
      let tris = 0, emissive = true;
      for (const pr of g.meshes[node.mesh].primitives) {
        tris += g.accessors[pr.indices].count / 3;
        const m = (g.materials || [])[pr.material];
        if (!m || !m.emissiveTexture) emissive = false;
      }
      if (tris > SOLO_TRI_MAX) errs.push(`piece-${id} has ${tris} triangles, over ${SOLO_TRI_MAX}`);
      if (!emissive) errs.push(`piece-${id} has no emissive (mask) texture`);
    } else errs.push(`piece-${id} has no mesh`);
    return errs;
  });
  check(`solo ${id}: layout`, () => {
    if (!fs.existsSync(at("layout.json"))) return [`missing assets/solo/${id}/layout.json`];
    const L = JSON.parse(fs.readFileSync(at("layout.json"), "utf8")), errs = [];
    const c = L.camera || {};
    if (!isNums(c.position, 3) || !isNums(c.target, 3)) errs.push("camera.position/target must be 3-number arrays");
    if (!(c.fovY >= 4 && c.fovY <= 40)) errs.push(`camera.fovY ${c.fovY} outside 4..40`);
    if (!isNums(L.light, 3)) errs.push("light must be a 3-number array");
    if (!L.board || !isNums(L.board.center, 2) || !isNums(L.board.size, 2)) errs.push("board.center / board.size must be 2-number arrays");
    if (!isNums(L.tilt, 2)) errs.push("tilt must be a 2-number array");
    return errs;
  });
}

let failed = 0;
for (const c of checks) {
  let errs;
  try { errs = c.fn(); } catch (e) { errs = [String(e.message || e)]; }
  if (errs.length) { failed++; console.log(`FAIL  ${c.name}`); for (const e of errs) console.log(`      ${e}`); }
  else console.log(`PASS  ${c.name}`);
}
process.exit(failed ? 1 : 0);
