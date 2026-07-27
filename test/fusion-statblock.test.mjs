// Fusion producing a real demon rather than an average of its ingredients (p.80).
// `node test/fusion-statblock.test.mjs` (exit 0 pass, 1 fail).
//
// spec: fusion-produces-the-real-demon
//
// The chart names the result (p.80-82) and the compendium holds that demon's printed
// stat block, so the fused actor should BE that demon. Before this, buildFusedSystem
// averaged the two ingredients: a fused Momunofu came out with fabricated stats, no
// favored stat, and a 9,999,999 HP sentinel.
//
// What fusion still contributes is inherited skills, and p.80 bounds them exactly:
//
//   "no matter how many skills the newly fused demon may inherit, it may not learn
//    more than eight skills in total, including its initial skills. Initial skills
//    cannot be removed in favor of adding more inherited skills."
//
// So the result demon's own skills are kept first and inheritance fills what is left.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { buildFusionResult } = await import("../module/helpers/fusion.mjs");

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

const CAP = SMT.fusion.skillCap;
eq(CAP, 8, "the skill cap is 8 (p.80)");

const skill = (name) => ({ name, system: { inheritanceType: "" } });

// A stat block with a known number of initial skills, independent of the corpus.
const statBlock = (initialSkillCount) => ({
  name: "Test Demon", clan: "fairy", level: 20,
  stats: { strength: 5, magic: 6, vitality: 7, agility: 8, luck: 9 },
  statTNs: {}, substats: {}, hp: 162, mp: 78,
  affinities: "Weak Fire", inheritTraits: "", evolve: "", behavior: "", dropItems: "None",
  macca: 10, exp: 10, physicalResist: 13, magicResist: 13, fatePoints: 5,
  skills: Array.from({ length: initialSkillCount }, (_, i) => ({
    name: `Own ${i + 1}`, type: "Spell", element: "Fire", target: "1"
  }))
});

// --- the result is the real demon, not an average -------------------------
{
  const r = buildFusionResult({ stats: statBlock(2), ingredientSkills: [], allowed: 0 });
  eq(r.system.level, 20, "level comes from the stat block");
  eq(r.system.strength, 5, "stats come from the stat block, not an average");
  eq(r.system.clan, "fairy", "clan comes from the stat block");
  eq(r.system.affinities.fire, "weak", "affinities come from the stat block");
  ok(!("hp" in r.system) || r.system.hp.value === 162, "HP is the demon's own, not a sentinel");
  eq(r.items.length, 2, "the demon keeps its own initial skills");
  eq(r.items.map(i => i.name), ["Own 1", "Own 2"], "initial skills are its own");
  eq(r.inheritedNames, [], "nothing inherited when none is allowed");
}

// --- inheritance fills what is left, initial skills first -----------------
{
  const ingredients = ["A", "B", "C", "D", "E", "F"].map(skill);

  // 2 initial + 6 allowed -> only 6 slots remain under the cap of 8.
  let r = buildFusionResult({ stats: statBlock(2), ingredientSkills: ingredients, allowed: 6 });
  eq(r.items.length, 8, "fills to the cap of 8");
  eq(r.items.slice(0, 2).map(i => i.name), ["Own 1", "Own 2"], "initial skills come first");
  eq(r.inheritedNames.length, 6, "six inherited");

  // 6 initial + 6 allowed -> only 2 slots remain; initial skills are NOT displaced.
  r = buildFusionResult({ stats: statBlock(6), ingredientSkills: ingredients, allowed: 6 });
  eq(r.items.length, 8, "still capped at 8");
  eq(r.items.filter(i => /^Own /.test(i.name)).length, 6, "all six initial skills survive");
  eq(r.inheritedNames.length, 2, "inheritance takes only the two free slots");

  // 8 initial -> nothing can be inherited at all.
  r = buildFusionResult({ stats: statBlock(8), ingredientSkills: ingredients, allowed: 6 });
  eq(r.items.length, 8, "a full demon stays at 8");
  eq(r.inheritedNames, [], "no room to inherit anything");
  eq(r.items.filter(i => /^Own /.test(i.name)).length, 8, "initial skills are never removed (p.80)");
}

// --- an inherited skill never duplicates an initial one -------------------
{
  const stats = statBlock(2);
  const ingredients = [skill("Own 1"), skill("Fresh")];
  const r = buildFusionResult({ stats, ingredientSkills: ingredients, allowed: 6 });
  eq(r.inheritedNames, ["Fresh"], "a skill the demon already has is not inherited again");
  eq(r.items.filter(i => i.name === "Own 1").length, 1, "no duplicate item is created");
}

// --- fail-closed ----------------------------------------------------------
{
  eq(buildFusionResult({ stats: null, ingredientSkills: [], allowed: 4 }), null,
    "no stat block yields null, so the caller can fall back to averaging");
  eq(buildFusionResult({ stats: undefined, ingredientSkills: [], allowed: 4 }), null,
    "undefined yields null");
}

// --- against the real corpus ---------------------------------------------
const DATA = join(ROOT, "data-local/demon-stats.json");
if (!existsSync(DATA)) {
  console.log("  SKIPPED: data-local/demon-stats.json not present — the corpus leg did not run.");
} else {
  const demons = JSON.parse(readFileSync(DATA, "utf8")).demons;
  const ingredients = ["X", "Y", "Z"].map(skill);
  let checked = 0;
  const bad = [];
  for (const d of demons.filter(x => !x.boss)) {
    const r = buildFusionResult({ stats: d, ingredientSkills: ingredients, allowed: 3 });
    if (!r) { bad.push(`${d.name}: no result built`); continue; }
    checked++;
    if (r.items.length > CAP) bad.push(`${d.name}: ${r.items.length} skills exceeds the cap`);
    if (r.system.level !== d.level) bad.push(`${d.name}: level ${r.system.level} != ${d.level}`);
    const names = r.items.map(i => i.name);
    if (new Set(names).size !== names.length) bad.push(`${d.name}: duplicate skill names`);
  }
  ok(checked >= 165, `every fusable demon builds a fusion result (${checked})`);
  eq(bad.slice(0, 5), [], `no demon exceeds the cap or loses its identity (${bad.length} bad)`);
}

console.log(`\nsmt-rpg fusion-statblock tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 20)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
