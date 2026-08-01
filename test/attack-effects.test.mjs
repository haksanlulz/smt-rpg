// Attack riders: fractional-HP, FP-immunity, drains, conditional instant kills.
// `node test/attack-effects.test.mjs` (exit 0 pass, 1 fail).
//
// spec: attack-effect-riders-resolve-as-printed
//
// Four printed rules that ride an attack instead of being one (p.98, p.102-103):
// "reduced to half their current HP" · "Fate points cannot reduce this amount" ·
// "Drain HP from 1 target, and caster recovers HP" · "50% chance to Instant Kill a
// Stoned target". Each was previously either absent or — worse — almost right: an
// unguarded parse turns Zan's conditional kill into an unconditional 30% death, and
// an unguarded halve button lets a fate point reduce Thunderclap.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { fractionalEnd, canOfferHalve, killConditionMet, drainAmounts } =
  await import("../module/helpers/damage.mjs");
const { cascadePlan } = await import("../module/helpers/checks.mjs");
const { attackRiders, buildSkillSystem, skillKey } =
  await import("../module/helpers/skill-compendium.mjs");

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

// ------------------------------------------------------ fractionalEnd (pure)

eq(fractionalEnd(100, "half"), 50, "half of 100 is 50");
eq(fractionalEnd(101, "half"), 51, "an odd pool rounds the survivor UP");
eq(fractionalEnd(1, "half"), 1, "ESCAPE: half of 1 HP stays 1 — rounding never kills");
eq(fractionalEnd(100, "toPercent", 20), 20, "20% of 100 is 20");
eq(fractionalEnd(7, "toPercent", 20), 2, "20% of 7 rounds up to 2");
eq(fractionalEnd(1, "toPercent", 20), 1, "20% of 1 stays 1");
eq(fractionalEnd(2950, "toPercent", 20), 590, "Black Frost at 20% lands on 590");
eq(fractionalEnd(100, "toOne"), 1, "toOne ends on exactly 1");
eq(fractionalEnd(1, "toOne"), 1, "toOne on 1 HP stays 1");
eq(fractionalEnd(0, "toOne"), 0, "a dead target stays dead — no fraction revives");
eq(fractionalEnd(50, "none"), 50, "no kind, no change");
eq(fractionalEnd(-5, "half"), 0, "garbage HP sanitizes to 0");

// Property sweep: for every kind and every pool, the end is within (0, hp] when
// hp > 0 — a fractional attack can never heal and never kill on its own.
for (const kind of ["half", "toPercent", "toOne"]) {
  for (const hp of [1, 2, 3, 5, 7, 10, 33, 99, 100, 2950]) {
    const end = fractionalEnd(hp, kind, 20);
    ok(end >= 1 && end <= hp, `${kind}(${hp}) = ${end} stays within (0, hp]`);
  }
}

// ------------------------------------------------------ canOfferHalve (pure)

ok(canOfferHalve({ fpImmune: false, resolved: false, currentDamage: 10, fatePoints: 1 }),
  "a normal damage card offers the halve");
ok(!canOfferHalve({ fpImmune: true, resolved: false, currentDamage: 10, fatePoints: 1 }),
  "ESCAPE: 'Fate points cannot reduce this amount' refuses the offer");
ok(!canOfferHalve({ fpImmune: false, resolved: true, currentDamage: 10, fatePoints: 1 }),
  "a resolved card offers nothing");
ok(!canOfferHalve({ fpImmune: false, resolved: false, currentDamage: 0, fatePoints: 1 }),
  "zero damage offers nothing");
ok(!canOfferHalve({ fpImmune: false, resolved: false, currentDamage: 10, fatePoints: 0 }),
  "no fate points, no offer");

// --------------------------------------------------- killConditionMet (pure)

ok(killConditionMet({ ailment: "stone", rate: 50 }, "stone"), "Stoned target meets Zan's condition");
ok(!killConditionMet({ ailment: "stone", rate: 50 }, "none"), "a healthy target never does");
ok(!killConditionMet({ ailment: "stone", rate: 50 }, "sleep"), "a different ailment never does");
ok(killConditionMet({ ailment: "sleep", rate: 100 }, "sleep"), "Eternal Rest on a sleeper");
ok(!killConditionMet({ ailment: "none", rate: 50 }, "none"), "'none' is not a condition");
ok(!killConditionMet({ ailment: "stone", rate: 0 }, "stone"), "rate 0 never fires");
ok(!killConditionMet(null, "stone"), "no condition, no kill");

// ------------------------------------------------------- drainAmounts (pure)

eq(drainAmounts({ hpDealt: 30, mpBefore: 50, finalDamage: 30, drainsHP: true, drainsMP: false }),
  { hpDrained: 30, mpDrained: 0 }, "Deathtouch drains what the target lost");
eq(drainAmounts({ hpDealt: 12, mpBefore: 50, finalDamage: 30, drainsHP: true, drainsMP: false }),
  { hpDrained: 12, mpDrained: 0 },
  "ESCAPE: an overkill drains only the HP that was there (p.98's actual-loss rule)");
eq(drainAmounts({ hpDealt: 0, mpBefore: 8, finalDamage: 30, drainsHP: false, drainsMP: true }),
  { hpDrained: 0, mpDrained: 8 }, "Mana Drain floors at the target's MP pool");
eq(drainAmounts({ hpDealt: 30, mpBefore: 50, finalDamage: 30, drainsHP: true, drainsMP: true }),
  { hpDrained: 30, mpDrained: 30 }, "Life Drain takes an equal amount of both");
eq(drainAmounts({}), { hpDrained: 0, mpDrained: 0 }, "no flags, no drain");

// --------------------------------------------------------- cascadePlan rider

eq(cascadePlan({ hasPowerRoll: false, riders: { fractional: { kind: "half", pct: 20 } } },
  { oldSuccess: false, newSuccess: true }), "fractionalAttack",
"an FP flip on a fractional skill posts its attack");
eq(cascadePlan({ hasPowerRoll: true, riders: { fractional: { kind: "half" } } },
  { oldSuccess: false, newSuccess: true }), "powerRoll",
"a power roll still wins when both exist");
eq(cascadePlan({ hasPowerRoll: false, ailmentType: "sleep", ailmentRate: 70 },
  { oldSuccess: false, newSuccess: true }), "ailmentOnly",
"the Lullaby path is unchanged");

// ------------------------------------------------- attackRiders (both grammars)

// The ch4 prose grammar.
eq(attackRiders("Attacks all targets with Light; targets hit are reduced to half their current HP. Fate points cannot reduce this amount."),
  { fractionalHP: "half", fpImmune: true }, "Thunderclap's sentence parses whole");
eq(attackRiders("Attacks 1 target with Light; if hit, the target is reduced to 20% of their current HP. Fate points cannot reduce this amount."),
  { fractionalHP: "toPercent", fractionalPercent: 20, fpImmune: true }, "Godly Light's 20%");
eq(attackRiders("Attack 1 target with Dark; if hit, the target is reduced to 1 HP. Fate points cannot reduce this amount."),
  { fractionalHP: "toOne", fpImmune: true }, "Evil Gaze's to-1");
eq(attackRiders("All targets are reduced to 1 HP."),
  { fractionalHP: "toOne" },
  "ESCAPE: Sol Niger is printed BARE — no fate clause, so no fpImmune is invented");
eq(attackRiders("Drain HP from 1 target, and caster recovers HP."),
  { drainsHP: true }, "Deathtouch drains HP only");
eq(attackRiders("Drain MP from 1 target, and caster recovers MP."),
  { drainsMP: true }, "Mana Drain drains MP only");
eq(attackRiders("Drain HP from 1 target, and the caster recovers HP. Then, drains an equal amount of MP from the same target, and the caster recovers MP."),
  { drainsHP: true, drainsMP: true }, "Life Drain drains both");
eq(attackRiders("Deal Force damage to 1 target; 50% chance to Instant Kill a Stoned target."),
  { killCondition: { ailment: "stone", rate: 50 } }, "Zan's conditional kill");
eq(attackRiders("Attack all targets with Mind; Instant Kill all Sleeping targets."),
  { killCondition: { ailment: "sleep", rate: 100 } }, "Eternal Rest kills sleepers outright");

// The stat-block terse grammar.
eq(attackRiders("HP Halved"), { fractionalHP: "half" }, "corpus 'HP Halved'");
eq(attackRiders("HP 1/5"), { fractionalHP: "toPercent", fractionalPercent: 20 }, "corpus 'HP 1/5'");
eq(attackRiders("HP 1"), { fractionalHP: "toOne" }, "corpus 'HP 1'");
eq(attackRiders("If target is Stoned, Instant Kill 30%"),
  { killCondition: { ailment: "stone", rate: 30 } }, "corpus conditional form");
eq(attackRiders("If target is Sleeping, Instant Kill."),
  { killCondition: { ailment: "sleep", rate: 100 } }, "corpus Eternal Rest form");

// Refusals: plain text stays plain.
eq(attackRiders("Deal Fire damage to 1 target."), {}, "an ordinary attack carries no riders");
eq(attackRiders("Instant Kill 70%"), {},
  "ESCAPE: an unconditional kill is the death AILMENT's business, not a rider");
eq(attackRiders(""), {}, "empty is empty");

// ------------------------------------------------- builder + schema (always)

const schemaSrc = readFileSync(join(ROOT, "module/data/skill-data.mjs"), "utf8");
const SCHEMA_FIELDS = new Set(
  [...schemaSrc.matchAll(/^\s{6}([a-zA-Z]+):\s*new\s+\w+Field/gm)].map(m => m[1]));
for (const f of ["fractionalHP", "fractionalPercent", "fpImmune", "drainsHP", "drainsMP", "killCondition"]) {
  ok(SCHEMA_FIELDS.has(f), `the skill schema declares "${f}"`);
}

const zan = buildSkillSystem({
  name: "Zan",
  listed: { kind: "active", element: "Force", cost: { value: 4, resource: "mp" }, potency: 10,
    effect: "Deal Force damage to 1 target; 50% chance to Instant Kill a Stoned target." },
  corpus: null
});
eq(zan.killCondition, { ailment: "stone", rate: 50 }, "Zan builds its condition");
ok(!("ailment" in zan),
  "ESCAPE: the conditional kill never degrades into an unconditional 50% death ailment");

const thunder = buildSkillSystem({
  name: "Thunderclap",
  listed: { kind: "active", element: "Light", cost: { value: 12, resource: "mp" }, potency: 0,
    effect: "Attacks all targets with Light; targets hit are reduced to half their current HP. Fate points cannot reduce this amount." },
  corpus: { effect: "HP Halved" }
});
eq(thunder.fractionalHP, "half", "Thunderclap builds fractional");
ok(thunder.fpImmune === true, "…and carries the printed FP immunity");

// ----------------------------------------------------------- corpus (skippable)

const SKILLS = join(ROOT, "data-local/skill-stats.json");
const DEMONS = join(ROOT, "data-local/demon-stats.json");
if (!existsSync(SKILLS) || !existsSync(DEMONS)) {
  console.log("  SKIPPED: data-local skill/demon data absent — the six printed riders were NOT checked.");
  console.log(`\nsmt-rpg attack-effects tests: ${passed} passed, ${failed} failed (corpus leg skipped)`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  process.exit(0);
}

const skills = JSON.parse(readFileSync(SKILLS, "utf8")).skills;
const demons = JSON.parse(readFileSync(DEMONS, "utf8")).demons;
const listedBy = new Map(skills.map(s => [skillKey(s.name), s]));
const corpusBy = new Map();
for (const d of demons) {
  for (const row of d.skills ?? []) {
    const k = skillKey(row.name);
    if (!corpusBy.has(k) || (!corpusBy.get(k).type && row.type)) corpusBy.set(k, row);
  }
}
const build = (name) => buildSkillSystem({
  name, listed: listedBy.get(skillKey(name)) ?? null, corpus: corpusBy.get(skillKey(name)) ?? null
});

eq(build("Thunderclap").fractionalHP, "half", "imported Thunderclap halves");
ok(build("Thunderclap").fpImmune === true, "imported Thunderclap is FP-immune");
eq(build("Holy Wrath").fractionalHP, "toPercent", "imported Holy Wrath goes to 20%");
eq(build("Holy Wrath").fractionalPercent, 20, "…exactly 20");
eq(build("Evil Gaze").fractionalHP, "toOne", "imported Evil Gaze goes to 1");
ok(build("Evil Gaze").fpImmune === true, "imported Evil Gaze is FP-immune");
eq(build("Sol Niger").fractionalHP, "toOne", "imported Sol Niger goes to 1");
ok(!build("Sol Niger").fpImmune,
  "imported Sol Niger is NOT FP-immune — the book prints it bare");
ok(build("Deathtouch").drainsHP === true && !build("Deathtouch").drainsMP,
  "imported Deathtouch drains HP alone");
ok(build("Mana Drain").drainsMP === true && !build("Mana Drain").drainsHP,
  "imported Mana Drain drains MP alone");
ok(build("Life Drain").drainsHP === true && build("Life Drain").drainsMP === true,
  "imported Life Drain drains both");
eq(build("Zan").killCondition, { ailment: "stone", rate: 50 }, "imported Zan: 50% on Stoned");
eq(build("Mazan").killCondition, { ailment: "stone", rate: 30 }, "imported Mazan: 30% on Stoned");
eq(build("Wet Wind").killCondition, { ailment: "stone", rate: 30 }, "imported Wet Wind: 30% on Stoned");
eq(build("Eternal Rest").killCondition, { ailment: "sleep", rate: 100 }, "imported Eternal Rest");
for (const n of ["Zan", "Mazan", "Zanma", "Wet Wind", "Eternal Rest"]) {
  ok(!("ailment" in build(n)), `${n} carries no unconditional death ailment`);
}
// A plain attack gains nothing from the new fields.
const agi = build("Agi");
for (const k of ["fractionalHP", "fpImmune", "drainsHP", "drainsMP", "killCondition"]) {
  ok(!(k in agi), `Agi carries no ${k}`);
}

console.log(`\nsmt-rpg attack-effects tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
