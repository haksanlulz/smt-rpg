// A fiend learns what its Magatama teaches, at the level the book says (p.42).
// `node test/skill-learning.test.mjs` (exit 0 pass, 1 fail).
//
// spec: a-fiend-learns-its-magatamas-skills
//
// Until 2026-07-31 the p.42 progression existed nowhere in the system: `skillList` had
// a schema, an editor and imported data, and nothing on any code path read it. A fiend
// equipped Marogareh and never got Hell Thrust at 4. This suite covers the planner that
// decides what is owed, and the builder that turns a skill NAME into a real Item.
//
// The corpus leg skips loudly without the local import; the planner and builder legs are
// pure and always run.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { magatamaLearnPlan } = await import("../module/helpers/magatama.mjs");
const { buildSkillSystem, skillTypeFrom, targetsFrom, skillKey } =
  await import("../module/helpers/skill-compendium.mjs");

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

const LIST = [
  { skillName: "Alpha", learnLevel: 1 },
  { skillName: "Beta", learnLevel: 4 },
  { skillName: "Gamma", learnLevel: 6 },
  { skillName: "Delta", learnLevel: 20 }
];
const names = (plan) => plan.learn.map(s => s.skillName);

// ------------------------------------------------------------- the plan (pure)

// ESCAPE: the whole defect was that nothing was ever owed. A fiend past a learn level
// must be owed that skill, and this is the assertion that goes red if the plan is ever
// short-circuited back to empty.
ok(magatamaLearnPlan({ skillList: LIST, level: 10 }).learn.length > 0,
  "ESCAPE: a levelled fiend is owed skills at all");
eq(names(magatamaLearnPlan({ skillList: LIST, level: 10 })), ["Alpha", "Beta", "Gamma"],
  "everything at or below the current level");
eq(names(magatamaLearnPlan({ skillList: LIST, level: 1 })), ["Alpha"], "level 1 learns only level 1");
eq(names(magatamaLearnPlan({ skillList: LIST, level: 0 })), [], "below the first learn level, nothing");
eq(names(magatamaLearnPlan({ skillList: LIST, level: 4 })), ["Alpha", "Beta"],
  "the learn level itself is inclusive");
eq(names(magatamaLearnPlan({ skillList: LIST, level: 99 })), ["Alpha", "Beta", "Gamma", "Delta"],
  "a high level owes the whole list");

// Owned skills are not re-granted, whatever their case or padding.
eq(names(magatamaLearnPlan({ skillList: LIST, level: 10, ownedNames: ["Alpha"] })),
  ["Beta", "Gamma"], "an owned skill is not granted twice");
eq(names(magatamaLearnPlan({ skillList: LIST, level: 10, ownedNames: [" alpha ", "BETA"] })),
  ["Gamma"], "ownership matching ignores case and padding");
eq(names(magatamaLearnPlan({ skillList: LIST, level: 10, ownedNames: ["Alpha", "Beta", "Gamma"] })),
  [], "nothing owed when it is all already known");

// State, not diff: this is what makes a Magatama swap (p.39) grant the earned backlog
// rather than only what is still ahead.
eq(names(magatamaLearnPlan({ skillList: LIST, level: 20, ownedNames: ["Zeta", "Eta"] })),
  ["Alpha", "Beta", "Gamma", "Delta"],
  "a swap grants the new Magatama's whole earned progression, not just future levels");

// The p.80 cap of 8, applied in learn order, and what it turns away is reported.
const capped = magatamaLearnPlan({
  skillList: LIST, level: 99, ownedNames: ["a", "b", "c", "d", "e", "f"]
});
eq(names(capped), ["Alpha", "Beta"], "the cap fills from the earliest unlearned skill");
eq(capped.blocked.map(s => s.skillName), ["Gamma", "Delta"],
  "ESCAPE: what the cap turns away is RETURNED, never silently dropped");
eq(capped.cap, 8, "the cap reported is the one that was applied");
const full = magatamaLearnPlan({
  skillList: LIST, level: 99, ownedNames: ["a", "b", "c", "d", "e", "f", "g", "h"]
});
eq(names(full), [], "at the cap, nothing is learned");
eq(full.blocked.length, 4, "...and all four are reported as blocked");
eq(names(magatamaLearnPlan({ skillList: LIST, level: 99, cap: 2 })), ["Alpha", "Beta"],
  "an explicit cap overrides the config one");

// Ordering is by learn level, so the cap cannot be decided by list order.
eq(names(magatamaLearnPlan({
  skillList: [{ skillName: "Late", learnLevel: 20 }, { skillName: "Early", learnLevel: 1 }],
  level: 99, cap: 1
})), ["Early"], "the earliest learn level wins a contested cap slot");

// Degenerate input is not an error.
eq(magatamaLearnPlan().learn, [], "no arguments yields no plan");
eq(magatamaLearnPlan({ skillList: null, level: 10 }).learn, [], "a null list yields no plan");
eq(magatamaLearnPlan({ skillList: [{ learnLevel: 3 }], level: 10 }).learn, [],
  "an entry with no skill name is skipped rather than creating a nameless Item");

// ---------------------------------------------------------- the builder (pure)

eq(targetsFrom("Deal Fire damage to 1 target."), "1", "a single-target effect reads as 1");
eq(targetsFrom("Deal Fire damage to all targets."), "All", "an all-target effect reads as All");
eq(targetsFrom("Deal Phys damage to all enemies."), "All", "...including 'all enemies'");
eq(targetsFrom("Deal Fire damage to 1 target.", "3"),
  "3", "the stat-block column wins over the sentence when present");

// p.96 divides skills by what they spend: spells cost MP, physical skills cost HP.
eq(skillTypeFrom({ listed: { kind: "active", element: "Fire", cost: { resource: "mp" } } }),
  "spell", "an MP cost with no stat-block type reads as a spell (p.96)");
eq(skillTypeFrom({ listed: { kind: "active", element: "Phys", cost: { resource: "hp" } } }),
  "physical-attack", "an HP cost reads as a physical attack (p.96)");
eq(skillTypeFrom({ listed: { kind: "passive" } }), "passive", "a passive reads as a passive");
eq(skillTypeFrom({ listed: { kind: "active", element: "Healing", cost: { resource: "mp" } } }),
  "recovery", "the Healing element overrides the cost rule");
eq(skillTypeFrom({ listed: { kind: "active", element: "Support", cost: { resource: "mp" }, effect: "All allies improve their physical power by 1d10." } }),
  "support", "a Support skill that improves is support");
eq(skillTypeFrom({ listed: { kind: "active", element: "Support", cost: { resource: "mp" }, effect: "All enemies reduce their physical power by 1d10." } }),
  "debuff", "a Support skill that reduces is a debuff");
eq(skillTypeFrom({ corpus: { type: "Magical Attack" }, listed: { kind: "active", element: "Fire", cost: { resource: "hp" } } }),
  "magical-attack", "a stat-block type wins over the cost rule");

const built = buildSkillSystem({
  name: "Fixture",
  listed: {
    kind: "active", element: "Ice", cost: { value: 3, resource: "mp" }, potency: 10,
    effect: "Deal Ice damage to 1 target; 20% chance to inflict Freeze."
  },
  corpus: { type: "Magical Attack", target: "1", tn: 55, traits: "Mouth" }
});
eq(built.cost, { value: 3, resource: "mp" }, "cost comes from the ch4 list");
eq(built.power, 10, "power is the ch4 potency");
eq(built.element, "ice", "element maps to the schema's key");
eq(built.skillType, "magical-attack", "type comes from the stat block");
eq(built.ailment, { type: "freeze", rate: 20 }, "the ailment is read out of the effect text");
eq(built.tn, 55, "a stat-block TN is carried");
eq(built.customTN, true, "...and marked custom, or the sheet would derive over it");
eq(built.inheritanceType, "Mouth", "the inherit trait comes from the stat block");

// A name the ch4 list omits still builds, because the stat blocks print it.
const corpusOnly = buildSkillSystem({
  name: "OnlyInCorpus",
  corpus: { type: "Magical Attack", target: "All", cost: "45 MP", potency: 30, element: "mind", effect: "Deal Mind damage to all targets." }
});
eq(corpusOnly.cost, { value: 45, resource: "mp" }, "a corpus-only skill takes its cost from the stat block");
eq(corpusOnly.power, 30, "...and its power");
eq(corpusOnly.targets, "All", "...and its targets");

// A passive costs nothing, and must not inherit the MP default.
eq(buildSkillSystem({ name: "P", listed: { kind: "passive", effect: "Increase HP multiplier by 1." } }).cost,
  { value: 0, resource: "none" }, "a passive costs nothing at all");

eq(skillKey("War Cry"), skillKey("Warcry"), "spacing folds out of the match key");
eq(skillKey("Agirao"), skillKey("Agilao"), "the recorded p.42/p.97 spelling variant resolves");
ok(skillKey("Agi") !== skillKey("Agilao"), "folding does not collapse two different skills");

// ------------------------------------------------- document shape (§4, always runs)
//
// Same guard as demon-skills: the 2026-07-27 escape wrote field names from memory and
// Foundry rejected every Item. `skill-data.mjs` cannot be imported here, so its field
// names are parsed out of it and a rename changes what this checks.
const schemaSrc = readFileSync(join(ROOT, "module/data/skill-data.mjs"), "utf8");
const SCHEMA_FIELDS = new Set(
  [...schemaSrc.matchAll(/^\s{6}([a-zA-Z]+):\s*new\s+\w+Field/gm)].map(m => m[1])
);
ok(SCHEMA_FIELDS.size >= 18, `skill schema fields parsed (${SCHEMA_FIELDS.size} >= 18)`);
for (const key of Object.keys(built)) {
  ok(SCHEMA_FIELDS.has(key), `builder writes "${key}", which the schema declares`);
}
ok(Object.keys(SMT.skillTypes).includes(built.skillType), "skillType resolves against CONFIG");
ok(Object.keys(SMT.elements).includes(built.element), "element resolves against CONFIG");
ok(["hp", "mp", "none"].includes(built.cost.resource), "cost resource is one the schema accepts");

// ---------------------------------------------------------- corpus (skippable)

const SKILLS = join(ROOT, "data-local/skill-stats.json");
const MAGATAMA = join(ROOT, "data-local/magatama-stats.json");
const DEMONS = join(ROOT, "data-local/demon-stats.json");
if (![SKILLS, MAGATAMA, DEMONS].every(existsSync)) {
  console.log("  SKIPPED: data-local/*.json not present — run tools/import-rulebook.py.");
  console.log("  The planner, builder and schema legs above still ran; NOTHING about the");
  console.log("  book's own skill list was checked.");
  console.log(`\nsmt-rpg skill-learning tests: ${passed} passed, ${failed} failed (corpus leg skipped)`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  process.exit(0);
}

const skills = JSON.parse(readFileSync(SKILLS, "utf8")).skills;
const magatama = JSON.parse(readFileSync(MAGATAMA, "utf8")).magatama;
const demons = JSON.parse(readFileSync(DEMONS, "utf8")).demons;

const listedBy = new Map(skills.map(s => [skillKey(s.name), s]));
const corpusBy = new Map();
for (const d of demons) {
  for (const row of d.skills ?? []) {
    const k = skillKey(row.name);
    if (!corpusBy.has(k) || (!corpusBy.get(k).type && row.type)) corpusBy.set(k, row);
  }
}
const entryFor = (name) => ({
  name, listed: listedBy.get(skillKey(name)) ?? null, corpus: corpusBy.get(skillKey(name)) ?? null
});

ok(skills.length >= 200, `the ch4 list imported (${skills.length} skills)`);

// ESCAPE: the parser read one printed ROW at a time, so a wrapped Effect — which prints
// one line above the name and one below it — landed in neither. Every wrapped skill lost
// its effect text and Endure was dropped outright. An empty effect is now a failure.
eq(skills.filter(s => !s.effect).length, 0, "ESCAPE: every imported skill has effect text");
const endure = listedBy.get(skillKey("Endure"));
ok(endure, "ESCAPE: Endure imported at all (a wrap-only row)");
ok(endure && /1\/\s*combat only/i.test(endure.effect),
  "ESCAPE: a three-line effect is joined across the wrap, in reading order");

// Every skill in the list builds a schema-valid payload.
for (const s of skills) {
  const system = buildSkillSystem(entryFor(s.name));
  for (const key of Object.keys(system)) {
    ok(SCHEMA_FIELDS.has(key), `${s.name}: writes "${key}", which the schema declares`);
  }
  ok(Object.keys(SMT.skillTypes).includes(system.skillType),
    `${s.name}: skillType "${system.skillType}" is declared`);
  ok(Object.keys(SMT.elements).includes(system.element),
    `${s.name}: element "${system.element}" is declared`);
  ok(["hp", "mp", "none"].includes(system.cost.resource),
    `${s.name}: cost resource "${system.cost.resource}" is declared`);
  ok(Number.isInteger(system.cost.value) && system.cost.value >= 0,
    `${s.name}: cost value ${system.cost.value} is a non-negative integer`);
  ok(Number.isInteger(system.power), `${s.name}: power ${system.power} is an integer`);
}

// The point of the whole unit: every Magatama, at its own top learn level, hands its
// fiend a set of real skills. Two talk skills have no definition in the ch4 list and are
// named here rather than allowed to look like a parse failure.
const TALK_NOT_IMPORTED = new Set(["Jive Talk", "Stone Hunt"]);
for (const m of magatama) {
  const top = Math.max(...m.skills.map(s => s.learnLv));
  const plan = magatamaLearnPlan({
    skillList: m.skills.map(s => ({ skillName: s.name, learnLevel: s.learnLv })),
    level: top,
    cap: 99            // the cap is asserted above; here the question is coverage
  });
  eq(plan.learn.length, m.skills.length, `${m.name}: all ${m.skills.length} skills owed at level ${top}`);
  for (const s of plan.learn) {
    if (TALK_NOT_IMPORTED.has(s.skillName)) continue;
    const entry = entryFor(s.skillName);
    ok(entry.listed || entry.corpus, `${m.name}: ${s.skillName} has a definition`);
    const system = buildSkillSystem(entry);
    ok(Object.keys(SMT.skillTypes).includes(system.skillType),
      `${m.name}: ${s.skillName} builds a declared skillType`);
  }
}

// Exactly ONE Magatama skill has no definition anywhere. Both talk skills are missing
// from the ch4 import — that table is not read — but Stone Hunt is printed on a stat
// block and so still resolves; Jive Talk is on neither. A second name appearing here
// means the ch4 import lost a table rather than the book omitting a skill.
const unresolved = magatama.flatMap(m => m.skills.map(s => s.name))
  .filter(n => !listedBy.has(skillKey(n)) && !corpusBy.has(skillKey(n)));
eq([...new Set(unresolved)].sort(), ["Jive Talk"],
  "Jive Talk is the only Magatama skill with no definition in either printing");
ok(!listedBy.has(skillKey("Stone Hunt")) && corpusBy.has(skillKey("Stone Hunt")),
  "Stone Hunt is absent from the ch4 import but recovered from the stat blocks");

console.log(`\nsmt-rpg skill-learning tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
