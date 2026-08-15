// The Fumble Effect Chart (p.58) and its hit-check elaboration (p.64).
// `node test/fumble-chart.test.mjs` (exit 0 pass, 1 fail).
//
// spec: a-fumbled-attack-lands-on-your-own-side
//
// The printed chart, all five rows:
//   Hit Check        — "Hit yourself and/or your allies."
//   Dodge Check      — "Treated as though you've been hit by a critical."
//   Negotiation      — "Talk target is enraged, and combat ensues."
//   Save             — "The ailment remains, and your HP and MP are halved."
//   Any Other Check  — "Bad things happen; the GM is free to determine what."
//
// Before this, a fumbled HIT CHECK did nothing at all beyond inflicting the Curse.
// SMTItem#use branched on isSuccess three times and never on isFumble, so the whole
// top row of the chart — the one that fires most often, on every fumbled attack in
// the game — resolved to a chat card saying "Fumble" and no mechanical consequence.
// That is the shape the §1 clause-2 bar rules out: not wrong maths, just absent.
//
// p.64 is unusually specific and every clause is asserted here: "the attacker becomes
// Cursed, and the attack then randomly hits either themselves or an ally (and in the
// case of the attack being 'all' then it hits all allies, themselves included). When
// hitting an ally, that ally may avoid the attack with a dodge check as normal, but an
// attacker cannot avoid hitting themselves."
//
// The asymmetry in that last sentence is the trap. Dodge eligibility is PER VICTIM,
// not per attack — the same fumbled Mabufu that an ally may dodge, the attacker may
// not. A single canDodge on the attack would have to pick one and be wrong for the
// other half of the victims.

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
  FUMBLE_CHECK_TYPES, fumbleEffect, fumbleVictims, fumbleVictimPool
} = await import("../module/helpers/fumble.mjs");
const { fumbledSaveResources } = await import("../module/helpers/ailments.mjs");
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

// ------------------------------------------------------------------- the chart

eq(FUMBLE_CHECK_TYPES, ["hit", "dodge", "negotiation", "save", "other"],
  "all five printed rows are present");
eq(FUMBLE_CHECK_TYPES, Object.keys(SMT.fumbleChart),
  "…and the chart matches CONFIG rather than restating it");

ok(fumbleEffect("hit").automated, "the hit row is the system's to resolve");
ok(fumbleEffect("dodge").automated, "so is the dodge row (already the damage engine's)");
ok(fumbleEffect("save").automated, "and the save row");
ok(!fumbleEffect("negotiation").automated,
  "the negotiation row is the GM's — 'combat ensues' is a scene change, not a number");
ok(!fumbleEffect("other").automated,
  "ESCAPE: 'the GM is free to determine what' must resolve to a stated prompt, not to "
  + "an invented effect — the book hands this one to a person");
eq(fumbleEffect("nonsense"), SMT.fumbleChart.other,
  "an unrecognised check type falls to the Any Other row, which is what that row is for");

// ---------------------------------------------- the hit row, single target (p.64)

eq(fumbleVictims({ targetsAll: false, allyCount: 3, pick: 0 }),
  [{ target: "self", index: -1, canDodge: false }],
  "the attacker is one entry in the pool and can come up first");
eq(fumbleVictims({ targetsAll: false, allyCount: 3, pick: 1 }),
  [{ target: "ally", index: 0, canDodge: true }], "…and an ally on the next");
eq(fumbleVictims({ targetsAll: false, allyCount: 3, pick: 3 }),
  [{ target: "ally", index: 2, canDodge: true }], "…through to the last ally");
eq(fumbleVictims({ targetsAll: false, allyCount: 3, pick: 4 }),
  [{ target: "self", index: -1, canDodge: false }],
  "a roll past the pool wraps rather than landing on nobody");

eq(fumbleVictims({ targetsAll: false, allyCount: 0, pick: 0 }),
  [{ target: "self", index: -1, canDodge: false }],
  "ESCAPE: a lone attacker always hits themselves — 'themselves or an ally' with no "
  + "allies is a pool of one, not a fumble that fizzles");
eq(fumbleVictims({ targetsAll: false, allyCount: 0, pick: 7 }),
  [{ target: "self", index: -1, canDodge: false }],
  "…whatever the roll was");

eq(fumbleVictimPool(0), 1, "the pool is the attacker alone");
eq(fumbleVictimPool(3), 4, "the pool is the attacker plus their allies");
eq(fumbleVictimPool(-2), 1, "a nonsense ally count floors at the attacker");

// ------------------------------------------------------ the hit row, "all" (p.64)

eq(fumbleVictims({ targetsAll: true, allyCount: 2 }), [
  { target: "self", index: -1, canDodge: false },
  { target: "ally", index: 0, canDodge: true },
  { target: "ally", index: 1, canDodge: true }
], "'in the case of the attack being all then it hits all allies, themselves included'");
eq(fumbleVictims({ targetsAll: true, allyCount: 0 }),
  [{ target: "self", index: -1, canDodge: false }],
  "an area attack with no allies present still catches the attacker");
ok(!fumbleVictims({ targetsAll: true, allyCount: 2 }).some(v => v.target === "self" && v.canDodge),
  "ESCAPE: the attacker never dodges their own fumble, even in the blast — "
  + "'an attacker cannot avoid hitting themselves'");
ok(fumbleVictims({ targetsAll: true, allyCount: 2 }).filter(v => v.canDodge).length === 2,
  "…while every ally caught in it may dodge as normal");

// A roll must not change an "all" fumble: the book gives it no randomness at all.
eq(fumbleVictims({ targetsAll: true, allyCount: 2, pick: 1 }),
  fumbleVictims({ targetsAll: true, allyCount: 2, pick: 0 }),
  "ESCAPE: an area fumble is not rolled for — every pick produces the same victims");

// ----------------------------------------- the two rows that were already engine

// Dodge row: "treated as though you've been hit by a critical" — p.65 spells that out
// as doubled damage with no resistance, quadrupled if the hit was itself a critical.
const normal = calculateDamage({ rawPower: 100, affinity: "normal", resistance: 30, isCritical: false });
const fumbled = calculateDamage({ rawPower: 100, affinity: "normal", resistance: 30, isCritical: false, dodgeFumble: true });
eq(normal.finalDamage, 70, "a normal hit takes resistance off");
eq(fumbled.finalDamage, 200, "a fumbled dodge doubles the damage AND skips resistance (p.65)");
const both = calculateDamage({ rawPower: 100, affinity: "normal", resistance: 30, isCritical: true, dodgeFumble: true });
eq(both.finalDamage, 200, "a critical hit through a fumbled dodge is the same 2x on power…");
ok(both.finalDamage > normal.finalDamage * 2,
  "…and still more than double a resisted normal hit, which is the printed intent");

// Save row: "the ailment remains, and your HP and MP are halved."
eq(fumbledSaveResources({ hp: 41, mp: 21 }), { hp: 20, mp: 10 },
  "a fumbled save halves both pools");

// -------------------------------------------------- wiring (source, always runs)

const item = readFileSync(join(ROOT, "module/documents/item.mjs"), "utf8");
ok(/checkResult\??\.isFumble/.test(item),
  "ESCAPE: SMTItem#use reads isFumble at all — it branched on isSuccess three times "
  + "and on the fumble never, which is how the chart's top row did nothing");
ok(item.includes("fumbleVictims("),
  "…and routes the fumbled attack through the chart rather than inventing a victim");

const fumbleSrc = readFileSync(join(ROOT, "module/helpers/fumble.mjs"), "utf8");
ok(/p\.58/.test(fumbleSrc) && /p\.64/.test(fumbleSrc),
  "the helper cites both the chart and its elaboration");

console.log(`\nsmt-rpg fumble-chart tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
