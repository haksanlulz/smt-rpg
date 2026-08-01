// d100-vs-TN outcome ladder (p.64). Pure; callers localize cssClass/outcomeKey.

// Flag payloads under the "smt-rpg" namespace (not runtime-enforced):
// CheckData: { actorTokenUuid, rollResult, isSuccess, isCritical, currentTN, originalTN, hasPowerRoll, basePower, skillPower, element, isPhysical, skillName, targetTokenUuids, targetsString, ailmentType, ailmentRate, hasMight, resolved }
// AttackData: { attackerTokenUuid, targetTokenUuid, rawPower, element, isPhysical, isCritical, skillName, ailmentType, ailmentRate, checkMessageId, resolved }
// DamageData: { targetTokenUuid, originalDamage, currentDamage, resolved }
// DamageResult: { rawPower, affinity, afterAffinity, resistanceApplied, finalDamage, isDrain, isRepel, isNull, drainedAmount, reflectedDamage, dodgeFumble }

// How many times a TN may be spent, and at what TN each (p.59-60).
//
// "Divide the original TN by the number of actions taken to find the TN for each
// action... (Adjust the critical value for each based on the new TN, post-division.)"
// The critical adjustment falls out for free: evaluatePercentile derives the crit
// threshold from whatever TN it is handed, so passing the divided TN is enough.
//
// Two things are barred outright rather than merely discouraged: an auto-success
// skill can never multi-action even at 300% (p.60, restated p.96), and negotiation
// never can (p.74).
export function multiActionPlan(tn, { autoSuccess = false, isNegotiation = false } = {}) {
  const value = Number.isFinite(tn) ? Math.floor(tn) : 0;
  if (autoSuccess || isNegotiation) return { actions: 1, tnEach: value, eligible: false };

  const band = CONFIG.SMT.multiAction.bands.find(b => value >= b.min);
  if (!band) return { actions: 1, tnEach: value, eligible: false };

  const actions = Math.min(band.actions, CONFIG.SMT.multiAction.maxActions);
  return { actions, tnEach: Math.floor(value / actions), eligible: true };
}

// The TN one part of an N-part multi-action rolls against. Split out so a caller that
// lets the player take FEWER parts than the maximum still divides by what was taken,
// which is what p.60's "divide the original TN by the number of actions taken" says.
export function multiActionTn(tn, actions) {
  const value = Number.isFinite(tn) ? Math.floor(tn) : 0;
  const parts = Number.isFinite(actions) && actions >= 1 ? Math.floor(actions) : 1;
  return Math.floor(value / parts);
}

// What a Fate Point owes the skill once it moves the outcome (p.59).
//
// The guard here used to be `newSuccess && hasPowerRoll`, which is right for the
// power roll and wrong for everything else: a skill whose ENTIRE effect is its
// ailment — Lullaby, Stun Gaze, Makajam — has no power roll, so rerolling one into
// a success produced nothing at all. The un-rerolled path in SMTItem#use has always
// had the second branch; the Fate Point path never did.
//
// Returns "powerRoll" | "fractionalAttack" | "ailmentOnly" | "cancel" | "none".
export function cascadePlan(checkData, { oldSuccess, newSuccess }) {
  if (!oldSuccess && newSuccess) {
    if (checkData?.hasPowerRoll) return "powerRoll";
    // A fractional-HP skill (p.102-103) rolls no power — the pending attack itself
    // is its whole effect, so a rerolled success must still post it.
    if (checkData?.riders?.fractional) return "fractionalAttack";
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
