// The pdf.js EXTRACTION layer against the CLI reference — the layer the word-level
// parity rung structurally cannot see.
// `node test/importer-extraction.test.mjs` (exit 0 pass, 1 fail).
//
// spec: browser-parse-matches-the-cli-parse
//
// importer-parity.test.mjs proves the PARSERS over PyMuPDF's words. This rung proves
// the other half: Foundry's own bundled pdf.js build extracts the operator's PDF,
// extract.mjs shapes the words, and the full parse output must be BYTE-IDENTICAL to
// the CLI reference across all five corpora — 194 demons, 25 Magatama, 248 skills,
// 48 items, 20 gear — plus zero verifier errors. Two engines, one output.
//
// Born from the first live run (2026-08-01): the import refused because pdf.js gives
// BASELINE y where PyMuPDF gives glyph-box TOP, and the difference is the font size —
// mixed-size label rows split under Math.round and the ALL-CAPS stop rule fired
// before any value. First blocks passed on rounding luck; every second block lost its
// HP/MP/resists. See GAUNTLET.md §6.
//
// Environment-dependent by nature: it needs the operator's PDF, the data-local
// reference files, and a Foundry install to borrow pdf.mjs from. Missing any of those
// (fresh clone, CI, another machine) it SKIPS LOUDLY. If the pdf.js build is FOUND
// but fails to load or extract, that is a real failure, not a skip.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; failures.push(`${label}\n    expected ${e}\n    got      ${a}`); }
}

const finish = (suffix = "") => {
  console.log(`\nsmt-rpg importer-extraction tests: ${passed} passed, ${failed} failed${suffix}`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures.slice(0, 12)) console.log("  - " + f);
    process.exit(1);
  }
  process.exit(0);
};

// --- locate the three environment pieces; any absence is a loud skip ---------

const PDF = join(ROOT, "Shin_Megami_Tensei_The_Roleplaying_Game_Tokyo_Conception.pdf");
const REFS = ["demon-stats.json", "magatama-stats.json", "skill-stats.json", "gear-stats.json"]
  .map(f => join(ROOT, "data-local", f));

// Foundry's bundled pdf.js. SMT_PDFJS overrides; otherwise the known install spots.
const PDFJS_CANDIDATES = [
  process.env.SMT_PDFJS,
  "E:/Program Files/Foundry Virtual Tabletop/resources/app/node_modules/@foundryvtt/pdfjs/build/pdf.mjs",
  "C:/Program Files/Foundry Virtual Tabletop/resources/app/node_modules/@foundryvtt/pdfjs/build/pdf.mjs",
].filter(Boolean);
const pdfjsPath = PDFJS_CANDIDATES.find(p => existsSync(p));

if (!existsSync(PDF) || REFS.some(f => !existsSync(f)) || !pdfjsPath) {
  console.log("  SKIPPED: needs the rulebook PDF, the data-local reference files, and a");
  console.log("  Foundry install's pdf.mjs (set SMT_PDFJS to point at one).");
  console.log("  The extraction layer was NOT checked. This is not a pass.");
  finish(" (environment absent — skipped)");
}

// --- run the real browser extraction path under node -------------------------

const pdfjs = await import(pathToFileURL(pdfjsPath).href);
const dp = await import("../module/importer/demon-parse.mjs");
const mp = await import("../module/importer/magatama-parse.mjs");
const sp = await import("../module/importer/skill-parse.mjs");
const gp = await import("../module/importer/gear-parse.mjs");
const { pageWords } = await import("../module/importer/extract.mjs");

const data = new Uint8Array(readFileSync(PDF));
const doc = await pdfjs.getDocument({ data }).promise;

const indices = new Set();
for (let p = dp.GENERAL_PAGES[0]; p <= dp.GENERAL_PAGES[1]; p++) indices.add(p + dp.PRINTED_OFFSET);
for (let p = dp.BOSS_PAGES[0]; p <= dp.BOSS_PAGES[1]; p++) indices.add(p + dp.PRINTED_OFFSET);
for (let p = mp.MAGATAMA_PROSE[0]; p <= mp.MAGATAMA_PAGE; p++) indices.add(p + mp.PRINTED_OFFSET);
for (let p = sp.SKILL_PAGES[0]; p <= sp.SKILL_PAGES[1]; p++) indices.add(p + sp.PRINTED_OFFSET);
for (let p = gp.ITEM_PAGES[0]; p <= gp.GEAR_PAGE; p++) indices.add(p + gp.PRINTED_OFFSET);

const pages = {};
for (const idx of indices) {
  const { words } = await pageWords(await doc.getPage(idx + 1));
  pages[idx] = words;
}
console.log(`  extracted ${Object.keys(pages).length} pages via ${pdfjsPath.includes("@foundryvtt") ? "Foundry's" : "an external"} pdf.js ${pdfjs.version ?? ""}`);

const demons = dp.parseDemons(pages);
const { entries: magatama, errs: tableErrs } = mp.parseMagatama(pages);
const { skills, junk } = sp.parseSkillList(pages);
const { consumables, gear, errs: gearErrs } = gp.parseGearItems(pages);

// Byte-identity against the CLI reference, corpus by corpus.
const compare = (name, got, refFile, refKey, key) => {
  const ref = JSON.parse(readFileSync(join(ROOT, "data-local", refFile), "utf8"))[refKey];
  const byKey = new Map(got.map(d => [key(d), JSON.stringify(d)]));
  let identical = 0;
  for (const r of ref) {
    if (byKey.get(key(r)) === JSON.stringify(r)) { passed++; identical++; }
    else { failed++; failures.push(`${name} ${key(r)} diverges under pdf.js extraction`); }
  }
  console.log(`  extraction parity: ${identical}/${ref.length} ${name} byte-identical`);
};
compare("demons", demons, "demon-stats.json", "demons", d => `${d.name}|p${d.page}`);
compare("magatama", magatama, "magatama-stats.json", "magatama", d => d.name);
compare("skills", skills, "skill-stats.json", "skills", d => `${d.name}|p${d.page}`);
compare("items", consumables, "gear-stats.json", "consumables", d => d.name);
compare("gear", gear, "gear-stats.json", "gear", d => d.name);

// And the write gate itself: zero errors, so a live import would proceed.
const errs = [
  ...dp.verifyDemons(demons).errs, ...tableErrs,
  ...mp.verifyMagatama(magatama).errs,
  ...sp.verifySkillList(skills, demons, magatama, junk).errs,
  ...gp.verifyGearItems(consumables, gear, gearErrs).errs
];
eq(errs, [], "the in-Foundry verifiers pass over pdf.js extraction (a live import would write)");

finish();
