// Pure percentile-check evaluation (p.64). No side effects, no i18n, no rolling.
// Single source of truth for the d100-vs-TN outcome ladder. Callers (actor.rollPercentile,
// combat._evaluatePercentile) localize cssClass/outcomeKey themselves.

/**
 * Cross-file ChatMessage flag payloads live under the "smt-rpg" namespace.
 * These typedefs document the load-bearing shapes once; they are not enforced at runtime.
 */

/**
 * Result of evaluating a d100 check against a target number.
 * @typedef {object} CheckOutcome
 * @property {boolean} isSuccess   - true on success or critical.
 * @property {boolean} isCritical  - true only on a critical (roll === 1 or roll <= crit threshold).
 * @property {boolean} isFumble    - true only on a fumble (roll === CONFIG.SMT.check.fumble).
 * @property {string}  cssClass    - "fumble" | "auto-fail" | "critical" | "success" | "failure".
 * @property {string}  outcomeKey  - i18n key under SMT.Roll.* the caller localizes for display.
 */

/**
 * checkData flag (ChatMessage flag "smt-rpg.checkData"). Built in item.mjs use(); read by
 * combat.mjs resolveCheckReroll/resolveCheckBoost. Drives Fate Point reroll/boost buttons.
 * @typedef {object} CheckData
 * @property {string}   actorTokenUuid    - token UUID of the acting actor (?? actor.id fallback).
 * @property {number}   rollResult        - the d100 result currently shown.
 * @property {boolean}  isSuccess         - current success state of the check.
 * @property {boolean}  isCritical        - current critical state of the check.
 * @property {number}   currentTN         - target number after any FP boosts.
 * @property {number}   originalTN        - target number before any FP boosts.
 * @property {boolean}  hasPowerRoll      - whether a power roll follows on success.
 * @property {number}   basePower         - actor base physical/magical power for the power roll.
 * @property {number}   skillPower        - skill's own power contribution.
 * @property {string}   element           - damage/affinity element key.
 * @property {boolean}  isPhysical        - true for physical-attack skills.
 * @property {string}   skillName         - skill display name.
 * @property {string[]} targetTokenUuids  - manually-targeted token UUIDs captured at use time.
 * @property {string}   targetsString     - the skill's raw targets string ("All Foes", etc.).
 * @property {string}   ailmentType       - inflicted ailment type, or "none".
 * @property {number}   ailmentRate       - base ailment infliction rate (percent).
 * @property {boolean}  hasMight          - whether the Might passive widened the crit threshold.
 * @property {boolean}  resolved          - guard flag; true once the card is spent.
 */

/**
 * attackData flag (ChatMessage flag "smt-rpg.attackData"). Built in combat.postPendingAttack;
 * read by combat.resolveAttack. One pending-attack card per target; Dodge/Apply buttons act on it.
 * @typedef {object} AttackData
 * @property {string}  attackerTokenUuid - token UUID of the attacker (?? actor.id fallback).
 * @property {string}  targetTokenUuid   - token UUID of the target (?? actor.id fallback).
 * @property {number}  rawPower          - rolled power total before affinity/resistance.
 * @property {string}  element           - damage/affinity element key.
 * @property {boolean} isPhysical        - true for physical attacks (selects physical resistance).
 * @property {boolean} isCritical        - true if the originating check critted.
 * @property {string}  skillName         - skill display name.
 * @property {string}  ailmentType       - inflicted ailment type, or "none".
 * @property {number}  ailmentRate       - base ailment infliction rate (percent).
 * @property {?string} checkMessageId    - id of the originating check card (for FP cascade), or null.
 * @property {boolean} resolved          - guard flag; true once dodge/damage has been applied.
 */

/**
 * damageData flag (ChatMessage flag "smt-rpg.damageData"). Built in actor.applyDamage; read by
 * combat.resolveHalveDamage. Drives the Fate Point "Halve Damage" button.
 * @typedef {object} DamageData
 * @property {string}  targetTokenUuid - token UUID of the damaged target (?? actor.id fallback).
 * @property {number}  originalDamage  - finalDamage as first applied.
 * @property {number}  currentDamage   - finalDamage after any FP halving.
 * @property {boolean} resolved         - guard flag.
 */

/**
 * Object returned by calculateDamage (damage.mjs). Pure; describes one attack against one target.
 * @typedef {object} DamageResult
 * @property {number}  rawPower         - power total fed in, before any modifier.
 * @property {string}  affinity         - target affinity for the element ("normal"|"weak"|"strong"|"null"|"drain"|"repel").
 * @property {number}  afterAffinity    - rawPower after the affinity multiplier (and dodge-fumble doubling).
 * @property {number}  resistanceApplied- resistance subtracted from afterAffinity (0 on crit/dodge-fumble).
 * @property {number}  finalDamage      - HP loss after resistance, floored at 0 (0 for null/drain/repel).
 * @property {boolean} isDrain          - target absorbs the hit as healing.
 * @property {boolean} isRepel          - hit is reflected back at the attacker.
 * @property {boolean} isNull           - hit is nullified.
 * @property {number}  drainedAmount    - HP the target would heal on drain (post-resistance, floored 0).
 * @property {number}  reflectedDamage  - HP the attacker would lose on repel (attacker-side resistance, floored 0).
 * @property {boolean} dodgeFumble      - dodge roll fumbled: damage doubled, resistance skipped (p.65).
 */

/**
 * Evaluate a d100 result against a target number. Pure: takes the rolled value, returns the outcome.
 * Mirrors the SMT check ladder (p.64) using CONFIG.SMT.check thresholds.
 *
 * @param {number} result            - the d100 roll total (1-100).
 * @param {number} tn                 - the target number to beat (roll <= tn succeeds).
 * @param {object} [options]
 * @param {boolean} [options.hasMight=false] - Might passive: widen crit threshold to floor(tn / mightCritDivisor).
 * @returns {CheckOutcome} outcome flags plus cssClass and the SMT.Roll.* i18n key.
 */
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
