// The action budget (p.63) and press skills (p.96).
// `node test/action-budget.test.mjs` (exit 0 pass, 1 fail).
//
// spec: press-skills-buy-actions-not-checks
//
// p.63 is the whole base rule, in two sentences: "Each combatant gets one turn per
// round" and "During their turn in the initiative order, combatants may take one
// action." The boss trait is the only printed exception — "Bosses take two actions on
// their turn" (p.278) — so the base budget is 1, or 2 with the trait, and nothing else
// moves it except a press skill.
//
// p.96 PRESS SKILLS, verbatim: "Beast Eye and Dragon Eye are skills that can increase
// how many actions one can take per turn. They cost one action to apply. Beast Eye
// spends one action to grant two actions, effectively granting one additional action.
// Dragon Eye takes one action to grant four actions, effectively granting three
// additional actions."
//
// THE TRAP THIS SUITE EXISTS FOR is the collision with multi-action (p.59-60), which
// looks like the same axis and is not. A multi-action spends ONE action to make two or
// three CHECKS at a divided TN — "perform the same action two or three times
// consecutively in the same turn". A press skill spends one action to buy more
// ACTIONS, each of which may itself be a fresh multi-action against a different target
// with a different skill. Wiring press grants into multiActionPlan, or charging a
// three-part multi-action three actions, would be wrong in both directions at once.
//
// The second rule, and it is NOT printed in either skill's effect text: p.96's boss
// section says "using Dragon Eye in succession to gain unlimited actions just wouldn't
// be fair", and the GM chapter restates it as a rule — "skills that grant additional
// actions, like Dragon Eye, should be limited to being used once per turn". So the
// once-per-round limit is stamped from the prose, not read off the skill row, and that
// stamp is asserted here because nothing else in the pipeline would notice it missing.

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
  baseActions, parsePressGrant, turnKey, actionState, spendActions
} = await import("../module/helpers/actions.mjs");
const { multiActionPlan } = await import("../module/helpers/checks.mjs");
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

// ------------------------------------------------------------- the base budget

eq(baseActions({}), 1, "p.63: 'combatants may take one action'");
eq(baseActions({ isBoss: false }), 1, "an ordinary combatant gets one");
eq(baseActions({ isBoss: true }), 2, "p.278: 'Bosses take two actions on their turn'");
eq(baseActions({ isBoss: true }), SMT.actions.boss, "the boss figure comes from CONFIG");
eq(baseActions({}), SMT.actions.base, "…and so does the base");

// ------------------------------------------------------- reading a press grant

eq(parsePressGrant("Gain two actions this round; this check auto- succeeds."), 2,
  "Beast Eye grants two — and the importer's line-break artifact in 'auto- succeeds' "
  + "must not defeat the match");
eq(parsePressGrant("Gain four actions this round; this check auto-succeeds."), 4,
  "Dragon Eye grants four");
eq(parsePressGrant("Gain 2 actions this round."), 2, "a digit reads the same as the word");
eq(parsePressGrant("Gain one action this round."), 1, "the singular parses too");
eq(parsePressGrant("The caster doubles the total power of their next basic strike or "
  + "physical attack. The check for this auto-succeeds."), 0,
  "ESCAPE: Focus is the other 0-MP Unique auto-success skill on the same page and "
  + "grants NO actions — the two are one row apart in the printed table");
eq(parsePressGrant("Deal Fire damage to all targets."), 0, "an ordinary skill grants none");
eq(parsePressGrant("All allies gain +1d10 to their physical power."), 0,
  "'gain' alone is not an action grant");
eq(parsePressGrant(""), 0, "empty grants nothing");
eq(parsePressGrant(null), 0, "missing grants nothing");

// --------------------------------------------------------------- the turn key

eq(turnKey(3, 2), "3:2", "the key is round and turn");
eq(turnKey(1, 0), "1:0", "turn zero is a real turn, not a missing one");
eq(turnKey(null, 2), null, "no round, no key");
eq(turnKey(3, null), null, "no turn, no key");
eq(turnKey(undefined, undefined), null, "out of combat there is no key at all");

// ------------------------------------------------------- state, and the reset

eq(actionState(null, { key: "1:0" }),
  { total: 1, spent: 0, granted: 0, remaining: 1, tracked: true },
  "no ledger yet reads as a full budget");
eq(actionState({ key: "1:0", spent: 1, granted: 0 }, { key: "1:0" }),
  { total: 1, spent: 1, granted: 0, remaining: 0, tracked: true },
  "a spent action is gone");
eq(actionState({ key: "1:0", spent: 1, granted: 0 }, { key: "2:0" }),
  { total: 1, spent: 0, granted: 0, remaining: 1, tracked: true },
  "ESCAPE: a ledger from an EARLIER turn reads as fresh — the key is the reset, so a "
  + "missed hook can never lock a combatant out of acting");
eq(actionState({ key: "1:0", spent: 5, granted: 4 }, { key: "1:0", isBoss: true }),
  { total: 6, spent: 5, granted: 4, remaining: 1, tracked: true },
  "a boss's grant rides on the boss base");
eq(actionState({ key: "1:0", spent: 9, granted: 0 }, { key: "1:0" }).remaining, 0,
  "remaining floors at zero rather than going negative");
eq(actionState({ key: "1:0", spent: -3, granted: -7 }, { key: "1:0" }),
  { total: 1, spent: 0, granted: 0, remaining: 1, tracked: true },
  "a corrupt negative ledger is treated as unspent, never as credit");

eq(actionState({ key: "1:0", spent: 1 }, { key: null }),
  { total: Infinity, spent: 0, granted: 0, remaining: Infinity, tracked: false },
  "ESCAPE: out of combat there is no budget to run out of — nothing may refuse a "
  + "skill used outside a fight");

// ------------------------------------------------------------------- spending

eq(spendActions(null, { key: "1:0" }),
  { allowed: true, total: 1, spent: 1, granted: 0, remaining: 0,
    ledger: { key: "1:0", spent: 1, granted: 0 } },
  "the one printed action is spent");
eq(spendActions({ key: "1:0", spent: 1, granted: 0 }, { key: "1:0" }).allowed, false,
  "ESCAPE: a second action in the same turn is refused");
eq(spendActions({ key: "1:0", spent: 1, granted: 0 }, { key: "1:0" }).remaining, 0,
  "…and the refusal reports nothing left rather than a negative");

eq(spendActions(null, { key: "1:0", grants: 2 }),
  { allowed: true, total: 3, spent: 1, granted: 2, remaining: 2,
    ledger: { key: "1:0", spent: 1, granted: 2 } },
  "p.96 Beast Eye: spends one action to grant two, leaving TWO to use — 'effectively "
  + "granting one additional action' against the one it started with");
eq(spendActions(null, { key: "1:0", grants: 4 }).remaining, 4,
  "p.96 Dragon Eye: four to use after the one it cost — 'three additional actions'");
eq(spendActions(null, { key: "1:0", grants: 4, isBoss: true }).remaining, 5,
  "a boss keeps its unspent second action on top of the grant");

// The press skill still costs its action even when it is the last one.
eq(spendActions({ key: "1:0", spent: 1, granted: 0 }, { key: "1:0", grants: 4 }).allowed, false,
  "ESCAPE: a press skill cannot be cast with no action left to pay for it — 'they "
  + "cost one action to apply'");

eq(spendActions({ key: "1:0", spent: 1, granted: 2 }, { key: "1:0", grants: 2 }),
  { allowed: true, total: 5, spent: 2, granted: 4, remaining: 3,
    ledger: { key: "1:0", spent: 2, granted: 4 } },
  "grants stack arithmetically; the once-per-round LIMIT is what stops the loop, not "
  + "the budget maths");

eq(spendActions({ key: "1:0", spent: 1 }, { key: null }).allowed, true,
  "out of combat, spending is always allowed");
eq(spendActions({ key: "1:0", spent: 1 }, { key: null }).ledger, null,
  "…and writes no ledger, so nothing accumulates outside a fight");

eq(spendActions(null, { key: "1:0", cost: 0 }).spent, 1, "a zero cost floors at one action");
eq(spendActions(null, { key: "1:0", cost: -2 }).spent, 1, "so does a negative one");

// ------------------------------------- press skills vs multi-action (p.59-60)

// The two axes cross here and nowhere else. A 210% TN buys three CHECKS out of ONE
// action; it must not cost three actions, and it must not be reachable by spending a
// press grant instead of having the TN.
eq(multiActionPlan(210).actions, 3, "a 210% TN is three checks (p.60)");
eq(spendActions(null, { key: "1:0" }).spent, 1,
  "ESCAPE: the budget charges ONE action for a turn's declared action, whatever the "
  + "multi-action count — p.60's parts are checks, not actions");
eq(multiActionPlan(90).eligible, false, "a 90% TN buys no extra checks…");
eq(spendActions(null, { key: "1:0", grants: 4 }).remaining, 4,
  "…and a press grant does not make it eligible — it hands out actions, not TN");

// ------------------------------------------ the stamp the printed row never carries

const beast = attackRiders("Gain two actions this round; this check auto- succeeds.");
eq(beast.grantsActions, 2, "the compendium reads the grant off the effect text");
eq(beast.useLimit, { period: "round", count: 1 },
  "ESCAPE: p.96 — 'using Dragon Eye in succession to gain unlimited actions just "
  + "wouldn't be fair' — is stamped from the PROSE; neither skill's printed row says "
  + "'once per round', so nothing else in the pipeline would supply it");
eq(attackRiders("Gain four actions this round; this check auto-succeeds.").useLimit,
  { period: "round", count: 1 }, "Dragon Eye carries the same stamp");
eq(attackRiders("Deal Fire damage to 1 target.").grantsActions, undefined,
  "an ordinary skill gets no press field at all");
eq(attackRiders("Deal Fire damage to 1 target.").useLimit, undefined,
  "…and no invented limit");
eq(attackRiders("Completely nullify the effects of an attack on you, 1/scenario only.").useLimit,
  { period: "scenario", count: 1 },
  "a printed limit on a non-press skill is untouched");

// The stamp's guard only matters when BOTH are present, which neither printed press
// skill does — so it needs a constructed case or it is an untested branch. Found by
// the mutation probe: removing `if (!out.useLimit)` left the suite green, because
// every prior assertion exercised one side or the other and never the collision.
const both = attackRiders("Gain two actions this round; 1/combat only.");
eq(both.grantsActions, 2, "a press grant is read alongside a printed limit");
eq(both.useLimit, { period: "combat", count: 1 },
  "ESCAPE: a printed limit WINS over the prose stamp — the stamp fills a gap and must "
  + "never narrow a limit the book actually states");

// -------------------------------------------------- wiring (source, always runs)

const skillSchema = readFileSync(join(ROOT, "module/data/skill-data.mjs"), "utf8");
ok(/grantsActions:\s*new NumberField/.test(skillSchema),
  "the skill schema declares the press grant");
const actorSchema = readFileSync(join(ROOT, "module/data/base-actor.mjs"), "utf8");
ok(/actionLedger:\s*new ObjectField/.test(actorSchema),
  "the actor schema declares the action ledger");

const actor = readFileSync(join(ROOT, "module/documents/actor.mjs"), "utf8");
// Anchored on the METHOD DECLARATIONS, not on the identifiers. `actionState(` alone
// matched twice — the method and the call it makes to the imported pure function — so
// deleting the method left it green. Found by the 2026-08-15 assertion audit.
ok(/^\s{2}actionState\(\)\s*\{/m.test(actor), "the actor exposes the budget read");
ok(/^\s{2}async spendAction\(/m.test(actor), "…and the spend");
// `isBoss` alone matched four times, which cannot pin anything. What matters is that
// BOTH budget entry points pass the trait through — it is the only printed change to
// the base, and dropping it on either path gives a boss one action.
ok(/actionState\(this\.system\.actionLedger,[\s\S]{0,120}?isBoss: !!this\.system\.isBoss/.test(actor),
  "the budget READ passes the boss trait");
ok(/spendActions\(this\.system\.actionLedger,[\s\S]{0,160}?isBoss: !!this\.system\.isBoss/.test(actor),
  "…and so does the SPEND, which is the p.278 'two actions on their turn'");

const item = readFileSync(join(ROOT, "module/documents/item.mjs"), "utf8");
const idxAction = item.indexOf("spendAction(");
const idxUse = item.indexOf("spendSkillUse(this)");
const idxPay = item.indexOf("current - cost.value");
ok(idxAction > 0 && idxUse > 0 && idxAction < idxUse,
  "ESCAPE: the action budget is checked BEFORE the use limit — a skill refused for "
  + "having no action left must not burn a once-per-scenario use");
ok(idxAction > 0 && idxPay > 0 && idxAction < idxPay,
  "…and before the cost, so a refused skill burns no MP either");

const entry = readFileSync(join(ROOT, "smt-rpg.mjs"), "utf8");
ok(/clearActionBudget/.test(entry),
  "combat end clears the budget, so a stale ledger never outlives the fight");

console.log(`\nsmt-rpg action-budget tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
