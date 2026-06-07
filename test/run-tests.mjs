// ═══════════════════════════════════════════════
// run-tests.mjs — node-runnable unit tests for the PURE rules helpers.
//
// The system has no test runner and no build step, so this is a zero-dependency
// harness: `node test/run-tests.mjs` (exit 0 = pass, 1 = fail). It covers only the
// pure, document-free functions — evaluatePercentile (checks.mjs), calculateDamage
// (damage.mjs), and the fusion maths (fusion.mjs) — by importing them directly and
// stubbing the two globals Foundry would otherwise provide:
//   - CONFIG.SMT  : the real config object from config.mjs (the rules SSoT), so the
//                   tests exercise the same constants the live system reads.
//   - Math.clamp  : Foundry adds this to Math; Node does not, so we polyfill the
//                   exact same (value, min, max) semantics the helpers rely on.
// No Foundry, no DOM, no network. Keep new pure helpers covered here.
// ═══════════════════════════════════════════════

import { SMT } from "../module/config.mjs";

// --- Foundry global stubs (must precede importing the helpers under test) ---
if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { evaluatePercentile } = await import("../module/helpers/checks.mjs");
const { calculateDamage } = await import("../module/helpers/damage.mjs");
const {
  computeFusionLevel, inheritedSkillCount, elementClanFor,
  isExceptionDemon, selectInheritedSkills
} = await import("../module/helpers/fusion.mjs");

// --- Tiny assertion harness ---
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

// ═══════════════════════════════════════════════
// evaluatePercentile (p.64)
// ═══════════════════════════════════════════════
{
  // TN 50: crit threshold floor(50/10)=5; auto-fail >=96; fumble ==100.
  eq(evaluatePercentile(1, 50).isCritical, true, "roll 1 is always critical");
  eq(evaluatePercentile(5, 50).isCritical, true, "roll <= floor(TN/10) crits (5 vs TN50)");
  eq(evaluatePercentile(6, 50).isCritical, false, "roll just over crit threshold is a normal success");
  eq(evaluatePercentile(6, 50).isSuccess, true, "roll 6 <= TN50 succeeds");
  eq(evaluatePercentile(50, 50).isSuccess, true, "roll == TN succeeds");
  eq(evaluatePercentile(51, 50).isSuccess, false, "roll > TN fails");
  eq(evaluatePercentile(96, 50).cssClass, "auto-fail", "roll 96 auto-fails even under TN math");
  eq(evaluatePercentile(100, 50).isFumble, true, "roll 100 fumbles");
  // Might widens crit to floor(TN/5): TN50 -> 10.
  eq(evaluatePercentile(10, 50, { hasMight: true }).isCritical, true, "Might widens crit threshold (10 vs TN50)");
  eq(evaluatePercentile(10, 50, { hasMight: false }).isCritical, false, "without Might, 10 is not a crit at TN50");
  // Auto-fail outranks an otherwise-successful high TN (TN >= 96).
  eq(evaluatePercentile(96, 99).isSuccess, false, "96 auto-fails even when TN is 99");
}

// ═══════════════════════════════════════════════
// calculateDamage (p.64-65)
// ═══════════════════════════════════════════════
{
  // Normal: 100 power, 20 resist -> 80.
  eq(calculateDamage({ rawPower: 100, affinity: "normal", resistance: 20, isCritical: false }).finalDamage, 80, "normal hit subtracts resistance");
  // Weak doubles BEFORE resistance: 100*2 - 20 = 180.
  eq(calculateDamage({ rawPower: 100, affinity: "weak", resistance: 20, isCritical: false }).finalDamage, 180, "weak doubles then subtracts resistance");
  // Strong halves (floor): floor(100/2) - 20 = 30.
  eq(calculateDamage({ rawPower: 100, affinity: "strong", resistance: 20, isCritical: false }).finalDamage, 30, "strong halves then subtracts resistance");
  // Crit skips resistance: 100 -> 100.
  eq(calculateDamage({ rawPower: 100, affinity: "normal", resistance: 20, isCritical: true }).finalDamage, 100, "crit skips resistance");
  // Null: no damage, flagged.
  const nul = calculateDamage({ rawPower: 100, affinity: "null", resistance: 20, isCritical: false });
  ok(nul.isNull && nul.finalDamage === 0, "null deals no damage");
  // Drain heals post-resistance against TARGET resistance: 100-20=80.
  const drn = calculateDamage({ rawPower: 100, affinity: "drain", resistance: 20, isCritical: false });
  ok(drn.isDrain && drn.finalDamage === 0 && drn.drainedAmount === 80, "drain heals post-resistance, deals 0 damage");
  // Repel reflects post-ATTACKER-resistance: attackerResistance 30 -> 100-30=70.
  const rep = calculateDamage({ rawPower: 100, affinity: "repel", resistance: 20, isCritical: false, attackerResistance: 30 });
  ok(rep.isRepel && rep.reflectedDamage === 70, "repel reflects using attacker resistance");
  // Dodge fumble doubles AND skips resistance: 100*2 = 200.
  eq(calculateDamage({ rawPower: 100, affinity: "normal", resistance: 20, isCritical: false, dodgeFumble: true }).finalDamage, 200, "dodge fumble doubles and skips resistance");
  // Resistance never drives damage below 0.
  eq(calculateDamage({ rawPower: 10, affinity: "normal", resistance: 50, isCritical: false }).finalDamage, 0, "damage floors at 0");
}

// ═══════════════════════════════════════════════
// Fusion maths (p.79-82)
// ═══════════════════════════════════════════════
{
  // Level = floor((L1+L2)/2)+2.
  eq(computeFusionLevel(2, 5), 5, "fusion level: floor((2+5)/2)+2 = 5");
  eq(computeFusionLevel(10, 10), 12, "fusion level: floor((10+10)/2)+2 = 12");
  eq(computeFusionLevel(1, 1), 3, "fusion level floors at the formula, never below 1");
  // Inheritance band table (p.80).
  eq(inheritedSkillCount(0), 0, "0 combined skills inherit none");
  eq(inheritedSkillCount(3), 1, "3 combined -> 1");
  eq(inheritedSkillCount(7), 2, "7 combined -> 2");
  eq(inheritedSkillCount(11), 3, "11 combined -> 3");
  eq(inheritedSkillCount(15), 4, "15 combined -> 4");
  eq(inheritedSkillCount(19), 5, "19 combined -> 5");
  eq(inheritedSkillCount(23), 6, "23 combined -> 6");
  eq(inheritedSkillCount(24), 7, "24 combined -> 7");
  eq(inheritedSkillCount(40), 7, "above 24 caps at 7");
  // Same-clan Element (p.81).
  eq(elementClanFor("fairy", "fairy"), "aeros", "Fairy+Fairy -> Aeros");
  eq(elementClanFor("holy", "holy"), "flaemis", "Holy+Holy -> Flaemis");
  eq(elementClanFor("yoma", "yoma"), "aquans", "Yoma+Yoma -> Aquans");
  eq(elementClanFor("jirae", "jirae"), "erthys", "Jirae+Jirae -> Erthys");
  eq(elementClanFor("fairy", "beast"), null, "cross-clan returns null (chart lookup is the GM's)");
  eq(elementClanFor("FAIRY", "fairy"), "aeros", "clan match is case-insensitive");
  // Exception demons (p.80).
  ok(isExceptionDemon("Shiva"), "Shiva is an exception demon");
  ok(isExceptionDemon("  high pixie  "), "exception check trims + lowercases");
  ok(!isExceptionDemon("Pixie"), "Pixie is not an exception demon");
  // selectInheritedSkills: count cap, dedupe, inheritance-type gate, total cap.
  const pool = [
    { name: "Agi" }, { name: "Bufu" }, { name: "Zio" }, { name: "Agi" } /* dup */
  ];
  eq(selectInheritedSkills(pool, { count: 2 }).map(s => s.name), ["Agi", "Bufu"], "selects up to count, preserves order");
  eq(selectInheritedSkills(pool, { count: 5 }).map(s => s.name), ["Agi", "Bufu", "Zio"], "dedupes by name");
  // Typed skill only inherits with matching result trait.
  const typed = [{ name: "Megidolaon", inheritanceType: "almighty" }, { name: "Dia" }];
  eq(selectInheritedSkills(typed, { count: 5, resultInheritance: "" }).map(s => s.name), ["Dia"], "typed skill skipped when result has no matching trait");
  eq(selectInheritedSkills(typed, { count: 5, resultInheritance: "almighty" }).map(s => s.name), ["Megidolaon", "Dia"], "typed skill inherited when trait matches");
  // Total cap: a demon already holding (cap-1) skills can only inherit 1 more.
  const cap = SMT.fusion.skillCap;
  const many = Array.from({ length: 10 }, (_, i) => ({ name: `S${i}` }));
  eq(selectInheritedSkills(many, { count: 9, initialCount: cap - 1 }).length, 1, "total skill cap leaves room for only 1 more");
  eq(selectInheritedSkills(many, { count: 9, initialCount: cap }).length, 0, "no room when already at the cap");
  // An initial skill name is not re-added.
  eq(selectInheritedSkills([{ name: "Agi" }, { name: "Bufu" }], { count: 5, initialNames: ["Agi"] }).map(s => s.name), ["Bufu"], "skips a skill already among initial skills");
}

// --- Report ---
console.log(`\nsmt-rpg pure-helper tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
