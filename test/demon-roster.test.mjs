// Demon roster + fusion result-demon selection (p.80, Ch.5 p.126-235).
// `node test/demon-roster.test.mjs` (exit 0 pass, 1 fail).
//
// spec: cross-clan-fusion-names-a-demon

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { resultDemonFor, crossClanFusion, computeFusionLevel, isExceptionDemon } =
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

const roster = SMT.demons;
const fusable = roster.filter(d => !d.boss);

// --- roster integrity -----------------------------------------------------
{
  ok(roster.length >= 190, `roster is populated (${roster.length} >= 190)`);
  eq(fusable.length, 171, "171 general demons (p.126-211, two per page bar the last)");
  eq(roster.length - fusable.length, 23, "23 boss-only demons (p.213-235)");

  // Every clan must be a clan the fusion chart knows, or a documented off-chart
  // special (element/mitama fusion, corpus, and the boss-only clans).
  const onChart = new Set(SMT.fusion.normalChart.clanOrder);
  const OFF_CHART = new Set(["element", "mitama", "corpus", "zoa", "hallel", "light"]);
  const unknown = [...new Set(roster.map(d => d.clan))].filter(c => !onChart.has(c) && !OFF_CHART.has(c)).sort();
  eq(unknown, [], "every demon clan is on the p.82 chart or a documented off-chart clan");

  // The four Element and four Mitama demons are the special-fusion clans and must
  // not be reachable through the normal cross-clan chart.
  eq(fusable.filter(d => d.clan === "element").length, 4, "four Element demons (p.143-144)");
  eq(fusable.filter(d => d.clan === "mitama").length, 4, "four Mitama demons (p.145-146)");

  for (const d of roster) {
    ok(typeof d.name === "string" && d.name.length > 0, `demon has a name (${d.name})`);
    ok(Number.isInteger(d.level), `${d.name} level is an integer`);
    // One entry is out of range and says so: the book prints LVL 440 (p.218).
    if (!d.bookLevel) ok(d.level >= 1 && d.level <= 99, `${d.name} level in 1..99 (${d.level})`);
  }

  // Book errata are recorded, not silently corrected.
  const baal = roster.find(d => d.name === "Baal Avatar");
  eq(baal.clan, "deity", "Baal Avatar normalised to the deity clan");
  eq(baal.bookClan, "DIETY", "Baal Avatar keeps the book's own spelling on the entry");
  eq(roster.find(d => d.name === "Specter (3rd Time)").level, 440, "Specter (3rd Time) keeps the printed LVL 440");

  // Spot anchors read off the rendered pages.
  eq(roster.find(d => d.name === "Vishnu"), { name: "Vishnu", clan: "deity", level: 93 }, "anchor: Vishnu p.126");
  eq(roster.find(d => d.name === "Mitra"), { name: "Mitra", clan: "deity", level: 78 }, "anchor: Mitra p.126");
  ok(roster.some(d => d.name === "Scáthach"), "accented names survive extraction (Scáthach)");
  ok(roster.some(d => d.name === "Dís"), "accented names survive extraction (Dís)");
}

// --- resultDemonFor: p.80 selection rule ----------------------------------
// "find the level of the demon in the new clan closest to that number and no less
// than" -> the lowest-level demon in the clan at or above the fusion level.
{
  const deity = fusable.filter(d => d.clan === "deity").sort((a, b) => a.level - b.level);
  const lowest = deity[0];

  eq(resultDemonFor("deity", 1)?.name, lowest.name, "below the clan floor yields the lowest demon in the clan");
  eq(resultDemonFor("deity", lowest.level)?.name, lowest.name, "an exact level match yields that demon");

  // Property: for every fusable clan and every level, the result is in that clan,
  // at or above the requested level, and is the lowest such demon.
  const clans = [...new Set(fusable.map(d => d.clan))];
  for (const clan of clans) {
    const pool = fusable.filter(d => d.clan === clan && !isExceptionDemon(d.name))
      .sort((a, b) => a.level - b.level);
    if (!pool.length) continue;
    for (let lvl = 1; lvl <= 99; lvl += 7) {
      const got = resultDemonFor(clan, lvl);
      const want = pool.find(d => d.level >= lvl) ?? pool[pool.length - 1];
      if (!got) { failed++; failures.push(`resultDemonFor(${clan}, ${lvl}) returned null`); continue; }
      ok(got.clan === clan, `result stays in the requested clan (${clan}, ${lvl})`);
      eq(got.name, want.name, `lowest demon at or above the level (${clan}, ${lvl})`);
    }
  }

  // Above the clan ceiling there is nothing higher; the top demon is the result.
  const top = deity[deity.length - 1];
  eq(resultDemonFor("deity", 99)?.level, top.level, "above the ceiling yields the highest demon in the clan");
}

// --- exception demons (p.80) ----------------------------------------------
// "ignore it and instead find the demon a rank higher (or, in the case of a Rank
// Down, use a rank lower)".
{
  // No exception demon is ever returned as a normal fusion result.
  const clans = [...new Set(fusable.map(d => d.clan))];
  for (const clan of clans) {
    for (let lvl = 1; lvl <= 99; lvl += 5) {
      const got = resultDemonFor(clan, lvl);
      if (got) ok(!isExceptionDemon(got.name), `never returns an exception demon (${clan} ${lvl} -> ${got.name})`);
    }
  }

  // Amaterasu (Deity, exception) must be stepped over rather than produced.
  const ama = fusable.find(d => d.name === "Amaterasu");
  ok(ama && isExceptionDemon(ama.name), "Amaterasu is on the p.80 exception list");
  const at = resultDemonFor("deity", ama.level);
  ok(at && at.name !== "Amaterasu", "fusing to Amaterasu's level steps to another demon");
  ok(at.level >= ama.level, "the step goes a rank higher, not lower");

  // Rank Down steps the other way.
  const down = resultDemonFor("deity", ama.level, { rankDown: true });
  ok(down && down.name !== "Amaterasu", "rank-down also steps over the exception demon");
  ok(down.level <= ama.level, "rank down steps to a lower or equal level");
}

// --- fail-closed ----------------------------------------------------------
{
  eq(resultDemonFor("", 10), null, "blank clan yields null");
  eq(resultDemonFor("notaclan", 10), null, "unknown clan yields null");
  eq(resultDemonFor("deity", NaN), null, "NaN level yields null");
  eq(resultDemonFor(null, null), null, "null args yield null");
  // Boss-only clans are not a fusion pool.
  eq(resultDemonFor("zoa", 50), null, "boss-only clan yields null (not in the fusion pool)");
  eq(resultDemonFor("light", 50), null, "boss-only Light clan yields null");
}

// --- end to end: two demons -> a named result -----------------------------
// The whole point of the roster: a cross-clan pair now produces a demon, not just
// a clan. Swept over real pairs rather than one hand-picked example — the first
// draft of this block picked Pixie x Jack Frost, which are both Fairy, so the
// chart correctly returned null and the "end to end" case tested nothing.
{
  // Same clan is not a cross-clan fusion; the chart returns null by design.
  const pixie = fusable.find(d => d.name === "Pixie");
  const jack = fusable.find(d => d.name === "Jack Frost");
  eq(pixie.clan, jack.clan, "Pixie and Jack Frost are both Fairy");
  eq(crossClanFusion(pixie.clan, jack.clan), null, "same-clan pairs are not on the cross-clan chart");

  const onChart = new Set(SMT.fusion.normalChart.clanOrder);
  const byClan = new Map();
  for (const d of fusable) {
    if (onChart.has(d.clan) && !byClan.has(d.clan)) byClan.set(d.clan, d);
  }
  const reps = [...byClan.values()];
  ok(reps.length >= 20, `chart clans represented in the roster (${reps.length} >= 20)`);

  let resolved = 0;
  let attempted = 0;
  for (let i = 0; i < reps.length; i++) {
    for (let j = i + 1; j < reps.length; j++) {
      const a = reps[i];
      const b = reps[j];
      const clan = crossClanFusion(a.clan, b.clan);
      if (!clan) continue;            // off-axis pairs have no defined result
      attempted++;
      const level = computeFusionLevel(a.level, b.level);
      const result = resultDemonFor(clan, level);
      if (!result) continue;          // result clan may have no fusable members
      resolved++;
      ok(result.clan === clan, `${a.name} x ${b.name}: named demon is in the result clan`);
      ok(!isExceptionDemon(result.name), `${a.name} x ${b.name}: never an exception demon`);
      ok(!result.boss, `${a.name} x ${b.name}: never a boss-only demon`);
    }
  }
  ok(attempted >= 100, `cross-clan pairs exercised (${attempted} >= 100)`);
  ok(resolved >= attempted * 0.9, `pairs naming a demon (${resolved}/${attempted})`);
}

console.log(`\nsmt-rpg demon-roster tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 25)) console.log("  - " + f);
  if (failures.length > 25) console.log(`  ... +${failures.length - 25} more`);
  process.exit(1);
}
process.exit(0);
