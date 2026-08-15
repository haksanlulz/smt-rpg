// Four printed skills whose text describes a mechanic nothing else in the system has
// (p.102, p.103, p.106, p.108). Pure: reads CONFIG.SMT, touches no document.
//
// Each one is here rather than in a general helper because each is a one-off rule the
// book states for exactly one skill, and generalising a sample size of one is how a
// rider ends up applying to skills that never printed it.

// ── Deadly Fury (p.108) ──────────────────────────────────────────────────────
// "Deal Phys damage to all enemies. For this check only, treat critical rate as 20%
// (1/5th) of the TN. Does not stack with Might."
//
// Might (p.110) widens the crit threshold exactly the same way, and the non-stacking
// clause is what makes this a MIN over divisors rather than a product: two effects that
// both say "a fifth of the TN" produce a fifth, not a twenty-fifth. Returning the
// divisor rather than a boolean is what makes that expressible at all.
export function critDivisorFor({ hasMight = false, skillWidensCrit = false } = {}) {
  const check = CONFIG.SMT.check;
  const widened = check.mightCritDivisor;
  return (hasMight || skillWidensCrit) ? widened : check.critDivisor;
}

// ── Pinhole (p.106) ──────────────────────────────────────────────────────────
// "Make an attack with a firearm using Agility. Your target treats their resistance and
// dodge rate as being halved for this attack."
//
// Both halvings are FOR THIS ATTACK, so neither is a stored effect — they are arguments
// to one resolution. Rounding is down on the resistance (the attacker's benefit is the
// printed intent) and down on the dodge TN (same reason). [inferred — the book prints
// no rounding rule for either]
export function pinholeResistance(resistance, { halves = false } = {}) {
  const value = Number.isFinite(resistance) ? Math.max(0, Math.floor(resistance)) : 0;
  return halves ? Math.floor(value / 2) : value;
}

export function pinholeDodgeTn(dodgeTn, { halves = false } = {}) {
  const value = Number.isFinite(dodgeTn) ? Math.max(0, Math.floor(dodgeTn)) : 0;
  return halves ? Math.floor(value / 2) : value;
}

// ── Analyze (p.102) ──────────────────────────────────────────────────────────
// "Make a power roll, adding the user's level to the roll. If this roll is equal to or
// higher than the target demon's level, learn all info in their statblock. This skill
// cannot be used on Bosses. No check is necessary during combat."
//
// Note what is NOT a hit check: p.15's worked example calls it "an auto-success skill,
// so no check is needed", and the contest is the POWER roll against the target's level.
// Treating it as a percentile check would gate the skill on a stat it never names.
//
// "Equal to or higher" is inclusive, and the boss refusal is absolute rather than a
// harder threshold — a boss returns `blocked`, not a contest the roll cannot win.
export function analyzeOutcome({ roll = 0, userLevel = 0, targetLevel = 0, targetIsBoss = false } = {}) {
  if (targetIsBoss) return { blocked: true, success: false, total: 0 };
  const total = (Number.isFinite(roll) ? roll : 0) + (Number.isFinite(userLevel) ? userLevel : 0);
  const against = Number.isFinite(targetLevel) ? targetLevel : 0;
  return { blocked: false, success: total >= against, total };
}

// ── God's Curse (p.103) ──────────────────────────────────────────────────────
// "60% chance to inflict ailment to all targets. Roll 1d10: 1-2: Charm; 3-4: Panic;
// 5-6: Sleep; 7-8: Restrain; 9-10: Stun."
//
// The 1d10 picks WHICH ailment; the 60% is the ordinary effect rate and still runs
// through resolveAilment, so affinity, crit and dodge-fumble modifiers all apply to it
// exactly as they would to a printed single-ailment skill. Two rolls, two jobs — folding
// the d10 into the rate would make the ailment certain and its identity a coin flip.
export function godsCurseAilment(d10) {
  const table = CONFIG.SMT.godsCurse.table;
  const roll = Number.isFinite(d10) ? Math.floor(d10) : 0;
  for (const row of table) {
    if (roll >= row.min && roll <= row.max) return row.ailment;
  }
  return null;
}
