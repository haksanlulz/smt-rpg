// Encounter check, ambush and back attack (p.70-71). Pure: reads CONFIG.SMT, touches no
// document.
//
// p.70: "To make an encounter check, all PCs make a Luck check, then consult the
// following chart to find their overall value and ultimately what situation occurs."
// Every PC contributes a signed value by outcome, the party TOTALS them, and one band
// lookup decides the situation for both sides at once.
//
// ─── The party is the unit, not the character ─────────────────────────────────
// This is the only check in the system whose result belongs to a group. One PC critting
// does not ambush anybody; five PCs each scraping a success does. That is why the sum is
// its own function and the band lookup takes a sum rather than a roll — writing it
// per-character and combining afterwards is how a +2 crit ends up applied five times.
//
// ─── Ambush and back attack are one axis with two magnitudes ──────────────────
// A back attack is "an ambush executed with flawless efficiency" (p.71), so the effect
// carries a SIDE and a SEVERITY rather than being four unrelated outcomes. Both give the
// aggressor +1d10 initiative; they differ in what happens to the victim, and modelling
// them as separate booleans is how the shared clause drifts.

export const ENCOUNTER_OUTCOMES = ["critical", "success", "failure", "autoFail", "fumble"];

// What one PC's Luck check contributes (p.70): Critical +2, Success +1, Failure -1,
// Auto-Fail -2, Fumble -3. An unrecognised outcome contributes NOTHING rather than
// guessing a sign — a check that did not happen must not tilt the party's total.
export function encounterValue(outcome) {
  const values = CONFIG.SMT.encounter.values;
  return Object.hasOwn(values, outcome) ? values[outcome] : 0;
}

// The party total. `results` is one outcome string per PC.
export function encounterSum(results) {
  let sum = 0;
  for (const outcome of results ?? []) sum += encounterValue(outcome);
  return sum;
}

// Which situation the total produces (p.70). Returns
// `{ id, side, severity }` — side is "pcs" | "demons" | null (who is the AGGRESSOR),
// severity is "backAttack" | "ambush" | null.
//
// The bands are inclusive and gapless as printed: +5 or more / +3 or +4 / 0 to +2 /
// -3 to -1 / -4 or less. The suite sweeps every integer across the whole range because
// a hand-typed band table's two failure modes are a hole and an overlap, and neither is
// visible by reading.
export function encounterEffect(sum) {
  const value = Number.isFinite(sum) ? Math.floor(sum) : 0;
  for (const band of CONFIG.SMT.encounter.bands) {
    const overMin = band.min === null || value >= band.min;
    const underMax = band.max === null || value <= band.max;
    if (overMin && underMax) return { id: band.id, side: band.side, severity: band.severity };
  }
  return { id: "none", side: null, severity: null };
}

// p.71: "When PCs are setting up by lying in wait or some other means, the encounter
// check gains +20% to its TN. If the demon side is, however, then -20%."
//
// Both sides preparing is not printed. Netting them to zero is the reading taken, and it
// is the only one that keeps the modifier a property of the SITUATION rather than of
// whoever the GM happened to mention first. [inferred]
export function surpriseTnModifier({ pcsPrepared = false, demonsPrepared = false } = {}) {
  const step = CONFIG.SMT.encounter.surpriseTnBonus;
  return (pcsPrepared ? step : 0) - (demonsPrepared ? step : 0);
}

// Whether a given side is the aggressor under this effect.
export function isAggressor(effect, side) {
  return !!effect?.side && effect.side === side;
}

// The initiative treatment each side gets (p.71).
//
//   aggressor  — "+1d10 bonus to their initiative rolls", both ambush and back attack
//   ambushed   — "rolls initiative normally"
//   back-attacked — "sets their initiative without making an effect roll for it. That
//                   is, their initiative is equal to their Agility alone."
//
// Returned as a formula fragment rather than a number so the caller hands it straight to
// the initiative roll, and so "Agility alone" is expressible at all — it is not a
// modifier on the normal roll, it replaces the die.
export function initiativeTreatment(effect, side) {
  const cfg = CONFIG.SMT.encounter;
  if (!effect?.side) return { formula: cfg.initiativeFormula, bonus: null, flat: false };
  if (isAggressor(effect, side)) {
    return { formula: `${cfg.initiativeFormula} + ${cfg.initiativeBonus}`, bonus: cfg.initiativeBonus, flat: false };
  }
  // The victim's side.
  if (effect.severity === "backAttack") {
    return { formula: cfg.initiativeFlatFormula, bonus: null, flat: true };
  }
  return { formula: cfg.initiativeFormula, bonus: null, flat: false };
}

// p.71: "During the first round of combat, characters on the side being ambushed are
// considered to be defenseless right up until they act for the first time. While
// defenseless, characters cannot take any actions, dodging included."
//
// AMBUSH ONLY. A back attack inflicts Shock instead, which is a stronger and separately
// stated effect — stacking both on the back-attacked side would double a penalty the
// book states once.
export function defenseless(effect, side) {
  if (!effect?.side || effect.severity !== "ambush") return false;
  return !isAggressor(effect, side);
}

// p.71: "the side being back attacked is inflicted with Shock. This Shock ignores any
// affinity ratings that would nullify it."
//
// The affinity bypass is the whole reason this returns a shape rather than a boolean —
// a Shock applied through the ordinary ailment path would be nulled by any demon with a
// Null Nerve rating, and the sentence exists specifically to say it is not.
export function backAttackShock(effect, side) {
  if (effect?.severity !== "backAttack" || isAggressor(effect, side)) return null;
  return { ailment: CONFIG.SMT.encounter.backAttackAilment, ignoresAffinity: true };
}
