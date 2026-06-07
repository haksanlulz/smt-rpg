// d100-vs-TN outcome ladder (p.64). Pure; callers localize cssClass/outcomeKey.

// Flag payloads under the "smt-rpg" namespace (not runtime-enforced):
// CheckData: { actorTokenUuid, rollResult, isSuccess, isCritical, currentTN, originalTN, hasPowerRoll, basePower, skillPower, element, isPhysical, skillName, targetTokenUuids, targetsString, ailmentType, ailmentRate, hasMight, resolved }
// AttackData: { attackerTokenUuid, targetTokenUuid, rawPower, element, isPhysical, isCritical, skillName, ailmentType, ailmentRate, checkMessageId, resolved }
// DamageData: { targetTokenUuid, originalDamage, currentDamage, resolved }
// DamageResult: { rawPower, affinity, afterAffinity, resistanceApplied, finalDamage, isDrain, isRepel, isNull, drainedAmount, reflectedDamage, dodgeFumble }

export function evaluatePercentile(result, tn, { hasMight = false } = {}) {
  const check = CONFIG.SMT.check;
  const critDivisor = hasMight ? check.mightCritDivisor : check.critDivisor;

  if (result === check.fumble) {
    return { isSuccess: false, isCritical: false, isFumble: true, cssClass: "fumble", outcomeKey: "SMT.Roll.Fumble" };
  }
  if (result >= check.autoFailMin) {
    return { isSuccess: false, isCritical: false, isFumble: false, cssClass: "auto-fail", outcomeKey: "SMT.Roll.AutoFail" };
  }
  if (result === 1 || result <= Math.floor(tn / critDivisor)) {
    return { isSuccess: true, isCritical: true, isFumble: false, cssClass: "critical", outcomeKey: "SMT.Roll.Critical" };
  }
  if (result <= tn) {
    return { isSuccess: true, isCritical: false, isFumble: false, cssClass: "success", outcomeKey: "SMT.Roll.Success" };
  }
  return { isSuccess: false, isCritical: false, isFumble: false, cssClass: "failure", outcomeKey: "SMT.Roll.Failure" };
}
