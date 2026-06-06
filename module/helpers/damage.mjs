// Pure damage calc (p.64-65). No side effects.
// Raw power -> affinity modifier -> subtract resistance (skipped on crit) -> floor 0

/**
 * Apply the affinity multiplier and (unless skipped) resistance to a post-affinity value.
 * Mirrors the normal-hit pipeline so drain/repel can compute their would-be final damage.
 * @param {number} afterAffinity  - power after the affinity multiplier and any dodge-fumble doubling.
 * @param {number} resistance     - resistance to subtract.
 * @param {boolean} skipResistance- true on crit / dodge-fumble (p.65).
 * @returns {number} HP delta, floored at 0.
 */
function _applyResistance(afterAffinity, resistance, skipResistance) {
  const value = skipResistance ? afterAffinity : afterAffinity - resistance;
  return Math.max(0, value);
}

/**
 * Compute the damage outcome of one attack against one target. Pure — no document access.
 *
 * For null/drain/repel the target takes no direct HP loss (finalDamage = 0). drain/repel still
 * carry the would-be magnitude so the actor layer can heal/reflect the correct, post-resistance
 * amount (p.65) rather than the raw power:
 *  - drainedAmount   : healing the target gains, using the TARGET's resistance.
 *  - reflectedDamage : HP the attacker loses, using the ATTACKER's resistance (attackerResistance).
 *
 * @param {object} params
 * @param {number}  params.rawPower            - rolled power total before any modifier.
 * @param {string}  params.affinity            - "normal"|"weak"|"strong"|"null"|"drain"|"repel".
 * @param {number}  params.resistance          - target's resistance (physical or magical) for the element.
 * @param {boolean} params.isCritical          - crit skips resistance (p.65).
 * @param {boolean} [params.dodgeFumble=false] - dodge fumble: double damage, skip resistance (p.65).
 * @param {number}  [params.attackerResistance=0] - attacker's resistance, used only for repel reflection (p.65).
 * @returns {import("./checks.mjs").DamageResult}
 */
export function calculateDamage({ rawPower, affinity, resistance, isCritical, dodgeFumble = false, attackerResistance = 0 }) {
  const result = {
    rawPower,
    affinity,
    afterAffinity: 0,
    resistanceApplied: 0,
    finalDamage: 0,
    isDrain: false,
    isRepel: false,
    isNull: false,
    drainedAmount: 0,
    reflectedDamage: 0,
    dodgeFumble
  };

  if (affinity === "null") {
    result.isNull = true;
    return result;
  }

  // Affinity multiplier (shared by normal hits and the would-be drain/repel magnitude).
  let afterAffinity;
  if (affinity === "weak") {
    afterAffinity = rawPower * 2;
  } else if (affinity === "strong") {
    afterAffinity = Math.floor(rawPower / 2);
  } else {
    afterAffinity = rawPower;
  }

  // Dodge fumble: double damage, skip resistance (p.65). Applies to drain/repel magnitude too.
  if (dodgeFumble) afterAffinity *= 2;
  const skipResistance = isCritical || dodgeFumble;

  if (affinity === "drain") {
    result.isDrain = true;
    result.afterAffinity = afterAffinity;
    // Target absorbs as healing: post-resistance against the target's own resistance.
    result.drainedAmount = _applyResistance(afterAffinity, resistance, skipResistance);
    return result;
  }
  if (affinity === "repel") {
    result.isRepel = true;
    result.afterAffinity = afterAffinity;
    // Reflected back at the attacker: the attacker's resistance applies (p.65).
    result.reflectedDamage = _applyResistance(afterAffinity, attackerResistance, skipResistance);
    return result;
  }

  result.afterAffinity = afterAffinity;
  result.resistanceApplied = skipResistance ? 0 : resistance;
  result.finalDamage = _applyResistance(afterAffinity, resistance, skipResistance);

  return result;
}
