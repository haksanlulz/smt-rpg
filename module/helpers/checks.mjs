// d100-vs-TN outcome ladder (p.64). Pure; callers localize cssClass/outcomeKey.

// Flag payloads under the "smt-rpg" namespace (not runtime-enforced):
// CheckData: { actorTokenUuid, rollResult, isSuccess, isCritical, currentTN, originalTN, hasPowerRoll, basePower, skillPower, element, isPhysical, skillName, targetTokenUuids, targetsString, ailmentType, ailmentRate, hasMight, resolved }
// AttackData: { attackerTokenUuid, targetTokenUuid, rawPower, element, isPhysical, isCritical, skillName, ailmentType, ailmentRate, checkMessageId, resolved }
// DamageData: { targetTokenUuid, originalDamage, currentDamage, resolved }
// DamageResult: { rawPower, affinity, afterAffinity, resistanceApplied, finalDamage, isDrain, isRepel, isNull, drainedAmount, reflectedDamage, dodgeFumble }

// What a Fate Point owes the skill once it moves the outcome (p.59).
//
// The guard here used to be `newSuccess && hasPowerRoll`, which is right for the
// power roll and wrong for everything else: a skill whose ENTIRE effect is its
// ailment — Lullaby, Stun Gaze, Makajam — has no power roll, so rerolling one into
// a success produced nothing at all. The un-rerolled path in SMTItem#use has always
// had the second branch; the Fate Point path never did.
//
// Returns "powerRoll" | "ailmentOnly" | "cancel" | "none".
export function cascadePlan(checkData, { oldSuccess, newSuccess }) {
  if (!oldSuccess && newSuccess) {
    if (checkData?.hasPowerRoll) return "powerRoll";
    const type = checkData?.ailmentType ?? "none";
    const rate = Number(checkData?.ailmentRate) || 0;
    return (type && type !== "none" && rate > 0) ? "ailmentOnly" : "none";
  }
  if (oldSuccess && !newSuccess) return "cancel";
  return "none";
}

// `cursed` widens the auto-fail band from 96-99 to 86-99 (p.57, p.67). It moves
// nothing else: 100 is still a fumble and 1 is still a critical.
export function evaluatePercentile(result, tn, { hasMight = false, cursed = false } = {}) {
  const check = CONFIG.SMT.check;
  const critDivisor = hasMight ? check.mightCritDivisor : check.critDivisor;
  const autoFailMin = cursed ? check.curseAutoFailMin : check.autoFailMin;

  if (result === check.fumble) {
    return { isSuccess: false, isCritical: false, isFumble: true, cssClass: "fumble", outcomeKey: "SMT.Roll.Fumble" };
  }
  if (result >= autoFailMin) {
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
