// The Healing group is four different effects, not one (p.100, p.104).
// `node test/recovery-skills.test.mjs` (exit 0 pass, 1 fail).
//
// spec: a-cure-skill-cures-instead-of-healing
//
// Found 2026-07-28 by reading Ch.4 against the code. `SkillData` had no cure,
// revive or full-heal field of any kind, and `SMTItem#_heal` treated skillType
// "recovery" as "roll power, add HP". Every entry below therefore did the wrong
// thing rather than nothing — which is why it produced no symptom: a heal card
// posting after Patra looks like Patra working.
//
//   Patra, Me Patra, Mutudi, Posumudi, Paraladi, Petradi   healed instead of curing
//   Recarm, Samarecarm                                     healed a corpse, never revived it
//   Recarmdra                                              healed, never killed the caster
//   Prayer                                                 healed, cleared nothing
//
// The machinery already existed one file away on ConsumableData — a Dis-Poison item
// could cure what the Posumudi spell could not.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { curedAilments, curesCurrent, recoveryPlan } =
  await import("../module/helpers/recovery.mjs");

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

// --- the schema can express a cure at all -----------------------------------
{
  ok(SMT.skillCureAll === "all", "the cure-everything sentinel is a named constant, not a literal");
}

// --- cure specs -------------------------------------------------------------
{
  eq(curedAilments("none"), [], "'none' cures nothing");
  eq(curedAilments(""), [], "an empty spec cures nothing");
  eq(curedAilments(null), [], "a null spec cures nothing");
  eq(curedAilments(undefined), [], "an undefined spec cures nothing");

  eq(curedAilments("poison"), ["poison"], "Posumudi clears Poison (p.100)");
  eq(curedAilments("mute"), ["mute"], "Mutudi clears Mute");
  eq(curedAilments("stun"), ["stun"], "Paraladi clears Stun");
  eq(curedAilments("stone"), ["stone"], "Petradi clears Stone");

  // Patra is the shape the consumable path could not express: a set of three.
  eq(curedAilments("restrain sleep panic"), ["restrain", "sleep", "panic"],
    "Patra clears exactly Restrain, Sleep and Panic (p.100)");
  eq(curedAilments("restrain, sleep, panic"), ["restrain", "sleep", "panic"],
    "commas separate as well as spaces");
  eq(curedAilments("  SLEEP   Restrain  "), ["restrain", "sleep"],
    "case and padding do not change the set");
  eq(curedAilments("sleep sleep sleep"), ["sleep"], "a repeated key is not a repeated cure");

  // Order is the p.68 priority order regardless of how the spec was written.
  eq(curedAilments("panic restrain sleep"), ["restrain", "sleep", "panic"],
    "the returned set is in the book's priority order, not the author's typing order");

  // An unknown key is dropped, not passed through.
  eq(curedAilments("bogus"), [], "an unknown ailment cures nothing rather than becoming a key");
  eq(curedAilments("poison bogus"), ["poison"], "one bad key does not poison the whole spec");

  // Death and Curse are not in the common slot and are never cleared this way:
  // Curse only ends at a Fountain of Life (p.67), Death needs revival (p.68).
  eq(curedAilments("curse"), [], "Curse is not curable by a Remedy skill (p.67)");
  eq(curedAilments("death"), [], "Death is not an ailment a cure clears — that is revival");
  ok(!curedAilments("all").includes("curse"), "'all' does not reach Curse");
  ok(!curedAilments("all").includes("death"), "'all' does not reach Death");
  eq(curedAilments("all").length, 11, "'all' covers the eleven common ailments (p.68)");
}

// --- does this cure clear what the target is carrying? ----------------------
{
  ok(curesCurrent("restrain sleep panic", "sleep"), "Patra clears a sleeping ally");
  ok(!curesCurrent("restrain sleep panic", "poison"), "Patra does not clear Poison");
  ok(curesCurrent("all", "poison"), "Prayer-style 'all' clears Poison");
  ok(!curesCurrent("all", "none"), "a healthy target has nothing to clear");
  ok(!curesCurrent("none", "sleep"), "a skill with no cure clears nothing");
  ok(!curesCurrent("all", null), "a null ailment is not cleared");
}

// --- the whole plan, skill by skill off p.100 and p.104 ---------------------
{
  // Dia / Diarama: heal by power.
  eq(recoveryPlan({ power: 10 }),
    { heals: "power", cures: [], revives: false, reviveFull: false, selfKO: false },
    "Dia heals by total Power");

  // Diarahan / Mediarahan: heal in full.
  eq(recoveryPlan({ healFull: true }),
    { heals: "full", cures: [], revives: false, reviveFull: false, selfKO: false },
    "Diarahan restores all HP");

  // Patra: cures, and heals NOTHING. This is the assertion the old code fails.
  eq(recoveryPlan({ curesAilment: "restrain sleep panic" }),
    { heals: "none", cures: ["restrain", "sleep", "panic"], revives: false, reviveFull: false, selfKO: false },
    "ESCAPE: Patra cures and does not heal");
  eq(recoveryPlan({ curesAilment: "poison" }).heals, "none",
    "ESCAPE: Posumudi cures and does not heal");
  eq(recoveryPlan({ curesAilment: "stone" }).cures, ["stone"],
    "Petradi clears Stone — which now matters, because Stone can shatter");

  // Recarm: revives, then restores by power. Samarecarm: revives in full.
  eq(recoveryPlan({ revive: true, power: 10 }),
    { heals: "power", cures: [], revives: true, reviveFull: false, selfKO: false },
    "ESCAPE: Recarm revives and then restores by Power");
  eq(recoveryPlan({ revive: true, reviveFull: true, healFull: true }),
    { heals: "full", cures: [], revives: true, reviveFull: true, selfKO: false },
    "ESCAPE: Samarecarm revives in full");
  ok(!recoveryPlan({ reviveFull: true }).reviveFull,
    "reviveFull without revive is not a revival");

  // Recarmdra: everyone up, caster down.
  eq(recoveryPlan({ healFull: true, selfKO: true }),
    { heals: "full", cures: [], revives: false, reviveFull: false, selfKO: true },
    "ESCAPE: Recarmdra restores all allies and kills the caster");

  // Prayer (p.104): full HP and every ailment but Fly.
  {
    const prayer = recoveryPlan({ healFull: true, curesAilment: "all" });
    eq(prayer.heals, "full", "Prayer restores all HP");
    ok(prayer.cures.includes("poison") && prayer.cures.includes("stone"),
      "Prayer clears the common ailments");
  }

  // A skill that declares nothing at all still heals — that is the old default and
  // the majority of the group, so it must not regress.
  eq(recoveryPlan({}).heals, "power", "a bare recovery skill still heals by Power");
  eq(recoveryPlan().heals, "power", "a missing system object does not throw");

  // A cure that ALSO carries potency heals as well; the book has no such entry
  // today, but the shape has to be expressible rather than silently dropped.
  const both = recoveryPlan({ curesAilment: "poison", power: 20 });
  eq(both.heals, "power", "a cure that also carries potency still heals");
  eq(both.cures, ["poison"], "and still cures");
}

console.log(`\nsmt-rpg recovery-skills tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 25)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
