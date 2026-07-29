// The eight printed sample characters (p.25-32) against the p.35-36 formulas.
// `node test/sample-characters.test.mjs` (exit 0 pass, 1 fail).
//
// spec: the-printed-sample-characters-derive
//
// These sheets are eight independent cross-checks of the arithmetic the entire system
// rests on — stat TNs, HP, MP, both resistances, both base powers, dodge, negotiation,
// fate and starting macca — and until 2026-07-29 none of it had a single assertion,
// because it all lived inline in prepareDerivedData where no node suite can reach it.
// Same seam as the 2026-06-07 halve-damage escape: covered pure maths on one side,
// uncovered derived writes on the other.
//
// Transcribed from the rendered pages. Fiend stat lines print "base+leveled + magatama"
// (e.g. Marogareh's "11 + 4 = 15"); the totals are what the formulas consume.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { statTn, dodgeTn, negotiationTn, resistance, basePower, fatePoints, startingMacca } =
  await import("../module/helpers/derived.mjs");
const { resolveResourceMax } = await import("../module/helpers/resources.mjs");

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

// p.25-32. `hpMultBonus` is a Life Bonus passive where the sheet says so.
const SAMPLES = [
  {
    name: "Marogareh", page: 25, cls: "fiend", level: 10,
    st: 15, ma: 3, vi: 4, ag: 4, lu: 3,
    stTn: 85, maTn: 25, viTn: 30, agTn: 30, luTn: 25,
    hp: 98, mp: 39, physRes: 7, magRes: 6, physPower: 25, magPower: 13,
    dodge: 14, nego: 26, fate: 5, macca: 500, hpMultBonus: 1
  },
  {
    name: "Shiranui", page: 26, cls: "fiend", level: 10,
    st: 3, ma: 16, vi: 2, ag: 6, lu: 2,
    stTn: 25, maTn: 90, viTn: 20, agTn: 40, luTn: 20,
    hp: 72, mp: 78, physRes: 6, magRes: 13, physPower: 13, magPower: 26,
    dodge: 16, nego: 24, fate: 5, macca: 500
  },
  {
    name: "Ankh", page: 27, cls: "fiend", level: 10,
    st: 12, ma: 4, vi: 7, ag: 2, lu: 4,
    stTn: 70, maTn: 30, viTn: 45, agTn: 20, luTn: 30,
    hp: 102, mp: 42, physRes: 8, magRes: 7, physPower: 22, magPower: 14,
    dodge: 12, nego: 28, fate: 5, macca: 500
  },
  {
    name: "Pixie", page: 28, cls: "demon", level: 9,
    st: 4, ma: 8, vi: 5, ag: 3, lu: 9,
    stTn: 29, maTn: 49, viTn: 34, agTn: 24, luTn: 54,
    hp: 84, mp: 51, physRes: 7, magRes: 8, physPower: 13, magPower: 17,
    dodge: 13, nego: 38, fate: 6, macca: 450,
    slip: {
      field: "Magic TN", printed: 39, corroborated: 49,
      why: "Magic 8 at level 9 derives 49; the sheet's own Base Magical Power of 17 "
        + "confirms Magic 8, and its own Zio line — a spell, so the Magic TN — prints 49%"
    }
  },
  {
    name: "Jack Frost", page: 29, cls: "demon", level: 9,
    st: 5, ma: 10, vi: 6, ag: 4, lu: 4,
    stTn: 34, maTn: 59, viTn: 39, agTn: 29, luTn: 29,
    hp: 90, mp: 57, physRes: 7, magRes: 9, physPower: 14, magPower: 19,
    dodge: 14, nego: 28, fate: 5, macca: 450
  },
  {
    name: "Hellhound", page: 30, cls: "demon", level: 9,
    st: 10, ma: 6, vi: 8, ag: 5, lu: 4,
    stTn: 59, maTn: 39, viTn: 49, agTn: 34, luTn: 29,
    hp: 102, mp: 45, physRes: 8, magRes: 7, physPower: 19, magPower: 15,
    dodge: 15, nego: 28, fate: 5, macca: 450,
    slip: {
      field: "Magic stat", printed: 5, corroborated: 6,
      why: "three separate printed figures on the same sheet all require Magic 6 — "
        + "TN 39, Base Magical Power 15, and MP 45"
    }
  },
  {
    name: "Soldier", page: 31, cls: "human", level: 11,
    st: 6, ma: 1, vi: 2, ag: 10, lu: 1,
    stTn: 41, maTn: 16, viTn: 21, agTn: 61, luTn: 16,
    hp: 52, mp: 24, physRes: 6, magRes: 6, physPower: 17, magPower: 12,
    dodge: 20, nego: 22, fate: 5, macca: 550,
    // The sheet prints "12 (6)": the parenthetical is the derived value, 12 is after
    // +6 from Helmet, Bulletproof Vest and Combat Boots.
    gearPhysRes: 6
  },
  {
    name: "Reporter", page: 32, cls: "human", level: 11,
    st: 1, ma: 1, vi: 1, ag: 3, lu: 14,
    stTn: 16, maTn: 16, viTn: 16, agTn: 26, luTn: 81,
    hp: 48, mp: 24, physRes: 6, magRes: 6, physPower: 12, magPower: 12,
    dodge: 13, nego: 48, fate: 7, macca: 550,
    // The sheet prints Save TN 12% against a Vitality TN of 16%. See the errata block.
    printedSaveTn: 12
  }
];

const HP_MULT = { fiend: 6, demon: 6, human: 4 };
const MP_MULT = { fiend: 3, demon: 3, human: 2 };

ok(SAMPLES.length === 8, "all eight printed sample characters are transcribed");

// --- every sheet, every formula --------------------------------------------
for (const s of SAMPLES) {
  const at = `${s.name} (p.${s.page})`;

  eq(statTn(s.st, s.level), s.stTn, `${at} Strength TN`);
  eq(statTn(s.ma, s.level), s.maTn, `${at} Magic TN`);
  eq(statTn(s.vi, s.level), s.viTn, `${at} Vitality TN`);
  eq(statTn(s.ag, s.level), s.agTn, `${at} Agility TN`);
  eq(statTn(s.lu, s.level), s.luTn, `${at} Luck TN`);

  eq(resolveResourceMax({
    stat: s.vi, level: s.level, multiplier: HP_MULT[s.cls] + (s.hpMultBonus ?? 0)
  }), s.hp, `${at} HP`);
  eq(resolveResourceMax({
    stat: s.ma, level: s.level, multiplier: MP_MULT[s.cls] + (s.mpMultBonus ?? 0)
  }), s.mp, `${at} MP`);

  eq(resistance(s.vi, s.level), s.physRes, `${at} physical resistance`);
  eq(resistance(s.ma, s.level), s.magRes, `${at} magical resistance`);
  eq(basePower(s.st, s.level), s.physPower, `${at} base physical power`);
  eq(basePower(s.ma, s.level), s.magPower, `${at} base magical power`);

  eq(dodgeTn(s.ag), s.dodge, `${at} dodge TN`);
  eq(negotiationTn(s.lu), s.nego, `${at} negotiation TN`);
  eq(fatePoints(s.lu), s.fate, `${at} fate points`);
  eq(startingMacca(s.level), s.macca, `${at} starting macca (p.36)`);
}

// --- Save TN is the Vitality TN (p.35) -------------------------------------
// Seven of the eight sheets print them equal. The Reporter prints 12% against a
// Vitality TN of 16%, and no rule anywhere gives that subclass a save penalty —
// its own Vitality TN is printed as 16 two lines above. Carried as a book slip and
// asserted as such, per §1 clause 1: match the book, do not quietly improve it.
{
  for (const s of SAMPLES) {
    const expected = statTn(s.vi, s.level);
    if (s.printedSaveTn === undefined) {
      passed++; // no separate figure printed; the sheet shows the Vitality TN twice
      continue;
    }
    ok(s.printedSaveTn !== expected,
      `KNOWN BOOK SLIP: ${s.name} prints Save TN ${s.printedSaveTn}% against a Vitality TN of ${expected}%`);
  }
  // If a future transcription pass makes this agree, the assertion above fails and the
  // errata note gets revisited rather than silently outliving the slip.
  eq(SAMPLES.filter(s => s.printedSaveTn !== undefined).length, 1,
    "exactly one sheet disagrees with saveTN = vitalityTN");
}

// --- book slips, recorded not corrected (§1 clause 1) ----------------------
// Two sheets disagree with themselves. In both cases the printed figure is outvoted by
// other printed figures on the SAME page, so the corroborated value is what the tables
// above use — and the slip is asserted here so it cannot quietly vanish in a later
// transcription pass. Same handling as Scáthach's 498 HP in GAUNTLET.md §6.
{
  const slips = SAMPLES.filter(s => s.slip);
  eq(slips.length, 2, "exactly two sample sheets contradict themselves");

  for (const s of slips) {
    ok(s.slip.printed !== s.slip.corroborated,
      `KNOWN BOOK SLIP: ${s.name} (p.${s.page}) prints ${s.slip.field} ${s.slip.printed}, `
      + `corroborated as ${s.slip.corroborated} — ${s.slip.why}`);
    ok(s.slip.why.length > 20, `${s.name}'s slip carries its corroboration, not just a claim`);
  }

  // Pixie's is the derived Magic TN; Hellhound's is the Magic stat itself, so its
  // knock-on figures must all still derive from the corroborated 6.
  const hh = SAMPLES.find(s => s.name === "Hellhound");
  eq(statTn(hh.ma, hh.level), 39, "Hellhound's printed Magic TN derives from Magic 6");
  eq(basePower(hh.ma, hh.level), 15, "so does its printed Base Magical Power");
  eq(resolveResourceMax({ stat: hh.ma, level: hh.level, multiplier: 3 }), 45, "and its printed MP");
}

// --- gear is additive on top of the derived value (p.114) ------------------
{
  const soldier = SAMPLES.find(s => s.name === "Soldier");
  eq(resistance(soldier.vi, soldier.level) + soldier.gearPhysRes, 12,
    "Soldier's printed 12 physical resistance is 6 derived plus 6 from armour");
}

// --- the formulas fail closed ----------------------------------------------
{
  eq(statTn(undefined, undefined), 0, "a missing stat and level give 0, not NaN");
  eq(dodgeTn(null), SMT.dodgeBonus, "a null agility still yields the flat bonus");
  eq(negotiationTn(NaN), SMT.negotiation.bonus, "a NaN luck still yields the flat bonus");
  eq(resistance("x", "y"), 0, "non-numeric inputs give 0");
  eq(basePower(NaN, 5), 5, "a NaN stat contributes nothing");
  eq(fatePoints(-10), SMT.fate.maxBase - 2, "a negative luck floors toward fewer points, never NaN");
  eq(startingMacca(0), 0, "a level of 0 starts with nothing");

  // Fate rounds down, so 0-4 Luck are all the base value.
  for (const luck of [0, 1, 2, 3, 4]) {
    eq(fatePoints(luck), SMT.fate.maxBase, `Luck ${luck} gives the base fate points`);
  }
  eq(fatePoints(5), SMT.fate.maxBase + 1, "Luck 5 buys the first extra fate point");
  eq(fatePoints(14), SMT.fate.maxBase + 2, "the Reporter's Luck 14 buys two");
}

// --- the stat cap is a single owned constant (p.39) ------------------------
{
  eq(SMT.statCap, 40, "stats cap at 40 (p.39)");
  eq(SMT.startingMaccaPerLevel, 50, "starting macca is 50 per level (p.36)");
  eq(SMT.magatama.maxIngested, 3, "a fiend may ingest three Magatama (p.39)");
}

console.log(`\nsmt-rpg sample-character tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 25)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
