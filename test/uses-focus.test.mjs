// Limited skills (p.96) and Focus (p.105).
// `node test/uses-focus.test.mjs` (exit 0 pass, 1 fail).
//
// spec: limited-skills-run-out-and-focus-doubles-once
//
// p.96 hands use-tracking to the player — "Players with these skills are responsible
// for keeping track of when to use such skills, and how many uses they have
// remaining." Clause 2 says otherwise: "the GM can do that by hand" is not done. So
// the ledger is kept, and the whole rule is in the RESET BOUNDARY — a round retires
// round budgets, ending a combat retires round and combat, and scenario budgets
// survive both because nothing but the GM knows when a scenario ended.
//
// Focus is the other half, and its trap is that it looks like Concentrate: both are
// setup actions bought with an action. Concentrate adds +20% to the hit CHECK; Focus
// multiplies the POWER after the roll. Folding it into consumeSetupBonuses would have
// made it +20% to hit and no extra damage at all.

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
  USE_PERIODS, parseUseLimit, useBudget, spendUse, clearedByBoundary,
  ledgerKey, ledgerPeriod, focusMultiplier, focusConsumed
} = await import("../module/helpers/uses.mjs");

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

// ------------------------------------------------------------ parsing limits

eq(parseUseLimit("Completely nullify the effects of an attack on you, 1/scenario only."),
  { period: "scenario", count: 1 }, "Luck Smiles is once per scenario");
eq(parseUseLimit("…instead survive the attack with 1 HP. 1/ combat only. No effect when Stoned."),
  { period: "combat", count: 1 }, "Endure is once per combat, spacing and all");
eq(parseUseLimit("May be used once per round."), { period: "round", count: 1 },
  "the prose form parses too");
eq(parseUseLimit("3/scenario only."), { period: "scenario", count: 3 },
  "a count above one is read, not assumed");
eq(parseUseLimit("Deal Fire damage to 1 target."), null,
  "ESCAPE: a skill stating no limit gets none — inventing one forbids a legal action");
eq(parseUseLimit("Deal Ice damage to all targets; 10% chance to inflict Freeze."), null,
  "a percentage is not a use limit");
eq(parseUseLimit(""), null, "empty states nothing");
eq(parseUseLimit(null), null, "missing states nothing");

// -------------------------------------------------------------- the budget

eq(useBudget({ count: 1, copies: 1 }), 1, "one copy, one use");
eq(useBudget({ count: 1, copies: 3 }), 3,
  "p.110: 'May be learned multiple times, allowing you to use it an additional time "
  + "per scenario each' — three copies is three uses");
eq(useBudget({ count: 2, copies: 2 }), 4, "count and copies multiply");
eq(useBudget({}), 1, "defaults to one");
eq(useBudget({ count: 0, copies: -4 }), 1, "garbage floors at one");

// --------------------------------------------------------------- spending

eq(spendUse({ period: "none" }), { allowed: true, spent: 0, remaining: Infinity, limited: false },
  "an unlimited skill is always allowed and never tracked");
eq(spendUse({ period: "combat", count: 1, spent: 0 }),
  { allowed: true, spent: 1, remaining: 0, limited: true }, "the first use is allowed");
eq(spendUse({ period: "combat", count: 1, spent: 1 }),
  { allowed: false, spent: 1, remaining: 0, limited: true },
  "ESCAPE: the second use of a once-per-combat skill is refused");
eq(spendUse({ period: "scenario", count: 1, copies: 2, spent: 1 }),
  { allowed: true, spent: 2, remaining: 0, limited: true },
  "a second copy buys a second use");
eq(spendUse({ period: "scenario", count: 1, copies: 2, spent: 2 }).allowed, false,
  "…and no more than that");
eq(spendUse({ period: "banana", count: 1, spent: 99 }).allowed, true,
  "an unknown period is not a limit — a bad value must not lock a skill out");
eq(spendUse({ period: "combat", count: 1, spent: -5 }).spent, 1,
  "a corrupt negative ledger entry is treated as unspent, not as credit");

// ---------------------------------------------------------- reset boundaries

const ledger = {
  [ledgerKey("round", "Icy Death")]: 1,
  [ledgerKey("combat", "Endure")]: 1,
  [ledgerKey("scenario", "Fortune")]: 1,
};
eq(ledgerPeriod(ledgerKey("round", "Icy Death")), "round", "the period rides the key");
eq(ledgerKey("combat", "  ENDURE  "), "combat:endure", "keys fold case and padding");

eq(clearedByBoundary(ledger, "round").sort(), ["round:icy death"],
  "a new round retires only round budgets");
eq(clearedByBoundary(ledger, "combat").sort(), ["combat:endure", "round:icy death"],
  "ending a combat retires round AND combat — a combat contains rounds");
ok(!clearedByBoundary(ledger, "combat").includes("scenario:fortune"),
  "ESCAPE: a scenario budget survives the end of a fight");
eq(clearedByBoundary(ledger, "scenario").sort(),
  ["combat:endure", "round:icy death", "scenario:fortune"], "a scenario retires everything");
eq(clearedByBoundary(ledger, "nonsense"), [], "an unknown boundary clears nothing");
eq(clearedByBoundary(null, "combat"), [], "no ledger, nothing to clear");

eq(USE_PERIODS, ["none", "round", "combat", "scenario"], "the period set is closed");
eq(USE_PERIODS, SMT.useLimits.periods, "…and matches CONFIG rather than restating it");

// ------------------------------------------------------------------- Focus

eq(focusMultiplier({ active: true, isPhysical: true }), 2, "Focus doubles a physical attack");
eq(focusMultiplier({ active: true, isPhysical: false }), 1,
  "ESCAPE: p.105 says 'basic strike or physical attack' — a spell gets nothing");
eq(focusMultiplier({ active: false, isPhysical: true }), 1, "no Focus stored, no doubling");
eq(focusMultiplier({}), 1, "defaults to no change");
eq(focusMultiplier({ active: true, isPhysical: true }), SMT.focus.multiplier,
  "the multiplier comes from CONFIG");

ok(focusConsumed({ active: true, isPhysical: true }), "an eligible action spends the Focus");
ok(!focusConsumed({ active: true, isPhysical: false }),
  "ESCAPE: a spell does NOT consume it — the doubling waits for a strike");
ok(!focusConsumed({ active: false, isPhysical: true }), "nothing stored, nothing spent");

// -------------------------------------------------- wiring (source, always runs)

const schemaSrc = readFileSync(join(ROOT, "module/data/skill-data.mjs"), "utf8");
ok(/useLimit:\s*new SchemaField/.test(schemaSrc), "the skill schema declares useLimit");
const actorSchema = readFileSync(join(ROOT, "module/data/base-actor.mjs"), "utf8");
ok(/useLedger:\s*new ObjectField/.test(actorSchema), "the actor schema declares the ledger");
ok(/focusReady:\s*new BooleanField/.test(actorSchema), "…and the stored Focus");

const item = readFileSync(join(ROOT, "module/documents/item.mjs"), "utf8");
// Anchored on the DEDUCTION, not on a `const cost` declaration — the first of those
// in the file is a getter, and anchoring there made this assertion read the wrong two
// positions and fail against correct code.
const idxLimit = item.indexOf("spendSkillUse(this)");
const idxPay = item.indexOf("current - cost.value");
ok(idxLimit > 0 && idxPay > 0 && idxLimit < idxPay,
  "ESCAPE: the use limit is checked BEFORE the cost is spent — a refused skill must not burn MP");

const actor = readFileSync(join(ROOT, "module/documents/actor.mjs"), "utf8");
ok(actor.includes("focusFor(") && actor.includes("clearFocus("),
  "the actor exposes the Focus read and its clear");
const combat = readFileSync(join(ROOT, "module/helpers/combat.mjs"), "utf8");
ok(combat.includes("actor.focusFor(true)"),
  "the basic strike — the skill's own named consumer — applies it");
ok(/focus\.consumed.*clearFocus/s.test(combat),
  "…and clears it, so a two-part multi-action doubles once rather than twice");

const entry = readFileSync(join(ROOT, "smt-rpg.mjs"), "utf8");
ok(/clearUseLimits\("round"\)/.test(entry), "a new round clears round budgets");
ok(/clearUseLimits\("combat"\)/.test(entry), "combat end clears combat budgets");
ok(entry.includes('clearUseLimits?.("scenario")'),
  "the scenario reset exists as a GM control — the book gives that boundary to a person");
ok(!/clearUseLimits\("scenario"\)/.test(entry.replace(/clearUseLimits\?\.\("scenario"\)/g, "")),
  "ESCAPE: nothing clears scenario budgets automatically");

console.log(`\nsmt-rpg uses/focus tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
