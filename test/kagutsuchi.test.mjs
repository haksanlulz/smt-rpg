// The Kagutsuchi Chart (p.56, p.301).
// `node test/kagutsuchi.test.mjs` (exit 0 pass, 1 fail).
//
// spec: the-kagutsuchi-track-wraps-and-full-changes-the-rules
//
// p.55: "Starting from New, it takes eight steps to get to Full, then another eight
// steps to get back to New. With 16 phases altogether, we measure phase 0 (New) to
// phase 8 (full), then go to phase 15 before returning to phase 0 (New) again."
//
// p.301: "Move 1 step per scene. Move 1 step per combat completed. Each time you pass
// 'New'/Phase 0, the PCs make a Luck check. If all PCs fail, or if one PC auto-fails or
// fumbles, the party encounters enemy demons. If a PC rolls a critical, something
// beneficial happens instead."
//
// Full (p.55, p.301): "Demons go wild, and won't engage in negotiations. Random
// encounter chances are higher. Sacrificial fusion is available."
//
// TWO THINGS THIS SUITE IS SHAPED AROUND.
//
// First, "passing New" is not "landing on New". Starting AT phase 0 and stepping off it
// does not pass it; landing on it does, and so does a full 16-step cycle back to it. A
// naive `phase === 0` check after the advance gets the first case wrong in one direction
// and a 16-step move wrong in the other, so the count is swept across the whole wheel.
//
// Second, the chart's parenthetical numbers are NOT mechanics. p.301 prints "Phase 0 (1)
// / Phase 1 (2) / Phase 3 (3) ..." — ten labels against sixteen phases, indexing the moon
// artwork. No rule reads them. They are named in the helper so the gap is not mistaken
// for something dropped.

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
  normalizePhase, advancePhase, newPassings, isNew, isFull, phaseTrend,
  negotiationBlocked, sacrificialFusionAvailable, encountersHeightened, newPassOutcome
} = await import("../module/helpers/kagutsuchi.mjs");

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

// ------------------------------------------------------------- the wheel

eq(SMT.kagutsuchi.phases, 16, "sixteen phases altogether (p.55)");
eq(SMT.kagutsuchi.newPhase, 0, "New is phase 0");
eq(SMT.kagutsuchi.fullPhase, 8, "Full is phase 8 — eight steps from New");

eq(normalizePhase(0), 0, "0 is 0");
eq(normalizePhase(15), 15, "15 is the last phase");
eq(normalizePhase(16), 0, "16 wraps to New");
eq(normalizePhase(17), 1, "…and 17 to phase 1");
eq(normalizePhase(-1), 15, "ESCAPE: a negative wraps FORWARD to 15, not to -1 — a "
  + "JavaScript % on a negative returns a negative, which would index off the chart");
eq(normalizePhase(-16), 0, "a full negative cycle is New");
eq(normalizePhase(2.7), 2, "a fraction floors");

eq(advancePhase(0, 8), 8, "eight steps from New reaches Full");
eq(advancePhase(8, 8), 0, "another eight returns to New");
eq(advancePhase(15, 1), 0, "15 rolls over to 0");
eq(advancePhase(0, 16), 0, "a whole cycle lands where it started");
eq(advancePhase(5, 0), 5, "no steps, no movement");
eq(advancePhase(3, -1), 2, "the GM may wind it back (p.56 lets them set it freely)");
eq(advancePhase(0, -1), 15, "…including backwards past New");

// Every phase must be reachable and the wheel must close.
{
  const seen = new Set();
  let p = 0;
  for (let i = 0; i < SMT.kagutsuchi.phases; i++) { seen.add(p); p = advancePhase(p, 1); }
  eq(seen.size, 16, "sixteen distinct phases are reachable by single steps");
  eq(p, 0, "…and the sixteenth step closes the wheel");
}

// -------------------------------------------------------- passing New

eq(newPassings(15, 1), 1, "15 -> 0 passes New");
eq(newPassings(0, 1), 0,
  "ESCAPE: starting AT New and stepping off does NOT pass it — a `phase === 0` check "
  + "after the move gets this backwards");
eq(newPassings(0, 16), 1, "a full cycle back to New passes it once");
eq(newPassings(8, 8), 1, "Full to New passes it");
eq(newPassings(8, 7), 0, "…but stopping at 15 does not");
eq(newPassings(14, 2), 1, "landing exactly on New counts");
eq(newPassings(1, 32), 2,
  "ESCAPE: two cycles pass New TWICE — the check is per passing, and a boolean would "
  + "silently drop the second");
eq(newPassings(5, 0), 0, "no movement passes nothing");
eq(newPassings(5, -3), 0, "a GM winding the track back triggers no check");
// Found by the mutation probe: the case above never reaches the guard, because |−3|
// from phase 5 crosses nothing either way. This one does.
eq(newPassings(15, -1), 0,
  "ESCAPE: winding BACK across New owes no check — p.301 triggers on passing it as "
  + "time moves forward, and taking the magnitude of the step would fire on a rewind");
eq(newPassings(0, -16), 0, "…nor does a whole cycle backwards");

// Sweep: across the whole wheel, a single step passes New from exactly one phase.
{
  let passers = 0;
  for (let p = 0; p < 16; p++) if (newPassings(p, 1) === 1) passers++;
  eq(passers, 1, "exactly one phase steps onto New");
}

// ---------------------------------------------------- what Full changes

ok(isNew(0), "phase 0 is New");
ok(!isNew(8), "phase 8 is not");
ok(isFull(8), "phase 8 is Full");
ok(!isFull(0), "phase 0 is not");
ok(!isFull(7) && !isFull(9), "and neither are its neighbours");

eq(phaseTrend(0), "new", "0 is the turning point at New");
eq(phaseTrend(8), "full", "8 is the turning point at Full");
eq(phaseTrend(4), "waxing", "between them it waxes");
eq(phaseTrend(7), "waxing", "…right up to the phase before Full");
eq(phaseTrend(9), "waning", "and wanes from the phase after");
eq(phaseTrend(12), "waning", "past Full it wanes");
eq(phaseTrend(15), "waning", "right up to the wrap");

ok(negotiationBlocked(8), "p.301: demons 'won't engage in negotiations' at Full");
ok(!negotiationBlocked(7), "…and will one phase either side");
ok(!negotiationBlocked(9), "…on both");
ok(sacrificialFusionAvailable(8), "p.79: sacrificial fusion 'may be performed when Kagutsuchi is Full'");
ok(!sacrificialFusionAvailable(0), "and not at New");
ok(encountersHeightened(8), "encounters are likelier at Full");

// The book states no NUMBER for the heightened rate, and none is invented.
{
  const src = readFileSync(join(ROOT, "module/helpers/kagutsuchi.mjs"), "utf8");
  ok(/encountersHeightened = \(phase\) => isFull\(phase\)/.test(src),
    "ESCAPE: 'random encounter chances are higher' returns a CONDITION, not a "
    + "multiplier — the book states no rate, and fabricating one would look exactly as "
    + "authoritative as a printed number");
}

// ------------------------------------------------- the passing-New check

eq(newPassOutcome(["failure", "failure", "failure"]),
  { encounter: true, boon: false, allFailed: true },
  "all PCs fail: the party encounters enemy demons");
eq(newPassOutcome(["failure", "success", "failure"]),
  { encounter: false, boon: false, allFailed: false },
  "ESCAPE: one success is enough to avoid it — 'if ALL PCs fail' is the condition, and "
  + "reading it as 'if any PC fails' would trigger on almost every passing");
eq(newPassOutcome(["success", "fumble"]),
  { encounter: true, boon: false, allFailed: false },
  "a single fumble triggers it regardless of who else succeeded");
eq(newPassOutcome(["success", "autoFail"]).encounter, true, "so does a single auto-fail");
eq(newPassOutcome(["critical", "failure"]),
  { encounter: false, boon: true, allFailed: false },
  "a critical is the beneficial event");
eq(newPassOutcome(["critical", "fumble"]),
  { encounter: true, boon: true, allFailed: false },
  "[inferred] both are REPORTED when both are literally met — the book's 'instead' "
  + "reads naturally for one thing happening and does not say which wins when one PC "
  + "crits and another fumbles, so this reports rather than resolves");
eq(newPassOutcome([]), { encounter: false, boon: false, allFailed: false },
  "no PCs, no check — an empty party must not read as 'all failed'");
eq(newPassOutcome(null), { encounter: false, boon: false, allFailed: false },
  "…and neither must a missing one");

// -------------------------------------------------- wiring (source, always runs)

const cfg = readFileSync(join(ROOT, "module/config.mjs"), "utf8");
ok(/SMT\.kagutsuchi\s*=/.test(cfg), "the chart's shape lives in CONFIG");

const helper = readFileSync(join(ROOT, "module/helpers/kagutsuchi.mjs"), "utf8");
ok(/p\.301 prints/.test(helper),
  "the parenthetical chart numbers are documented as non-mechanical, so the gap between "
  + "ten labels and sixteen phases is not mistaken for something dropped");

console.log(`\nsmt-rpg kagutsuchi tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
