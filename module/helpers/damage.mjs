// Pure damage calc (p.64-65). No side effects.
// Raw power -> affinity modifier -> subtract resistance (skipped on crit) -> floor 0
export function calculateDamage({ rawPower, affinity, resistance, isCritical, dodgeFumble = false }) {
  const result = {
    rawPower,
    affinity,
    afterAffinity: 0,
    resistanceApplied: 0,
    finalDamage: 0,
    isDrain: false,
    isRepel: false,
    isNull: false,
    dodgeFumble
  };

  if (affinity === "null") {
    result.isNull = true;
    return result;
  }
  if (affinity === "drain") {
    result.isDrain = true;
    result.afterAffinity = rawPower;
    result.finalDamage = 0;
    return result;
  }
  if (affinity === "repel") {
    result.isRepel = true;
    result.afterAffinity = rawPower;
    result.finalDamage = 0;
    return result;
  }

  // Affinity multiplier
  if (affinity === "weak") {
    result.afterAffinity = rawPower * 2;
  } else if (affinity === "strong") {
    result.afterAffinity = Math.floor(rawPower / 2);
  } else {
    result.afterAffinity = rawPower;
  }

  // Dodge fumble: double damage, skip resistance (p.65)
  if (dodgeFumble) {
    result.afterAffinity *= 2;
  }

  // Crits and dodge fumbles skip resistance
  if (isCritical || dodgeFumble) {
    result.resistanceApplied = 0;
    result.finalDamage = result.afterAffinity;
  } else {
    result.resistanceApplied = resistance;
    result.finalDamage = result.afterAffinity - resistance;
  }

  result.finalDamage = Math.max(0, result.finalDamage);

  return result;
}
