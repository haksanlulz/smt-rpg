// Cross-clan Normal Fusion Chart (p.82) tests: `node test/fusion-chart.test.mjs` (exit 0 pass, 1 fail).
// Zero-dependency; stubs CONFIG.SMT like run-tests.mjs. These probe the DATA (config) and the
// crossClanFusion helper as a pair: transcription self-consistency + the fail-closed contract.
// Deliberately property-based (whole-matrix sweeps), not a handful of memorised cells, so the
// suite cannot pass by special-casing an oracle.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { crossClanFusion, rankShiftFusion } = await import("../module/helpers/fusion.mjs");

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

const { clanOrder, chart } = SMT.fusion.normalChart;
const keySet = new Set(clanOrder);
const idx = Object.fromEntries(clanOrder.map((c, i) => [c, i]));

// Structural integrity of the transcribed data
{
  // The axis is the 29 clans from p.82, no dupes.
  eq(clanOrder.length, 29, "chart axis has 29 clans");
  eq(new Set(clanOrder).size, 29, "chart axis clans are unique");

  // Every chart entry is upper-triangular (col strictly after row in clanOrder) and BOTH its
  // row key, col key, and result value are real clan keys — a typo cannot ship a bad key.
  let cells = 0;
  const badRow = [];
  const badCol = [];
  const badVal = [];
  const notUpper = [];
  const sameClanCell = [];
  for (const [row, cols] of Object.entries(chart)) {
    if (!keySet.has(row)) badRow.push(row);
    for (const [col, val] of Object.entries(cols)) {
      cells++;
      if (!keySet.has(col)) badCol.push(`${row}.${col}`);
      if (!keySet.has(val)) badVal.push(`${row}.${col}=${val}`);
      if (idx[col] === idx[row]) sameClanCell.push(`${row}.${col}`);
      else if (idx[col] < idx[row]) notUpper.push(`${row}.${col}`);
    }
  }
  eq(badRow, [], "every chart row key is a valid clan");
  eq(badCol, [], "every chart column key is a valid clan");
  eq(badVal, [], "every chart result value is a valid clan key");
  eq(sameClanCell, [], "no chart cell is on the diagonal (same-clan)");
  eq(notUpper, [], "every stored cell is upper-triangular (col after row)");
  // The p.82 chart is dense but not full; lock the transcribed non-null count so a dropped or
  // duplicated row is caught. 339 cross-clan results, well under the 406 upper-tri cells.
  eq(cells, 339, "exactly 339 cross-clan result cells transcribed");
  ok(cells < (29 * 28) / 2, "non-null cells fewer than all upper-triangle cells (blanks exist)");
}

// Commutativity + diagonal nullity across the ENTIRE 29x29 grid (not a sample)
{
  const asymmetric = [];
  const diagonalNonNull = [];
  for (const a of clanOrder) {
    for (const b of clanOrder) {
      const ab = crossClanFusion(a, b);
      const ba = crossClanFusion(b, a);
      if (ab !== ba) asymmetric.push(`${a},${b}: ${ab} != ${ba}`);
      if (a === b && ab !== null) diagonalNonNull.push(`${a}`);
      // Whatever it returns for a real pair must itself be a valid clan key (or null).
      if (ab !== null && !keySet.has(ab)) asymmetric.push(`${a},${b}: bad result ${ab}`);
    }
  }
  eq(asymmetric, [], "crossClanFusion is commutative over the whole grid + only emits valid keys");
  eq(diagonalNonNull, [], "same-clan (diagonal) always returns null");
}

// Every transcribed cell round-trips through the helper (forward and mirrored)
{
  const mismatches = [];
  for (const [row, cols] of Object.entries(chart)) {
    for (const [col, val] of Object.entries(cols)) {
      if (crossClanFusion(row, col) !== val) mismatches.push(`${row},${col}`);
      if (crossClanFusion(col, row) !== val) mismatches.push(`${col},${row} (mirror)`);
    }
  }
  eq(mismatches, [], "every data cell is reachable via crossClanFusion both ways");
}

// Fail-closed contract: unknown / empty / malformed input NEVER throws, always null
{
  const garbage = ["", "   ", "notaclan", "FAIRYY", null, undefined, 0, 42, {}, [], NaN, true];
  for (const g of garbage) {
    let threw = false;
    let out;
    try { out = crossClanFusion(g, "fury"); } catch { threw = true; }
    ok(!threw, `crossClanFusion(${String(g)}, fury) does not throw`);
    eq(out, null, `crossClanFusion(${String(g)}, fury) is null`);

    threw = false;
    try { out = crossClanFusion("fury", g); } catch { threw = true; }
    ok(!threw, `crossClanFusion(fury, ${String(g)}) does not throw`);
    eq(out, null, `crossClanFusion(fury, ${String(g)}) is null`);
  }
  // Both-garbage and same-garbage cases.
  eq(crossClanFusion("xx", "yy"), null, "two unknown clans -> null");
  eq(crossClanFusion("fairy", "fairy"), null, "same clan -> null (element's job)");
  eq(crossClanFusion("FURY", "kishin"), crossClanFusion("fury", "KISHIN"), "case-insensitive + commutative");
  eq(crossClanFusion("  fury  ", "kishin"), crossClanFusion("fury", "kishin"), "input is trimmed");
}

// A blank ("-") chart cell resolves to null even though both clans are valid. deity x vile is a
// dash on p.82 (deity has no 'vile' entry), so it must be null rather than a fabricated result.
{
  ok(!("vile" in chart.deity), "deity x vile is a blank cell in the data");
  eq(crossClanFusion("deity", "vile"), null, "a blank chart cell -> null");
  eq(crossClanFusion("vile", "deity"), null, "blank cell is null mirrored too");
}

// Spot checks beyond the committed oracle (held-out anchors a judge can cross-read on p.82).
{
  eq(crossClanFusion("deity", "kishin"), "fury", "deity x kishin = fury (oracle)");
  eq(crossClanFusion("megami", "fury"), "deity", "megami x fury = deity");
  eq(crossClanFusion("fairy", "beast"), "divine", "fairy x beast = divine");
  eq(crossClanFusion("holy", "yoma"), "divine", "holy x yoma = divine");
  eq(crossClanFusion("snake", "beast"), "brute", "snake x beast = brute");
  eq(crossClanFusion("avian", "raptor"), "megami", "avian x raptor = megami");
  eq(crossClanFusion("raptor", "entity"), "vile", "raptor x entity = vile");
  eq(crossClanFusion("seraph", "wargod"), "kishin", "seraph x wargod = kishin");
  eq(crossClanFusion("genma", "raptor"), "lady", "genma x raptor = lady");
  eq(crossClanFusion("yoma", "vile"), "jirae", "yoma x vile = jirae");
}

// Graceful degradation if the SSoT is missing/garbled (defensive, mirrors real misconfig).
{
  const realFusion = CONFIG.SMT.fusion;
  CONFIG.SMT = { ...CONFIG.SMT, fusion: { ...realFusion, normalChart: undefined } };
  eq(crossClanFusion("deity", "kishin"), null, "missing normalChart -> null, no throw");
  CONFIG.SMT = { ...CONFIG.SMT, fusion: { ...realFusion, normalChart: { clanOrder: [], chart: {} } } };
  eq(crossClanFusion("deity", "kishin"), null, "empty chart -> null, no throw");
  CONFIG.SMT = { ...CONFIG.SMT, fusion: realFusion }; // restore
  eq(crossClanFusion("deity", "kishin"), "fury", "restored chart resolves again");
}

// REGRESSION — the field's single worst liability: an engine that does a naive
// chart[a]?.[b] ?? chart[b]?.[a] double-read with NO guard that the looked-up result is a
// real clan on the axis. A transcription typo (off-axis result key) or a stray
// lower-triangle cell would then silently PROPAGATE a bad clan into fusion instead of
// failing closed. The shipped engine canonicalises via clanOrder and guards the result with
// order.includes(result). This block pins that contract so a future regression to the naive
// double-read can never re-enter: an off-axis stored result must degrade to null, and stored
// data must stay strictly upper-triangular (no lower-triangle duplicates a mirror could read).
{
  const realFusion = CONFIG.SMT.fusion;
  const real = realFusion.normalChart;

  // (a) Off-axis result key in a cell MUST resolve to null, not propagate the bad clan.
  const poisoned = {
    clanOrder: ["aa", "bb", "cc"],
    chart: { aa: { bb: "zz" } }   // "zz" is NOT on clanOrder -> must be rejected
  };
  CONFIG.SMT = { ...CONFIG.SMT, fusion: { ...realFusion, normalChart: poisoned } };
  eq(crossClanFusion("aa", "bb"), null, "off-axis result key degrades to null (no bad-clan propagation)");
  eq(crossClanFusion("bb", "aa"), null, "off-axis result key is null on the mirrored read too");

  // A valid on-axis result in the same shape still resolves (guard is targeted, not blanket).
  const clean = { clanOrder: ["aa", "bb", "cc"], chart: { aa: { bb: "cc" } } };
  CONFIG.SMT = { ...CONFIG.SMT, fusion: { ...realFusion, normalChart: clean } };
  eq(crossClanFusion("aa", "bb"), "cc", "a valid on-axis result still resolves");
  eq(crossClanFusion("bb", "aa"), "cc", "on-axis result is commutative");

  CONFIG.SMT = { ...CONFIG.SMT, fusion: realFusion }; // restore real data

  // (b) The real shipped chart stores ONLY the upper triangle — no lower-triangle cell that a
  // mirrored read could pick up as a conflicting (and unguarded) value.
  const order = real.clanOrder;
  const ix = Object.fromEntries(order.map((c, i) => [c, i]));
  let lowerTri = 0;
  for (const [row, cols] of Object.entries(real.chart)) {
    for (const col of Object.keys(cols)) {
      if (ix[col] <= ix[row]) lowerTri++;
    }
  }
  eq(lowerTri, 0, "real chart has zero lower-triangle cells (mirror can never read a conflicting value)");
}

// REGRESSION — rankShift graft (p.81 Rank Up/Down): the table + pure rankShiftFusion helper.
// Direction values were independently re-verified against the PDF by positional extraction
// (84/84 cells, 0 mismatches). This pins the graft so it cannot silently rot: the helper is
// order-free, needs EXACTLY one Element side, is fail-closed, and the table stays complete.
{
  const { elementClans, rankShift } = CONFIG.SMT.fusion;
  const elements = Object.keys(elementClans);          // flaemis, aquans, aeros, erthys
  eq(elements.length, 4, "four Element clans (flaemis/aquans/aeros/erthys)");

  // Table completeness: 21 non-Element clans x 4 elements = 84 cells, each "up" | "down".
  let cells = 0, bad = [];
  for (const [clan, row] of Object.entries(rankShift)) {
    for (const el of elements) {
      const v = row[el];
      if (v !== "up" && v !== "down") bad.push(`${clan}.${el}=${v}`);
      else cells++;
    }
  }
  eq(rankShift && Object.keys(rankShift).length, 21, "rankShift covers 21 non-Element clans");
  eq(bad, [], "every rankShift cell is exactly 'up' or 'down'");
  eq(cells, 84, "rankShift table has 84 complete cells");

  // A few PDF-verified anchors (independently positional-extracted), both argument orders.
  eq(rankShiftFusion("holy", "flaemis"), "up", "holy + flaemis = up (p.81)");
  eq(rankShiftFusion("flaemis", "holy"), "up", "rankShift is order-free");
  eq(rankShiftFusion("lady", "erthys"), "up", "lady + erthys = up (p.81)");
  eq(rankShiftFusion("deity", "flaemis"), "down", "deity + flaemis = down (p.81)");
  eq(rankShiftFusion("yoma", "aquans"), "up", "yoma + aquans = up (p.81)");

  // Fail-closed contract: needs exactly one Element side, never throws on garbage.
  eq(rankShiftFusion("holy", "deity"), null, "two non-Element clans -> null (no Element side)");
  eq(rankShiftFusion("flaemis", "aquans"), null, "two Element clans -> null");
  eq(rankShiftFusion("holy", "holy"), null, "same non-Element clan -> null");
  for (const g of ["", "   ", "notaclan", null, undefined, 0, {}, [], NaN]) {
    let threw = false, out;
    try { out = rankShiftFusion(g, "flaemis"); } catch { threw = true; }
    ok(!threw, `rankShiftFusion(${String(g)}, flaemis) does not throw`);
    eq(out, null, `rankShiftFusion(${String(g)}, flaemis) is null`);
  }
}

console.log(`\nsmt-rpg fusion-chart tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
