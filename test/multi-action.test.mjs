// Multi-action (p.59-60).
// `node test/multi-action.test.mjs` (exit 0 pass, 1 fail).
//
// spec: a-high-tn-buys-repeats-of-the-same-action
//
// "When you have a 100% or higher TN for a roll, you may choose to take a
// multi-action... If the base TN reaches 100 to 199%, the action is taken twice; if
// the TN reaches over 200%, then the action is taken three times. Divide the original
// TN by the number of actions taken to find the TN for each action in the
// multi-action. (Adjust the critical value for each based on the new TN,
// post-division.)"
//
// Unimplemented until 2026-07-28. A TN over 100% is ordinary at the table's levels —
// the play log of 2026-07-28 has a save TN of 275 on one demon — so this was not a
// corner case, it was a rule the system simply never offered.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { multiActionPlan, multiActionTn, evaluatePercentile } =
  await import("../module/helpers/checks.mjs");

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

// --- the bands --------------------------------------------------------------
{
  for (const tn of [0, 1, 55, 99]) {
    eq(multiActionPlan(tn), { actions: 1, tnEach: tn, eligible: false },
      `a TN of ${tn} buys no repeat`);
  }
  for (const tn of [100, 120, 150, 199]) {
    const p = multiActionPlan(tn);
    eq(p.actions, 2, `a TN of ${tn} buys two actions`);
    eq(p.tnEach, Math.floor(tn / 2), `each at ${Math.floor(tn / 2)}%`);
    ok(p.eligible, `and ${tn} reports as eligible`);
  }
  for (const tn of [200, 210, 275, 400]) {
    const p = multiActionPlan(tn);
    eq(p.actions, 3, `a TN of ${tn} buys three actions`);
    eq(p.tnEach, Math.floor(tn / 3), `each at ${Math.floor(tn / 3)}%`);
  }

  // The book's own two worked examples, p.60.
  eq(multiActionPlan(120).tnEach, 60, "p.60 example 1: a 120% strike becomes two at 60%");
  eq(multiActionPlan(210), { actions: 3, tnEach: 70, eligible: true },
    "p.60 example 2: a 210% magic check becomes three at 70%");

  // Three is the ceiling however high the TN goes — "but no more than three".
  eq(multiActionPlan(9999).actions, 3, "three actions is the hard ceiling (p.59)");
  eq(SMT.multiAction.maxActions, 3, "and the ceiling is a named constant");
}

// --- the two outright bars --------------------------------------------------
{
  // p.60: "Skills that automatically pass their checks cannot be used for
  // multi-actions." Restated on p.96 for auto skills whose TN would exceed 100%.
  for (const tn of [100, 210, 500]) {
    eq(multiActionPlan(tn, { autoSuccess: true }), { actions: 1, tnEach: tn, eligible: false },
      `ESCAPE: an auto-success skill never multi-actions, even at ${tn}%`);
  }
  // p.74: "Multi-actions cannot be taken with negotiations."
  for (const tn of [100, 210, 500]) {
    eq(multiActionPlan(tn, { isNegotiation: true }).actions, 1,
      `ESCAPE: negotiation never multi-actions, even at ${tn}%`);
  }
  eq(multiActionPlan(210, { autoSuccess: true, isNegotiation: true }).actions, 1,
    "both bars at once is still one action");
}

// --- fail-closed on junk ----------------------------------------------------
{
  for (const bad of [NaN, Infinity, -Infinity, null, undefined, "210", {}]) {
    const p = multiActionPlan(bad);
    eq(p.actions, 1, `a TN of ${JSON.stringify(bad)} never buys a repeat`);
  }
  eq(multiActionPlan(-50).actions, 1, "a negative TN buys nothing");
}

// --- taking FEWER parts than the maximum ------------------------------------
// p.60 divides "by the number of actions taken", not by the number available, so a
// player who takes two of a possible three rolls at TN/2.
{
  eq(multiActionTn(210, 3), 70, "three of three at 210% is 70% each");
  eq(multiActionTn(210, 2), 105, "ESCAPE: two of a possible three is 105%, not 70%");
  eq(multiActionTn(210, 1), 210, "declining the multi-action keeps the whole TN");
  eq(multiActionTn(100, 2), 50, "the two-action band divides the same way");

  // Rounding is down, per p.53's ground rule.
  eq(multiActionTn(101, 2), 50, "an odd TN rounds down, not to the nearest");
  eq(multiActionTn(205, 3), 68, "205 across three is 68, not 68.33");

  for (const bad of [0, -1, NaN, null, undefined]) {
    eq(multiActionTn(210, bad), 210, `an unusable part count (${JSON.stringify(bad)}) falls back to one`);
  }
}

// --- the critical value follows the divided TN ------------------------------
// p.60: "Adjust the critical value for each based on the new TN, post-division."
// Nothing does that adjustment explicitly — evaluatePercentile derives the crit
// threshold from whatever TN it is handed, so handing it the divided one is the whole
// of the rule. These assertions exist to keep that true.
{
  // At 210% undivided, a roll of 21 would crit (210/10). At 70% it must not.
  ok(evaluatePercentile(21, 210).isCritical, "a 21 crits against an undivided 210% TN");
  ok(!evaluatePercentile(21, 70).isCritical, "ESCAPE: the same roll does not crit against the divided 70%");
  ok(evaluatePercentile(7, 70).isCritical, "the divided TN crits at a tenth of ITSELF");

  // And the success band narrows with it, which is the cost of multi-acting.
  ok(evaluatePercentile(80, 210).isSuccess, "an 80 succeeds against 210%");
  ok(!evaluatePercentile(80, 70).isSuccess, "and fails against the divided 70%");

  // Might widens the divided threshold too, not the original.
  ok(evaluatePercentile(14, 70, { hasMight: true }).isCritical,
    "Might crits at a fifth of the DIVIDED TN");
  ok(!evaluatePercentile(15, 70, { hasMight: true }).isCritical, "and not beyond it");
}

console.log(`\nsmt-rpg multi-action tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 25)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
