// Damage calc (p.64-65). Pure: raw power -> affinity -> subtract resistance (skipped on crit) -> floor 0.

function _applyResistance(afterAffinity, resistance, skipResistance) {
  const value = skipResistance ? afterAffinity : afterAffinity - resistance;
  return Math.max(0, value);
}

// drain/repel deal no direct HP loss but carry the post-resistance magnitude (p.65) for the actor layer.
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

  let afterAffinity;
  if (affinity === "weak") {
    afterAffinity = rawPower * 2;
  } else if (affinity === "strong") {
    afterAffinity = Math.floor(rawPower / 2);
  } else {
    afterAffinity = rawPower;
  }

  // Dodge fumble: double damage, skip resistance (p.65).
  if (dodgeFumble) afterAffinity *= 2;
  const skipResistance = isCritical || dodgeFumble;

  if (affinity === "drain") {
    result.isDrain = true;
    result.afterAffinity = afterAffinity;
    result.drainedAmount = _applyResistance(afterAffinity, resistance, skipResistance);
    return result;
  }
  if (affinity === "repel") {
    result.isRepel = true;
    result.afterAffinity = afterAffinity;
    // Attacker's resistance applies on reflect (p.65).
    result.reflectedDamage = _applyResistance(afterAffinity, attackerResistance, skipResistance);
    return result;
  }

  result.afterAffinity = afterAffinity;
  result.resistanceApplied = skipResistance ? 0 : resistance;
  result.finalDamage = _applyResistance(afterAffinity, resistance, skipResistance);

  return result;
}
