// HP mutation + Fate Point halve-damage arithmetic (p.59, p.64-65).
// Pure: no Foundry, no DOM. `node test/fate-damage.test.mjs` (exit 0 pass, 1 fail).
//
// Exists because the halve-damage escape of 2026-06-07 lived entirely in the gap
// between `calculateDamage` (pure, covered) and the HP write inside
// `SMTActor#applyDamage` (Foundry-coupled, uncovered). See GAUNTLET.md §6.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { applyDamageToHp, halveDamageResult } = await import("../module/helpers/damage.mjs");

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

// spec: halve-damage-never-restores-more-than-was-dealt
const DIV = SMT.fate.halveDivisor;

// applyDamageToHp — the write `applyDamage` performs, made checkable.
{
  eq(applyDamageToHp(100, 100, 40), { hpAfter: 60, dealt: 40 }, "ordinary hit subtracts in full");
  eq(applyDamageToHp(100, 100, 0), { hpAfter: 100, dealt: 0 }, "zero damage is a no-op");

  // The overkill case. `dealt` is the HP actually lost, NOT the computed damage.
  eq(applyDamageToHp(20, 100, 40), { hpAfter: 0, dealt: 20 }, "overkill floors at 0 and reports only what was dealt");
  eq(applyDamageToHp(30, 100, 40), { hpAfter: 0, dealt: 30 }, "overkill dealt == hp before, not the computed damage");
  eq(applyDamageToHp(0, 100, 40), { hpAfter: 0, dealt: 0 }, "hitting an already-downed target deals nothing");

  // Flag values are author-forgeable (helpers/combat.mjs treats them as hostile).
  eq(applyDamageToHp(50, 100, -10), { hpAfter: 50, dealt: 0 }, "negative damage never heals");
  eq(applyDamageToHp(50, 100, NaN), { hpAfter: 50, dealt: 0 }, "NaN damage is inert");
  eq(applyDamageToHp(50, 100, 7.9), { hpAfter: 43, dealt: 7 }, "fractional damage floors");
}

// halveDamageResult — p.59. Resolves against the HP at the moment the hit landed,
// so the result is exact whether or not the original hit overkilled.
{
  // Ordinary: 100 -> 60 on a 40, halve to 20 -> HP 80.
  eq(halveDamageResult({ hpBefore: 100, hpMax: 100, currentDamage: 40, divisor: DIV }),
    { newDamage: 20, hpAfter: 80 }, "ordinary halve nets half the damage");

  // p.59 allows repeated spends: 1/2 -> 1/4 -> 1/8, each resolved from hpBefore.
  eq(halveDamageResult({ hpBefore: 100, hpMax: 100, currentDamage: 20, divisor: DIV }),
    { newDamage: 10, hpAfter: 90 }, "second halve quarters the original hit");
  eq(halveDamageResult({ hpBefore: 100, hpMax: 100, currentDamage: 10, divisor: DIV }),
    { newDamage: 5, hpAfter: 95 }, "third halve eighths the original hit");

  // THE ESCAPE. 20 HP taking a 40 was floored to 0; only 20 was ever dealt.
  // Halving must land the target at 0 (half of 40 still exactly drops them),
  // NOT restore them to 20 as the restore-the-difference arithmetic did.
  eq(halveDamageResult({ hpBefore: 20, hpMax: 100, currentDamage: 40, divisor: DIV }),
    { newDamage: 20, hpAfter: 0 }, "ESCAPE: halving an exactly-lethal overkill still drops the target");
  eq(halveDamageResult({ hpBefore: 30, hpMax: 100, currentDamage: 40, divisor: DIV }),
    { newDamage: 20, hpAfter: 10 }, "ESCAPE: halving a partial overkill leaves hpBefore - newDamage");
  eq(halveDamageResult({ hpBefore: 5, hpMax: 100, currentDamage: 60, divisor: DIV }),
    { newDamage: 30, hpAfter: 0 }, "ESCAPE: a halve that is still lethal keeps the target down");

  // Property: a halve never leaves the target above where the hit found them,
  // and never below 0. This is the invariant the escape violated.
  for (let hpBefore = 0; hpBefore <= 60; hpBefore += 5) {
    for (let dmg = 0; dmg <= 80; dmg += 5) {
      const r = halveDamageResult({ hpBefore, hpMax: 100, currentDamage: dmg, divisor: DIV });
      ok(r.hpAfter <= hpBefore, `halve never heals past the pre-hit HP (hp ${hpBefore}, dmg ${dmg})`);
      ok(r.hpAfter >= 0, `halve never drives HP below 0 (hp ${hpBefore}, dmg ${dmg})`);
      ok(r.newDamage <= dmg, `halved damage never exceeds the original (hp ${hpBefore}, dmg ${dmg})`);
    }
  }

  // Never exceeds max even if hpBefore was somehow stale/high.
  eq(halveDamageResult({ hpBefore: 500, hpMax: 100, currentDamage: 10, divisor: DIV }).hpAfter, 100,
    "halve clamps to hp max");

  // Hostile / missing inputs stay inert rather than throwing.
  eq(halveDamageResult({ hpBefore: 50, hpMax: 100, currentDamage: 0, divisor: DIV }),
    { newDamage: 0, hpAfter: 50 }, "halving zero damage is a no-op");
  eq(halveDamageResult({ hpBefore: 50, hpMax: 100, currentDamage: NaN, divisor: DIV }),
    { newDamage: 0, hpAfter: 50 }, "NaN damage is inert");
  eq(halveDamageResult({ hpBefore: 50, hpMax: 100, currentDamage: 1, divisor: DIV }),
    { newDamage: 0, hpAfter: 50 }, "1 damage halves to 0 and fully restores");
}

// Legacy cards written before hpBefore existed fall back to restore-the-difference.
// That path carries the original bug by construction; it is kept only so old chat
// messages keep working, and it is asserted so the fallback cannot silently widen.
{
  eq(halveDamageResult({ hpBefore: null, hpNow: 60, hpMax: 100, currentDamage: 40, divisor: DIV }),
    { newDamage: 20, hpAfter: 80 }, "legacy fallback matches the fixed path when no overkill occurred");
  eq(halveDamageResult({ hpBefore: undefined, hpNow: 0, hpMax: 100, currentDamage: 40, divisor: DIV }),
    { newDamage: 20, hpAfter: 20 }, "legacy fallback is documented-wrong on overkill (old cards only)");
}

console.log(`\nsmt-rpg fate/damage tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
