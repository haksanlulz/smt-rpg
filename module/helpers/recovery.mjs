// What a recovery skill actually does (p.100, p.104). Pure: reads CONFIG.SMT,
// touches no documents.
//
// The Healing group on p.100 is not one effect, it is four. Nine of its fourteen
// entries do something other than restore HP by power:
//
//   Patra / Me Patra      remove Restrain, Sleep and Panic  (a SET, not one and not all)
//   Mutudi / Posumudi /
//   Paraladi / Petradi    remove one named ailment each
//   Recarm / Samarecarm   revive, then restore
//   Recarmdra             restore every ally in full, then kill the caster
//   Prayer (p.104)        restore every ally in full and clear every ailment but Fly
//
// Same rule as advancement.mjs and ailments.mjs: never import data/fields.mjs here.

// Which ailments a cure spec clears.
//   "none" / empty  -> []
//   "all"           -> every common ailment the book lists (p.68)
//   anything else    -> whitespace- or comma-separated keys; unknown keys are DROPPED
//                       rather than passed through, so a typo cures nothing instead of
//                       silently becoming a key the ailment slot will never hold.
export function curedAilments(spec) {
  const known = Object.keys(CONFIG.SMT.ailments);
  const raw = String(spec ?? "").trim().toLowerCase();
  if (!raw || raw === "none") return [];
  if (raw === "all") return known.filter(a => !CONFIG.SMT.specialAilments.includes(a));

  const seen = new Set();
  for (const token of raw.split(/[\s,]+/)) {
    if (known.includes(token) && !CONFIG.SMT.specialAilments.includes(token)) seen.add(token);
  }
  return known.filter(a => seen.has(a));
}

// Whether a cure spec clears the ailment the target is actually carrying.
export function curesCurrent(spec, current) {
  if (!current || current === "none") return false;
  return curedAilments(spec).includes(current);
}

// The whole of what one recovery skill does, read off its system data.
//
// `heals` is "full" | "power" | "none" — "power" being p.97's total Power (skill
// potency + base magical power + power roll). A skill that only cures or only
// revives heals nothing, which is the case the old code got wrong: it treated
// skillType "recovery" as "roll power and add HP", so Patra healed instead of curing.
export function recoveryPlan(sys = {}) {
  const cures = curedAilments(sys.curesAilment);
  const revives = !!sys.revive;
  const healFull = !!sys.healFull;
  const power = Number(sys.power) || 0;

  let heals = "none";
  if (healFull) heals = "full";
  else if (power > 0 || (!cures.length && !revives)) heals = "power";

  return {
    heals,
    cures,
    revives,
    reviveFull: revives && !!sys.reviveFull,
    selfKO: !!sys.selfKO
  };
}
