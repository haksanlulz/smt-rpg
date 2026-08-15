// Deadly Fury (p.108), Pinhole (p.106), Analyze (p.102), God's Curse (p.103).
// `node test/named-skills.test.mjs` (exit 0 pass, 1 fail).
//
// spec: one-off-printed-skills-do-what-their-sentence-says
//
// Four skills whose text describes a mechanic nothing else in the system has. Each is
// stated for exactly ONE skill in the book, which is the reason they are matched on the
// printed sentence rather than on the skill name, and the reason none of them was
// generalised into a shared rider: a sample size of one generalises into a rule that
// fires on skills that never printed it.
//
//   Deadly Fury  33 HP — "Deal Phys damage to all enemies. For this check only, treat
//                         critical rate as 20% (1/5th) of the TN. Does not stack with
//                         Might."
//   Pinhole      10 MP — "Make an attack with a firearm using Agility. Your target
//                         treats their resistance and dodge rate as being halved for
//                         this attack."
//   Analyze       0 MP — "Make a power roll, adding the user's level to the roll. If
//                         this roll is equal to or higher than the target demon's
//                         level, learn all info in their statblock. This skill cannot
//                         be used on Bosses."
//   God's Curse   0 MP — "60% chance to inflict ailment to all targets. Roll 1d10: 1-2:
//                         Charm; 3-4: Panic; 5-6: Sleep; 7-8: Restrain; 9-10: Stun."

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
  critDivisorFor, pinholeResistance, pinholeDodgeTn, analyzeOutcome, godsCurseAilment
} = await import("../module/helpers/named-skills.mjs");
const { evaluatePercentile } = await import("../module/helpers/checks.mjs");
const { attackRiders } = await import("../module/helpers/skill-compendium.mjs");

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

// ------------------------------------------------------- Deadly Fury (p.108)

eq(critDivisorFor({}), SMT.check.critDivisor, "an ordinary check uses the ordinary divisor");
eq(critDivisorFor({ skillWidensCrit: true }), SMT.check.mightCritDivisor,
  "Deadly Fury widens the crit band to a fifth of the TN");
eq(critDivisorFor({ hasMight: true }), SMT.check.mightCritDivisor, "so does Might");
eq(critDivisorFor({ hasMight: true, skillWidensCrit: true }), SMT.check.mightCritDivisor,
  "ESCAPE: 'Does not stack with Might' — both together is still a FIFTH, not a "
  + "twenty-fifth. Returning a divisor rather than a boolean is what makes the "
  + "non-stacking expressible at all");
eq(SMT.check.mightCritDivisor, 5, "a fifth is 20%, which is what p.108 prints");

// The widened band has to actually change an outcome, or the divisor is decoration.
{
  const tn = 50;
  const ordinary = evaluatePercentile(9, tn, { hasMight: false });
  const widened = evaluatePercentile(9, tn, { hasMight: true });
  ok(!ordinary.isCritical, "a 9 against TN 50 is an ordinary success at a tenth");
  ok(widened.isCritical, "…and a critical at a fifth — the same roll, the band moved");
}

// ------------------------------------------------------------ Pinhole (p.106)

eq(pinholeResistance(30, { halves: true }), 15, "resistance is halved for this attack");
eq(pinholeResistance(31, { halves: true }), 15, "rounding is down, in the attacker's favour");
eq(pinholeResistance(30, { halves: false }), 30, "and untouched without the skill");
eq(pinholeResistance(1, { halves: true }), 0, "a resistance of 1 halves away entirely");
eq(pinholeResistance(-5, { halves: true }), 0, "a nonsense resistance floors at zero");
eq(pinholeDodgeTn(45, { halves: true }), 22, "the dodge TN is halved too");
eq(pinholeDodgeTn(45, { halves: false }), 45, "…and only with the skill");
eq(pinholeDodgeTn(0, { halves: true }), 0, "an undodgeable target stays undodgeable");
ok(pinholeResistance(30, { halves: true }) !== pinholeDodgeTn(30, { halves: false }),
  "ESCAPE: the two halvings are separate arguments — the printed sentence names BOTH "
  + "resistance and dodge, and halving only one is the likely half-fix");

// ------------------------------------------------------------ Analyze (p.102)

eq(analyzeOutcome({ roll: 20, userLevel: 10, targetLevel: 30 }),
  { blocked: false, success: true, total: 30 },
  "'equal to or higher' is inclusive — exactly the target's level succeeds");
eq(analyzeOutcome({ roll: 20, userLevel: 10, targetLevel: 31 }).success, false,
  "one under fails");
eq(analyzeOutcome({ roll: 20, userLevel: 10, targetLevel: 29 }).success, true, "one over succeeds");
eq(analyzeOutcome({ roll: 5, userLevel: 60, targetLevel: 40 }).success, true,
  "the user's LEVEL is added to the roll, which is what makes a low roll survivable");
eq(analyzeOutcome({ roll: 99, userLevel: 99, targetLevel: 1, targetIsBoss: true }),
  { blocked: true, success: false, total: 0 },
  "ESCAPE: 'This skill cannot be used on Bosses' is an absolute refusal, not a harder "
  + "threshold — no roll beats it, and reporting success against a boss would leak a "
  + "statblock the book withholds");
eq(analyzeOutcome({}).success, true, "zero against zero is 'equal to', so it succeeds");

// -------------------------------------------------------- God's Curse (p.103)

eq(godsCurseAilment(1), "charm", "1 is Charm");
eq(godsCurseAilment(2), "charm", "2 is Charm");
eq(godsCurseAilment(3), "panic", "3 is Panic");
eq(godsCurseAilment(4), "panic", "4 is Panic");
eq(godsCurseAilment(5), "sleep", "5 is Sleep");
eq(godsCurseAilment(6), "sleep", "6 is Sleep");
eq(godsCurseAilment(7), "restrain", "7 is Restrain");
eq(godsCurseAilment(8), "restrain", "8 is Restrain");
eq(godsCurseAilment(9), "stun", "9 is Stun");
eq(godsCurseAilment(10), "stun", "10 is Stun");
eq(godsCurseAilment(0), null, "0 is off the table");
eq(godsCurseAilment(11), null, "so is 11");

// Every face of the die lands somewhere, and every printed ailment is reachable — the
// two failure modes of a hand-typed range table, in both directions.
{
  const hit = [];
  for (let d = 1; d <= 10; d++) hit.push(godsCurseAilment(d));
  ok(hit.every(Boolean), "every face of the 1d10 maps to an ailment");
  eq([...new Set(hit)].sort(), ["charm", "panic", "restrain", "sleep", "stun"],
    "…and all five printed ailments are reachable, none doubled in by a bad range");
  for (const ailment of new Set(hit)) {
    ok(ailment in SMT.ailments, `"${ailment}" is a real ailment key, not a label`);
  }
}

// ------------------------------------------------ the compendium reads all four

eq(attackRiders("Deal Phys damage to all enemies. For this check only, treat critical "
  + "rate as 20% of the TN. Does not stack with Might.").widensCrit, true,
  "Deadly Fury's sentence stamps the widened crit");
const pin = attackRiders("Make an attack with a firearm using Agility. Your target treats "
  + "their resistance and dodge rate as being halved for this attack.");
eq(pin.halvesTargetResist, true, "Pinhole halves resistance…");
eq(pin.halvesTargetDodge, true, "…and dodge, from the one sentence naming both");
eq(attackRiders("Make a power roll, adding the user's level to the roll. If this roll is "
  + "equal to or higher than the target demon's level, learn all info in their statblock.").analyzes,
  true, "Analyze is recognised");
eq(attackRiders("60% chance to inflict ailment to all targets. Roll 1d10: 1-2: Charm; "
  + "3-4: Panic; 5-6: Sleep; 7-8: Restrain; 9-10: Stun.").randomAilment, true,
  "God's Curse is recognised");

// None of the four leaks onto an ordinary skill.
const plain = attackRiders("Deal Fire damage to all targets; 20% chance to inflict Freeze.");
eq(plain.widensCrit, undefined, "ESCAPE: an ordinary skill gets no widened crit…");
eq(plain.halvesTargetResist, undefined, "…no halved resistance…");
eq(plain.analyzes, undefined, "…no analyze…");
eq(plain.randomAilment, undefined,
  "…and no random ailment. It states a percentage and an ailment, which is the shape "
  + "closest to God's Curse's own sentence");

// -------------------------------------------------- wiring (source, always runs)

const schema = readFileSync(join(ROOT, "module/data/skill-data.mjs"), "utf8");
for (const field of ["widensCrit", "halvesTargetResist", "halvesTargetDodge", "analyzes", "randomAilment"]) {
  ok(new RegExp(`${field}:\\s*new BooleanField`).test(schema), `the schema declares ${field}`);
}

const combat = readFileSync(join(ROOT, "module/helpers/combat.mjs"), "utf8");
ok(combat.includes("pinholeResistance(") && combat.includes("pinholeDodgeTn("),
  "the attack pipeline applies both Pinhole halvings");
const item = readFileSync(join(ROOT, "module/documents/item.mjs"), "utf8");
ok(item.includes("godsCurseAilment("), "God's Curse rolls its d10 at use time");
ok(item.includes("analyzeOutcome("), "Analyze contests its power roll");
ok(/widensCrit/.test(item), "Deadly Fury's widened crit reaches the check");

console.log(`\nsmt-rpg named-skills tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
