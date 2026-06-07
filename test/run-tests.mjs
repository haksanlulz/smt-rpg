// Zero-dependency tests for the pure rules helpers: `node test/run-tests.mjs` (exit 0 pass, 1 fail).
// Stubs the two globals Foundry provides (CONFIG.SMT, Math.clamp); no Foundry, DOM, or network.

import { SMT } from "../module/config.mjs";

// Foundry global stubs (before importing the helpers under test)
if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { evaluatePercentile } = await import("../module/helpers/checks.mjs");
const { calculateDamage } = await import("../module/helpers/damage.mjs");
const {
  computeFusionLevel, inheritedSkillCount, elementClanFor,
  isExceptionDemon, selectInheritedSkills
} = await import("../module/helpers/fusion.mjs");
const {
  lookupBand, maccaDemand, hpDemand, talkCheckBonus, negotiationBlockReason
} = await import("../module/helpers/negotiation.mjs");
const {
  sanitizeRewardValue, expMultiplierForGap, expForDefeat, partyLevelOf,
  maccaShares, sanitizeDropName, parseDropItems
} = await import("../module/helpers/rewards.mjs");
const {
  resolvePassiveEffect, passiveMultiplierBonuses, hasMightEffect
} = await import("../module/helpers/passives.mjs");
const { expThresholdForLevel, canLevelUp } = await import("../module/helpers/advancement.mjs");
const { isSaveEligibleAilment } = await import("../module/helpers/effects.mjs");

// Assertion harness
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

// evaluatePercentile (p.64)
{
  // TN 50: crit threshold floor(50/10)=5; auto-fail >=96; fumble ==100.
  eq(evaluatePercentile(1, 50).isCritical, true, "roll 1 is always critical");
  eq(evaluatePercentile(5, 50).isCritical, true, "roll <= floor(TN/10) crits (5 vs TN50)");
  eq(evaluatePercentile(6, 50).isCritical, false, "roll just over crit threshold is a normal success");
  eq(evaluatePercentile(6, 50).isSuccess, true, "roll 6 <= TN50 succeeds");
  eq(evaluatePercentile(50, 50).isSuccess, true, "roll == TN succeeds");
  eq(evaluatePercentile(51, 50).isSuccess, false, "roll > TN fails");
  eq(evaluatePercentile(96, 50).cssClass, "auto-fail", "roll 96 auto-fails even under TN math");
  eq(evaluatePercentile(100, 50).isFumble, true, "roll 100 fumbles");
  // Might widens crit to floor(TN/5): TN50 -> 10.
  eq(evaluatePercentile(10, 50, { hasMight: true }).isCritical, true, "Might widens crit threshold (10 vs TN50)");
  eq(evaluatePercentile(10, 50, { hasMight: false }).isCritical, false, "without Might, 10 is not a crit at TN50");
  // Auto-fail outranks an otherwise-successful high TN (TN >= 96).
  eq(evaluatePercentile(96, 99).isSuccess, false, "96 auto-fails even when TN is 99");
}

// calculateDamage (p.64-65)
{
  // Normal: 100 power, 20 resist -> 80.
  eq(calculateDamage({ rawPower: 100, affinity: "normal", resistance: 20, isCritical: false }).finalDamage, 80, "normal hit subtracts resistance");
  // Weak doubles BEFORE resistance: 100*2 - 20 = 180.
  eq(calculateDamage({ rawPower: 100, affinity: "weak", resistance: 20, isCritical: false }).finalDamage, 180, "weak doubles then subtracts resistance");
  // Strong halves (floor): floor(100/2) - 20 = 30.
  eq(calculateDamage({ rawPower: 100, affinity: "strong", resistance: 20, isCritical: false }).finalDamage, 30, "strong halves then subtracts resistance");
  // Crit skips resistance: 100 -> 100.
  eq(calculateDamage({ rawPower: 100, affinity: "normal", resistance: 20, isCritical: true }).finalDamage, 100, "crit skips resistance");
  // Null: no damage, flagged.
  const nul = calculateDamage({ rawPower: 100, affinity: "null", resistance: 20, isCritical: false });
  ok(nul.isNull && nul.finalDamage === 0, "null deals no damage");
  // Drain heals post-resistance against TARGET resistance: 100-20=80.
  const drn = calculateDamage({ rawPower: 100, affinity: "drain", resistance: 20, isCritical: false });
  ok(drn.isDrain && drn.finalDamage === 0 && drn.drainedAmount === 80, "drain heals post-resistance, deals 0 damage");
  // Repel reflects post-ATTACKER-resistance: attackerResistance 30 -> 100-30=70.
  const rep = calculateDamage({ rawPower: 100, affinity: "repel", resistance: 20, isCritical: false, attackerResistance: 30 });
  ok(rep.isRepel && rep.reflectedDamage === 70, "repel reflects using attacker resistance");
  // Dodge fumble doubles AND skips resistance: 100*2 = 200.
  eq(calculateDamage({ rawPower: 100, affinity: "normal", resistance: 20, isCritical: false, dodgeFumble: true }).finalDamage, 200, "dodge fumble doubles and skips resistance");
  // Resistance never drives damage below 0.
  eq(calculateDamage({ rawPower: 10, affinity: "normal", resistance: 50, isCritical: false }).finalDamage, 0, "damage floors at 0");
}

// Fusion maths (p.79-82)
{
  // Level = floor((L1+L2)/2)+2.
  eq(computeFusionLevel(2, 5), 5, "fusion level: floor((2+5)/2)+2 = 5");
  eq(computeFusionLevel(10, 10), 12, "fusion level: floor((10+10)/2)+2 = 12");
  eq(computeFusionLevel(1, 1), 3, "fusion level floors at the formula, never below 1");
  // Inheritance band table (p.80).
  eq(inheritedSkillCount(0), 0, "0 combined skills inherit none");
  eq(inheritedSkillCount(3), 1, "3 combined -> 1");
  eq(inheritedSkillCount(7), 2, "7 combined -> 2");
  eq(inheritedSkillCount(11), 3, "11 combined -> 3");
  eq(inheritedSkillCount(15), 4, "15 combined -> 4");
  eq(inheritedSkillCount(19), 5, "19 combined -> 5");
  eq(inheritedSkillCount(23), 6, "23 combined -> 6");
  eq(inheritedSkillCount(24), 7, "24 combined -> 7");
  eq(inheritedSkillCount(40), 7, "above 24 caps at 7");
  // Same-clan Element (p.81).
  eq(elementClanFor("fairy", "fairy"), "aeros", "Fairy+Fairy -> Aeros");
  eq(elementClanFor("holy", "holy"), "flaemis", "Holy+Holy -> Flaemis");
  eq(elementClanFor("yoma", "yoma"), "aquans", "Yoma+Yoma -> Aquans");
  eq(elementClanFor("jirae", "jirae"), "erthys", "Jirae+Jirae -> Erthys");
  eq(elementClanFor("fairy", "beast"), null, "cross-clan returns null (chart lookup is the GM's)");
  eq(elementClanFor("FAIRY", "fairy"), "aeros", "clan match is case-insensitive");
  // Exception demons (p.80).
  ok(isExceptionDemon("Shiva"), "Shiva is an exception demon");
  ok(isExceptionDemon("  high pixie  "), "exception check trims + lowercases");
  ok(!isExceptionDemon("Pixie"), "Pixie is not an exception demon");
  // selectInheritedSkills: count cap, dedupe, inheritance-type gate, total cap.
  const pool = [
    { name: "Agi" }, { name: "Bufu" }, { name: "Zio" }, { name: "Agi" } /* dup */
  ];
  eq(selectInheritedSkills(pool, { count: 2 }).map(s => s.name), ["Agi", "Bufu"], "selects up to count, preserves order");
  eq(selectInheritedSkills(pool, { count: 5 }).map(s => s.name), ["Agi", "Bufu", "Zio"], "dedupes by name");
  // Typed skill only inherits with matching result trait.
  const typed = [{ name: "Megidolaon", inheritanceType: "almighty" }, { name: "Dia" }];
  eq(selectInheritedSkills(typed, { count: 5, resultInheritance: "" }).map(s => s.name), ["Dia"], "typed skill skipped when result has no matching trait");
  eq(selectInheritedSkills(typed, { count: 5, resultInheritance: "almighty" }).map(s => s.name), ["Megidolaon", "Dia"], "typed skill inherited when trait matches");
  // Total cap: a demon already holding (cap-1) skills can only inherit 1 more.
  const cap = SMT.fusion.skillCap;
  const many = Array.from({ length: 10 }, (_, i) => ({ name: `S${i}` }));
  eq(selectInheritedSkills(many, { count: 9, initialCount: cap - 1 }).length, 1, "total skill cap leaves room for only 1 more");
  eq(selectInheritedSkills(many, { count: 9, initialCount: cap }).length, 0, "no room when already at the cap");
  // An initial skill name is not re-added.
  eq(selectInheritedSkills([{ name: "Agi" }, { name: "Bufu" }], { count: 5, initialNames: ["Agi"] }).map(s => s.name), ["Bufu"], "skips a skill already among initial skills");
}

// Negotiation / demon-talk (p.72-78, p.112)
{
  // lookupBand: inclusive [min,max] band tables, 0/10 face handled.
  // Gift Table (p.73): 1-3 cheer, 4-5 hp, 6-7 macca, 8-9 item, 10/0 gem.
  eq(lookupBand(SMT.talk.giftTable, 1).kind, "cheer", "gift roll 1 -> cheer");
  eq(lookupBand(SMT.talk.giftTable, 3).kind, "cheer", "gift roll 3 -> cheer (band upper bound)");
  eq(lookupBand(SMT.talk.giftTable, 4).kind, "hp", "gift roll 4 -> HP recovery");
  eq(lookupBand(SMT.talk.giftTable, 7).kind, "macca", "gift roll 7 -> macca");
  eq(lookupBand(SMT.talk.giftTable, 9).kind, "item", "gift roll 9 -> item");
  eq(lookupBand(SMT.talk.giftTable, 10).kind, "gem", "gift roll 10 -> gem");
  eq(lookupBand(SMT.talk.giftTable, 0).kind, "gem", "gift roll 0 reads as 10 -> gem");
  // Item Demand Table (p.76): 1-4 Life Stone, 5-7 Chakra Drop, 8 Revival Bead, 9 Bead, 0 GM.
  eq(lookupBand(SMT.talk.itemDemandTable, 1).label, "SMT.Talk.Item.LifeStone", "item demand 1 -> Life Stone");
  eq(lookupBand(SMT.talk.itemDemandTable, 5).label, "SMT.Talk.Item.ChakraDrop", "item demand 5 -> Chakra Drop");
  eq(lookupBand(SMT.talk.itemDemandTable, 8).label, "SMT.Talk.Item.RevivalBead", "item demand 8 -> Revival Bead");
  eq(lookupBand(SMT.talk.itemDemandTable, 9).label, "SMT.Talk.Item.Bead", "item demand 9 -> Bead");
  eq(lookupBand(SMT.talk.itemDemandTable, 0).label, "SMT.Talk.Item.GMChoice", "item demand 0 -> GM choice");
  // Random Gem Table (p.73): faces map 1:1 to a gem; the 0 face is Aquamarine.
  eq(lookupBand(SMT.talk.gemTable, 1).label, "SMT.Talk.Gem.Sapphire", "gem 1 -> Sapphire");
  eq(lookupBand(SMT.talk.gemTable, 9).label, "SMT.Talk.Gem.Coral", "gem 9 -> Coral");
  eq(lookupBand(SMT.talk.gemTable, 0).label, "SMT.Talk.Gem.Aquamarine", "gem 0 -> Aquamarine");
  eq(lookupBand([], 5), null, "empty table returns null");

  // maccaDemand: (10 x level) + (dieRoll x 10), floored at 0 (p.75).
  eq(maccaDemand(5, 3), 80, "macca demand: (10*5)+(3*10) = 80");
  eq(maccaDemand(20, 10), 300, "macca demand: (10*20)+(10*10) = 300");
  eq(maccaDemand(1, 1), 20, "macca demand: (10*1)+(1*10) = 20");
  eq(maccaDemand(0, 0), 0, "macca demand floors at 0");
  eq(maccaDemand(-5, -5), 0, "negative inputs floor at 0");

  // hpDemand: 10% of the demon's own max HP, floored (p.76).
  eq(hpDemand(100), 10, "HP demand: 10% of 100 = 10");
  eq(hpDemand(95), 9, "HP demand floors: 10% of 95 = 9");
  eq(hpDemand(0), 0, "HP demand of 0 max HP = 0");

  // talkCheckBonus: +20% for any talk skill, 0 otherwise (p.75/112).
  eq(talkCheckBonus(true), 20, "a talk skill grants +20% to the Negotiation check");
  eq(talkCheckBonus(false), 0, "a non-talk action grants no bonus");
  eq(talkCheckBonus(true), SMT.negotiation.talkBonus, "the bonus is the config value, not a literal");

  // negotiationBlockReason: conversation stoppers off actor state (p.73).
  eq(negotiationBlockReason({ negotiable: true, isBoss: false, ailment: "none", deathAilment: false }),
    null, "a negotiable, non-boss, able target can be talked to");
  eq(negotiationBlockReason({ negotiable: false, isBoss: false, ailment: "none" }),
    "SMT.Talk.Block.NotNegotiable", "a non-negotiable target is blocked");
  eq(negotiationBlockReason({ negotiable: true, isBoss: true, ailment: "none" }),
    "SMT.Talk.Block.Boss", "a Boss demon is blocked (reads isBoss)");
  eq(negotiationBlockReason({ negotiable: true, isBoss: false, deathAilment: true, ailment: "none" }),
    "SMT.Talk.Block.CannotAct", "a Dead target cannot act -> blocked");
  eq(negotiationBlockReason({ negotiable: true, isBoss: false, ailment: "freeze" }),
    "SMT.Talk.Block.CannotAct", "a Frozen target cannot act -> blocked");
  eq(negotiationBlockReason({ negotiable: true, isBoss: false, ailment: "sleep" }),
    "SMT.Talk.Block.CannotAct", "a Sleeping target cannot act -> blocked");
  eq(negotiationBlockReason({ negotiable: true, isBoss: false, ailment: "panic" }),
    "SMT.Talk.Block.CannotAct", "a Panicked target cannot act -> blocked");
  // A common ailment that does NOT incapacitate (e.g. Poison) does not block talk.
  eq(negotiationBlockReason({ negotiable: true, isBoss: false, ailment: "poison" }),
    null, "a Poisoned (but able) target can still be talked to");
  // Non-negotiable takes precedence over a clear ailment slot; boss over ailment, etc.
  eq(negotiationBlockReason({ negotiable: false, isBoss: true, ailment: "freeze" }),
    "SMT.Talk.Block.NotNegotiable", "non-negotiable is reported first");
  eq(negotiationBlockReason(null), null, "missing system object is treated as no block");

  // The block reason reads isBoss/negotiable, which now exist on BOTH demon and npc
  // data models — the same plain-object shape the engine passes in either case.
  eq(negotiationBlockReason({ negotiable: true, isBoss: true }),
    "SMT.Talk.Block.Boss", "isBoss block works on a minimal (npc-shaped) system object");
}

// Combat-end rewards (p.46, p.48)
{
  // sanitizeRewardValue: floor, clamp [0, max], non-finite -> 0.
  eq(sanitizeRewardValue(12.9), 12, "reward value floors");
  eq(sanitizeRewardValue(-5), 0, "negative reward clamps to 0");
  eq(sanitizeRewardValue(NaN), 0, "NaN reward collapses to 0");
  eq(sanitizeRewardValue(Infinity), 0, "non-finite reward collapses to 0 (matches the chat/HP guards)");
  eq(sanitizeRewardValue(5e9), SMT.rewards.maxValue, "oversized finite reward clamps to max");

  // expMultiplierForGap (p.48 "Notice"): 1 below the 10-level threshold; doubles
  // once per full 10 levels of gap at or above it.
  eq(expMultiplierForGap(0), 1, "foe at party level -> x1");
  eq(expMultiplierForGap(9), 1, "9 levels above -> still x1 (below threshold)");
  eq(expMultiplierForGap(10), 2, "10 levels above -> x2");
  eq(expMultiplierForGap(19), 2, "19 levels above -> x2 (one full step)");
  eq(expMultiplierForGap(20), 4, "20 levels above -> x4 (two full steps)");
  eq(expMultiplierForGap(30), 8, "30 levels above -> x8");
  eq(expMultiplierForGap(-5), 1, "foe below party level -> x1");

  // expForDefeat: base EXP scaled by the gap multiplier, granted in full (p.48).
  eq(expForDefeat(100, 5, 5), 100, "even-level foe grants its base EXP");
  eq(expForDefeat(100, 15, 5), 200, "foe 10 levels up doubles EXP");
  eq(expForDefeat(100, 25, 5), 400, "foe 20 levels up quadruples EXP");
  eq(expForDefeat(0, 25, 5), 0, "a foe with no EXP drop grants nothing");
  eq(expForDefeat(-50, 25, 5), 0, "a negative/forged EXP drop grants nothing");

  // partyLevelOf: the highest recipient level (the party advances at its strongest).
  eq(partyLevelOf([3, 7, 5]), 7, "party level is the highest member level");
  eq(partyLevelOf([]), 0, "empty party level is 0");
  eq(partyLevelOf([2, "bad", 9]), 9, "party level coerces non-numbers");

  // maccaShares: shared splits evenly (floored, never minted); per-pc gives full.
  eq(maccaShares(100, 4, "shared"), 25, "shared macca splits evenly");
  eq(maccaShares(101, 4, "shared"), 25, "shared macca floors the split (no minting)");
  eq(maccaShares(100, 4, "per-pc"), 100, "per-pc macca gives each the full total");
  eq(maccaShares(100, 0, "shared"), 0, "no recipients -> 0 each");
  eq(maccaShares(0, 4, "shared"), 0, "no macca -> 0 each");
  eq(maccaShares(100, 3, "bogus"), 33, "unknown mode falls back to shared split");

  // sanitizeDropName: strip HTML-significant chars, collapse whitespace, trim, cap.
  eq(sanitizeDropName("  Life Stone  "), "Life Stone", "drop name trims and collapses");
  eq(sanitizeDropName("<b>Bead</b>"), "b Bead /b", "drop name neutralizes angle brackets");
  eq(sanitizeDropName('Chakra "Drop"'), "Chakra Drop", "drop name strips quotes");
  eq(sanitizeDropName(""), "", "empty drop name stays empty");
  eq(sanitizeDropName(42), "", "non-string drop name -> empty");
  eq(sanitizeDropName("x".repeat(150)).length, 100, "drop name caps at 100 chars");

  // parseDropItems: comma/newline split, sanitized, blanks dropped, deduped.
  eq(parseDropItems("Bead, Life Stone, Chakra Drop"), ["Bead", "Life Stone", "Chakra Drop"], "parses comma-separated drops");
  eq(parseDropItems("Bead\nLife Stone"), ["Bead", "Life Stone"], "parses newline-separated drops");
  eq(parseDropItems("Bead, ,, Bead , bead"), ["Bead"], "drops blanks and dedupes case-insensitively");
  eq(parseDropItems(""), [], "empty drops string -> no items");
  eq(parseDropItems("   "), [], "whitespace-only drops string -> no items");
}

// Passive-skill resolution (p.109-110)
{
  const reg = SMT.passiveEffects;
  const skill = (name, passiveEffect) => ({ name, system: { passiveEffect } });

  // resolvePassiveEffect — enum key takes priority.
  eq(resolvePassiveEffect(skill("anything", "lifeSurge"), reg)?.id, "lifeSurge",
    "explicit passiveEffect key resolves regardless of name");
  // Legacy name fallback when the enum is the "none" sentinel (pre-enum data).
  eq(resolvePassiveEffect(skill("Life Bonus", "none"), reg)?.id, "lifeBonus",
    "legacy name resolves when passiveEffect is 'none'");
  eq(resolvePassiveEffect(skill("Mana Surge", undefined), reg)?.id, "manaSurge",
    "legacy name resolves when passiveEffect is absent");
  // Name fallback is case/whitespace-insensitive.
  eq(resolvePassiveEffect(skill("  mana gain  ", "none"), reg)?.id, "manaGain",
    "legacy name match trims and lowercases");
  eq(resolvePassiveEffect(skill("MIGHT", "none"), reg)?.id, "might",
    "Might resolves by legacy name, case-insensitively");
  // Unknown skills resolve to nothing.
  eq(resolvePassiveEffect(skill("Bufu", "none"), reg), null,
    "non-passive skill resolves to null");
  eq(resolvePassiveEffect(skill("", "none"), reg), null,
    "empty name with no enum resolves to null");
  // An unknown enum key still allows the name fallback to win.
  eq(resolvePassiveEffect(skill("Life Gain", "bogusKey"), reg)?.id, "lifeGain",
    "unrecognized enum key falls through to the legacy name");

  // passiveMultiplierBonuses — Amplify tiers (highest only, per resource).
  eq(passiveMultiplierBonuses([skill("Life Bonus", "none")], reg), { hpBonus: 1, mpBonus: 0 },
    "Life Bonus grants +1 HP multiplier");
  eq(passiveMultiplierBonuses([skill("x", "lifeSurge")], reg), { hpBonus: 3, mpBonus: 0 },
    "Life Surge (by enum) grants +3 HP multiplier");
  // Similar abilities do not stack — take the max, not the sum.
  eq(passiveMultiplierBonuses([skill("Life Bonus", "none"), skill("y", "lifeSurge")], reg),
    { hpBonus: 3, mpBonus: 0 }, "HP amplifies take the highest tier, never sum");
  // HP and MP tiers accumulate independently.
  eq(passiveMultiplierBonuses([skill("Life Gain", "none"), skill("Mana Surge", "none")], reg),
    { hpBonus: 2, mpBonus: 3 }, "HP and MP amplify bonuses resolve independently");
  // Mixed enum + legacy + irrelevant skills.
  eq(passiveMultiplierBonuses([skill("z", "manaBonus"), skill("Bufu", "none"), skill("Mana Gain", "none")], reg),
    { hpBonus: 0, mpBonus: 2 }, "max MP tier wins across enum + legacy; non-passives ignored");
  // Might is not an amplify and contributes no multiplier.
  eq(passiveMultiplierBonuses([skill("Might", "none")], reg), { hpBonus: 0, mpBonus: 0 },
    "Might contributes no HP/MP multiplier");
  eq(passiveMultiplierBonuses([], reg), { hpBonus: 0, mpBonus: 0 },
    "no skills -> no bonuses");

  // hasMightEffect — both resolution paths, and the negative case.
  ok(hasMightEffect([skill("Might", "none")], reg), "Might detected by legacy name");
  ok(hasMightEffect([skill("renamed", "might")], reg), "Might detected by enum key");
  ok(!hasMightEffect([skill("Life Bonus", "none"), skill("Bufu", "none")], reg),
    "no Might among amplify / non-passive skills");
  ok(!hasMightEffect([], reg), "no skills -> no Might");

  // Regression guard: legacy-name-only data (enum left at default) behaves exactly
  // as the prior name-keyed implementation did for the full Amplify set + Might.
  const legacy = [
    skill("Life Surge", "none"), skill("Mana Bonus", "none"), skill("Might", "none")
  ];
  eq(passiveMultiplierBonuses(legacy, reg), { hpBonus: 3, mpBonus: 1 },
    "legacy-name-only actor keeps prior HP/MP amplify result");
  ok(hasMightEffect(legacy, reg), "legacy-name-only actor keeps prior Might detection");
}

// Advancement maths (p.48). Confirms the shared curve matches the old inline values.
{
  // EXP to reach a level = level^3 x type multiplier, floored.
  eq(expThresholdForLevel(1), 0, "level 1 needs 0 EXP");
  eq(expThresholdForLevel(0), 0, "level 0 (and below) needs 0 EXP");
  eq(expThresholdForLevel(2, 1), 8, "fiend level 2 needs 8 (2^3)");
  eq(expThresholdForLevel(3, 1), 27, "fiend level 3 needs 27");
  eq(expThresholdForLevel(10, 1), 1000, "fiend level 10 needs 1000");
  eq(expThresholdForLevel(50, 1), 125000, "fiend level 50 needs 125000");
  // Demon ×1.3 floors: 2^3×1.3=10.4->10, 3^3×1.3=35.1->35, 10^3×1.3=1300.
  eq(expThresholdForLevel(2, 1.3), 10, "demon level 2 needs 10 (floor 10.4)");
  eq(expThresholdForLevel(3, 1.3), 35, "demon level 3 needs 35 (floor 35.1)");
  eq(expThresholdForLevel(10, 1.3), 1300, "demon level 10 needs 1300 (old inline value)");
  // Human ×0.8 floors: 2^3×0.8=6.4->6, 10^3×0.8=800, 50^3×0.8=100000.
  eq(expThresholdForLevel(2, 0.8), 6, "human level 2 needs 6 (floor 6.4)");
  eq(expThresholdForLevel(10, 0.8), 800, "human level 10 needs 800");
  eq(expThresholdForLevel(50, 0.8), 100000, "human level 50 needs 100000");

  // canLevelUp: banked EXP must meet the NEXT level's threshold; capped level is never ready.
  ok(canLevelUp(8, 1, 1), "fiend with 8 EXP at level 1 can level up");
  ok(!canLevelUp(7, 1, 1), "fiend with 7 EXP at level 1 cannot level up yet");
  ok(canLevelUp(27, 2, 1), "fiend with 27 EXP at level 2 can reach level 3");
  ok(!canLevelUp(26, 2, 1), "fiend with 26 EXP at level 2 cannot reach level 3");
  ok(canLevelUp(10, 1, 1.3), "demon with 10 EXP at level 1 can level up");
  ok(!canLevelUp(9, 1, 1.3), "demon with 9 EXP at level 1 cannot level up yet");
  ok(!canLevelUp(9_999_999, SMT.advancement.maxLevel, 1), "an actor at the level cap is never ready");
}

// Ailment-save eligibility (p.69, p.68 Save column).
{
  // Save-eligible set is exactly Charm/Restrain/Sleep/Panic.
  ok(isSaveEligibleAilment("charm"), "Charm is save-eligible");
  ok(isSaveEligibleAilment("restrain"), "Restrain is save-eligible");
  ok(isSaveEligibleAilment("sleep"), "Sleep is save-eligible");
  ok(isSaveEligibleAilment("panic"), "Panic is save-eligible");
  // Stone and Fly are NOT eligible (the fix).
  ok(!isSaveEligibleAilment("stone"), "Stone is not save-eligible");
  ok(!isSaveEligibleAilment("fly"), "Fly is not save-eligible (only ends at combat end)");
  // Freeze/Shock auto-recover at turn start, so they are not save-eligible here.
  ok(!isSaveEligibleAilment("freeze"), "Freeze is not save-eligible (auto-recovers)");
  ok(!isSaveEligibleAilment("shock"), "Shock is not save-eligible (auto-recovers)");
  // The rest cannot be saved against.
  ok(!isSaveEligibleAilment("mute"), "Mute is not save-eligible");
  ok(!isSaveEligibleAilment("stun"), "Stun is not save-eligible");
  ok(!isSaveEligibleAilment("poison"), "Poison is not save-eligible");
  ok(!isSaveEligibleAilment("death"), "Death is not save-eligible");
  ok(!isSaveEligibleAilment("curse"), "Curse is not save-eligible");
  ok(!isSaveEligibleAilment("none"), "no ailment is not save-eligible");
}

// Report
console.log(`\nsmt-rpg pure-helper tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
