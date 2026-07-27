// Boss HP/MP maxima (p.123-125).
// `node test/boss-hp.test.mjs` (exit 0 pass, 1 fail).
//
// spec: bosses-keep-their-printed-hp
//
// p.123: "The boss statblocks conform to how they appear in the original game,
// deriving their stats from their HP and MP." The Boss HP/MP List on p.124-125 is
// hand-authored per boss and does NOT follow (vitality + level) x multiplier — the
// ratio to the derived value runs from 0.26x to 55x across the 23 bosses, so no
// multiplier reproduces it. 21 of the 23 print MORE than the formula derives, and
// were being silently clamped down to it.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { buildDemonSystem } = await import("../module/helpers/compendium.mjs");
const { resolveResourceMax } = await import("../module/helpers/resources.mjs");

let passed = 0;
let failed = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; failures.push(`${label}\n    expected ${e}\n    got      ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// --- resolveResourceMax: the derived formula, with an explicit override -----
{
  // Ordinary actors derive: (stat + level) x multiplier.
  eq(resolveResourceMax({ stat: 25, level: 93, multiplier: 6 }), 708, "Vishnu HP derives to the printed 708");
  eq(resolveResourceMax({ stat: 35, level: 93, multiplier: 3 }), 384, "Vishnu MP derives to the printed 384");
  eq(resolveResourceMax({ stat: 3, level: 9, multiplier: 6 }), 72, "Specter derives to 72 without an override");

  // An override replaces the derived value outright — no clamping, no blending.
  eq(resolveResourceMax({ stat: 3, level: 9, multiplier: 6, override: 148 }), 148,
    "an override wins over the derived value (Specter's printed 148)");
  eq(resolveResourceMax({ stat: 20, level: 85, multiplier: 6, override: 13000 }), 13000,
    "a very large override is kept (Baal Avatar's 13000, vs 630 derived)");

  // 0 / absent / hostile values mean "derive normally" rather than "max is 0".
  eq(resolveResourceMax({ stat: 25, level: 93, multiplier: 6, override: 0 }), 708, "override 0 means derive");
  eq(resolveResourceMax({ stat: 25, level: 93, multiplier: 6, override: null }), 708, "null override derives");
  eq(resolveResourceMax({ stat: 25, level: 93, multiplier: 6, override: NaN }), 708, "NaN override derives");
  eq(resolveResourceMax({ stat: 25, level: 93, multiplier: 6, override: -5 }), 708, "negative override derives");

  // Never below 1: an actor with a 0 max cannot be damaged or healed meaningfully.
  ok(resolveResourceMax({ stat: 0, level: 0, multiplier: 6 }) >= 1, "derived max floors at 1");
  ok(resolveResourceMax({ stat: 0, level: 0, multiplier: 0 }) >= 1, "a zero multiplier still floors at 1");
}

// --- the real corpus ------------------------------------------------------
const DATA = join(ROOT, "data-local/demon-stats.json");
if (!existsSync(DATA)) {
  console.log("  SKIPPED: data-local/demon-stats.json not present — run tools/import-rulebook.py.");
  console.log("  The formula assertions above still ran; the corpus sweep did not.");
} else {
  const demons = JSON.parse(readFileSync(DATA, "utf8")).demons;
  const hpM = SMT.hpMultipliers.demon;
  const mpM = SMT.mpMultipliers.demon;

  const general = demons.filter(d => !d.boss);
  const bosses = demons.filter(d => d.boss);

  // The formula reproduces the book for every general demon BUT ONE. Scáthach
  // (p.129, LV 64 / Vi 17) prints 498 HP where the formula gives 486; her MP
  // derives exactly and so does Lakshmi on the same page, so it is a slip in the
  // book. She carries an override; nobody else should, because a redundant one
  // would hide a future change to the formula.
  const overridden = general.filter(d => buildDemonSystem(d).system.hpMaxOverride).map(d => d.name);
  eq(overridden, ["Scáthach"], "exactly one general demon needs an HP override (the p.129 anomaly)");
  eq(general.filter(d => buildDemonSystem(d).system.mpMaxOverride).map(d => d.name), [],
    "no general demon needs an MP override");
  eq(buildDemonSystem(demons.find(d => d.name === "Scáthach")).anomalies,
    ["HP 498 (formula gives 486)"], "the anomaly is reported, not silently applied");

  let mismatch = [];
  for (const d of general) {
    const { system } = buildDemonSystem(d);
    const hp = resolveResourceMax({ stat: d.stats.vitality, level: d.level, multiplier: hpM, override: system.hpMaxOverride });
    const mp = resolveResourceMax({ stat: d.stats.magic, level: d.level, multiplier: mpM, override: system.mpMaxOverride });
    if (hp !== d.hp) mismatch.push(`${d.name}: HP ${hp} != printed ${d.hp}`);
    if (mp !== d.mp) mismatch.push(`${d.name}: MP ${mp} != printed ${d.mp}`);
  }
  eq(mismatch.slice(0, 5), [], `every general demon's HP and MP match the book (${mismatch.length} off)`);

  // Bosses must resolve to their printed values, which means an override.
  let bossOff = [];
  for (const d of bosses) {
    const { system } = buildDemonSystem(d);
    const hp = resolveResourceMax({ stat: d.stats.vitality, level: d.level, multiplier: hpM, override: system.hpMaxOverride });
    const mp = resolveResourceMax({ stat: d.stats.magic, level: d.level, multiplier: mpM, override: system.mpMaxOverride });
    if (hp !== d.hp) bossOff.push(`${d.name}: HP ${hp} != printed ${d.hp}`);
    if (mp !== d.mp) bossOff.push(`${d.name}: MP ${mp} != printed ${d.mp}`);
  }
  eq(bossOff.slice(0, 5), [], `every boss's HP and MP match the book (${bossOff.length} off)`);

  // The case that was silently wrong: printed HP above what the formula derives.
  const clamped = bosses.filter(d => d.hp > (d.stats.vitality + d.level) * hpM);
  ok(clamped.length >= 15, `bosses printing more HP than the formula derives (${clamped.length}) — the clamped set`);
  for (const d of clamped) {
    const { system } = buildDemonSystem(d);
    ok(system.hpMaxOverride === d.hp, `${d.name} carries its printed HP as an override (${d.hp})`);
  }

  const baal = demons.find(d => d.name === "Baal Avatar");
  eq(buildDemonSystem(baal).system.hpMaxOverride, 13000, "Baal Avatar overrides to 13000, not the 630 it derives");
}

console.log(`\nsmt-rpg boss-hp tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 20)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
