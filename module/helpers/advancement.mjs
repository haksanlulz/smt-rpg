// Pure EXP-curve maths (p.48). The single definition of the level curve, shared by
// base-actor (expNext/canLevelUp), actor.setLevel, and fusion.buildFusedSystem.
// No document/Foundry access beyond CONFIG.SMT.advancement; unit-tested in node.

// EXP needed to REACH a level: floor(level^expCurvePower * multiplier) (p.48). Level 1
// and below needs 0. multiplier is the actor type's expMultiplier (fiend ×1, demon ×1.3, human ×0.8).
export function expThresholdForLevel(level, expMultiplier) {
  const lvl = Math.floor(Number(level) || 0);
  if (lvl <= 1) return 0;
  const mult = Number(expMultiplier) || 1;
  return Math.floor(Math.pow(lvl, CONFIG.SMT.advancement.expCurvePower) * mult);
}

// Whether banked EXP meets the next level's threshold and the level cap isn't reached (p.48).
export function canLevelUp(currentExp, level, expMultiplier) {
  const lvl = Math.floor(Number(level) || 0);
  if (lvl >= CONFIG.SMT.advancement.maxLevel) return false;
  return (Number(currentExp) || 0) >= expThresholdForLevel(lvl + 1, expMultiplier);
}
