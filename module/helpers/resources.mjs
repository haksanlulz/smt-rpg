// HP/MP maxima (p.36, p.109, p.123). Pure — no Foundry, no document access.

// (stat + level) x (multiplier + passive bonus), unless an explicit maximum is set.
//
// Boss stat blocks print HP and MP that no formula derives: p.123 says they "conform
// to how they appear in the original game, deriving their stats from their HP and MP",
// and the p.124-125 list is hand-authored per boss. Across the 23 bosses the ratio to
// the derived value runs from 0.26x to 55x, so there is no multiplier to apply — the
// printed number has to be carried. 21 of the 23 print MORE than the formula derives
// and were being clamped down to it, which halved Specter and cost Baal Avatar 12,370 HP.
//
// An override of 0, absent, negative or non-finite means "derive normally" rather than
// "this actor has no HP" — the schema default is 0 and must not zero out every actor.
export function resolveResourceMax({ stat, level, multiplier, override } = {}) {
  const fixed = Number(override);
  if (Number.isFinite(fixed) && fixed > 0) return Math.floor(fixed);

  const s = Number(stat) || 0;
  const lvl = Number(level) || 0;
  const mult = Number(multiplier) || 0;
  return Math.max(1, Math.floor((s + lvl) * mult));
}
