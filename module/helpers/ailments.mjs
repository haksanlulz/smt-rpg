// Ailment rules the book states as arithmetic (p.66-69). Pure: reads CONFIG.SMT,
// touches no documents, so the node suites can reach it.
//
// Like advancement.mjs, this module must NOT import from data/fields.mjs — that
// module destructures foundry.data.fields at module scope and would break every
// node suite that imports this one.

// What the start of an afflicted combatant's turn owes them (p.66, p.68).
//
// Freeze and Shock read "Save allowed. Can only fail to save once; next turn
// automatic recovery" — so the FIRST turn start offers a save, and failing it
// costs the turn; only the turn after that is the recovery free. Recovering
// unconditionally on the first turn start makes both ailments cosmetic and
// leaves their cannotActAilments entries unreachable.
//
// Returns "autoRecover" | "save" | "none".
export function turnStartPlan(ailment, { saveFailed = false } = {}) {
  const SMT = CONFIG.SMT;
  if (!ailment || ailment === "none") return "none";
  if (saveFailed && SMT.autoRecoverAtTurnStart.includes(ailment)) return "autoRecover";
  if (SMT.ailmentSave.eligible.includes(ailment)) return "save";
  return "none";
}

// p.68 Dodge column. N for Stone, Restrain, Freeze, Sleep and Shock; Stone is the
// one of those five that can still take its own action, which is why it does not
// appear in cannotActAilments.
export function canDodge(ailment) {
  if (!ailment || ailment === "none") return true;
  return !CONFIG.SMT.cannotDodgeAilments.includes(ailment);
}

// p.66 Stone: "when struck with a Phys element attack, you have a 30% chance to
// shatter and die." Returns the percentage, or 0 when nothing shatters.
export function shatterPctFor(ailment, element) {
  const stone = CONFIG.SMT.stone;
  if (ailment !== "stone") return 0;
  return stone.shatterElements.includes(element) ? stone.shatterPct : 0;
}

// p.58 Fumble Effect Chart, Save row: "The ailment remains, and your HP and MP are
// halved." The ailment part falls out of the save simply failing; this is the other half.
export function fumbledSaveResources({ hp, mp }) {
  const d = CONFIG.SMT.fumbleEffects.saveResourceDivisor;
  const half = v => Math.floor(Math.max(0, Number(v) || 0) / d);
  return { hp: half(hp), mp: half(mp) };
}

// The multiplier an ailment puts on damage the afflicted character RECEIVES.
//
// Stone (p.66): "You halve damage from all attacks that are not Phys, Force, or
// Almighty elements." Fly (p.66): "All damage received is doubled."
//
// The book does not say where either sits relative to resistance. Both are applied
// with the affinity multiplier — i.e. before resistance — because that is the one
// ordering p.65 does fix for a multiplier on incoming damage. Inference, not print.
export function incomingDamageMultiplier(ailment, element) {
  const SMT = CONFIG.SMT;
  if (ailment === "stone") {
    return SMT.stone.halveExceptElements.includes(element) ? 1 : 0.5;
  }
  if (ailment === "fly") return SMT.fly.damageMultiplier;
  return 1;
}
