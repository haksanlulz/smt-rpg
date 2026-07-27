// Rank Up / Rank Down fusion result selection (p.81).
// `node test/rank-shift.test.mjs` (exit 0 pass, 1 fail).
//
// spec: rank-shift-fusion-names-a-demon
//
// p.81, verbatim: "When fusing an Element demon with any non-Element demon, the
// resulting demon is of the same clan as the non-Element demon but one rank higher
// or lower... 'Rank Up' in this case, means to take the non-Element demon fused and
// find the demon that is closest to it in level within the same clan but higher.
// Rank Down means to find one lower in level." Cursed fusion reverses the direction.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { rankShiftFusion, rankShiftResult, isExceptionDemon } =
  await import("../module/helpers/fusion.mjs");

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

const fusable = SMT.demons.filter(d => !d.boss);
const ELEMENTS = Object.keys(SMT.fusion.elementClans);
const poolOf = (clan) => fusable.filter(d => d.clan === clan).sort((a, b) => a.level - b.level);

// --- direction lookup is unchanged, re-guarded here alongside the selection ---
{
  eq(ELEMENTS.sort(), ["aeros", "aquans", "erthys", "flaemis"], "four Element clans (p.81)");
  eq(rankShiftFusion("deity", "flaemis"), "down", "Deity x Flaemis ranks down (p.81 table)");
  eq(rankShiftFusion("flaemis", "deity"), "down", "argument order does not matter");
  eq(rankShiftFusion("lady", "erthys"), "up", "Lady x Erthys ranks up (p.81 table)");
  eq(rankShiftFusion("deity", "megami"), null, "two non-Elements are not a rank shift");
  eq(rankShiftFusion("flaemis", "aquans"), null, "two Elements are not a rank shift");
}

// --- rankShiftResult: the demon the shift actually produces ---------------
{
  // Up = lowest demon in the clan strictly above the ingredient's level.
  // Down = highest demon strictly below it.
  for (const clan of [...new Set(fusable.map(d => d.clan))]) {
    const pool = poolOf(clan).filter(d => !isExceptionDemon(d.name));
    if (pool.length < 3) continue;
    for (const d of poolOf(clan)) {
      const up = rankShiftResult(clan, d.level, "up");
      const wantUp = pool.find(x => x.level > d.level) ?? null;
      eq(up?.name ?? null, wantUp?.name ?? null, `up from ${clan} ${d.level} -> nearest above`);
      if (up) ok(up.level > d.level, `up result is strictly higher (${clan} ${d.level})`);

      const down = rankShiftResult(clan, d.level, "down");
      const below = pool.filter(x => x.level < d.level);
      const wantDown = below.length ? below[below.length - 1] : null;
      eq(down?.name ?? null, wantDown?.name ?? null, `down from ${clan} ${d.level} -> nearest below`);
      if (down) ok(down.level < d.level, `down result is strictly lower (${clan} ${d.level})`);
    }
  }
}

// --- cursed reverses the direction (p.81) --------------------------------
{
  const clan = "fairy";
  const pool = poolOf(clan);
  ok(pool.length >= 3, "fairy clan has enough members to shift within");
  const mid = pool[Math.floor(pool.length / 2)];

  const up = rankShiftResult(clan, mid.level, "up");
  const cursedUp = rankShiftResult(clan, mid.level, "up", { cursed: true });
  const down = rankShiftResult(clan, mid.level, "down");
  eq(cursedUp?.name ?? null, down?.name ?? null, "cursed turns a Rank Up into a Rank Down");

  const cursedDown = rankShiftResult(clan, mid.level, "down", { cursed: true });
  eq(cursedDown?.name ?? null, up?.name ?? null, "cursed turns a Rank Down into a Rank Up");
}

// --- exception demons are stepped over, never produced -------------------
{
  for (const clan of [...new Set(fusable.map(d => d.clan))]) {
    for (const d of poolOf(clan)) {
      for (const dir of ["up", "down"]) {
        const r = rankShiftResult(clan, d.level, dir);
        if (r) ok(!isExceptionDemon(r.name), `never returns an exception demon (${clan} ${d.level} ${dir} -> ${r.name})`);
        if (r) ok(!r.boss, `never returns a boss-only demon (${clan} ${d.level} ${dir})`);
      }
    }
  }
}

// --- ceilings and floors fail closed -------------------------------------
{
  const pool = poolOf("deity").filter(d => !isExceptionDemon(d.name));
  const top = pool[pool.length - 1];
  const bottom = pool[0];
  eq(rankShiftResult("deity", top.level, "up"), null, "no demon above the clan ceiling");
  eq(rankShiftResult("deity", bottom.level, "down"), null, "no demon below the clan floor");
  eq(rankShiftResult("deity", 999, "up"), null, "absurd level up yields null");
}

// --- fail-closed ---------------------------------------------------------
{
  eq(rankShiftResult("", 10, "up"), null, "blank clan yields null");
  eq(rankShiftResult("notaclan", 10, "up"), null, "unknown clan yields null");
  eq(rankShiftResult("deity", NaN, "up"), null, "NaN level yields null");
  eq(rankShiftResult("deity", 10, "sideways"), null, "unknown direction yields null");
  eq(rankShiftResult("deity", 10, null), null, "null direction yields null");
  // Element clans are the ingredient side, never a rank-shift result clan.
  for (const e of ELEMENTS) {
    eq(rankShiftResult(e, 10, "up"), null, `${e} is not a rank-shift result clan`);
  }
}

console.log(`\nsmt-rpg rank-shift tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 20)) console.log("  - " + f);
  if (failures.length > 20) console.log(`  ... +${failures.length - 20} more`);
  process.exit(1);
}
process.exit(0);
