// The p.35-36 character formulas. Pure — no Foundry, no document access.
//
// These lived inline in SMTBaseActorData#prepareDerivedData, which no node suite can
// import, so the arithmetic the entire system rests on had no assertion on it. Pulled
// out for the same reason applyDamageToHp was (GAUNTLET.md §6): the 2026-06-07 escape
// lived precisely at the seam between covered pure maths and an uncovered write.
//
// Every one of these is checked against the eight printed sample characters on
// p.25-32 in test/sample-characters.test.mjs. HP/MP maxima stay in resources.mjs,
// which already owns the boss-override case.

// Stat TN = (stat x 5) + level + modifiers (p.35).
export function statTn(stat, level, modifiers = 0) {
  return (num(stat) * CONFIG.SMT.tnPerStat) + num(level) + num(modifiers);
}

// Dodge TN = Agility + 10. NOT level-based, and p.35 says so explicitly.
export function dodgeTn(agility, bonus = 0) {
  return num(agility) + CONFIG.SMT.dodgeBonus + num(bonus);
}

// Negotiation TN = (Luck x 2) + 20. Also not level-based (p.35).
export function negotiationTn(luck) {
  const n = CONFIG.SMT.negotiation;
  return (num(luck) * n.multiplier) + n.bonus;
}

// Resistance = (stat + level) / 2, rounded down per p.53's ground rule (p.36).
// Physical reads Vitality, magical reads Magic.
export function resistance(stat, level) {
  return Math.floor((num(stat) + num(level)) / 2);
}

// Base power = stat + level (p.36). Physical reads Strength, magical reads Magic.
export function basePower(stat, level) {
  return num(stat) + num(level);
}

// Fate = (Luck / 5) + 5 (p.36). The division floors, so Luck 0-4 all give 5.
export function fatePoints(luck) {
  const f = CONFIG.SMT.fate;
  return Math.floor(num(luck) / f.maxLuckDivisor) + f.maxBase;
}

// Starting Macca = Level x 50 (p.36). A character-creation value; nothing in the
// system consumes it yet because there is no creation flow to attach it to.
export function startingMacca(level) {
  return num(level) * CONFIG.SMT.startingMaccaPerLevel;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
