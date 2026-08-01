// The in-Foundry demon parse against the reference implementation.
// `node test/importer-parity.test.mjs` (exit 0 pass, 1 fail).
//
// spec: browser-parse-matches-the-cli-parse
//
// tools/import-rulebook.py is the reference: proven against the rendered book and
// carrying every layout quirk in §6. module/importer/demon-parse.mjs is its port, and
// THIS suite is what holds the two equal: both consume the exact same word lists
// (data-local/word-dump.json, PyMuPDF's extraction, rounded once at the source), and
// every field of every demon must be identical to data-local/demon-stats.json.
//
// A geometry slip in the port — a window off by a point, a tolerance drifted, a sort
// that broke ties differently — lands here as a named field diff on a named demon, not
// as a wrong actor discovered in play.
//
// The corpus legs skip loudly when the local data is absent (fresh clones have no
// book). The pure legs always run.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const {
  rows, blocks, buildRuler, parseSkills, parseDemons, verifyDemons,
  titleCase, num, clean,
} = await import("../module/importer/demon-parse.mjs");

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

// ------------------------------------------------------------------ pure legs

// The primitive ports carry Python semantics, not JS defaults.
eq(num("1,044"), 1044, "num strips thousands commas");
eq(num("245%"), 245, "num strips percent");
eq(num("12abc"), null, "num refuses what Python int() refuses (parseInt would take it)");
eq(num("—"), null, "num refuses the dash");
eq(clean("—"), "", "clean maps the em-dash placeholder to empty");
eq(clean(" - "), "", "clean maps the ascii dash placeholder to empty");
eq(titleCase("BLACK FROST"), "Black Frost", "title case");
eq(titleCase("SPECTER (3RD TIME)"), "Specter (3rd Time)", "ordinals and parens survive title case");
eq(titleCase("CU CHULAINN"), "Cu Chulainn", "plain names");

// Row bucketing: first key within tolerance wins, values sort by x.
eq(rows([[10, 100, "b"], [5, 101, "a"], [7, 200, "c"]]),
  [[100, [[5, "a"], [10, "b"]]], [200, [[7, "c"]]]],
  "rows buckets by y tolerance and sorts by x");

// Block detection needs name + LV/LVL + CLAN on one row.
const HEAD = [[50, 10, "PIXIE"], [120, 10, "LV"], [140, 10, "2"], [180, 10, "CLAN"], [220, 10, "FAIRY"]];
eq(blocks(HEAD).length, 1, "a header row yields a block");
eq(blocks(HEAD)[0][0], { y: 10, name: "PIXIE", level: 2, clan: "FAIRY" }, "header fields parse");
eq(blocks([[50, 10, "PIXIE"], [180, 10, "CLAN"], [220, 10, "FAIRY"]]).length, 0,
  "no LV token, no block");

// The all-dash ruler: exactly one token per column, medianed.
const dashRow = [Array.from({ length: 12 }, (_, i) => [i * 10, "—"])];
eq(buildRuler([[[50, dashRow[0]]]]), Array.from({ length: 12 }, (_, i) => i * 10),
  "a full dash row is an exact ruler");
eq(buildRuler([[[50, dashRow[0].slice(0, 11)]]]), null,
  "an 11-token row is not a ruler");

// parseSkills drops page furniture and non-rows, keeps Legion's learn-level-only shape.
const anchors = Array.from({ length: 12 }, (_, i) => i * 40);
eq(parseSkills([[10, [[0, "137"]]]], anchors), [], "a bare page number is not a skill");
eq(parseSkills([[10, [[0, "Anti-Phys"], [40, "24"]]]], anchors),
  [{ name: "Anti-Phys", learnLv: 24 }],
  "a passive with only a learn level survives (Legion, p.194)");

// ------------------------------------------------------------- corpus parity

const WORDS = join(ROOT, "data-local/word-dump.json");
const DEMONS = join(ROOT, "data-local/demon-stats.json");
if (!existsSync(WORDS) || !existsSync(DEMONS)) {
  console.log("  SKIPPED: data-local/word-dump.json or demon-stats.json not present —");
  console.log("  run tools/import-rulebook.py --dump-words against your own PDF.");
  console.log("  The pure legs above ran; the 194-demon parity diff DID NOT.");
  console.log(`\nsmt-rpg importer-parity tests: ${passed} passed, ${failed} failed (parity leg skipped)`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  process.exit(0);
}

const dump = JSON.parse(readFileSync(WORDS, "utf8"));
const reference = JSON.parse(readFileSync(DEMONS, "utf8")).demons;

const ported = parseDemons(dump.pages);

eq(ported.length, reference.length, `port parses ${reference.length} demons`);

// Field-for-field, demon-for-demon. Key by name+page (unique across the corpus).
const key = (d) => `${d.name}|p${d.page}`;
const byKey = new Map(ported.map(d => [key(d), d]));
let identical = 0;
for (const ref of reference) {
  const got = byKey.get(key(ref));
  if (!got) { failed++; failures.push(`missing from port: ${key(ref)}`); continue; }
  // The reference JSON drops null/empty skill cells; the port does the same. Compare
  // the full serialized record so ANY divergence — a field, an order, a type — lands.
  const a = JSON.stringify(got);
  const e = JSON.stringify(ref);
  if (a === e) { passed++; identical++; }
  else {
    failed++;
    // Name the first differing field, not just the demon.
    const diffs = [];
    const keys = new Set([...Object.keys(got), ...Object.keys(ref)]);
    for (const k of keys) {
      if (JSON.stringify(got[k]) !== JSON.stringify(ref[k])) {
        diffs.push(`${k}: port=${JSON.stringify(got[k])?.slice(0, 80)} ref=${JSON.stringify(ref[k])?.slice(0, 80)}`);
      }
    }
    failures.push(`${key(ref)} diverges:\n      ${diffs.join("\n      ")}`);
  }
}
console.log(`  parity: ${identical}/${reference.length} demons byte-identical to the reference`);

// The ported verifier agrees with the Python one on the real corpus: zero errors,
// and exactly the three as-printed Recarmdra warnings.
const { errs, warns } = verifyDemons(ported);
eq(errs, [], "ported verifier: zero errors on the real corpus");
eq(warns.length, 3, "ported verifier: exactly the three as-printed cost warnings");
ok(warns.every(w => w.includes("Recarmdra")), "…and all three are Recarmdra");

// ------------------------------------------------- magatama parity (25 entries)

const { parseMagatama, verifyMagatama, extractGrant } =
  await import("../module/importer/magatama-parse.mjs");

// Pure grant legs: same discipline as the compendium-side grammar — a decoy trigger
// cannot shadow the real clause, and the capture must open with a keyword.
eq(extractGrant("It grants Null Ice and Elec Weak."), "Null Ice and Elec Weak",
  "grant: plain capture");
eq(extractGrant("grants not only the Almighty attack spell Megido but also"),
  "", "grant: Kailash's decoy is refused (capture must open with a keyword)");
eq(extractGrant("It grants the power of X. It grants Strong Phys and Fire, Ice Weak."),
  "Strong Phys and Fire, Ice Weak", "grant: the longest candidate wins over a decoy");

const MAGATAMA = join(ROOT, "data-local/magatama-stats.json");
if (existsSync(MAGATAMA)) {
  const refMagatama = JSON.parse(readFileSync(MAGATAMA, "utf8")).magatama;
  const { entries, errs: mErrs, ignored } = parseMagatama(dump.pages);

  eq(entries.length, refMagatama.length, `port parses ${refMagatama.length} magatama`);
  eq(mErrs, [], "magatama table parse reports no errors");
  eq(ignored.length, 7, "the 7 page-furniture words are ignored, same as the reference");

  const mByName = new Map(entries.map(d => [d.name, d]));
  let mIdentical = 0;
  for (const ref of refMagatama) {
    const got = mByName.get(ref.name);
    if (!got) { failed++; failures.push(`missing from magatama port: ${ref.name}`); continue; }
    if (JSON.stringify(got) === JSON.stringify(ref)) { passed++; mIdentical++; }
    else {
      failed++;
      const keys = new Set([...Object.keys(got), ...Object.keys(ref)]);
      const diffs = [...keys]
        .filter(k => JSON.stringify(got[k]) !== JSON.stringify(ref[k]))
        .map(k => `${k}: port=${JSON.stringify(got[k])?.slice(0, 60)} ref=${JSON.stringify(ref[k])?.slice(0, 60)}`);
      failures.push(`magatama ${ref.name} diverges:\n      ${diffs.join("\n      ")}`);
    }
  }
  console.log(`  parity: ${mIdentical}/${refMagatama.length} magatama byte-identical to the reference`);

  const mv = verifyMagatama(entries);
  eq(mv.errs, [], "ported magatama verifier: zero errors");
  eq(mv.warns.length, 2, "…and exactly the two no-grant-as-printed warnings");
  ok(mv.warns.every(w => /Marogareh|Kailash/.test(w)), "…which are Marogareh and Kailash");
} else {
  console.log("  SKIPPED: magatama-stats.json absent — magatama parity leg did not run.");
}

// ------------------------------------------------- ch4 skill-list parity (248)

const { parseSkillList, verifySkillList } = await import("../module/importer/skill-parse.mjs");

const SKILLS = join(ROOT, "data-local/skill-stats.json");
if (existsSync(SKILLS)) {
  const refSkills = JSON.parse(readFileSync(SKILLS, "utf8")).skills;
  const { skills: portSkills, junk } = parseSkillList(dump.pages);

  eq(portSkills.length, refSkills.length, `port parses ${refSkills.length} ch4 skill rows`);

  const sKey = (s) => `${s.name}|p${s.page}`;
  const sByKey = new Map(portSkills.map(s => [sKey(s), s]));
  let sIdentical = 0;
  for (const ref of refSkills) {
    const got = sByKey.get(sKey(ref));
    if (!got) { failed++; failures.push(`missing from skill port: ${sKey(ref)}`); continue; }
    if (JSON.stringify(got) === JSON.stringify(ref)) { passed++; sIdentical++; }
    else {
      failed++;
      const keys = new Set([...Object.keys(got), ...Object.keys(ref)]);
      const diffs = [...keys]
        .filter(k => JSON.stringify(got[k]) !== JSON.stringify(ref[k]))
        .map(k => `${k}: port=${JSON.stringify(got[k])?.slice(0, 60)} ref=${JSON.stringify(ref[k])?.slice(0, 60)}`);
      failures.push(`skill ${sKey(ref)} diverges:\n      ${diffs.join("\n      ")}`);
    }
  }
  console.log(`  parity: ${sIdentical}/${refSkills.length} ch4 skills byte-identical to the reference`);

  if (existsSync(MAGATAMA)) {
    const refMagatama = JSON.parse(readFileSync(MAGATAMA, "utf8")).magatama;
    const sv = verifySkillList(portSkills, reference, refMagatama, junk);
    eq(sv.errs, [], "ported skill verifier: zero errors");
    eq(sv.distinct, 248, "ported skill verifier: 248 distinct");
    eq(sv.crossChecked, 863, "ported skill verifier: 863 costs cross-checked");
    const dissent = sv.warns.filter(w => w.includes("kept as printed"));
    eq(dissent.length, 4, "…the four outvoted book slips are warned, not errored");
    ok(sv.warns.some(w => w.includes("Makajamaon")), "…Makajamaon resolves from the corpus");
    ok(sv.warns.some(w => w.includes("Jive Talk")), "…and the Jive Talk gap is named");
  }
} else {
  console.log("  SKIPPED: skill-stats.json absent — skill parity leg did not run.");
}

// ------------------------------------------- gear + item price lists (48 + 20)

const { parseGearItems, verifyGearItems } = await import("../module/importer/gear-parse.mjs");
const { classifyGear, buildGearSystem, buildConsumableSystem, buildGearItemPayloads } =
  await import("../module/helpers/gear-compendium.mjs");

// Pure classification legs — the routing rules are decisions, so they are pinned.
eq(classifyGear("Weapon").gearType, "weapon-melee", "Weapon routes to melee");
eq(classifyGear("Weapon (Firearm)").gearType, "weapon-ranged", "Firearm routes to ranged");
eq(classifyGear("Weapon (Grenade)"), { route: "consumable", consumableType: "rock" },
  "a grenade is a single-use attack item — the Rock family, wherever it is printed");
eq(classifyGear("Ammo"), { route: "consumable", consumableType: "ammo" },
  "Bullets are the new ammo consumable type");
eq(classifyGear("Head Armor"), { route: "gear", gearType: "armor", slot: "Head" },
  "armor keeps its printed slot");
eq(classifyGear("Head/Body/Leg Armor").slot, "Head/Body/Leg", "the full-body slot survives");

const GEARDATA = join(ROOT, "data-local/gear-stats.json");
if (existsSync(GEARDATA)) {
  const refGear = JSON.parse(readFileSync(GEARDATA, "utf8"));
  const { consumables, gear, errs: gErrs } = parseGearItems(dump.pages);

  eq(gErrs, [], "gear table parse reports no errors");
  eq(consumables.length, refGear.consumables.length,
    `port parses ${refGear.consumables.length} price-list items`);
  eq(gear.length, refGear.gear.length, `port parses ${refGear.gear.length} gear entries`);

  let gIdentical = 0;
  const cByName = new Map(consumables.map(c => [c.name, c]));
  for (const ref of refGear.consumables) {
    const got = cByName.get(ref.name);
    if (JSON.stringify(got) === JSON.stringify(ref)) { passed++; gIdentical++; }
    else {
      failed++;
      failures.push(`item ${ref.name} diverges: port=${JSON.stringify(got)?.slice(0, 120)}`);
    }
  }
  const gByName = new Map(gear.map(g => [g.name, g]));
  for (const ref of refGear.gear) {
    const got = gByName.get(ref.name);
    if (JSON.stringify(got) === JSON.stringify(ref)) { passed++; gIdentical++; }
    else {
      failed++;
      failures.push(`gear ${ref.name} diverges: port=${JSON.stringify(got)?.slice(0, 120)}`);
    }
  }
  console.log(`  parity: ${gIdentical}/${refGear.consumables.length + refGear.gear.length} `
    + `gear+items byte-identical to the reference`);

  const gv = verifyGearItems(consumables, gear, gErrs);
  eq(gv.errs, [], "ported gear verifier: zero errors");

  // Builder shape checks against the schemas, same discipline as skill-learning:
  // field names parsed out of the data models, enums resolved from CONFIG.
  const gearSchema = new Set(
    [...readFileSync(join(ROOT, "module/data/gear-data.mjs"), "utf8")
      .matchAll(/^\s{6}([a-zA-Z]+):\s*new\s+\w+Field/gm)].map(m => m[1]));
  const consumableSchema = new Set(
    [...readFileSync(join(ROOT, "module/data/consumable-data.mjs"), "utf8")
      .matchAll(/^\s{6}([a-zA-Z]+):\s*new\s+\w+Field/gm)].map(m => m[1]));
  ok(gearSchema.has("slot"), "the gear schema declares the new slot field");

  const { payloads } = buildGearItemPayloads(consumables, gear);
  eq(payloads.length, consumables.length + gear.length, "every printed row builds a payload");
  for (const p of payloads) {
    const schema = p.type === "gear" ? gearSchema : consumableSchema;
    for (const key of Object.keys(p.system)) {
      ok(schema.has(key), `${p.name}: writes "${key}", which the ${p.type} schema declares`);
    }
    if (p.type === "consumable") {
      ok(Object.keys(SMT.consumableTypes).includes(p.system.consumableType),
        `${p.name}: consumableType "${p.system.consumableType}" is declared`);
    } else {
      ok(Object.keys(SMT.gearTypes).includes(p.system.gearType),
        `${p.name}: gearType "${p.system.gearType}" is declared`);
    }
  }

  // Row anchors through the BUILDER — the mechanically-load-bearing conversions.
  const byPayload = new Map(payloads.map(p => [p.name, p]));
  eq(byPayload.get("Knife").system.powerBonus, 5, "Knife carries its printed power");
  eq(byPayload.get("MP5").system.ammo, { max: 30, value: 30 },
    "MP5's Ammo Count is read out of the effect text");
  eq(byPayload.get("Tricorne Hat").system.resistBonus.magical, 2,
    "Tricorne's magic resistance is read out of the effect text");
  eq(byPayload.get("Plate Mail").system.resistBonus.physical, 12, "Plate Mail's printed resist");
  eq(byPayload.get("Hand Grenade").type, "consumable", "a grenade builds as a consumable");
  eq(byPayload.get("Hand Grenade").system.attackElement, "phys", "…attacking with Phys");
  ok(byPayload.get("Hand Grenade").system.attackAll, "…all enemies");
  eq(byPayload.get("Bullets x10").system.consumableType, "ammo", "Bullets build as ammo");
  eq(byPayload.get("Medicine").system.healHP, 50, "Medicine heals its printed 50");
  ok(byPayload.get("Soma").system.healFull, "Soma is a full heal");
  ok(byPayload.get("Bead Chain").system.healAllAllies, "Bead Chain hits the whole party");
  ok(byPayload.get("Revival Bead").system.revive && !byPayload.get("Revival Bead").system.reviveFull,
    "Revival Bead revives at 1 HP");
  ok(byPayload.get("Balm of Rising").system.reviveFull, "Balm of Rising revives at full");
  eq(byPayload.get("Dis-Poison").system.curesAilment, "poison", "Dis-Poison cures poison");
  eq(byPayload.get("Megido Rock").system.attackPower, 30, "Megido Rock's +30 is read");
  eq(byPayload.get("Megido Rock").system.attackElement, "almighty", "…as Almighty");
  ok(byPayload.get("Spyglass").system.reusable, "Spyglass is not discarded on use");
  const sacred = buildConsumableSystem(consumables.find(c => c.name === "Sacred Water"));
  eq(sacred.system.curesAilment ?? "none", "none",
    "Sacred Water's three cures cannot fit the one-ailment field…");
  eq(sacred.caveats.length, 1, "…and that is a caveat, not a silent drop");
} else {
  console.log("  SKIPPED: gear-stats.json absent — gear parity leg did not run.");
}

console.log(`\nsmt-rpg importer-parity tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 12)) console.log("  - " + f);
  if (failures.length > 12) console.log(`  ... +${failures.length - 12} more`);
  process.exit(1);
}
process.exit(0);
