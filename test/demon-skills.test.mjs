// Skill Items built from imported stat blocks must satisfy the SkillData schema.
// `node test/demon-skills.test.mjs` (exit 0 pass, 1 fail).
//
// spec: created-demons-have-valid-skill-items
//
// Exists because of the 2026-07-27 escape (GAUNTLET.md §6): buildDemonSkills wrote
// field names and enum values that were invented rather than read from the schema
// — `magicalAttack` for `magical-attack`, `target` for `targets`, `description` for
// `effectDescription`. Every created demon threw on validation and lost its skills.
//
// Legal values are read from CONFIG.SMT and from the schema's own declarations, never
// restated here: a hardcoded copy would drift the same way the original did.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

// The schema is written for Foundry and cannot be imported here, so the field names
// and their choice sources are parsed out of it. That keeps this test honest: if a
// field is renamed in the schema, the name below changes with it.
const schemaSrc = readFileSync(join(ROOT, "module/data/skill-data.mjs"), "utf8");
const SCHEMA_FIELDS = new Set(
  [...schemaSrc.matchAll(/^\s{6}([a-zA-Z]+):\s*new\s+\w+Field/gm)].map(m => m[1])
);
ok(SCHEMA_FIELDS.size >= 12, `skill schema fields parsed (${SCHEMA_FIELDS.size} >= 12)`);
for (const f of ["skillType", "targets", "effectDescription", "element", "power", "cost"]) {
  ok(SCHEMA_FIELDS.has(f), `schema declares "${f}" (the escape wrote a different name)`);
}

const LEGAL = {
  skillType: Object.keys(SMT.skillTypes),
  element: Object.keys(SMT.elements),
  resource: ["hp", "mp", "none"],
  ailment: Object.keys(SMT.ailments)
};
ok(LEGAL.skillType.length >= 8, `skillTypes from CONFIG (${LEGAL.skillType.length})`);
ok(LEGAL.skillType.every(t => /^[a-z]+(-[a-z]+)?$/.test(t)),
  "every skillType key is kebab-case — the escape emitted camelCase");

// --- the real corpus, when it has been imported ---------------------------
// SKIPS LOUDLY when the local data is absent. A fresh clone has no stat blocks, and
// a silent pass over an empty set is exactly the fail-open this project guards against.
const DATA = join(ROOT, "data-local/demon-stats.json");
if (!existsSync(DATA)) {
  console.log("  SKIPPED: data-local/demon-stats.json not present — run tools/import-rulebook.py.");
  console.log("  The schema-shape assertions above still ran; the corpus sweep did not.");
} else {
  const demons = JSON.parse(readFileSync(DATA, "utf8")).demons;
  ok(demons.length >= 190, `corpus loaded (${demons.length} demons)`);

  let skillCount = 0;
  const bad = [];
  for (const d of demons) {
    for (const s of buildDemonSkills(d)) {
      skillCount++;
      const where = `${d.name} / ${s.name}`;
      for (const key of Object.keys(s.system)) {
        if (!SCHEMA_FIELDS.has(key)) bad.push(`${where}: "${key}" is not a schema field`);
      }
      if (!LEGAL.skillType.includes(s.system.skillType)) {
        bad.push(`${where}: skillType "${s.system.skillType}" not a legal choice`);
      }
      if (!LEGAL.element.includes(s.system.element)) {
        bad.push(`${where}: element "${s.system.element}" not a legal choice`);
      }
      if (!LEGAL.resource.includes(s.system.cost?.resource)) {
        bad.push(`${where}: cost.resource "${s.system.cost?.resource}" not a legal choice`);
      }
      for (const k of Object.keys(s.system.cost ?? {})) {
        if (!["value", "resource"].includes(k)) bad.push(`${where}: cost."${k}" is not a schema key`);
      }
      if (s.system.ailment && !LEGAL.ailment.includes(s.system.ailment.type)) {
        bad.push(`${where}: ailment.type "${s.system.ailment.type}" not a legal choice`);
      }
      if (typeof s.system.targets !== "string") bad.push(`${where}: targets must be a string`);
      if (!Number.isInteger(s.system.power)) bad.push(`${where}: power must be an integer`);
      if (s.type !== "skill") bad.push(`${where}: item type must be "skill"`);
      if (!s.name) bad.push(`${d.name}: skill with no name`);
    }
  }

  ok(skillCount >= 1000, `skills built across the corpus (${skillCount} >= 1000)`);
  eq(bad.slice(0, 10), [], `every built skill satisfies the schema (${bad.length} violations)`);

  // Basic Strike is the innate attack every actor already has.
  const withBasic = demons.filter(d => buildDemonSkills(d).some(s => /^basic strike$/i.test(s.name)));
  eq(withBasic.map(d => d.name), [], "Basic Strike is never created as an Item");

  // The actor payload must only use fields the demon schema knows.
  const demonSrc = readFileSync(join(ROOT, "module/data/demon-data.mjs"), "utf8");
  const baseSrc = readFileSync(join(ROOT, "module/data/base-actor.mjs"), "utf8");
  const actorFields = new Set([
    ...[...demonSrc.matchAll(/^\s{4,8}([a-zA-Z]+):\s*new\s+\w+Field/gm)].map(m => m[1]),
    ...[...baseSrc.matchAll(/^\s{4,8}([a-zA-Z]+):\s*(new\s+\w+Field|make\w+Schema)/gm)].map(m => m[1])
  ]);
  ok(actorFields.size >= 10, `actor schema fields parsed (${actorFields.size} >= 10)`);

  const unknownActorFields = new Set();
  for (const d of demons) {
    const { system } = buildDemonSystem(d);
    for (const key of Object.keys(system)) {
      if (!actorFields.has(key)) unknownActorFields.add(key);
    }
  }
  eq([...unknownActorFields].sort(), [], "every actor system key is declared by the schema");

  // A matching field NAME is not enough — `drops` is a SchemaField and was written
  // as a bare string in the escape, which the name check above passed happily.
  // Sub-keys are parsed out of the schema so this cannot be restated wrongly.
  const subKeysOf = (src, field) => {
    const m = src.match(new RegExp(`${field}:\\s*new SchemaField\\(\\{([\\s\\S]*?)\\n\\s{4,6}\\}\\)`));
    return m ? [...m[1].matchAll(/^\s+([a-zA-Z]+):/gm)].map(x => x[1]) : null;
  };
  const dropKeys = subKeysOf(demonSrc, "drops");
  ok(dropKeys?.length >= 2, `drops sub-keys parsed from the schema (${dropKeys})`);

  const shapeBad = [];
  for (const d of demons) {
    const { system } = buildDemonSystem(d);
    if ("drops" in system) {
      if (typeof system.drops !== "object" || system.drops === null) {
        shapeBad.push(`${d.name}: drops is ${typeof system.drops}, schema declares a SchemaField`);
      } else {
        for (const k of Object.keys(system.drops)) {
          if (!dropKeys.includes(k)) shapeBad.push(`${d.name}: drops."${k}" is not a schema sub-key`);
        }
      }
    }
    for (const f of ["hp", "mp", "fatePoints"]) {
      if (f in system && (typeof system[f] !== "object" || system[f] === null)) {
        shapeBad.push(`${d.name}: ${f} must be an object`);
      }
    }
  }
  eq(shapeBad.slice(0, 6), [], `nested schema fields written with the right shape (${shapeBad.length} violations)`);
}

console.log(`\nsmt-rpg demon-skills tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 20)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
