// Combining affinity ratings across axes (p.65).
// `node test/affinity-axes.test.mjs` (exit 0 pass, 1 fail).
//
// spec: affinity-ratings-stack-across-axes
//
// A demon can hold a rating against the ELEMENT of an attack, against MAGIC as a
// category, and against AILMENT attacks as a category. The book, verbatim:
//
//   "Skills may alter one's affinity ratings, and when they do, the following order
//    is applied: Repel > Drain > Null > Strong > Weak (with Repel having the
//    highest priority)."
//
//   "Weak: Damage and ailment effect rate are both doubled."
//   "Strong: Damage and ailment effect rate are both halved."
//
//   "Exception: Ailment Attacks vs. an Ailment Strong/Weak/Null affinity. These
//    affinity ratings only have an effect on the ailment effect rate and do not have
//    any influence on the damage part. Consider them to be a separate kind of
//    affinity rating."
//
// And the worked example on p.65: a demon "weak to Ice, Magic, and Ailments"
// critically hit by a Mabufu spell that also fumbles its dodge takes a 32x bonus to
// the effect hit rate — 2(Ice) x 2(Magic) x 2(Ailment) x 2(crit) x 2(fumble). So
// weak/strong ratings MULTIPLY across axes; the absolutes resolve by priority.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { affinityOutcome, calculateDamage } = await import("../module/helpers/damage.mjs");

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

// --- affinityOutcome: one place that knows how ratings combine -------------
{
  eq(affinityOutcome([]), { absolute: null, multiplier: 1 }, "no ratings is neutral");
  eq(affinityOutcome(["normal"]), { absolute: null, multiplier: 1 }, "normal is neutral");
  eq(affinityOutcome(["weak"]), { absolute: null, multiplier: 2 }, "weak doubles");
  eq(affinityOutcome(["strong"]), { absolute: null, multiplier: 0.5 }, "strong halves");

  // The p.65 example: the weak ratings multiply rather than one winning.
  eq(affinityOutcome(["weak", "weak"]), { absolute: null, multiplier: 4 }, "two weaks multiply to 4x");
  eq(affinityOutcome(["weak", "weak", "weak"]), { absolute: null, multiplier: 8 },
    "three weaks multiply to 8x — the Ice/Magic/Ailment case");
  eq(affinityOutcome(["strong", "strong"]), { absolute: null, multiplier: 0.25 }, "two strongs quarter");
  eq(affinityOutcome(["weak", "strong"]), { absolute: null, multiplier: 1 }, "weak and strong cancel");

  // Absolutes resolve by the printed priority, and outrank weak/strong entirely.
  eq(affinityOutcome(["null", "weak"]).absolute, "null", "an absolute outranks weak");
  eq(affinityOutcome(["weak", "null"]).absolute, "null", "order of arguments does not matter");
  eq(affinityOutcome(["null", "drain"]).absolute, "drain", "Drain outranks Null");
  eq(affinityOutcome(["drain", "repel"]).absolute, "repel", "Repel outranks Drain");
  eq(affinityOutcome(["repel", "null", "drain"]).absolute, "repel", "Repel is highest of all");
  eq(affinityOutcome(["strong", "repel"]).absolute, "repel", "Repel outranks Strong");

  // Hostile / unknown values are ignored rather than throwing.
  eq(affinityOutcome(["bogus", "weak"]), { absolute: null, multiplier: 2 }, "unknown ratings are ignored");
  eq(affinityOutcome([null, undefined, "weak"]), { absolute: null, multiplier: 2 }, "null entries are ignored");
}

// --- calculateDamage with a Magic-category rating --------------------------
// Magic is an ordinary affinity rating that happens to apply to magical attacks, so
// it affects damage. (Ailment does NOT — see the exception quoted above.)
{
  const base = { rawPower: 100, resistance: 0, isCritical: false };

  eq(calculateDamage({ ...base, affinity: "normal" }).finalDamage, 100, "neutral is unchanged");
  eq(calculateDamage({ ...base, affinity: "weak" }).finalDamage, 200, "weak to the element doubles");
  eq(calculateDamage({ ...base, affinity: "normal", magicAffinity: "weak" }).finalDamage, 200,
    "weak to Magic doubles a magical attack");

  // Both axes weak: the p.65 stacking, on the damage side.
  eq(calculateDamage({ ...base, affinity: "weak", magicAffinity: "weak" }).finalDamage, 400,
    "weak to the element AND to Magic is 4x");
  eq(calculateDamage({ ...base, affinity: "strong", magicAffinity: "strong" }).finalDamage, 25,
    "strong on both axes quarters");
  eq(calculateDamage({ ...base, affinity: "weak", magicAffinity: "strong" }).finalDamage, 100,
    "weak element and strong Magic cancel");

  // Absolutes on either axis win outright.
  ok(calculateDamage({ ...base, affinity: "normal", magicAffinity: "null" }).isNull,
    "Null Magic nullifies a magical attack");
  ok(calculateDamage({ ...base, affinity: "weak", magicAffinity: "null" }).isNull,
    "Null Magic beats a weak element rating");
  ok(calculateDamage({ ...base, affinity: "normal", magicAffinity: "repel" }).isRepel,
    "Repel Magic reflects");
  ok(calculateDamage({ ...base, affinity: "null", magicAffinity: "repel" }).isRepel,
    "Repel outranks Null across axes");
  ok(calculateDamage({ ...base, affinity: "normal", magicAffinity: "drain" }).isDrain,
    "Drain Magic heals the target");

  // A physical attack must ignore the Magic rating entirely.
  eq(calculateDamage({ ...base, affinity: "normal", magicAffinity: "weak", isPhysicalAttack: true }).finalDamage,
    100, "a physical attack ignores the Magic axis");
  eq(calculateDamage({ ...base, affinity: "weak", magicAffinity: "null", isPhysicalAttack: true }).finalDamage,
    200, "Null Magic does not protect against a physical attack");

  // Resistance still applies after affinity (p.65), and crit still skips it.
  eq(calculateDamage({ rawPower: 100, affinity: "weak", magicAffinity: "weak", resistance: 50, isCritical: false }).finalDamage,
    350, "resistance is subtracted after the stacked multiplier");
  eq(calculateDamage({ rawPower: 100, affinity: "weak", magicAffinity: "weak", resistance: 50, isCritical: true }).finalDamage,
    400, "a critical skips resistance but keeps the multiplier");
}

// --- the Ailment axis must NOT touch damage --------------------------------
// "These affinity ratings only have an effect on the ailment effect rate and do not
// have any influence on the damage part." Asserted directly, because folding it in
// would be the obvious mistake.
{
  const base = { rawPower: 100, resistance: 0, isCritical: false };
  for (const rating of ["weak", "strong", "null", "drain", "repel"]) {
    eq(calculateDamage({ ...base, affinity: "normal", ailmentAffinity: rating }).finalDamage, 100,
      `Ailment "${rating}" leaves damage alone (p.65 exception)`);
  }
  ok(!calculateDamage({ ...base, affinity: "normal", ailmentAffinity: "null" }).isNull,
    "Null Ailment does not nullify damage");
  ok(!calculateDamage({ ...base, affinity: "normal", ailmentAffinity: "repel" }).isRepel,
    "Repel Ailment does not reflect damage");
}

// --- existing single-axis behaviour is unchanged ---------------------------
{
  const base = { rawPower: 40, resistance: 10, isCritical: false };
  eq(calculateDamage({ ...base, affinity: "normal" }).finalDamage, 30, "unchanged: normal minus resistance");
  eq(calculateDamage({ ...base, affinity: "weak" }).finalDamage, 70, "unchanged: weak then resistance");
  eq(calculateDamage({ ...base, affinity: "strong" }).finalDamage, 10, "unchanged: strong then resistance");
  ok(calculateDamage({ ...base, affinity: "null" }).isNull, "unchanged: null");
  ok(calculateDamage({ ...base, affinity: "drain" }).isDrain, "unchanged: drain");
  eq(calculateDamage({ ...base, affinity: "drain" }).drainedAmount, 30, "unchanged: drained amount");
  ok(calculateDamage({ ...base, affinity: "repel", attackerResistance: 5 }).isRepel, "unchanged: repel");
  eq(calculateDamage({ ...base, affinity: "repel", attackerResistance: 5 }).reflectedDamage, 35,
    "unchanged: reflect uses the attacker's resistance");
  eq(calculateDamage({ ...base, affinity: "weak", dodgeFumble: true }).finalDamage, 160,
    "unchanged: dodge fumble doubles and skips resistance");
}

console.log(`\nsmt-rpg affinity-axes tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 20)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
