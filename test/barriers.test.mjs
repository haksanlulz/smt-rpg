// Barrier skills (p.101): Tetraja, Makarakarn, Tetrakarn.
// `node test/barriers.test.mjs` (exit 0 pass, 1 fail).
//
// spec: barriers-grant-affinity-that-runs-out
//
// The three printed rows, verbatim from the p.101 table:
//   Tetraja    15 MP — "All allies gain Null Light and Null Dark. However, after this
//                       effect nullifies one attack for an ally, they return to their
//                       normal affinity."
//   Makarakarn 45 MP — "Until the end of the next round, all allies Repel Magic."
//   Tetrakarn  45 MP — "Until the end of the next round, all allies Repel Phys."
//
// TWO DIFFERENT CLOCKS, and conflating them is the whole risk. The -karn pair run on
// ROUNDS and expire whether or not anything hit them. Tetraja runs on a CHARGE and
// expires only by being used — it can sit through a whole fight untouched, and it
// falls off the instant it does its job. A single "duration" field would have to lie
// about one of them.
//
// The second trap is quieter: Tetraja is spent "after this effect nullifies one
// attack". If the ally already Repels Light, the hit is repelled and Tetraja did
// nothing — so it must NOT be consumed. If they already Null Light, the hit is
// nullified but not BY this effect, so it must not be consumed either. Only a target
// whose own rating was worse than Null spends the charge, and that is asserted from
// both sides because "was it nullified" and "did this nullify it" look identical at
// the call site.
//
// Everything here composes through betterAffinity (p.65's "Repel > Drain > Null >
// Strong > Weak"), the same ladder the Affinity Changer passives resolve with — so a
// barrier can only ever improve a rating, never downgrade a printed one.

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
  BARRIER_KINDS, parseBarrier, barrierGrants, barrierExpiry, barrierActive,
  barrierRatings, barrierConsumed
} = await import("../module/helpers/barriers.mjs");
const { betterAffinity } = await import("../module/helpers/passives.mjs");
const { affinityOutcome } = await import("../module/helpers/damage.mjs");
const { attackRiders } = await import("../module/helpers/skill-compendium.mjs");

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

// ------------------------------------------------------------- reading the row

eq(parseBarrier("All allies gain Null Light and Null Dark. However, after this effect "
  + "nullifies one attack for an ally, they return to their normal affinity."), "tetraja",
  "Tetraja reads off its printed sentence");
eq(parseBarrier("Until the end of the next round, all allies Repel Magic."), "makarakarn",
  "Makarakarn is the Magic one");
eq(parseBarrier("Until the end of the next round, all allies Repel Phys."), "tetrakarn",
  "Tetrakarn is the Phys one");
eq(parseBarrier("Deal Fire damage to all targets."), null, "an ordinary skill is no barrier");
eq(parseBarrier("All allies gain +1d10 to their physical resist."), null,
  "ESCAPE: Rakukaja also says 'all allies gain' and is a buff, not a barrier — the "
  + "grant, not the phrasing, is what identifies one");
eq(parseBarrier(""), null, "empty is no barrier");
eq(parseBarrier(null), null, "missing is no barrier");

// ---------------------------------------------------------------- what they grant

eq(barrierGrants("tetraja"), { affinities: { light: "null", dark: "null" }, categories: {} },
  "Tetraja is Null Light AND Null Dark — two elements from one cast");
eq(barrierGrants("makarakarn"), { affinities: {}, categories: { magic: "repel" } },
  "ESCAPE: 'Repel Magic' is the MAGIC CATEGORY axis (p.65), not an element — a "
  + "per-element reading would miss every magical attack whose element it does not name");
eq(barrierGrants("tetrakarn"), { affinities: { phys: "repel" }, categories: {} },
  "'Repel Phys' IS an element, and the asymmetry with Makarakarn is the book's, not ours");
eq(barrierGrants("nonsense"), { affinities: {}, categories: {} }, "an unknown kind grants nothing");
eq(BARRIER_KINDS, ["tetraja", "makarakarn", "tetrakarn"], "the kind set is closed");
eq(BARRIER_KINDS, Object.keys(SMT.barriers), "…and matches CONFIG rather than restating it");

// --------------------------------------------------------------- the two clocks

eq(barrierExpiry("makarakarn", 3), 4,
  "'until the end of the NEXT round' — cast in round 3, alive through round 4");
eq(barrierExpiry("tetrakarn", 1), 2, "same clock on the Phys twin");
eq(barrierExpiry("tetraja", 3), null,
  "ESCAPE: Tetraja has NO round clock — its sentence names no duration at all, and "
  + "giving it one would expire a barrier the book says lasts until it is used");
eq(barrierExpiry("makarakarn", null), null, "cast outside a combat round, no round clock");

ok(barrierActive({ kind: "makarakarn", expiresAfterRound: 4, charges: 0 }, 4),
  "alive on its last round");
ok(!barrierActive({ kind: "makarakarn", expiresAfterRound: 4, charges: 0 }, 5),
  "ESCAPE: gone the round after — 'end of the next round' is an end, not a suggestion");
ok(barrierActive({ kind: "makarakarn", expiresAfterRound: 4, charges: 0 }, 3),
  "and alive on the round it was cast");
ok(barrierActive({ kind: "tetraja", expiresAfterRound: null, charges: 1 }, 99),
  "an unspent Tetraja survives any number of rounds");
ok(!barrierActive({ kind: "tetraja", expiresAfterRound: null, charges: 0 }, 1),
  "a spent Tetraja is gone");
ok(barrierActive({ kind: "makarakarn", expiresAfterRound: null, charges: 0 }, null),
  "out of combat there is no round to expire on, so it stands until the fight starts");

// ------------------------------------------------------- folding into a rating set

const both = barrierRatings([
  { kind: "tetraja", expiresAfterRound: null, charges: 1 },
  { kind: "tetrakarn", expiresAfterRound: 4, charges: 0 }
], 4);
eq(both, { affinities: { light: "null", dark: "null", phys: "repel" }, categories: {} },
  "two barriers at once merge rather than replace");
eq(barrierRatings([
  { kind: "tetrakarn", expiresAfterRound: 2, charges: 0 },
  { kind: "makarakarn", expiresAfterRound: 9, charges: 0 }
], 5), { affinities: {}, categories: { magic: "repel" } },
  "an expired barrier contributes nothing while a live one still does");
eq(barrierRatings([], 3), { affinities: {}, categories: {} }, "no barriers, no ratings");
eq(barrierRatings(null, 3), { affinities: {}, categories: {} }, "no list, no ratings");

// The composition rule: a barrier may improve a rating and may never worsen one.
eq(betterAffinity("weak", barrierGrants("tetraja").affinities.light), "null",
  "Tetraja lifts a Light weakness to Null");
eq(betterAffinity("repel", barrierGrants("tetraja").affinities.light), "repel",
  "ESCAPE: a printed Repel Light is NOT downgraded to Null by casting Tetraja on it — "
  + "p.65's ladder decides, not cast order");
eq(betterAffinity("drain", barrierGrants("tetrakarn").affinities.phys), "repel",
  "Repel outranks Drain, so Tetrakarn does improve a Drain Phys demon");

// --------------------------------------------- when Tetraja actually spends itself

ok(barrierConsumed({ kind: "tetraja", baseRating: "normal", effectiveRating: "null" }),
  "a normal target spends the charge — this effect is what nullified the hit");
ok(barrierConsumed({ kind: "tetraja", baseRating: "weak", effectiveRating: "null" }),
  "so does a weak one");
ok(!barrierConsumed({ kind: "tetraja", baseRating: "null", effectiveRating: "null" }),
  "ESCAPE: a target who already Nulls Light spends nothing — the book says 'after "
  + "THIS EFFECT nullifies one attack', and theirs did");
ok(!barrierConsumed({ kind: "tetraja", baseRating: "repel", effectiveRating: "repel" }),
  "ESCAPE: a printed Repel wins the ladder, so the hit was reflected and not "
  + "nullified — nothing is spent");
ok(!barrierConsumed({ kind: "tetraja", baseRating: "normal", effectiveRating: "weak" }),
  "a hit that was not nullified at all spends nothing");
ok(!barrierConsumed({ kind: "tetrakarn", baseRating: "normal", effectiveRating: "repel" }),
  "ESCAPE: the -karn pair are NOT charge-based — repelling an attack must not consume "
  + "a barrier whose sentence gives it a round clock instead");
ok(!barrierConsumed({ kind: "makarakarn", baseRating: "normal", effectiveRating: "repel" }),
  "…the same on the Magic twin");
// Found by the mutation probe: every -karn assertion above passes the `repel` early
// return, so deleting the charges guard entirely left the suite green. This is the
// case that actually reaches it.
ok(!barrierConsumed({ kind: "tetrakarn", baseRating: "normal", effectiveRating: "null" }),
  "ESCAPE: a charges:0 barrier is not consumed even by a nullified hit — the guard is "
  + "the kind's clock, not the hit's outcome");
ok(!barrierConsumed({ kind: "makarakarn", baseRating: "weak", effectiveRating: "null" }),
  "…and the same on Makarakarn");

// A repel is not a null: the outcome the damage engine reaches has to agree with the
// consumption rule, or Tetraja gets spent on hits it never stopped.
eq(affinityOutcome(["null"]).absolute, "null", "Null ends the calculation as Null");
eq(affinityOutcome(["repel"]).absolute, "repel", "Repel ends it as Repel");
eq(affinityOutcome(["repel", "null"]).absolute, "repel",
  "and Repel outranks Null when both are in play (p.65)");

// -------------------------------------------------- the compendium reads it through

eq(attackRiders("Until the end of the next round, all allies Repel Magic.").barrier,
  "makarakarn", "the compendium stamps the barrier kind onto the skill");
eq(attackRiders("All allies gain Null Light and Null Dark. However, after this effect "
  + "nullifies one attack for an ally, they return to their normal affinity.").barrier,
  "tetraja", "…for Tetraja too");
eq(attackRiders("Deal Fire damage to 1 target.").barrier, undefined,
  "an ordinary skill gets no barrier field at all");

// -------------------------------------------------- wiring (source, always runs)

const skillSchema = readFileSync(join(ROOT, "module/data/skill-data.mjs"), "utf8");
ok(/barrier:\s*new StringField/.test(skillSchema), "the skill schema declares the barrier");

const baseActor = readFileSync(join(ROOT, "module/data/base-actor.mjs"), "utf8");
ok(baseActor.includes("barrierRatings("),
  "derived data folds barrier ratings in");
const idxPassive = baseActor.indexOf("affinityOverrides(");
const idxBarrier = baseActor.indexOf("barrierRatings(");
ok(idxPassive > 0 && idxBarrier > 0 && idxPassive < idxBarrier,
  "barriers resolve AFTER the Affinity Changer passives — both go through "
  + "betterAffinity, so order cannot change the result, but the read order is the "
  + "one the comments claim");
// Both folds are grepped, not just the category one: the probe deleted the ELEMENT
// fold's betterAffinity and the suite stayed green because only the category line was
// asserted. A source grep cannot see semantics, but it can see a deletion.
// Anchored to the BARRIER loop, not to the assignment shape: the Affinity Changer
// pass one block above writes a byte-identical line, so an unanchored grep matched it
// and stayed green while the barrier fold was replaced with a straight assignment.
ok(/Object\.entries\(barriers\.affinities\)[\s\S]{0,240}?betterAffinity\(this\.affinities\[element\], rating\)/.test(baseActor),
  "the element fold goes through the p.65 ladder, not straight assignment");
ok(/betterAffinity\(this\.categoryAffinities/.test(baseActor),
  "ESCAPE: the CATEGORY axis is folded too — Makarakarn is the only barrier that "
  + "lives there, and dropping it silently costs 45 MP for nothing");

const entry = readFileSync(join(ROOT, "smt-rpg.mjs"), "utf8");
ok(/barriersPersistAfterCombat/.test(entry),
  "combat-end clearing is a homebrew toggle, not a hardcoded call");
ok(/"barriersPersistAfterCombat",\s*\{[\s\S]{0,200}?default:\s*false/.test(entry),
  "ESCAPE: it DEFAULTS to clearing — the book gives Tetraja no duration at all, so "
  + "persisting by default would carry a free nullify into every later fight forever");
ok(/if \(!game\.settings\.get\("smt-rpg", "barriersPersistAfterCombat"\)\) await clearBarriers/.test(entry),
  "…and the toggle gates the clear rather than merely existing");

const effects = readFileSync(join(ROOT, "module/helpers/effects.mjs"), "utf8");
ok(effects.includes("applyBarrier") && effects.includes("consumeBarrierCharge"),
  "the effect layer can raise a barrier and spend a Tetraja charge");

const actor = readFileSync(join(ROOT, "module/documents/actor.mjs"), "utf8");
ok(actor.includes("consumeBarrierCharge"),
  "the damage pipeline is what spends the charge — nothing else sees a nullified hit");

console.log(`\nsmt-rpg barrier tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
