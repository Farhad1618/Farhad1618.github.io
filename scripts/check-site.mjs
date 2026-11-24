// Static checks for site.html. Usage: node scripts/check-site.mjs [--all]
// --all enables pending checks (those that need later tasks to pass).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "site.html"), "utf8");
const all = process.argv.includes("--all");

const TOKENS = {
  ink: "#0C0C0E", "ink-2": "#18181C", rule: "#26262A", "rule-soft": "#1B1B1E",
  bone: "#ECE7DC", dim: "#A8A49C", muted: "#716E68", sig: "#E9A03B", trace: "#5FA8B8",
};
const JS_KEYS = { ink: "ink", ink2: "ink-2", bone: "bone", dim: "dim", muted: "muted", sig: "sig", trace: "trace" };

const checks = [];
const check = (name, fn, pending = false) => checks.push({ name, fn, pending });

check("css tokens in :root", () => {
  const m = src.match(/:root\s*\{([^}]*)\}/);
  if (!m) return ["no :root block"];
  const errs = [];
  for (const [k, v] of Object.entries(TOKENS)) {
    const re = new RegExp("--" + k + "\\s*:\\s*" + v + "\\b", "i");
    if (!re.test(m[1])) errs.push(`--${k} should be ${v}`);
  }
  return errs;
});

check("JS C palette matches tokens", () => {
  const m = src.match(/var\s+C\s*=\s*\{([^}]*)\}/);
  if (!m) return ["no var C = {...}"];
  const errs = [];
  for (const [jk, tk] of Object.entries(JS_KEYS)) {
    const re = new RegExp("\\b" + jk + "\\s*:\\s*\"(#[0-9A-Fa-f]{6})\"");
    const mm = m[1].match(re);
    if (!mm) errs.push(`C.${jk} missing`);
    else if (mm[1].toUpperCase() !== TOKENS[tk].toUpperCase()) errs.push(`C.${jk} is ${mm[1]}, want ${TOKENS[tk]}`);
  }
  return errs;
});

check("script hosts allowed", () => {
  const errs = [];
  for (const m of src.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)) {
    let host;
    try { host = new URL(m[1]).hostname; } catch { errs.push(`bad src ${m[1]}`); continue; }
    if (host !== "cdnjs.cloudflare.com" && host !== "cdn.jsdelivr.net") errs.push(`disallowed host ${host}`);
  }
  return errs;
});

check("section ids appear once", () => {
  const errs = [];
  for (const id of ["top", "who", "drive", "work", "paper", "contact"]) {
    const n = (src.match(new RegExp(`\\bid=["']${id}["']`, "g")) || []).length;
    if (n !== 1) errs.push(`id="${id}" appears ${n} times`);
  }
  return errs;
});

check("exactly 6 .proj elements", () => {
  const n = (src.match(/class=["'][^"']*\bproj\b[^"']*["']/g) || []).length;
  return n === 6 ? [] : [`found ${n} class="proj" elements, want 6`];
});

check("work chapters: names in h3, problem/built/matters rows", () => {
  const errs = [];
  const names = ["Cyrus", "Zagros", "OnePharma", "Black Pearl", "Falah", "Network Intrusion Detection"];
  const h3 = [...src.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1]);
  for (const n of names) if (!h3.includes(n)) errs.push(`no <h3> ${n}`);
  const parts = src.split(/<section class="proj"/).slice(1).map((p) => p.split("</section>")[0]);
  parts.forEach((p, i) => {
    for (const row of ["The problem", "What I built", "Why it matters"]) if (!p.includes(row)) errs.push(`proj ${i + 1} lacks "${row}"`);
    if (!/<canvas/.test(p)) errs.push(`proj ${i + 1} lacks canvas`);
  });
  const zag = parts[1] || "";
  if (/<a\s/.test(zag)) errs.push("Zagros must have no link");
  const nids = parts[5] || "";
  if (!nids.includes('href="research.html"') || !nids.includes("10.1007/978-3-031-60994-7_4")) errs.push("nids links missing");
  if (!/SCENES\s*=\s*\[sceneCyrus,\s*sceneZagros,\s*sceneGraph,\s*scenePearl,\s*sceneFalah,\s*sceneNids\]/.test(src)) errs.push("SCENES array missing");
  if (!/function fitPlate\(/.test(src)) errs.push("fitPlate missing");
  if (!/rootMargin\s*:\s*"100px"/.test(src)) errs.push("IntersectionObserver rootMargin 100px missing");
  return errs;
});

check("forbidden substrings absent", () => {
  const bad = ["97%", "Apache", "ICNGN", "PyTorch", "[Your", "CV", "a week", "Onyxs", "SR-71", "Purple Finance", "Cyrus holds"];
  return bad.filter((s) => src.includes(s)).map((s) => `found "${s}"`);
});

check("99.34% only with TCP removed nearby", () => {
  const errs = [];
  let i = -1;
  while ((i = src.indexOf("99.34%", i + 1)) !== -1) {
    const win = src.slice(Math.max(0, i - 200), i + 6 + 200);
    if (!win.includes("TCP removed")) errs.push(`99.34% at offset ${i} lacks "TCP removed" within 200 chars`);
  }
  return errs;
});

check("contact mailto present", () =>
  src.includes("mailto:farhad.maleki1618@outlook.com") ? [] : ["mailto:farhad.maleki1618@outlook.com missing"]);

check("opacity:0 on .rv gated by html.motion", () => {
  const errs = [];
  const css = src.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/opacity\s*:\s*0\s*(;|$|!)/.test(m[2])) continue;
    for (const sel of m[1].split(",")) {
      if (/\.rv\b/.test(sel) && !/(html)?\.motion\b/.test(sel)) errs.push(`ungated selector: ${sel.trim()}`);
    }
  }
  return errs;
});

check("no family name in visible copy", () =>
  /Farhad Maleki|FARHAD MALEKI/.test(src) ? ['"Farhad Maleki" present; use "Farhad"'] : []);

check("hero and who copy present", () => {
  const need = ['aria-label="Farhad"', "Software Developer", "Featured systems", "CTO at OnePharma"];
  return need.filter((s) => !src.includes(s)).map((s) => `missing "${s}"`);
});

check("hero: chessboard poster, title and six project links", () => {
  const errs = [], ids = ["cyrus", "zagros", "onepharma", "pearl", "falah", "nids"];
  if (!/<h1 class="hero-title"[^>]*>.*Farhad.*<\/h1>/.test(src)) errs.push("h1.hero-title with Farhad missing");
  for (const gone of ["name-xl", 'id="field"', "data-hero-figure", "heroField", "Anton"]) if (src.includes(gone)) errs.push(`old hero remnant "${gone}"`);
  const nav = (src.match(/<nav class="hero-pieces"[^>]*>(.*?)<\/nav>/s) || [])[1] || "";
  if ((nav.match(/data-piece="/g) || []).length !== 6) errs.push("nav.hero-pieces must hold exactly six data-piece links");
  for (const id of ids) {
    if (!nav.includes(`data-piece="${id}" href="#proj-${id}"`)) errs.push(`link for ${id} missing`);
    if (src.split(`id="proj-${id}"`).length !== 2) errs.push(`id="proj-${id}" must appear exactly once`);
  }
  if (!src.includes('src="assets/hero/poster.webp"')) errs.push("poster.webp not referenced");
  if (!/<source media="\(orientation: portrait\)" srcset="assets\/hero\/poster-portrait\.webp">/.test(src)) errs.push("portrait poster source missing");
  const head = src.slice(0, src.indexOf("<header"));
  if (/<script[^>]+src="[^"]*three/.test(head)) errs.push("three.js must not load from a script tag in the head");
  return errs;
});

check("hero: live scene is lazy and pinned", () => {
  const errs = [], head = src.slice(0, src.indexOf("<header"));
  if (!/<script type="importmap">[^<]*"three":\s*"https:\/\/cdn\.jsdelivr\.net\/npm\/three@\d+\.\d+\.\d+\//.test(head)) errs.push("importmap pinning three on jsdelivr missing before <header");
  if (!src.includes('import("./hero.js")')) errs.push('import("./hero.js") missing');
  if (/<script type="module" src/.test(src)) errs.push("no static module scripts");
  const hp = join(root, "hero.js");
  if (!existsSync(hp) || !readFileSync(hp, "utf8").includes("export async function mountHero")) errs.push("hero.js with mountHero missing");
  return errs;
});

check("who copy: headline, photo slot, no origin line", () => {
  const errs = [];
  if (!src.includes("I'm Farhad. I turn chaos into systems that think.")) errs.push("who headline missing");
  if (!/<span class="pill" data-photo="">/.test(src)) errs.push('photo slot <span class="pill" data-photo=""> missing');
  if (/origin (story|line)/i.test(src)) errs.push("origin text present");
  return errs;
});

check("photo slot: swap removes monogram, caption not unfinished", () => {
  const errs = [];
  if (/coming soon/i.test(src)) errs.push('"coming soon" caption present');
  if (!/ph\.remove\(\)/.test(src)) errs.push("photo swap must remove .ph (display:grid overrides [hidden])");
  return errs;
});

check("drive section: headline and 4 moments", () => {
  const errs = [];
  if (!src.includes("Obsessed with the")) errs.push('"Obsessed with the" missing');
  if (!/<em>hardest<\/em>/.test(src)) errs.push("<em>hardest</em> missing");
  const n = (src.match(/class="moment[\s"]/g) || []).length;
  if (n !== 4) errs.push(`found ${n} class="moment" elements, want 4`);
  return errs;
});

check("research and contact: paper, paths, booking hidden", () => {
  const errs = [];
  for (const s of ["Deep Learning for Preventing Botnet Attacks on IoT", "10.1007/978-3-031-60994-7_4", "98.23%", "NSL-KDD",
    'href="research.html"', "Bring me your", "Email me", "data-booking", "BOOKING_URL", "Build with me", "Hire me",
    "github.com/Farhad1618", "linkedin.com/in/farhad-maleki"]) if (!src.includes(s)) errs.push(`missing "${s}"`);
  const bk = [...src.matchAll(/<a\b[^>]*data-booking[^>]*>/g)].map((m) => m[0]);
  if (bk.length !== 2) errs.push(`found ${bk.length} data-booking links, want 2`);
  bk.forEach((t) => { if (!/\shidden(\s|>|=)/.test(t)) errs.push(`Book a time lacks hidden: ${t}`); });
  if (!/\[data-booking\]\[hidden\]\s*\{\s*display\s*:\s*none/.test(src)) errs.push("[data-booking][hidden]{display:none} rule missing");
  if (!/var BOOKING_URL\s*=\s*"[^"]*";/.test(src)) errs.push('var BOOKING_URL = "" missing');
  if (!/subject=Build%20with%20me/.test(src) || !/subject=Hire%20me/.test(src)) errs.push("mailto subjects missing");
  if (src.includes("on request")) errs.push('"on request" present');
  return errs;
});

let failed = 0;
for (const c of checks) {
  if (c.pending && !all) { console.log(`SKIP  ${c.name} (pending, use --all)`); continue; }
  const errs = c.fn();
  if (errs.length) { failed++; console.log(`FAIL  ${c.name}`); errs.forEach((e) => console.log(`        ${e}`)); }
  else console.log(`PASS  ${c.name}`);
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
