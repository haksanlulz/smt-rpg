// Fleeing (p.70).
// `node test/flee.test.mjs` (exit 0 pass, 1 fail).
//
// spec: fleeing-succeeds-unless-somebody-stops-it
//
// Rule as printed in the book; paraphrased here, see the page cite above.
// THE DEFAULT IS SUCCESS, NOT A ROLL, and that is the whole shape of the unit. A check
// exists only because somebody chose to stop it. Every other escape-shaped rule in this
// system rolls for it, so "prompt for a dodge check on every flee" is what gets built by
// reflex — and it invents a failure mode the book does not have. `automatic` is
// therefore the first thing fleePlan answers, and the suite asserts the unblocked path
// carries no TN and no bonus at all rather than a TN that happens to be beatable.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { fleeAllowed, fleeTnBonus, fleePlan, fleeResult, combatEndsOnFlee } =
  await import("../module/helpers/flee.mjs");

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

// ------------------------------------------------------------ who may flee

ok(fleeAllowed({}), "an ordinary encounter can be fled");
ok(!fleeAllowed({ enemyIsBoss: true }),
  "ESCAPE: 'any NON-BOSS encounter' — a boss fight cannot be fled at all, which is a "
  + "refusal rather than a harder check");

// ----------------------------------------------------- unblocked is automatic

eq(fleePlan({ blocked: false, dodgeTn: 45 }), { automatic: true, tn: 0, bonus: 0 },
  "ESCAPE: nobody blocks, so it is automatic — no TN, no roll, and no bonus arithmetic "
  + "left sitting on a path that never uses it");
eq(fleePlan({ blocked: false, allies: 9, enemies: 1, dodgeTn: 45 }).automatic, true,
  "…and outnumbering cannot make an automatic success more automatic");
eq(fleePlan({}).automatic, true, "unblocked is the default, matching the book's default");

// -------------------------------------------------------- blocked needs a check

eq(fleePlan({ blocked: true, dodgeTn: 45, allies: 1, enemies: 3 }),
  { automatic: false, tn: 45, bonus: 0 },
  "blocked and outnumbered: the bare dodge TN");
eq(fleePlan({ blocked: true, dodgeTn: 45, allies: 4, enemies: 3 }),
  { automatic: false, tn: 65, bonus: 20 },
  "'more friendly combatants than enemy combatants' is +20%");
eq(fleePlan({ blocked: true, dodgeTn: 45, allies: 3, enemies: 3 }).bonus, 0,
  "ESCAPE: EQUAL numbers is not 'more' — the off-by-one that hands a bonus to a fair "
  + "fight");
eq(fleePlan({ blocked: true, dodgeTn: 0 }).tn, 0, "a zero dodge TN stays zero");
eq(fleePlan({ blocked: true, dodgeTn: -8 }).tn, 0, "a nonsense TN floors at zero");

eq(fleeTnBonus({ allies: 4, enemies: 3 }), SMT.flee.outnumberedBonus, "the bonus comes from CONFIG");
eq(fleeTnBonus({ allies: 1, enemies: 1 }), 0, "one on one is not outnumbering");
eq(fleeTnBonus({}), 0, "no combatants, no bonus");

// --------------------------------------------------------------- outcomes

eq(fleeResult({ isSuccess: true }),
  { escaped: true, extraAllyMayFlee: false, freeStrikes: false, noCounter: true },
  "a passed dodge check escapes");
eq(fleeResult({ isSuccess: false }).escaped, false, "a failed one does not");
eq(fleeResult({ isSuccess: false }).freeStrikes, false,
  "ESCAPE: an ordinary FAILURE hands out no free strikes — only a fumble does, and "
  + "conflating them punishes every missed escape");

eq(fleeResult({ isSuccess: true, isCritical: true }),
  { escaped: true, extraAllyMayFlee: true, freeStrikes: false, noCounter: true },
  "a critical takes one additional allied combatant along");
eq(fleeResult({ isCritical: true }).escaped, true,
  "a critical escapes even if the caller forgot to also mark it a success");

eq(fleeResult({ isFumble: true }),
  { escaped: false, extraAllyMayFlee: false, freeStrikes: true, noCounter: true },
  "a fumble: no escape, and every enemy gets a free basic strike");
eq(fleeResult({ isFumble: true, isCritical: true }).freeStrikes, true,
  "a fumble outranks a critical if both somehow arrive");

ok(fleeResult({ isFumble: true }).noCounter,
  "ESCAPE: 'These attacks cannot trigger the Counter skill' — the free strikes are the "
  + "second of the two carve-outs the counterattack spec names, and without the flag two "
  + "Counter-holders would trade blows off one fumbled escape");
ok(fleeResult({ isSuccess: true }).noCounter, "…and the flag rides every outcome, not just the fumble");

// ------------------------------------------------------------- ending combat

ok(combatEndsOnFlee({ remainingOnSide: 0 }), "'if all members of one side flee, combat ends'");
ok(!combatEndsOnFlee({ remainingOnSide: 1 }), "one left is not all gone");
ok(combatEndsOnFlee({}), "nobody left by default reads as ended");
ok(combatEndsOnFlee({ remainingOnSide: -2 }), "a nonsense count still reads as empty");

// -------------------------------------------------- wiring (source, always runs)

const cfg = readFileSync(join(ROOT, "module/config.mjs"), "utf8");
ok(/SMT\.flee\s*=/.test(cfg), "the flee figures live in CONFIG");

const src = readFileSync(join(ROOT, "module/helpers/flee.mjs"), "utf8");
ok(/if \(!blocked\) return \{ automatic: true/.test(src),
  "the unblocked branch returns BEFORE any bonus or TN is computed, so the automatic "
  + "path cannot acquire a roll by accident");

console.log(`\nsmt-rpg flee tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
