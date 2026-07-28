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

// Fly (p.66): "All stats other than Agility are treated as though they are 1."
//
// Returns the stat totals a Flied character uses for checks, base power, resistances
// and saves. The HP/MP pools are deliberately computed from the UN-flattened totals
// instead — operator ruling 2026-07-28, since a resource pool is not a check and the
// source game does not collapse max HP. Unknown stats are passed through untouched
// rather than flattened, so a future stat cannot be silently zeroed by this.
export function flyStatTotals(totals, ailment) {
  const out = { ...(totals ?? {}) };
  if (ailment !== "fly") return out;

  const { exemptStats, flattenedValue } = CONFIG.SMT.fly;
  for (const stat of Object.keys(CONFIG.SMT.stats)) {
    if (!(stat in out) || exemptStats.includes(stat)) continue;
    out[stat] = flattenedValue;
  }
  return out;
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
