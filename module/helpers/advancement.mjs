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

// Which stat a demon's level-up point raises (p.34). The roll is the 1d10 face, with
// the book's "0" being 10. Faces 6-8 point at the demon's favored stat; 9 and 0 are
// the player's choice, and so is anything the table cannot resolve — an off-table
// roll, or a favored-stat face on a demon that prints no asterisk at all (the three
// Manikins, p.210). Never guesses a stat.
export function statGrowthFor(roll, favoredStat) {
  const choice = { stat: null, playerChoice: true };
  if (!Number.isInteger(roll)) return choice;

  const entry = CONFIG.SMT.advancement.statGrowth.table[roll];
  if (entry === undefined || entry === null) return choice;

  const stat = entry === "favored" ? String(favoredStat ?? "").trim().toLowerCase() : entry;
  // CONFIG.SMT.stats is the canonical list. fields.mjs also exports one, but it
  // destructures foundry.data.fields at module scope and so cannot be imported here.
  if (!Object.keys(CONFIG.SMT.stats).includes(stat)) return choice;
  return { stat, playerChoice: false };
}
