// Demon Stat Growth Table (p.34, applied on level-up per p.49).
// `node test/stat-growth.test.mjs` (exit 0 pass, 1 fail).
//
// spec: demon-level-ups-roll-their-stat-growth
//
// p.34, verbatim: "For each level above the first, PCs gain 1 point to increase
// their stats. Fiends and humans may apply this point to any stat they prefer.
// Demons, however, apply the point randomly. Roll 1d10, and consult the table
// below."
//
//   1 Strength · 2 Magic · 3 Vitality · 4 Agility · 5 Luck
//   6, 7, 8  Favored stat, as determined by demon embodied
//   9, 0     Increase whichever stat is preferred
//
// "0" is the 10 face of a d10. So a demon's growth is NOT a choice — it is a roll
// the system should make, except on 9/10 where the book hands it back to the player.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { statGrowthFor } = await import("../module/helpers/advancement.mjs");

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

// --- the table, face by face ----------------------------------------------
{
  eq(statGrowthFor(1, "luck"), { stat: "strength", playerChoice: false }, "1 -> Strength");
  eq(statGrowthFor(2, "luck"), { stat: "magic", playerChoice: false }, "2 -> Magic");
  eq(statGrowthFor(3, "luck"), { stat: "vitality", playerChoice: false }, "3 -> Vitality");
  eq(statGrowthFor(4, "luck"), { stat: "agility", playerChoice: false }, "4 -> Agility");
  eq(statGrowthFor(5, "luck"), { stat: "luck", playerChoice: false }, "5 -> Luck");

  for (const face of [6, 7, 8]) {
    eq(statGrowthFor(face, "magic"), { stat: "magic", playerChoice: false },
      `${face} -> the favored stat`);
    eq(statGrowthFor(face, "vitality"), { stat: "vitality", playerChoice: false },
      `${face} follows whichever stat is favored`);
  }

  // 9 and 0 hand the point back to the player. "0" is the 10 face of a d10.
  for (const face of [9, 10]) {
    eq(statGrowthFor(face, "luck"), { stat: null, playerChoice: true },
      `${face === 10 ? "0 (the 10 face)" : "9"} -> player's choice`);
  }
}

// --- a demon with no favored stat -----------------------------------------
// The three Manikins print no asterisk at all (verified against the rendered
// p.210). A 6-8 roll then has nothing to point at, so it becomes a choice rather
// than silently landing on Strength.
{
  for (const face of [6, 7, 8]) {
    eq(statGrowthFor(face, ""), { stat: null, playerChoice: true },
      `${face} with no favored stat becomes a choice`);
    eq(statGrowthFor(face, null), { stat: null, playerChoice: true },
      `${face} with a null favored stat becomes a choice`);
  }
}

// --- fail-closed ----------------------------------------------------------
{
  for (const bad of [0, 11, -1, 1.5, NaN, null, undefined, "3"]) {
    const r = statGrowthFor(bad, "luck");
    ok(r.playerChoice === true && r.stat === null,
      `an off-table roll (${JSON.stringify(bad)}) never guesses a stat`);
  }
  // An unknown favored stat is not written through as if it were real.
  eq(statGrowthFor(6, "bogus"), { stat: null, playerChoice: true },
    "an unrecognised favored stat does not become a stat name");
}

// --- every face is covered, and only real stats are produced --------------
{
  const STATS = ["strength", "magic", "vitality", "agility", "luck"];
  let determined = 0;
  for (let face = 1; face <= 10; face++) {
    const r = statGrowthFor(face, "luck");
    if (r.playerChoice) continue;
    determined++;
    ok(STATS.includes(r.stat), `face ${face} yields a real stat (${r.stat})`);
  }
  eq(determined, 8, "8 of the 10 faces are determined; 9 and 0 are the player's");

  // The favored stat is reachable on 3 faces plus its own numbered face, which is
  // the bias the table exists to create.
  const favouredHits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map(f => statGrowthFor(f, "magic"))
    .filter(r => r.stat === "magic").length;
  eq(favouredHits, 4, "a favored stat comes up on 4 of 10 faces (its own, plus 6-8)");
}

console.log(`\nsmt-rpg stat-growth tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 20)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
