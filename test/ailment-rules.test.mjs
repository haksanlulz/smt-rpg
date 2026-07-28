// Ailment and Curse rules the book prints as arithmetic (p.57, p.66-69).
// `node test/ailment-rules.test.mjs` (exit 0 pass, 1 fail).
//
// spec: frozen-combatants-lose-a-turn
// spec: stone-shatters-instead-of-critting
// spec: a-curse-widens-the-auto-fail-band
// spec: rerolling-into-success-rolls-the-ailment
//
// Three defects this suite was written against, all found by reading Ch.3 back
// against the code (2026-07-28):
//
//   1. Freeze and Shock were cleared unconditionally at the start of the victim's
//      turn, so they never cost a turn and their entries in cannotActAilments were
//      unreachable. p.66: "You may save against this ailment. Even if you fail this
//      save, you automatically recover from this ailment at the start of your NEXT
//      turn." A failed save costs the turn; the free recovery is the turn after.
//   2. Stone was modelled as a forced critical on an incoming Phys attack. p.66
//      gives it a 30% chance to shatter and die instead, plus a halving of damage
//      from every element that is not Phys, Force or Almighty.
//   3. Curse was stored and displayed but inert. p.57/p.67: it widens the automatic
//      failure range to 86-99, and a fumble is what inflicts it.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { turnStartPlan, canDodge, shatterPctFor, incomingDamageMultiplier, fumbledSaveResources, flyStatTotals } =
  await import("../module/helpers/ailments.mjs");
const { evaluatePercentile, cascadePlan } = await import("../module/helpers/checks.mjs");
const { calculateDamage } = await import("../module/helpers/damage.mjs");

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

// --- p.68 Save column ------------------------------------------------------
// Y for exactly six: Charm, Restrain, Freeze, Sleep, Panic, Shock. The prose on
// p.69 says the same thing the other way round — "Except for Mute, Stun, Poison,
// Curse, and Death" — but the table also reads N for Stone and Fly, and the table
// is the per-ailment statement, so it wins.
{
  for (const a of ["charm", "restrain", "freeze", "sleep", "panic", "shock"]) {
    ok(SMT.ailmentSave.eligible.includes(a), `${a} accepts a save (p.68 Save = Y)`);
  }
  for (const a of ["stone", "fly", "stun", "poison", "mute", "curse", "death"]) {
    ok(!SMT.ailmentSave.eligible.includes(a), `${a} accepts no save (p.68 Save = N)`);
  }
  eq(SMT.ailmentSave.eligible.length, 6, "six ailments and no others accept a save");
}

// --- Freeze / Shock: the failed save costs the turn -------------------------
// The whole point of the p.68 clause "Can only fail to save once; next turn
// automatic recovery" is that there IS a failure that costs something. An
// unconditional recovery at the first turn start makes the save free and the
// ailment cosmetic.
{
  for (const a of ["freeze", "shock"]) {
    eq(turnStartPlan(a, { saveFailed: false }), "save",
      `${a}: the first turn start offers a save, it does not hand the turn back`);
    eq(turnStartPlan(a, { saveFailed: true }), "autoRecover",
      `${a}: recovery is free only AFTER a save has been failed`);
  }

  // The four that never auto-recover keep offering a save every turn.
  for (const a of ["charm", "restrain", "sleep", "panic"]) {
    eq(turnStartPlan(a, { saveFailed: false }), "save", `${a} offers a save`);
    eq(turnStartPlan(a, { saveFailed: true }), "save",
      `${a} still only offers a save after a failure — it has no free recovery`);
  }

  for (const a of ["stone", "fly", "stun", "poison", "mute"]) {
    eq(turnStartPlan(a, { saveFailed: false }), "none", `${a} gets neither a save nor a recovery`);
    eq(turnStartPlan(a, { saveFailed: true }), "none", `${a} is unaffected by a stale save flag`);
  }

  eq(turnStartPlan("none"), "none", "an unafflicted combatant has no turn-start step");
  eq(turnStartPlan(""), "none", "an empty ailment is not a plan");
  eq(turnStartPlan(null), "none", "a null ailment is not a plan");
  eq(turnStartPlan(undefined), "none", "an undefined ailment is not a plan");

  // The regression that the fix exists for: Freeze and Shock are declared as
  // turn-forfeiting, and on the first turn start that branch must be reachable.
  for (const a of ["freeze", "shock"]) {
    ok(SMT.cannotActAilments.includes(a), `${a} forfeits the turn (p.66)`);
    ok(turnStartPlan(a, { saveFailed: false }) !== "autoRecover",
      `${a}: the forfeit branch is reachable on the first turn start`);
  }
}

// --- p.68 Dodge column ------------------------------------------------------
// N for Stone, Restrain, Freeze, Sleep and Shock. Stone's is easy to miss because
// it is the one of the five that can still take its own action.
{
  for (const a of ["stone", "restrain", "freeze", "sleep", "shock"]) {
    ok(!canDodge(a), `${a} cannot dodge (p.68 Dodge = N)`);
  }
  for (const a of ["fly", "stun", "charm", "poison", "mute", "none"]) {
    ok(canDodge(a), `${a} may still dodge (p.68 Dodge = Y)`);
  }
  ok(canDodge(null) && canDodge(undefined) && canDodge(""),
    "an absent ailment never removes the dodge");
}

// --- Stone: 30% shatter, NOT a forced critical ------------------------------
{
  ok(!SMT.critOnPhysAilments.includes("stone"),
    "Stone does not force a critical — p.66 gives it a shatter roll instead");
  for (const a of ["restrain", "freeze", "shock"]) {
    ok(SMT.critOnPhysAilments.includes(a), `${a} does force a critical on Phys (p.66)`);
  }
  eq(SMT.critOnPhysAilments.length, 3, "exactly three ailments force the critical");

  eq(shatterPctFor("stone", "phys"), 30, "a Phys hit on a Stoned target shatters 30% of the time");
  for (const el of ["fire", "ice", "elec", "force", "light", "dark", "mind", "nerve", "ruin", "almighty"]) {
    eq(shatterPctFor("stone", el), 0, `a ${el} hit does not shatter — the book says Phys`);
  }
  for (const a of ["restrain", "freeze", "shock", "fly", "none", null]) {
    eq(shatterPctFor(a, "phys"), 0, `${a} carries no shatter chance`);
  }
}

// --- Stone / Fly damage multipliers ----------------------------------------
// Stone: "You halve damage from all attacks that are not Phys, Force, or Almighty
// elements." Fly: "All damage received is doubled."
{
  for (const el of ["phys", "force", "almighty"]) {
    eq(incomingDamageMultiplier("stone", el), 1,
      `Stone does not halve ${el} — it is one of the three the book exempts`);
  }
  for (const el of ["fire", "ice", "elec", "light", "dark", "mind", "nerve", "ruin"]) {
    eq(incomingDamageMultiplier("stone", el), 0.5, `Stone halves incoming ${el}`);
  }

  for (const el of ["phys", "fire", "force", "almighty", "dark"]) {
    eq(incomingDamageMultiplier("fly", el), 2, `Fly doubles incoming ${el} without exception`);
  }

  for (const a of ["none", "charm", "poison", "restrain", null, undefined, ""]) {
    eq(incomingDamageMultiplier(a, "fire"), 1, `${a} does not scale incoming damage`);
  }
}

// --- the multiplier reaches the damage pipeline -----------------------------
// Folded in with the affinity multiplier so the whole product is floored once,
// which is the rounding the book asks for on p.53 ("do the multiplication first").
{
  const base = {
    rawPower: 31, affinity: "normal", resistance: 7,
    isCritical: false, isPhysicalAttack: false
  };

  eq(calculateDamage({ ...base }).finalDamage, 24, "control: 31 - 7 with no ailment");
  eq(calculateDamage({ ...base, incomingMultiplier: 0.5 }).finalDamage, 8,
    "Stone halving lands before resistance: floor(31/2) - 7");
  eq(calculateDamage({ ...base, incomingMultiplier: 2 }).finalDamage, 55,
    "Fly doubling lands before resistance: (31*2) - 7");

  // Stacked with a Weak rating it is one product and one floor, not two roundings.
  eq(calculateDamage({ ...base, affinity: "weak", incomingMultiplier: 0.5 }).finalDamage, 24,
    "weak x stone-halving = x1, floored once");
  eq(calculateDamage({ rawPower: 25, affinity: "strong", resistance: 0, isCritical: false, incomingMultiplier: 0.5 }).finalDamage, 6,
    "strong x stone-halving floors the whole product (25/4 = 6), not each step");

  // Null still short-circuits: no damage means nothing to scale.
  ok(calculateDamage({ ...base, affinity: "null", incomingMultiplier: 2 }).isNull,
    "a Null affinity still ends the calculation before any ailment scaling");
  eq(calculateDamage({ ...base, incomingMultiplier: 1 }).finalDamage, 24,
    "an explicit multiplier of 1 changes nothing");
  eq(calculateDamage({ ...base, incomingMultiplier: 0 }).finalDamage, 0,
    "a zero multiplier deals nothing rather than going negative");
}

// --- Curse widens the auto-fail band to 86-99 (p.57, p.67) ------------------
{
  eq(SMT.check.curseAutoFailMin, 86, "the Cursed auto-fail band opens at 86");
  eq(SMT.check.autoFailMin, 96, "the uncursed band still opens at 96");

  // The band only matters where the TN is high enough to have covered the roll.
  for (const roll of [86, 90, 95]) {
    ok(evaluatePercentile(roll, 99, { cursed: false }).isSuccess,
      `${roll} against a TN of 99 succeeds when not Cursed`);
    const c = evaluatePercentile(roll, 99, { cursed: true });
    ok(!c.isSuccess && c.cssClass === "auto-fail",
      `${roll} against a TN of 99 auto-fails when Cursed`);
  }
  ok(evaluatePercentile(85, 99, { cursed: true }).isSuccess,
    "85 is still under the Cursed band and still succeeds");

  // The two ends of the ladder are unchanged by Curse.
  ok(evaluatePercentile(100, 99, { cursed: true }).isFumble, "100 is a fumble, Cursed or not");
  ok(evaluatePercentile(1, 99, { cursed: true }).isCritical, "1 is a critical, Cursed or not");
  ok(evaluatePercentile(96, 99, { cursed: false }).cssClass === "auto-fail",
    "96 auto-fails without a Curse");

  // Curse does not touch the critical band.
  const critTn = 50;
  eq(evaluatePercentile(5, critTn, { cursed: true }).isCritical,
    evaluatePercentile(5, critTn, { cursed: false }).isCritical,
    "the critical threshold is unmoved by Curse");

  // Default is uncursed, so every existing call site keeps the 96 band.
  eq(evaluatePercentile(90, 99).cssClass, "success", "the cursed flag defaults off");
}

// --- Curse's per-action mishap rate ----------------------------------------
{
  // Optional-chained on purpose: a missing key must report as a failed assertion,
  // not throw and take the other 200 with it.
  eq(SMT.curse?.mishapPct, 30, "a Cursed character has a 30% chance of a mishap per action (p.67)");
}

// --- Fly flattens every stat but Agility (p.66) -----------------------------
// "All stats other than Agility are treated as though they are 1."
//
// OPERATOR RULING 2026-07-28 on the half the book leaves open: the flattening reaches
// TNs, base power, resistances and saves, but NOT the HP/MP pools. base-actor reads
// the pool stats before calling this, which is the whole reason it takes a totals
// object rather than mutating the actor.
{
  const full = { strength: 20, magic: 18, vitality: 16, agility: 14, luck: 12 };

  eq(flyStatTotals(full, "fly"),
    { strength: 1, magic: 1, vitality: 1, agility: 14, luck: 1 },
    "ESCAPE: Fly drops every stat but Agility to 1");
  eq(flyStatTotals(full, "fly").agility, 14, "Agility is the one exemption the book names");

  for (const a of ["none", "stone", "freeze", "poison", "charm", null, undefined, ""]) {
    eq(flyStatTotals(full, a), full, `${a} leaves the stats alone`);
  }

  // It returns a copy — a derived-data pass must not mutate its input.
  {
    const source = { ...full };
    flyStatTotals(source, "fly");
    eq(source, full, "the input object is not mutated");
  }

  // An unknown key is passed through rather than flattened, so a stat added later
  // cannot be silently zeroed by a rule that never mentioned it.
  eq(flyStatTotals({ ...full, courage: 9 }, "fly").courage, 9,
    "a stat the config does not know is left untouched");
  eq(flyStatTotals({}, "fly"), {}, "an empty totals object stays empty");
  eq(flyStatTotals(undefined, "fly"), {}, "a missing totals object does not throw");

  eq(SMT.fly.flattenedValue, 1, "the flattened value is 1 (p.66)");
  eq(SMT.fly.exemptStats, ["agility"], "Agility alone is exempt");
  eq(SMT.fly.damageMultiplier, 2, "and Fly still doubles incoming damage");
  ok(SMT.fly.exemptStats.every(s => s in SMT.stats), "the exempt list names real stats");
}

// --- p.58 Fumble Effect Chart, Save row -------------------------------------
// "The ailment remains, and your HP and MP are halved." Observed missing in play
// 2026-07-28: Shiva fumbled a Freeze save (roll 100 against a save TN of 275) and
// kept the ailment, correctly — but paid nothing for the fumble.
{
  eq(fumbledSaveResources({ hp: 100, mp: 40 }), { hp: 50, mp: 20 }, "a fumbled save halves both pools");
  eq(fumbledSaveResources({ hp: 1, mp: 1 }), { hp: 0, mp: 0 }, "halving rounds down, per p.53");
  eq(fumbledSaveResources({ hp: 7, mp: 3 }), { hp: 3, mp: 1 }, "odd pools round down");
  eq(fumbledSaveResources({ hp: 0, mp: 0 }), { hp: 0, mp: 0 }, "an empty pool stays empty");
  eq(fumbledSaveResources({ hp: -5, mp: -5 }), { hp: 0, mp: 0 }, "a negative pool never survives as negative");
  eq(fumbledSaveResources({}), { hp: 0, mp: 0 }, "missing pools do not become NaN");
}

// --- Fate Point cascade on an ailment-only skill ----------------------------
// REPORTED FROM PLAY 2026-07-28: "rerolling into success doesn't proc ailments roll
// chance like it should." Apsaras cast Lullaby (Sleep 70%, no power), rolled 85 vs a
// TN of 38, spent a Fate Point and rerolled a 1 — a critical success that produced
// nothing. The cascade was gated on `hasPowerRoll`, which an ailment-only skill never
// has, so the branch carrying its entire effect was unreachable from the Fate path.
{
  const lullaby = { hasPowerRoll: false, ailmentType: "sleep", ailmentRate: 70 };
  const agi = { hasPowerRoll: true, ailmentType: "none", ailmentRate: 0 };
  const bufu = { hasPowerRoll: true, ailmentType: "freeze", ailmentRate: 20 };
  const inert = { hasPowerRoll: false, ailmentType: "none", ailmentRate: 0 };

  // The escape, stated directly.
  eq(cascadePlan(lullaby, { oldSuccess: false, newSuccess: true }), "ailmentOnly",
    "ESCAPE: a reroll into success on an ailment-only skill rolls its ailment");

  // The branch it used to be confused with still works.
  eq(cascadePlan(agi, { oldSuccess: false, newSuccess: true }), "powerRoll",
    "a damaging skill still gets its power roll");
  eq(cascadePlan(bufu, { oldSuccess: false, newSuccess: true }), "powerRoll",
    "a damaging skill that ALSO inflicts still takes the power path, which carries the ailment onward");

  // A skill with neither has nothing to cascade to — the one case the old guard got right.
  eq(cascadePlan(inert, { oldSuccess: false, newSuccess: true }), "none",
    "a skill with no power and no ailment cascades to nothing");

  // The reverse direction is unchanged.
  for (const c of [lullaby, agi, bufu, inert]) {
    eq(cascadePlan(c, { oldSuccess: true, newSuccess: false }), "cancel",
      "a Fate Point that flips a success to a failure cancels the pending attacks");
    eq(cascadePlan(c, { oldSuccess: true, newSuccess: true }), "none",
      "an unchanged success cascades to nothing");
    eq(cascadePlan(c, { oldSuccess: false, newSuccess: false }), "none",
      "an unchanged failure cascades to nothing");
  }

  // A rate of 0 is not an ailment, whatever the type says.
  eq(cascadePlan({ hasPowerRoll: false, ailmentType: "sleep", ailmentRate: 0 }, { oldSuccess: false, newSuccess: true }),
    "none", "a declared ailment with a 0% rate is not rolled");
  eq(cascadePlan({ hasPowerRoll: false, ailmentType: "sleep" }, { oldSuccess: false, newSuccess: true }),
    "none", "a missing rate is not treated as a rate");

  // Flag payloads are author-forgeable; a junk one must not throw or invent work.
  for (const junk of [null, undefined, {}, { ailmentRate: "70" }]) {
    const p = cascadePlan(junk, { oldSuccess: false, newSuccess: true });
    ok(p === "none" || p === "ailmentOnly", `a malformed checkData (${JSON.stringify(junk)}) is handled, not thrown on`);
  }
}

console.log(`\nsmt-rpg ailment-rules tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 25)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
