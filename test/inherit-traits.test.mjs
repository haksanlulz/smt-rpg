// Fusion skill-inheritance gating by trait (p.80).
// `node test/inherit-traits.test.mjs` (exit 0 pass, 1 fail).
//
// spec: typed-skills-need-a-matching-inherit-trait
//
// p.80: "some skills may have an inheritance type to them, and if so, the demon
// created via fusion cannot learn those skills unless it has the right inheritance
// traits."
//
// Three things had to line up for that gate to mean anything and none of them did:
// the demon's own Inherit Traits were captured by the importer and never written,
// a skill's Traits column was never written as its inheritanceType, and
// selectInheritedSkills compared the whole trait string as ONE value — so a demon
// printed "Mouth Eye Lunge Weapon" matched no skill at all.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { selectInheritedSkills } = await import("../module/helpers/fusion.mjs");
const { buildDemonSkills, buildDemonSystem } = await import("../module/helpers/compendium.mjs");

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

const s = (name, inheritanceType = "") => ({ name, inheritanceType });
const names = (r) => r.map(x => x.name);

// --- an untyped skill is never gated --------------------------------------
{
  const pool = [s("Plain"), s("Also Plain")];
  eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: "" })), ["Plain", "Also Plain"],
    "untyped skills pass with no traits at all");
  eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: "Eye" })), ["Plain", "Also Plain"],
    "untyped skills pass regardless of traits");
}

// --- a typed skill needs the trait ----------------------------------------
{
  const pool = [s("Hell Gaze", "Eye"), s("Lunge Attack", "Lunge"), s("Plain")];

  eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: "" })), ["Plain"],
    "a demon with no traits inherits only untyped skills");
  eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: "Eye" })), ["Hell Gaze", "Plain"],
    "one trait admits only that type");

  // THE DEFECT: a demon prints several traits, and every one of them counts.
  eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: "Mouth Eye Lunge Weapon" })),
    ["Hell Gaze", "Lunge Attack", "Plain"],
    "every trait in the printed list counts, not the string as one value");
  eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: "Eye Lunge" })),
    ["Hell Gaze", "Lunge Attack", "Plain"], "two traits admit both typed skills");
}

// --- matching is case- and separator-insensitive --------------------------
{
  const pool = [s("Bite", "Teeth")];
  for (const traits of ["Teeth", "teeth", "TEETH", "Mouth Teeth", "Mouth, Teeth", "Mouth/Teeth"]) {
    eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: traits })), ["Bite"],
      `"${traits}" admits a Teeth skill`);
  }
  eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: "None" })), [],
    '"None" is not a trait and admits nothing typed');
}

// --- the gate never breaks the cap or the dedupe --------------------------
{
  const pool = [s("A", "Eye"), s("B", "Eye"), s("C", "Eye")];
  eq(names(selectInheritedSkills(pool, { count: 2, resultInheritance: "Eye" })), ["A", "B"],
    "count still limits the result");
  eq(names(selectInheritedSkills(pool, { count: 9, resultInheritance: "Eye", initialCount: 7 })), ["A"],
    "the cap of 8 still applies with the gate on");
  eq(names(selectInheritedSkills([s("A", "Eye"), s("A", "Eye")], { count: 9, resultInheritance: "Eye" })), ["A"],
    "duplicates are still dropped");
}

// --- the corpus: traits are written on both sides -------------------------
const DATA = join(ROOT, "data-local/demon-stats.json");
if (!existsSync(DATA)) {
  console.log("  SKIPPED: data-local/demon-stats.json not present — the corpus leg did not run.");
} else {
  const demons = JSON.parse(readFileSync(DATA, "utf8")).demons;
  const VOCAB = ["eye", "lunge", "mouth", "weapon", "teeth", "claw"];

  let withTraits = 0;
  let typedSkills = 0;
  const bad = [];
  for (const d of demons) {
    const { system } = buildDemonSystem(d);
    if (system.inheritTraits) {
      withTraits++;
      for (const t of system.inheritTraits.toLowerCase().split(/[\s,/]+/).filter(Boolean)) {
        if (!VOCAB.includes(t)) bad.push(`${d.name}: inherit trait "${t}" is outside the printed vocabulary`);
      }
    }
    for (const sk of buildDemonSkills(d)) {
      const t = sk.system.inheritanceType;
      if (!t) continue;
      typedSkills++;
      if (typeof t !== "string") bad.push(`${d.name}/${sk.name}: inheritanceType must be a string`);
    }
  }
  ok(withTraits >= 150, `demons carrying inherit traits (${withTraits} >= 150)`);
  ok(typedSkills >= 200, `skills carrying an inheritance type (${typedSkills} >= 200)`);
  eq(bad.slice(0, 5), [], `traits stay within the printed vocabulary (${bad.length} bad)`);

  // A demon must be able to inherit a skill of a type it actually prints — the
  // whole point of the gate. Checked against the real corpus rather than a fixture.
  const withBoth = demons.filter(d => (d.inheritTraits || "").trim() && d.inheritTraits !== "None");
  ok(withBoth.length >= 150, `demons with a usable trait list (${withBoth.length})`);
  const sample = withBoth[0];
  const trait = sample.inheritTraits.split(/\s+/)[0];
  const got = selectInheritedSkills([s("Probe", trait)], {
    count: 9, resultInheritance: sample.inheritTraits
  });
  eq(names(got), ["Probe"], `${sample.name} can inherit a "${trait}" skill (its own printed trait)`);
}

console.log(`\nsmt-rpg inherit-traits tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 20)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
