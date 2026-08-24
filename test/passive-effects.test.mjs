// Mechanical passives from the p.109-110 tables.
// `node test/passive-effects.test.mjs` (exit 0 pass, 1 fail).
//
// spec: printed-passives-have-mechanical-effect
// spec: a-counterattack-is-offered-not-taken
//
// Before 2026-07-28 the registry held nine entries — the six Amplify skills, Might,
// Sure Shot and Powerful Strikes — against roughly twenty-five printed passives.
// Everything else resolved to "none": the skill sat on the sheet, named itself
// correctly, and did nothing.
//
// As of 2026-08-15: 26 named entries plus the 40 generated Affinity Changers. The
// reaction passives landed 2026-07-28; Drain Attack, Attack All, Item Pro and Luck
// Smiles landed today. FOUR remain unwired and the reason differs per passive —
// Mind's Eye and Lucky Find are downstream of lane 4 (there is no ambush check and no
// Item Acquisition table), while Good Instincts and Once A Snake have no mechanical
// surface at all. GAUNTLET.md §5 carries the table; each is asserted null below,
// because the spec's second clause is that a gap must resolve to NOTHING rather than
// to an adjacent entry.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const {
  resolvePassiveEffect, passiveMultiplierBonuses, hasMightEffect, shootTnBonus,
  dodgeTnBonus, powerDiceFor, elementBoosts, hasEndureEffect, combatEndRecovery, endureApplies,
  counterEffect, counterTriggers, affinityOverrides, betterAffinity,
  drainOnStrike, attackAllApplies, itemPowerDice, nullifyAttackEffect
} = await import("../module/helpers/passives.mjs");
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

const R = SMT.passiveEffects;
// A skill authored only by name — the corpus path, and the one that used to fall through.
const named = name => ({ name, system: { passiveEffect: "none" } });
const keyed = key => ({ name: "(renamed by a player)", system: { passiveEffect: key } });

// --- every printed name the registry claims actually resolves -----------------
{
  const printed = [
    "Life Bonus", "Life Gain", "Life Surge", "Mana Bonus", "Mana Gain", "Mana Surge",
    "Might", "Sure Shot", "Powerful Strikes",
    "Powerful Spells", "Expert Dodge", "Fire Boost", "Ice Boost", "Elec Boost",
    "Force Boost", "Life Aid", "Mana Aid", "Victory Cry", "Endure",
    "Counter", "Retaliate", "Avenge",
    // Wired 2026-08-15. These four were the mechanically-implementable half of the
    // eight this suite used to pin as gaps.
    "Drain Attack", "Attack All", "Item Pro", "Luck Smiles"
  ];
  for (const name of printed) {
    ok(resolvePassiveEffect(named(name), R), `"${name}" resolves to a registry entry`);
  }
  eq(printed.length, 26, "twenty-six printed passives are wired");

  // Case and padding are how a corpus row actually arrives.
  ok(resolvePassiveEffect({ name: "  fire boost ", system: {} }, R), "name matching ignores case and padding");

  // The four that remain unwired, and the spec's second clause is why they are asserted
  // rather than merely absent: an unimplemented passive must resolve to NOTHING, never
  // to an adjacent entry. Two are blocked on lane 4 (no ambush check, no Item
  // Acquisition table) and two have no mechanical surface to bonus at all.
  eq(resolvePassiveEffect(named("Mind's Eye"), R), null,
    "Mind's Eye is honestly unresolved — no awareness check exists to bonus (lane 4)");
  eq(resolvePassiveEffect(named("Lucky Find"), R), null,
    "Lucky Find is honestly unresolved — the Item Acquisition table is not imported (lane 4)");
  eq(resolvePassiveEffect(named("Good Instincts"), R), null,
    "Good Instincts is honestly unresolved — the system has no 'notice' action");
  eq(resolvePassiveEffect(named("Once A Snake"), R), null,
    "ESCAPE: Once A Snake is honestly unresolved — 'learn something useful' is GM fiat, "
    + "and resolving it to the neighbouring Luck Smiles (same page, same 1/scenario "
    + "wording) is exactly the adjacent-match the spec forbids");
}

// --- the forty Affinity Changers (p.109) ------------------------------------
// Ten elements x four ratings. Every one reads "Gain <rating> against <element>
// attacks", and before 2026-07-28 not one of them could touch system.affinities.
{
  // Driven by a LITERAL list, not by SMT.affinityChangeElements. Reading the config
  // value under test would mean an empty config produced an empty loop and 120
  // assertions that quietly never ran — which is exactly what happened the first
  // time this was mutation-proved. A shrunk config must turn assertions RED, not
  // make them disappear.
  const ELEMENTS = ["phys", "fire", "ice", "elec", "force", "mind", "nerve", "ruin", "dark", "light"];
  eq(SMT.affinityChangeElements.slice().sort(), ELEMENTS.slice().sort(),
    "the config's element list is exactly the ten the p.109 tables print");
  ok(!SMT.affinityChangeElements.includes("almighty"), "Almighty has no affinity changer (p.109)");
  for (const junk of ["recovery", "support", "none"]) {
    ok(!SMT.affinityChangeElements.includes(junk), `${junk} is not a damage element and gets no changer`);
  }

  const changers = Object.values(R).filter(e => e.kind === "affinityChange");
  eq(changers.length, 40, "ESCAPE: forty Affinity Changer skills are wired");

  // Every printed name resolves, in the book's asymmetric naming.
  for (const el of ELEMENTS) {
    const D = el[0].toUpperCase() + el.slice(1);
    for (const [printed, rating] of [
      [`Anti-${D}`, "strong"], [`Null ${D}`, "null"], [`${D} Drain`, "drain"], [`${D} Repel`, "repel"]
    ]) {
      const r = resolvePassiveEffect(named(printed), R);
      ok(r, `"${printed}" resolves`);
      eq(r?.entry?.rating, rating, `"${printed}" grants ${rating}`);
      eq(r?.entry?.element, el, `"${printed}" targets ${el}`);
    }
  }

  // Every entry points at a real element and a real rating, resolved from CONFIG.
  for (const e of changers) {
    ok(e.element in SMT.elements, `${e.legacyNames[0]} names a real element`);
    ok(e.rating in SMT.affinityRatings, `${e.legacyNames[0]} names a real rating`);
  }
}

// --- p.65's ladder decides conflicts ----------------------------------------
{
  eq(SMT.affinityPriority, ["repel", "drain", "null", "strong", "weak", "normal"],
    "the ladder is Repel > Drain > Null > Strong > Weak, with normal below all (p.65)");

  eq(betterAffinity("normal", "strong"), "strong", "Anti-X upgrades an unmodified affinity");
  eq(betterAffinity("weak", "strong"), "strong", "Anti-X beats a printed Weak");
  eq(betterAffinity("repel", "strong"), "repel", "ESCAPE: Anti-X never downgrades a printed Repel");
  eq(betterAffinity("drain", "null"), "drain", "Drain outranks Null");
  eq(betterAffinity("null", "drain"), "drain", "and the argument order does not matter");
  eq(betterAffinity("strong", "weak"), "strong", "Strong outranks Weak");
  eq(betterAffinity("normal", "weak"), "weak", "Bael's Curse can make a normal target Weak (p.104)");
  eq(betterAffinity(undefined, "null"), "null", "an absent current rating is treated as unset");
  eq(betterAffinity("normal", "bogus"), "normal", "an unknown rating never wins");

  eq(affinityOverrides([named("Anti-Fire")], R), { fire: "strong" }, "one changer, one element");
  eq(affinityOverrides([named("Fire Repel"), named("Anti-Fire")], R), { fire: "repel" },
    "two changers on one element resolve by the ladder, not by order");
  eq(affinityOverrides([named("Anti-Fire"), named("Null Ice")], R), { fire: "strong", ice: "null" },
    "changers on different elements are independent");
  eq(affinityOverrides([], R), {}, "no changers, no overrides");
  eq(affinityOverrides([named("Might")], R), {}, "an unrelated passive grants no affinity");
}

// --- Counter / Retaliate / Avenge (p.96, p.110) -----------------------------
{
  eq(SMT.counter.chancePct, 50, "the counterattack chance is 50%");
  eq(SMT.counter.element, "phys", "it answers Phys attacks only");

  eq(counterEffect([named("Counter")], R), { id: "counter", multiplier: 1 }, "ESCAPE: Counter strikes back at normal damage");
  eq(counterEffect([named("Retaliate")], R), { id: "retaliate", multiplier: 2 }, "ESCAPE: Retaliate doubles the damage dealt");
  eq(counterEffect([named("Avenge")], R), { id: "avenge", multiplier: 3 }, "ESCAPE: Avenge triples it");
  eq(counterEffect([], R), null, "no passive, no counterattack");
  eq(counterEffect([named("Might")], R), null, "an unrelated passive grants no counterattack");

  // They are one power-up chain, so holding several is the best one, not all of them.
  eq(counterEffect([named("Counter"), named("Avenge")], R), { id: "avenge", multiplier: 3 },
    "the highest tier wins rather than stacking");
  eq(counterEffect([named("Avenge"), named("Counter")], R), { id: "avenge", multiplier: 3 },
    "and order does not matter");

  // What provokes one.
  ok(counterTriggers({ element: "phys" }), "a Phys hit provokes a counterattack");
  for (const el of ["fire", "ice", "elec", "force", "light", "dark", "mind", "nerve", "ruin", "almighty"]) {
    ok(!counterTriggers({ element: el }), `a ${el} hit does not provoke one (p.96)`);
  }
  ok(!counterTriggers({ element: "phys", dodged: true }), "a dodged attack was not a hit");
  // p.70: the free strikes a fumbled flee hands out "cannot trigger the Counter skill".
  ok(!counterTriggers({ element: "phys", suppressed: true }),
    "a suppressed hit does not provoke one — p.70's fumbled-flee strikes, and a counterattack itself");
  ok(!counterTriggers({}), "an absent element provokes nothing");
  ok(!counterTriggers(), "the argument is optional");
}

// --- Retaliate/Avenge multiply the DAMAGE, not the power --------------------
// p.110 says "Damage dealt is doubled", so the multiplier lands after resistance —
// unlike the critical multiplier (p.59), which the book applies to total power.
{
  const base = { rawPower: 40, affinity: "normal", resistance: 10, isCritical: false };
  eq(calculateDamage({ ...base }).finalDamage, 30, "control: 40 - 10");
  eq(calculateDamage({ ...base, finalMultiplier: 2 }).finalDamage, 60,
    "Retaliate doubles (40-10), not (40x2)-10");
  eq(calculateDamage({ ...base, finalMultiplier: 3 }).finalDamage, 90, "Avenge triples the same way");
  eq(calculateDamage({ ...base, finalMultiplier: 1 }).finalDamage, 30, "a multiplier of 1 changes nothing");

  // Resistance that already ate the hit leaves nothing to multiply.
  eq(calculateDamage({ rawPower: 5, affinity: "normal", resistance: 10, isCritical: false, finalMultiplier: 3 }).finalDamage,
    0, "tripling zero is still zero — Avenge cannot revive a fully-resisted hit");

  // Absolutes still short-circuit ahead of it.
  ok(calculateDamage({ ...base, affinity: "null", finalMultiplier: 3 }).isNull,
    "a Null affinity ends the calculation before the counter multiplier");
  ok(calculateDamage({ ...base, affinity: "drain", finalMultiplier: 3 }).isDrain,
    "a Drain affinity likewise");
}

// --- Powerful Spells / Powerful Strikes are scoped -------------------------
{
  eq(powerDiceFor([named("Powerful Strikes")], R, "physical"), ["1d10"], "Powerful Strikes adds a die to strikes");
  eq(powerDiceFor([named("Powerful Strikes")], R, "magical"), [], "ESCAPE: it does NOT add one to magic");
  eq(powerDiceFor([named("Powerful Spells")], R, "magical"), ["1d10"], "ESCAPE: Powerful Spells adds a die to magic");
  eq(powerDiceFor([named("Powerful Spells")], R, "physical"), [], "and not to strikes");
  eq(powerDiceFor([named("Powerful Strikes"), named("Powerful Spells")], R, "physical"), ["1d10"],
    "holding both keeps each on its own side");
  eq(powerDiceFor([], R, "physical"), [], "no passives, no dice");
  eq(powerDiceFor([named("Might")], R, "physical"), [], "Might is not a power die");
  // Default scope is physical, which is what the single pre-scope entry meant.
  eq(powerDiceFor([named("Powerful Strikes")], R), ["1d10"], "the default scope is physical");
}

// --- elemental Boosts -------------------------------------------------------
{
  eq(elementBoosts([named("Fire Boost")], R), { fire: 1.5 }, "ESCAPE: Fire Boost multiplies Fire power by 1.5");
  eq(elementBoosts([named("Ice Boost")], R), { ice: 1.5 }, "Ice Boost");
  eq(elementBoosts([named("Elec Boost")], R), { elec: 1.5 }, "Elec Boost");
  eq(elementBoosts([named("Force Boost")], R), { force: 1.5 }, "Force Boost");
  eq(elementBoosts([named("Fire Boost"), named("Ice Boost")], R), { fire: 1.5, ice: 1.5 },
    "two Boosts cover two elements independently");

  // Duplicates must not compound into 2.25x.
  eq(elementBoosts([named("Fire Boost"), named("Fire Boost")], R), { fire: 1.5 },
    "a duplicated Boost does not stack");

  eq(elementBoosts([], R), {}, "no Boost, no multiplier");
  eq(elementBoosts([named("Might")], R), {}, "an unrelated passive contributes no boost");
  // The book prints Boosts for four elements only — no Light/Dark/Almighty Boost exists.
  {
    const all = elementBoosts(
      ["Fire Boost", "Ice Boost", "Elec Boost", "Force Boost"].map(named), R);
    eq(Object.keys(all).sort(), ["elec", "fire", "force", "ice"],
      "exactly four elements are boostable (p.110)");
  }
}

// --- Expert Dodge -----------------------------------------------------------
{
  eq(dodgeTnBonus([named("Expert Dodge")], R), 5, "ESCAPE: Expert Dodge is +5% to the dodge TN");
  eq(dodgeTnBonus([], R), 0, "no passive, no dodge bonus");
  eq(dodgeTnBonus([named("Sure Shot")], R), 0, "Sure Shot moves the Shoot TN, not the dodge TN");
  eq(shootTnBonus([named("Expert Dodge")], R), 0, "and Expert Dodge does not move the Shoot TN");
  eq(shootTnBonus([named("Sure Shot")], R), 10, "Sure Shot is unchanged at +10%");
}

// --- combat-end recovery ----------------------------------------------------
{
  eq(combatEndRecovery([named("Life Aid")], R), { hpPct: 20, mpPct: 0 }, "ESCAPE: Life Aid restores 20% max HP");
  eq(combatEndRecovery([named("Mana Aid")], R), { hpPct: 0, mpPct: 20 }, "ESCAPE: Mana Aid restores 20% max MP");
  eq(combatEndRecovery([named("Victory Cry")], R), { hpPct: 100, mpPct: 100 }, "ESCAPE: Victory Cry restores both in full");
  eq(combatEndRecovery([named("Life Aid"), named("Mana Aid")], R), { hpPct: 20, mpPct: 20 },
    "Life Aid and Mana Aid cover one pool each");
  eq(combatEndRecovery([named("Life Aid"), named("Victory Cry")], R), { hpPct: 100, mpPct: 100 },
    "the two do not sum to 120% — highest of each wins");
  eq(combatEndRecovery([], R), { hpPct: 0, mpPct: 0 }, "no passive, no recovery");
}

// --- Endure -----------------------------------------------------------------
{
  ok(hasEndureEffect([named("Endure")], R), "ESCAPE: Endure is recognised");
  ok(!hasEndureEffect([named("Might")], R), "Might is not Endure");
  ok(!hasEndureEffect([], R), "no passives, no Endure");

  ok(endureApplies(true, { ailment: "none", alreadyUsed: false }), "Endure fires on a healthy character");
  ok(!endureApplies(true, { ailment: "none", alreadyUsed: true }), "Endure is once per combat (p.110)");
  ok(!endureApplies(true, { ailment: "stone" }), "ESCAPE: Endure has no effect when Stoned (p.110)");
  ok(endureApplies(true, { ailment: "freeze" }), "every other ailment leaves Endure working");
  ok(endureApplies(true, { ailment: "poison" }), "Poison does not block Endure");
  ok(!endureApplies(false, {}), "no Endure passive, no save");
  ok(endureApplies(true), "the options argument is optional");
  eq(SMT.endure.survivesAt, 1, "Endure leaves exactly 1 HP");
}

// --- the pre-existing entries are untouched ---------------------------------
{
  eq(passiveMultiplierBonuses([named("Life Surge")], R), { hpBonus: 3, mpBonus: 0 }, "Life Surge still +3 HP multiplier");
  eq(passiveMultiplierBonuses([named("Life Bonus"), named("Life Surge")], R), { hpBonus: 3, mpBonus: 0 },
    "amplify passives still take the max rather than stacking");
  ok(hasMightEffect([named("Might")], R), "Might still resolves");
  ok(hasMightEffect([keyed("might")], R), "an explicitly keyed passive still wins over the name");
}

// --- the four wired 2026-08-15 (p.110) --------------------------------------
{
  const drain = [named("Drain Attack")];

  // Drain Attack (p.96): a basic strike recovers a quarter of the damage dealt.
  eq(drainOnStrike(drain, R, { hpDealt: 40, isBasicStrike: true }), 10, "a quarter of the loss");
  eq(drainOnStrike(drain, R, { hpDealt: 7, isBasicStrike: true }), 1,
    "rounding is DOWN — a drain is a bonus, and rounding a bonus up heals off a 1-damage poke");
  eq(drainOnStrike(drain, R, { hpDealt: 3, isBasicStrike: true }), 0, "…all the way to nothing");
  eq(drainOnStrike(drain, R, { hpDealt: 40, isBasicStrike: false }), 0,
    "ESCAPE: 'basic strike' is narrower than 'physical attack' — a Phys SKILL drains nothing");
  eq(drainOnStrike(drain, R, { hpDealt: 0, isBasicStrike: true }), 0, "a hit that dealt nothing drains nothing");
  eq(drainOnStrike(drain, R, { hpDealt: -9, isBasicStrike: true }), 0, "…and a negative cannot pay out");
  eq(drainOnStrike([], R, { hpDealt: 40, isBasicStrike: true }), 0, "no passive, no drain");
  eq(drainOnStrike([named("Drain Attack"), named("Drain Attack")], R, { hpDealt: 40, isBasicStrike: true }), 10,
    "two copies do not compound — the Amplify group's 'similar abilities do not stack'");

  const all = [named("Attack All")];
  ok(attackAllApplies(all, R, { isBasicStrike: true }), "basic strikes widen to all enemies");
  ok(!attackAllApplies(all, R, { isBasicStrike: true, isCounter: true }),
    "ESCAPE: p.96 — 'Even if you have the Attack All skill, it may not be applied to "
    + "this counterattack'");
  ok(!attackAllApplies(all, R, { isBasicStrike: false }), "a skill is not a basic strike");
  ok(!attackAllApplies([], R, { isBasicStrike: true }), "no passive, no widening");

  eq(itemPowerDice([named("Item Pro")], R), ["1d10"], "Item Pro adds a die to an item's power roll");
  eq(itemPowerDice([], R), [], "no passive, no die");
  eq(powerDiceFor([named("Item Pro")], R, "physical"), [],
    "ESCAPE: Item Pro's die is its OWN kind — folding it into powerDie would have "
    + "handed it to every physical attack…");
  eq(powerDiceFor([named("Item Pro")], R, "magical"), [], "…and to every spell");

  eq(nullifyAttackEffect([named("Luck Smiles")], R),
    { id: "luckSmiles", period: "scenario", count: 1, copies: 1 },
    "Luck Smiles is one scenario use");
  eq(nullifyAttackEffect([named("Luck Smiles"), named("Luck Smiles")], R).copies, 2,
    "p.110: 'may be learned multiple times, allowing you to use it an additional time "
    + "per scenario each' — copies is exactly what useBudget multiplies by");
  eq(nullifyAttackEffect([], R), null, "no passive, no nullify");
  eq(nullifyAttackEffect([named("Endure")], R), null,
    "ESCAPE: Endure is the other survive-a-hit passive and is NOT this one — it leaves "
    + "you at 1 HP once per combat, where Luck Smiles voids the attack once per scenario");
}

console.log(`\nsmt-rpg passive-effects tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 25)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
