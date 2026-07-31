// The 25 printed Magatama (p.42) and the affinity clauses stated in the p.39-41 prose.
// `node test/magatama-data.test.mjs` (exit 0 pass, 1 fail).
//
// spec: magatama-grants-parse-into-the-schema
//
// Two legs, and they check different things.
//
// The GRAMMAR leg is pure and always runs. Its fixtures are synthetic combinations the
// book does not print, because what is under test is the grammar, not the book's
// choices: keyword-first ("Null Ice"), keyword-LAST ("Elec Weak"), both in one
// sentence, comma lists, the two p.65 category targets, the one exclusion form, and the
// clauses that must be REFUSED rather than guessed at.
//
// The CORPUS leg reads data-local/magatama-stats.json and SKIPS LOUDLY when it is
// absent, which is the normal state of a fresh clone. A skip is reported as a skip and
// never as a pass — the failure mode this guards against is a suite that quietly checks
// nothing and reports green, which is how a shrunk config once made 120 assertions
// vanish instead of fail.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { parseMagatamaGrant, buildMagatamaSystem, sortMagatama } =
  await import("../module/helpers/magatama-compendium.mjs");
const { parseAffinityLine, ATTACK_ELEMENTS } = await import("../module/helpers/compendium.mjs");

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

const els = (text) => parseMagatamaGrant(text).elements;
const cats = (text) => parseMagatamaGrant(text).categories;

// ---------------------------------------------------------------- grammar (pure)

// Keyword-first, the form both parsers share.
eq(els("Null Fire"), { fire: "null" }, "keyword-first clause");
eq(els("Drain Elec"), { elec: "drain" }, "keyword-first, drain");
eq(els("Repel Phys"), { phys: "repel" }, "keyword-first, repel");

// Keyword-LAST. This is the form the stat-block grammar does not have, and it is the
// one the book uses for the second half of nearly every Magatama grant.
eq(els("Nerve Weak"), { nerve: "weak" }, "keyword-last clause");
eq(els("Ruin Strong"), { ruin: "strong" }, "keyword-last, strong");

// Both forms in one sentence, joined by "and" rather than by "/".
eq(els("Null Fire and Nerve Weak"), { fire: "null", nerve: "weak" },
  "keyword-first and keyword-last in one grant");
eq(els("Drain Ruin and Mind, Light Weak"),
  { ruin: "drain", mind: "weak", light: "weak" },
  "comma list shares the trailing keyword");
eq(els("Repel Dark and Ice, Force, Phys Strong"),
  { dark: "repel", ice: "strong", force: "strong", phys: "strong" },
  "three-element comma list");

// ESCAPE: routing this through the stat-block parser silently inverts the second
// clause, because there a keyword runs FORWARD until the next one replaces it. The two
// grammars are not interchangeable and this assertion is what says so.
eq(parseAffinityLine("Null Fire and Nerve Weak").elements,
  { fire: "null", nerve: "null" },
  "ESCAPE: the stat-block parser reads a trailing keyword as leading");
ok(JSON.stringify(els("Null Fire and Nerve Weak"))
  !== JSON.stringify(parseAffinityLine("Null Fire and Nerve Weak").elements),
  "ESCAPE: the two grammars disagree, so one cannot stand in for the other");

// p.65 categories are not elements, and "Attack"/"Attacks" is noise around the name.
eq(cats("Strong Ailment Attack"), { ailment: "strong" }, "ailment category, keyword-first");
eq(cats("Ailment Attack Weak"), { ailment: "weak" }, "ailment category, keyword-last");
eq(cats("Ailment Attacks Weak"), { ailment: "weak" }, "plural 'Attacks' reads the same");
eq(cats("Magic Weak"), { magic: "weak" }, "magic category");
eq(els("Strong Phys and Magic Weak"), { phys: "strong" },
  "a category target never lands in the element map");
eq(cats("Strong Phys and Magic Weak"), { magic: "weak" },
  "...and the element clause never lands in the category map");

// The exclusion form (p.41). The excluded element is read, not assumed.
const all = parseMagatamaGrant("Null affinity to all elements besides Almighty");
eq(Object.keys(all.elements).sort(), [...ATTACK_ELEMENTS].sort(),
  "exclusion form covers every attack element");
ok(Object.values(all.elements).every(v => v === "null"),
  "exclusion form applies one rating to all of them");
ok(!("almighty" in all.elements), "Almighty is excluded by name, not by luck");
const allButFire = parseMagatamaGrant("Repel affinity to all elements besides Fire");
ok(!("fire" in allButFire.elements) && allButFire.elements.ice === "repel",
  "a DIFFERENT exclusion excludes that element instead — the phrase is parsed, not matched");

// Refusals. An unreadable clause is recorded, never guessed at.
eq(els("Fire"), {}, "a bare element with no keyword assigns nothing");
eq(parseMagatamaGrant("Fire").unparsed, ["Fire"], "...and is reported as unparsed");
eq(els("Null Dark Weak"), {},
  "a clause with a keyword at BOTH ends is refused rather than resolved");
eq(els("Null Sunshine"), {}, "an unknown target assigns nothing");
ok(parseMagatamaGrant("Null Sunshine").unparsed.length === 1, "...and is reported");
eq(parseMagatamaGrant("").elements, {}, "an empty grant is not an error");
eq(parseMagatamaGrant(null).unparsed, [], "a missing grant is not an error");
eq(els("Null Fire."), { fire: "null" }, "a trailing period is not part of the element");
eq(els("null fire AND NERVE weak"), { fire: "null", nerve: "weak" },
  "case is irrelevant, in the keyword and in the connective");

// First-wins, so a grant naming the same element twice keeps the first rating.
eq(els("Null Fire and Fire Weak"), { fire: "null" }, "the first rating for an element wins");

// buildMagatamaSystem is pure and must not invent fields.
const built = buildMagatamaSystem({
  name: "Fixture", acquisition: "Starter", isStarter: true,
  statBonuses: { strength: 1, magic: 2, vitality: 3, agility: 4, luck: 5 },
  skills: [{ name: "Alpha", learnLv: 1 }, { name: "Beta", learnLv: 20 }],
  grant: "Null Fire and Nerve Weak"
});
eq(built.system.statBonuses, { strength: 1, magic: 2, vitality: 3, agility: 4, luck: 5 },
  "stat bonuses pass through");
eq(built.system.skillList,
  [{ skillName: "Alpha", learnLevel: 1 }, { skillName: "Beta", learnLevel: 20 }],
  "skills become the schema's skillList shape");
eq(built.system.affinities, { fire: "null", nerve: "weak" }, "grant becomes affinities");
eq(built.system.isStarter, true, "starter flag passes through");
ok(!("description" in built.system),
  "no description is written — the imported paragraphs are read for their grant alone");
eq(buildMagatamaSystem({}).system.skillList, [], "an entry with no skills builds an empty list");

// ------------------------------------------------- document shape (§4, always runs)
//
// The 2026-07-27 escape was a builder writing field names FROM MEMORY: `magicalAttack`
// where the schema declares `magical-attack`, `target` for `targets`, `drops` as a bare
// string where a SchemaField was declared. Foundry rejected every Item and the actor
// came up empty. `magatama-data.mjs` cannot be imported here (it destructures
// `foundry.data.fields` at module scope), so its field names are PARSED out of it —
// which means renaming a field in the schema changes what this checks, rather than
// leaving a literal behind to drift.
const schemaSrc = readFileSync(join(ROOT, "module/data/magatama-data.mjs"), "utf8");
const SCHEMA_FIELDS = new Set(
  [...schemaSrc.matchAll(/^\s{6}([a-zA-Z]+):\s*(?:new\s+\w+Field|make\w+Schema)/gm)].map(m => m[1])
);
const SKILL_ENTRY_FIELDS = new Set(
  [...schemaSrc.matchAll(/^\s{10}([a-zA-Z]+):\s*new\s+\w+Field/gm)].map(m => m[1])
);
ok(SCHEMA_FIELDS.size >= 7, `magatama schema fields parsed (${SCHEMA_FIELDS.size} >= 7)`);
ok(SKILL_ENTRY_FIELDS.size === 2, `skillList entry fields parsed (${SKILL_ENTRY_FIELDS.size} === 2)`);
for (const f of ["statBonuses", "affinities", "categoryAffinities", "skillList",
  "acquisition", "isStarter"]) {
  ok(SCHEMA_FIELDS.has(f), `schema declares "${f}"`);
}

for (const key of Object.keys(built.system)) {
  ok(SCHEMA_FIELDS.has(key), `builder writes "${key}", which the schema declares`);
}
for (const key of Object.keys(built.system.skillList[0])) {
  ok(SKILL_ENTRY_FIELDS.has(key), `skillList entry writes "${key}", which the schema declares`);
}
// Nested shapes, not just names — `drops` passed a name-only check happily as a string.
ok(Array.isArray(built.system.skillList), "skillList is an array, as the ArrayField declares");
ok(built.system.skillList.every(s =>
  typeof s.skillName === "string" && Number.isInteger(s.learnLevel)),
"every skillList entry is a StringField/NumberField pair");
for (const k of Object.keys(built.system.statBonuses)) {
  ok(["strength", "magic", "vitality", "agility", "luck"].includes(k),
    `statBonuses key "${k}" is one of the five stats the schema builds from`);
}
ok(typeof built.system.isStarter === "boolean", "isStarter is a boolean, as declared");
ok(typeof built.system.acquisition === "string", "acquisition is a string, as declared");

// Ordering: starters first, then by earliest skill level.
eq(sortMagatama([
  { name: "Late", isStarter: false, skills: [{ name: "x", learnLv: 60 }] },
  { name: "Early", isStarter: false, skills: [{ name: "x", learnLv: 30 }] },
  { name: "Start", isStarter: true, skills: [{ name: "x", learnLv: 1 }] }
]).map(m => m.name), ["Start", "Early", "Late"], "starters first, then by first skill level");
eq(sortMagatama([{ name: "NoSkills", isStarter: false, skills: [] }]).map(m => m.name),
  ["NoSkills"], "an entry with no skills still sorts rather than throwing");

// ---------------------------------------------------------------- corpus (skippable)

const DATA = join(ROOT, "data-local/magatama-stats.json");
if (!existsSync(DATA)) {
  console.log("  SKIPPED: data-local/magatama-stats.json not present — run tools/import-rulebook.py.");
  console.log("  The grammar leg above still ran; NOTHING about the book's own 25 entries was checked.");
  console.log(`\nsmt-rpg magatama tests: ${passed} passed, ${failed} failed (corpus leg skipped)`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  process.exit(0);
}

const payload = JSON.parse(readFileSync(DATA, "utf-8"));
const entries = payload.magatama ?? [];
const STAT_KEYS = ["strength", "magic", "vitality", "agility", "luck"];
const RATINGS = new Set(SMT.affinityPriority);

eq(entries.length, 25, "25 Magatama imported (24 printed + Masakados)");
eq(entries.filter(m => m.isStarter).length, 8, "8 of them are starters (p.39)");

for (const m of entries) {
  const where = m.name;
  eq(Object.keys(m.statBonuses ?? {}).sort(), [...STAT_KEYS].sort(), `${where}: all five stat bonuses`);
  for (const k of STAT_KEYS) {
    const v = m.statBonuses?.[k];
    ok(Number.isInteger(v) && v >= 0 && v <= SMT.statCap,
      `${where}: ${k} bonus ${v} is an integer within the p.39 stat cap`);
  }
  ok(!!m.acquisition, `${where}: has an acquisition`);
  ok(m.skills?.length > 0, `${where}: teaches at least one skill`);
  for (const s of m.skills ?? []) {
    ok(typeof s.name === "string" && s.name.trim().length > 0, `${where}: skill has a name`);
    ok(Number.isInteger(s.learnLv) && s.learnLv >= 1 && s.learnLv <= 99,
      `${where}: ${s.name} learn level ${s.learnLv} in range`);
    // The 2026-07-27 escape put the PDF's per-purchaser watermark onto 109 demons. The
    // same page furniture sits below this table too, so the same check belongs here.
    ok(!/^\d+$/.test(s.name) && !s.name.includes("Order #"),
      `${where}: ${s.name} is a skill, not page furniture`);
  }

  // Every clause the book states must be fully expressible. `unparsed` is the parser
  // saying it refused to guess — a non-empty one means the schema cannot carry a
  // printed rule, which is exactly what left Kamudo unable to be Ailment Attack Weak.
  const { system, grant } = buildMagatamaSystem(m);
  eq(grant.unparsed, [], `${where}: the whole affinity grant parses (${m.grant || "none stated"})`);
  for (const [el, rating] of Object.entries(system.affinities)) {
    ok(ATTACK_ELEMENTS.includes(el), `${where}: ${el} is an element the schema declares`);
    ok(RATINGS.has(rating), `${where}: ${el} rating "${rating}" is a declared affinity`);
  }
  for (const [cat, rating] of Object.entries(system.categoryAffinities)) {
    ok(cat in SMT.affinityCategories, `${where}: ${cat} is a declared p.65 category`);
    ok(RATINGS.has(rating), `${where}: ${cat} rating "${rating}" is a declared affinity`);
  }
}

// Exactly two of the printed Magatama state no affinity grant at all. If a third turns
// up, the prose scan lost a paragraph rather than the book gaining a plain Magatama.
const ungranted = entries.filter(m => !m.grant).map(m => m.name).sort();
eq(ungranted.length, 2, `exactly 2 Magatama state no affinity grant (found: ${ungranted.join(", ")})`);

// The three starters printed on made character sheets (p.25-32) are an independent
// third printing of these numbers — a different page, read by a different parser.
const byName = Object.fromEntries(entries.map(m => [m.name, m]));
const ANCHORS = {
  Marogareh: { strength: 4, magic: 1, vitality: 2, agility: 2, luck: 1 },
  Shiranui: { strength: 1, magic: 5, vitality: 0, agility: 4, luck: 0 },
  Ankh: { strength: 1, magic: 2, vitality: 5, agility: 0, luck: 2 }
};
for (const [name, want] of Object.entries(ANCHORS)) {
  eq(byName[name]?.statBonuses, want, `${name} matches its printed sample character sheet`);
}
// Marogareh's sheet shows no affinity line, and its paragraph states none.
eq(buildMagatamaSystem(byName.Marogareh ?? {}).system.affinities, {},
  "Marogareh grants no affinity, as printed");

console.log(`\nsmt-rpg magatama tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
