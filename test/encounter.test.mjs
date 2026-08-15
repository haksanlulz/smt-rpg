// Encounter check, ambush and back attack (p.70-71).
// `node test/encounter.test.mjs` (exit 0 pass, 1 fail).
//
// spec: the-encounter-check-is-the-partys-roll-not-a-characters
//
// Rule as printed in the book; paraphrased here, see the page cite above.
//   Critical +2 · Success +1 · Failure -1 · Auto-Fail -2 · Fumble -3
//
//   +5 or more   The PCs back attack the enemy
//   +3 or +4     The PCs ambush the enemy
//   0 to +2      No particular advantage over the other
//   -3 to -1     The PCs get ambushed
//   -4 or less   The PCs are back attacked
//
// THE THING THIS SUITE IS SHAPED AROUND is that the result belongs to the PARTY. It is
// the only check in the system that does. One PC critting ambushes nobody; five PCs each
// scraping a success does. Writing it per-character and combining afterwards is how a
// +2 crit ends up applied five times, so the sum is its own function and the band lookup
// takes a sum rather than a roll.
//
// The band table gets an exhaustive integer sweep rather than five hand-picked examples.
// A hand-typed range table fails two ways — a hole where no band matches, and an overlap
// where two do — and neither is visible by reading it. The sweep asserts every integer
// from -20 to +20 lands in exactly one band, which is the property, not the samples.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const {
  ENCOUNTER_OUTCOMES, encounterValue, encounterSum, encounterEffect,
  surpriseTnModifier, isAggressor, initiativeTreatment, defenseless, backAttackShock,
  combatantSide, outcomeFromCheck
} = await import("../module/helpers/encounter.mjs");

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

// ------------------------------------------------------ one PC's contribution

eq(encounterValue("critical"), 2, "Critical is +2");
eq(encounterValue("success"), 1, "Success is +1");
eq(encounterValue("failure"), -1, "Failure is -1");
eq(encounterValue("autoFail"), -2, "Auto-Fail is -2");
eq(encounterValue("fumble"), -3, "Fumble is -3");
eq(encounterValue("nonsense"), 0,
  "ESCAPE: an unrecognised outcome contributes NOTHING — a check that did not happen "
  + "must not tilt the party's total in either direction");
eq(encounterValue(undefined), 0, "…and neither does a missing one");
eq(ENCOUNTER_OUTCOMES.length, 5, "five printed outcomes");
for (const o of ENCOUNTER_OUTCOMES) {
  ok(Object.hasOwn(SMT.encounter.values, o), `"${o}" has a printed value in CONFIG`);
}

// ------------------------------------------------------------- the party sum

eq(encounterSum(["critical", "critical", "success"]), 5, "two crits and a success is +5");
eq(encounterSum(["success", "success", "success", "success", "success"]), 5,
  "five bare successes reach +5 too — the party is the unit, not the best roller");
eq(encounterSum(["critical"]), 2,
  "ESCAPE: ONE critical is +2, which is 'no particular advantage' — a lone great roll "
  + "ambushes nobody, and applying it per-character is the mistake this pins");
eq(encounterSum(["fumble", "fumble"]), -6, "two fumbles is -6");
eq(encounterSum([]), 0, "an empty party is zero, not an error");
eq(encounterSum(null), 0, "…and so is no party at all");
eq(encounterSum(["critical", "fumble"]), -1, "positives and negatives cancel");

// -------------------------------------------------------- the printed bands

eq(encounterEffect(5), { id: "pcsBackAttack", side: "pcs", severity: "backAttack" },
  "+5 is the PCs back attacking");
eq(encounterEffect(99).id, "pcsBackAttack", "'or more' is open-ended");
eq(encounterEffect(4).id, "pcsAmbush", "+4 is a PC ambush");
eq(encounterEffect(3).id, "pcsAmbush", "…and so is +3");
eq(encounterEffect(2).id, "none", "+2 is no advantage");
eq(encounterEffect(0), { id: "none", side: null, severity: null }, "zero is no advantage");
eq(encounterEffect(-1).id, "pcsAmbushed", "-1 is the PCs getting ambushed");
eq(encounterEffect(-3).id, "pcsAmbushed", "…down to -3");
eq(encounterEffect(-4).id, "pcsBackAttacked", "-4 is the PCs being back attacked");
eq(encounterEffect(-99).id, "pcsBackAttacked", "'or less' is open-ended");

// The property, not the samples: every integer lands in exactly one band.
{
  let holes = 0;
  let overlaps = 0;
  for (let sum = -20; sum <= 20; sum++) {
    const matches = SMT.encounter.bands.filter(b =>
      (b.min === null || sum >= b.min) && (b.max === null || sum <= b.max));
    if (matches.length === 0) holes++;
    if (matches.length > 1) overlaps++;
  }
  eq(holes, 0, "ESCAPE: no integer falls through every band — a hole would silently "
    + "become 'no advantage' and look like a legitimate result");
  eq(overlaps, 0, "ESCAPE: no integer matches two bands — an overlap resolves by table "
    + "ORDER, which reads as intentional and is not");
}

// The two boundaries the printed table makes easy to fence-post.
eq(encounterEffect(3).severity, "ambush", "+3 ambushes…");
eq(encounterEffect(5).severity, "backAttack", "…and +5 back attacks, with +4 between");
eq(encounterEffect(-3).severity, "ambush", "-3 is still only an ambush…");
eq(encounterEffect(-4).severity, "backAttack", "…and -4 tips to a back attack");

// --------------------------------------------------------- surprise modifier

eq(surpriseTnModifier({ pcsPrepared: true }), 20, "PCs lying in wait: +20% to the TN");
eq(surpriseTnModifier({ demonsPrepared: true }), -20, "the demon side doing it: -20%");
eq(surpriseTnModifier({}), 0, "neither side prepared, no modifier");
eq(surpriseTnModifier({ pcsPrepared: true, demonsPrepared: true }), 0,
  "both sides prepared nets to zero — [inferred], the book prints only the two single "
  + "cases, and netting keeps the modifier a property of the situation rather than of "
  + "whichever side the GM mentioned first");
eq(surpriseTnModifier({ pcsPrepared: true }), SMT.encounter.surpriseTnBonus,
  "the step comes from CONFIG");

// -------------------------------------------------------------- who is which

const pcsAmbush = encounterEffect(3);
const pcsAmbushed = encounterEffect(-1);
const pcsBackAttacked = encounterEffect(-4);
const noAdvantage = encounterEffect(1);

ok(isAggressor(pcsAmbush, "pcs"), "on +3 the PCs are the aggressor");
ok(!isAggressor(pcsAmbush, "demons"), "…and the demons are not");
ok(isAggressor(pcsAmbushed, "demons"), "on -1 the demons are");
ok(!isAggressor(noAdvantage, "pcs"), "with no advantage nobody is the aggressor");
ok(!isAggressor(noAdvantage, "demons"), "…on either side");

// ------------------------------------------------------------- initiative

eq(initiativeTreatment(pcsAmbush, "pcs").bonus, "1d10",
  "the ambushing side gets +1d10 on initiative");
eq(initiativeTreatment(pcsAmbush, "demons"), { formula: SMT.encounter.initiativeFormula, bonus: null, flat: false },
  "the ambushed side rolls initiative normally");
eq(initiativeTreatment(pcsBackAttacked, "demons").bonus, "1d10",
  "a back attack gives the aggressor the same +1d10 — one axis, two magnitudes");
eq(initiativeTreatment(pcsBackAttacked, "pcs"),
  { formula: SMT.encounter.initiativeFlatFormula, bonus: null, flat: true },
  "ESCAPE: the back-attacked side's initiative is AGILITY ALONE — p.71 removes the "
  + "effect roll rather than penalising it, so this replaces the formula and does not "
  + "modify it");
ok(!initiativeTreatment(pcsBackAttacked, "pcs").formula.includes("d10"),
  "…and that means no die in it at all");
eq(initiativeTreatment(noAdvantage, "pcs").formula, SMT.encounter.initiativeFormula,
  "with no advantage both sides roll normally");

// ---------------------------------------------------- defenseless vs Shock

ok(defenseless(pcsAmbushed, "pcs"), "the ambushed side is defenseless in round one");
ok(!defenseless(pcsAmbushed, "demons"), "the ambushers are not");
ok(!defenseless(pcsBackAttacked, "pcs"),
  "ESCAPE: a BACK-attacked side is not ALSO defenseless — p.71 gives it Shock instead, "
  + "and stacking both would double a penalty the book states once");
ok(!defenseless(noAdvantage, "pcs"), "no advantage, nobody defenseless");

eq(backAttackShock(pcsBackAttacked, "pcs"), { ailment: "shock", ignoresAffinity: true },
  "the back-attacked side takes Shock");
ok(backAttackShock(pcsBackAttacked, "pcs").ignoresAffinity,
  "ESCAPE: 'This Shock ignores any affinity ratings that would nullify it' — routed "
  + "through the ordinary ailment path a Null Nerve demon would shrug it off, which is "
  + "the exact case the sentence exists to rule out");
eq(backAttackShock(pcsBackAttacked, "demons"), null, "the aggressor takes nothing");
eq(backAttackShock(pcsAmbushed, "pcs"), null, "an ambush inflicts no Shock");
eq(backAttackShock(noAdvantage, "pcs"), null, "no advantage, no Shock");
ok(SMT.encounter.backAttackAilment in SMT.ailments,
  "the Shock key is a real ailment, not a label");

// -------------------------------------------------- wiring (source, always runs)

const cfg = readFileSync(join(ROOT, "module/config.mjs"), "utf8");
ok(/SMT\.encounter\s*=/.test(cfg), "the encounter table lives in CONFIG, not in the helper");

// --------------------------------------------------------- side classification

// p.70 says "all PCs". Ownership decides that, not token disposition — a friendly NPC
// demon fighting alongside the party is not a PC and must not roll into the total.
eq(combatantSide({ hasPlayerOwner: true }), "pcs", "a player-owned actor is a PC");
eq(combatantSide({ hasPlayerOwner: false }), "demons", "an unowned one is not");
eq(combatantSide(null), "demons", "a missing actor is not a PC");
const src = readFileSync(join(ROOT, "module/helpers/encounter.mjs"), "utf8");
// Property ACCESS, not the word — the helper's own comment explains why disposition is
// the wrong signal here, and a bare word match flagged the explanation as the offence.
ok(!/\.disposition\b/.test(src),
  "ESCAPE: side is NOT read off token disposition — a friendly NPC demon shares the "
  + "party's disposition and would otherwise roll into the party's encounter total");

// ----------------------------------------------------- check outcome mapping

eq(outcomeFromCheck({ isFumble: true, isCritical: true }), "fumble",
  "a fumble outranks everything — a 100 is never a critical");
eq(outcomeFromCheck({ isCritical: true, isSuccess: true }), "critical", "a critical is a critical");
eq(outcomeFromCheck({ isSuccess: true }), "success", "a plain success");
eq(outcomeFromCheck({ result: 97 }), "autoFail",
  "96-99 is the auto-fail band, worth -2 rather than a failure's -1");
eq(outcomeFromCheck({ result: 50 }), "failure", "an ordinary miss is -1");
eq(outcomeFromCheck({ result: SMT.check.autoFailMin }), "autoFail", "the band edge reads from CONFIG");
eq(outcomeFromCheck({ result: SMT.check.autoFailMin - 1 }), "failure", "…and one below it does not");

// -------------------------------------------------- wiring (source, always runs)

ok(src.includes("runEncounterCheck") && src.includes("applyEncounterEffect"),
  "the roll and the application are separate entry points");
// Anchored on `await`, i.e. the CALL. Without it the regex matched the function's own
// `export async function applyEncounterEffect(combat, effect)` signature, so deleting
// the call left the suite green — the second time today a source grep has matched a
// declaration instead of a use.
ok(/await applyEncounterEffect\(combat, effect\)/.test(src),
  "ESCAPE: the roll path calls the SAME applier — p.70 lets a GM 'simply declare a "
  + "result', and a declared result must reach identical code to a rolled one");
ok(/system\.ailment.*shock\.ailment|"system\.ailment": shock\.ailment/.test(src),
  "back-attack Shock is written DIRECTLY, never through resolveAilment, whose first act "
  + "is the affinity check this sentence overrides");

const combatSrc = readFileSync(join(ROOT, "module/helpers/combat.mjs"), "utf8");
ok(/dodgeDenied[\s\S]{0,200}?defenseless/.test(combatSrc),
  "a defenseless combatant is denied the dodge — the whole mechanical cost of an ambush");

const entry = readFileSync(join(ROOT, "smt-rpg.mjs"), "utf8");
ok(/clearDefenseless\(actor\)/.test(entry),
  "ESCAPE: defenseless is cleared at the ambushed character's turn start — p.71's "
  + "sentence is circular read literally ('until they act', and they cannot act), and "
  + "without a clear the state would never end");
ok(/encounter-check/.test(entry), "the GM fires it from a combat-tracker control");
ok(!/Hooks\.on\("combatStart"/.test(entry) && !/runEncounterCheck\(combat\)\s*;?\s*\}\s*\)\s*;?\s*\/\/\s*auto/.test(entry),
  "…and NOT from a combat-start hook: p.70 gives the GM the say on whether a check "
  + "happens at all, so firing it is the decision");

console.log(`\nsmt-rpg encounter tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
