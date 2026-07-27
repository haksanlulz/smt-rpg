// Damage calc (p.64-65). Pure: raw power -> affinity -> subtract resistance (skipped on crit) -> floor 0.

const MAX_DAMAGE = 1_000_000;

// Flag/roll values reach here author-forgeable; coerce before arithmetic.
function _sanitize(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.floor(value), 0), MAX_DAMAGE);
}

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

// The HP write itself, pulled out of SMTActor#applyDamage so it is checkable.
// `dealt` is the HP actually lost, which is NOT finalDamage when the hit overkills —
// the difference is what the FP halve needs to resolve correctly (p.59).
export function applyDamageToHp(hpBefore, hpMax, finalDamage) {
  const before = _sanitize(hpBefore);
  const hpAfter = Math.max(before - _sanitize(finalDamage), 0);
  return { hpAfter, dealt: before - hpAfter };
}

// FP "Halve Damage" (p.59). Resolves against `hpBefore` — the HP at the moment the
// hit landed — so the outcome is exact whether or not the hit overkilled, and stays
// exact across repeated spends (1/2 -> 1/4 -> 1/8), each recomputed from the same base.
//
// `hpNow` is the legacy path for damage cards written before `hpBefore` was stored:
// it restores the difference, which over-restores by exactly the overkill amount.
// Kept so old chat messages keep working; never used when hpBefore is present.
export function halveDamageResult({ hpBefore, hpNow, hpMax, currentDamage, divisor = 2 }) {
  const max = Number.isFinite(hpMax) ? Math.max(Math.floor(hpMax), 0) : MAX_DAMAGE;
  const div = Number.isFinite(divisor) && divisor > 0 ? divisor : 2;
  const damage = _sanitize(currentDamage);
  const newDamage = Math.floor(damage / div);

  const base = Number.isFinite(hpBefore)
    ? _sanitize(hpBefore) - newDamage
    : _sanitize(hpNow) + (damage - newDamage);

  return { newDamage, hpAfter: Math.min(Math.max(base, 0), max) };
}
