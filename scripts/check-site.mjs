// Static checks for site.html. Usage: node scripts/check-site.mjs [--all]
// --all enables pending checks (those that need later tasks to pass).
import { readFileSync } from "node:fs";
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
}, true);

check("forbidden substrings absent", () => {
  const bad = ["97%", "Apache", "ICNGN", "PyTorch", "[Your", "CV", "a week", "Onyxs", "SR-71", "Purple Finance"];
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

let failed = 0;
for (const c of checks) {
  if (c.pending && !all) { console.log(`SKIP  ${c.name} (pending, use --all)`); continue; }
  const errs = c.fn();
  if (errs.length) { failed++; console.log(`FAIL  ${c.name}`); errs.forEach((e) => console.log(`        ${e}`)); }
  else console.log(`PASS  ${c.name}`);
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
