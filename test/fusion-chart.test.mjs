// Oracle for the cross-clan Normal Fusion Chart (p.82). Run: `node test/fusion-chart.test.mjs`
// (exit 0 pass, 1 fail). Stubs the Foundry globals like run-tests.mjs; no Foundry/DOM/network.
//
// This is a SPOT-CHECK, not the whole spec: it verifies the lookup ENGINE (commutativity,
// case-insensitivity, completeness/shape, same-clan -> null) plus a SAMPLE of anchor cells
// transcribed from the book. It cannot prove all ~400 chart cells are correct — fill the
// WHOLE chart faithfully, do not special-case these anchors.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

let passed = 0, failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`${label}\n    expected ${e}\n    got      ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

const mod = await import("../module/helpers/fusion.mjs");
const crossClanFusion = mod.crossClanFusion;

if (typeof crossClanFusion !== "function") {
  console.error("FAIL: fusion.mjs does not export a `crossClanFusion(clanA, clanB)` function — nothing to test.");
  process.exit(1);
}

// The 29 clans on the Normal Fusion Chart axes (everything in SMT.demonClans except the
// special mitama + element). Cross-clan results are always one of these (or null).
const chartClans = Object.keys(SMT.demonClans).filter(k => k !== "mitama" && k !== "element");
const validResults = new Set([...chartClans, null]);

// Anchor cells transcribed from p.82 (the clearly-legible top-left block). Each is
// {clanA + clanB -> resultClan}. The lookup is commutative, so order must not matter.
const anchors = [
  ["deity",  "kishin", "fury"],
  ["deity",  "holy",   "megami"],
  ["deity",  "fairy",  "night"],
  ["deity",  "snake",  "kishin"],
  ["megami", "fury",   "deity"],
  ["megami", "lady",   "fury"],
  ["megami", "kishin", "lady"],
  ["megami", "holy",   "divine"],
  ["megami", "fallen", "divine"],
  ["fury",   "lady",   "vile"],
  ["fury",   "kishin", "lady"],
  ["fury",   "holy",   "kishin"],
  ["fury",   "yoma",   "holy"],
  ["fury",   "divine", "deity"],
  ["lady",   "kishin", "fury"],
  ["lady",   "holy",   "avatar"],
  ["lady",   "yoma",   "night"],
  ["lady",   "fairy",  "yoma"],
  ["lady",   "divine", "megami"],
  ["lady",   "snake",  "femme"],
];

// 1. Anchor cells match the book, both orderings.
for (const [a, b, want] of anchors) {
  eq(crossClanFusion(a, b), want, `chart: ${a}+${b} -> ${want}`);
  eq(crossClanFusion(b, a), want, `chart commutative: ${b}+${a} -> ${want}`);
}

// 2. Case-insensitive (matches elementClanFor's contract).
eq(crossClanFusion("DEITY", "Kishin"), "fury", "case-insensitive lookup");

// 3. Same-clan is NOT a cross-clan result (handled by elementClanFor) -> null.
eq(crossClanFusion("fairy", "fairy"), null, "same-clan returns null (element-born is elementClanFor's job)");

// 4. Completeness + shape: every ordered pair resolves to a valid clan key or null,
//    never undefined, and is always commutative. Forces the WHOLE chart to be filled.
let undef = 0, badKey = 0, asym = 0;
for (const a of chartClans) {
  for (const b of chartClans) {
    const r = crossClanFusion(a, b);
    if (r === undefined) undef++;
    else if (!validResults.has(r)) badKey++;
    if (JSON.stringify(crossClanFusion(a, b)) !== JSON.stringify(crossClanFusion(b, a))) asym++;
  }
}
eq(undef, 0, "every clan x clan pair resolves (no undefined)");
eq(badKey, 0, "every result is a valid chart clan key or null");
eq(asym, 0, "lookup is commutative across all pairs");

console.log(`fusion-chart oracle: ${passed} passed, ${failed} failed`);
if (failed) { console.error("\nFailures:\n  - " + failures.join("\n  - ")); process.exit(1); }
process.exit(0);
