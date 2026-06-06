// ═══════════════════════════════════════════════
// combat.mjs — attack/dodge/ailment/Fate-Point resolution helpers.
//
// Role: the rules engine behind the chat-card attack pipeline. smt-rpg.mjs binds
// the chat buttons (Dodge/Apply, Fate reroll/boost/halve) and calls into here via
// dynamic import to break the import cycle. Pure check evaluation lives in
// checks.mjs (evaluatePercentile); pure damage math lives in damage.mjs.
//
// Attack pipeline:
//   item.use()/sheet strike -> rollPercentile -> rollPower
//     -> postAttacksToTargets -> postPendingAttack (one card per target)
//     -> [Dodge | Apply] -> resolveAttack -> actor.applyDamage -> resolveAilment
//
// ChatMessage flags (namespace "smt-rpg"): attackData / checkData / damageData.
// These are author-forgeable — every resolver re-reads + validates them before
// they feed a roll or an HP mutation (see _sanitize* helpers).
//
// Section index:
//   - Token / target resolution           (getTokenUuid … resolveTargets)
//   - Flag validation helpers              (_sanitize*)
//   - Targeting                            (getAutoTargets)
//   - Attack / Dodge                       (postAttacksToTargets … resolveAttack)
//   - Ailment Resolution                   (resolveAilment)
//   - Fate Point Resolution                (buildCheckData … resolveHalveDamage)
//
// Typedefs (CheckData / AttackData / DamageData / DamageResult / CheckOutcome)
// are declared in checks.mjs and referenced here via {import("./checks.mjs").T}.
// ═══════════════════════════════════════════════

import { evaluatePercentile } from "./checks.mjs";

// ═══════════════════════════════════════════════
// Resolution idempotency
// ═══════════════════════════════════════════════
// Every mutating resolver carries a persisted `resolved` flag that it re-reads
// and bails on. That guard is written only AFTER the first await, so two clicks
// (or two clients) can both pass the check before either persists `resolved` —
// a TOCTOU double-apply. This synchronous in-flight set, keyed by message id,
// closes that window: a resolver claims its id before its first await and frees
// it in a finally, so a second concurrent entry returns immediately. It layers
// on top of the `resolved` re-read (which still guards against re-clicks after
// the first resolution has fully committed); it does not replace it.
const _inFlight = new Set();

/**
 * Stun caps an attacker's attack hit TN at CONFIG.SMT.stun.hitCapPct% (p.66).
 * Mirrors the inline cap in item.use() so every attack-resolution path agrees on
 * one rule and one constant. A non-stunned actor's TN is returned unchanged.
 *
 * @param {SMTActor} actor - the acting (attacking) actor.
 * @param {number}   tn    - the hit target number before the stun cap.
 * @returns {number} the TN capped to CONFIG.SMT.stun.hitCapPct when stunned.
 */
export function applyStunHitCap(actor, tn) {
  if (actor?.system?.ailment === "stun") return Math.min(tn, CONFIG.SMT.stun.hitCapPct);
  return tn;
}

// Best token UUID for an actor on the current scene
export function getTokenUuid(actor) {
  if (actor.token) return actor.token.uuid;
  const token = actor.getActiveTokens()[0];
  return token?.document.uuid ?? null;
}

// Resolve token UUID to actor. Falls back to world actor ID.
export function getActorFromTokenUuid(uuid) {
  if (!uuid) return null;
  const doc = fromUuidSync(uuid);
  if (doc?.actor) return doc.actor;
  return game.actors.get(uuid) ?? null;
}

// ═══════════════════════════════════════════════
// Flag validation helpers
//
// ChatMessage flags are author-forgeable. Coerce every numeric/element/ailment
// field sourced from a flag before it feeds a roll or an HP update.
// ═══════════════════════════════════════════════

// Upper bound on any flag-sourced power/damage/TN before it reaches a roll or HP
// update — mirrors actor.mjs MAX_HP_DELTA. Guards against NaN/Infinity/overflow.
const MAX_FLAG_VALUE = 1_000_000;

// Clamp a flag-sourced number to [0, MAX_FLAG_VALUE]; non-finite collapses to 0.
function _sanitizeAmount(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.clamp(Math.floor(value), 0, MAX_FLAG_VALUE);
}

// Validate a flag-sourced element key against CONFIG.SMT.elements; unknown -> "none".
function _sanitizeElement(element) {
  return element in CONFIG.SMT.elements ? element : "none";
}

// Validate a flag-sourced ailment type against CONFIG.SMT.ailments; unknown -> "none".
function _sanitizeAilmentType(ailmentType) {
  return ailmentType in CONFIG.SMT.ailments ? ailmentType : "none";
}

// Clamp a flag-sourced ailment rate to CONFIG.SMT.ailmentRate.min..max (0 stays 0
// so the "rate > 0" gate can still short-circuit a no-ailment attack).
function _sanitizeAilmentRate(rate) {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const { min, max } = CONFIG.SMT.ailmentRate;
  return Math.clamp(Math.floor(rate), min, max);
}

// ═══════════════════════════════════════════════
// Targeting
// ═══════════════════════════════════════════════

// Auto-resolve targets from skill target string ("All Foes", "All Allies", etc.)
export function getAutoTargets(actor, targetString) {
  const ts = (targetString ?? "").toLowerCase().trim();

  if (!ts || ts === "1" || ts === "self") return [];

  const actorToken = actor.getActiveTokens()[0];
  if (!actorToken) return [];
  const actorDisp = actorToken.document.disposition;

  const mode = game.settings.get("smt-rpg", "targetingMode");
  let candidates;
  if (mode === "combat" && game.combat) {
    candidates = game.combat.combatants
      .map(c => c.token?.object)
      .filter(t => t && t.id !== actorToken.id);
  } else {
    candidates = canvas.tokens.placeables.filter(t => t.id !== actorToken.id);
  }

  // Target-string -> token set:
  //   "foe"/"enem"   -> tokens of the opposing disposition
  //   "ally"/"all"   -> tokens sharing the actor's disposition (incl. "All Allies")
  // ("foe" is matched first, so "All Foes" never falls through to the ally branch.)
  if (ts.includes("foe") || ts.includes("enem")) {
    return candidates.filter(t => {
      const d = t.document.disposition;
      if (actorDisp === foundry.CONST.TOKEN_DISPOSITIONS.FRIENDLY) return d === foundry.CONST.TOKEN_DISPOSITIONS.HOSTILE;
      if (actorDisp === foundry.CONST.TOKEN_DISPOSITIONS.HOSTILE) return d === foundry.CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      return d !== actorDisp;
    });
  }

  if (ts.includes("ally") || ts.includes("allies") || ts.includes("all")) {
    return candidates.filter(t => t.document.disposition === actorDisp);
  }

  return [];
}

// Merge auto-targets with manual targets (hover+T), deduped
export function resolveTargets(actor, targetString) {
  const auto = getAutoTargets(actor, targetString);
  const manual = Array.from(game.user.targets);

  const seen = new Set();
  const merged = [];
  for (const token of [...auto, ...manual]) {
    if (!seen.has(token.id)) {
      seen.add(token.id);
      merged.push(token);
    }
  }
  return merged;
}

// ═══════════════════════════════════════════════
// Attack / Dodge
// ═══════════════════════════════════════════════

/**
 * Post one pending-attack card per target. Owns the per-target loop, token-UUID
 * resolution, and the no-target notification so the sheet strike/shoot handlers,
 * item.use, and the Fate-cascade path can all share one entry point.
 *
 * @param {object}    params
 * @param {SMTActor}  params.attacker        - the attacking actor.
 * @param {Token[]}   params.targets         - resolved target tokens (from resolveTargets).
 * @param {number}    params.rawPower        - rolled power total (pre affinity/resistance).
 * @param {string}    params.element         - damage/affinity element key.
 * @param {boolean}   params.isPhysical      - true for physical attacks.
 * @param {boolean}   params.isCritical      - true if the originating power roll critted.
 * @param {string}    params.skillName       - skill display name for the card.
 * @param {?string}   [params.checkMessageId]- id of the originating check card (FP cascade), or null.
 * @param {string}    [params.ailmentType]   - inflicted ailment type, or "none".
 * @param {number}    [params.ailmentRate]   - base ailment infliction rate (percent).
 * @returns {Promise<number>} count of pending-attack cards posted.
 */
export async function postAttacksToTargets({ attacker, targets, rawPower, element, isPhysical, isCritical, skillName, checkMessageId = null, ailmentType = "none", ailmentRate = 0 }) {
  if (!targets?.length) {
    ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
    return 0;
  }

  const attackerTokenUuid = getTokenUuid(attacker) ?? attacker.id;
  let posted = 0;
  for (const token of targets) {
    if (!token.actor) continue;
    await postPendingAttack({
      attacker,
      target: token.actor,
      attackerTokenUuid,
      targetTokenUuid: token.document.uuid,
      rawPower,
      element,
      isPhysical,
      isCritical,
      skillName,
      checkMessageId,
      ailmentType,
      ailmentRate
    });
    posted++;
  }
  return posted;
}

/**
 * Post a single pending-attack card; damage is applied later via the Dodge/Apply
 * buttons (handlers in smt-rpg.mjs). Writes the attackData flag (see the AttackData
 * typedef in checks.mjs).
 *
 * @param {object}    params
 * @param {SMTActor}  params.attacker            - the attacking actor.
 * @param {SMTActor}  params.target              - the target actor.
 * @param {string}    [params.attackerTokenUuid] - attacker token UUID (defaults to getTokenUuid).
 * @param {string}    [params.targetTokenUuid]   - target token UUID (defaults to getTokenUuid).
 * @param {number}    params.rawPower            - rolled power total (pre affinity/resistance).
 * @param {string}    params.element             - damage/affinity element key.
 * @param {boolean}   params.isPhysical          - true for physical attacks.
 * @param {boolean}   params.isCritical          - true if the originating power roll critted.
 * @param {string}    params.skillName           - skill display name for the card.
 * @param {?string}   [params.checkMessageId]    - originating check card id (FP cascade), or null.
 * @param {string}    [params.ailmentType]       - inflicted ailment type, or "none".
 * @param {number}    [params.ailmentRate]       - base ailment infliction rate (percent).
 * @returns {Promise<void>}
 */
export async function postPendingAttack({ attacker, target, attackerTokenUuid, targetTokenUuid, rawPower, element, isPhysical, isCritical, skillName, checkMessageId, ailmentType = "none", ailmentRate = 0 }) {
  const atkUuid = attackerTokenUuid ?? getTokenUuid(attacker);
  const tgtUuid = targetTokenUuid ?? getTokenUuid(target);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/attack-pending.hbs",
    {
      skillName,
      targetName: target.name,
      rawPower,
      isCritical,
      element,
      isPhysical
    }
  );

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content
  });

  await message.setFlag("smt-rpg", "attackData", {
    attackerTokenUuid: atkUuid,
    targetTokenUuid: tgtUuid,
    rawPower,
    element,
    isPhysical,
    isCritical,
    skillName,
    ailmentType,
    ailmentRate,
    checkMessageId: checkMessageId ?? null,
    resolved: false
  });
}

/**
 * Resolve a pending attack: optionally roll the target's dodge, then apply damage
 * and (on a real hit) roll the ailment. Re-reads the message flag and bails if the
 * card was already resolved (idempotency under double-click / re-render). All
 * flag-sourced numerics/element/ailment are sanitized before use.
 *
 * @param {ChatMessage} message               - the pending-attack card.
 * @param {import("./checks.mjs").AttackData} attackData - the attackData flag payload.
 * @param {boolean} [skipDodge=false]          - true for the Apply-damage button (no dodge roll).
 * @returns {Promise<void>}
 */
export async function resolveAttack(message, attackData, skipDodge = false) {
  // Re-read the live flag; bail if another client/click already resolved it.
  const live = message.getFlag("smt-rpg", "attackData");
  if (!live || live.resolved) return;
  attackData = live;

  // Idempotency: claim this message before the first await so a concurrent click
  // cannot also pass the resolved-flag check above. Released in finally.
  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const attacker = getActorFromTokenUuid(attackData.attackerTokenUuid);
    const target = getActorFromTokenUuid(attackData.targetTokenUuid);
    if (!attacker || !target) return;

    // Sanitize author-forgeable flag values before they feed rolls / HP updates.
    let rawPower = _sanitizeAmount(attackData.rawPower);
    const element = _sanitizeElement(attackData.element);
    const ailmentType = _sanitizeAilmentType(attackData.ailmentType);
    const ailmentRate = _sanitizeAilmentRate(attackData.ailmentRate);
    const isPhysical = !!attackData.isPhysical;
    let isCritical = !!attackData.isCritical;
    let dodgeFumble = false;
    let dodgeOutcome = null;

    if (!skipDodge) {
      const dodgeResult = await target.rollPercentile(
        target.system.dodgeTN,
        `${target.name} — ${game.i18n.localize("SMT.DodgeLabel")}`
      );

      dodgeOutcome = _resolveDodgeOutcome(isCritical, dodgeResult);

      if (CONFIG.SMT.debug) console.log("smt-rpg | Dodge Resolution", {
        target: target.name, dodgeTN: target.system.dodgeTN,
        dodgeRoll: dodgeResult.result, dodgeOutcome,
        hitWasCritical: isCritical
      });

      switch (dodgeOutcome) {
        case "miss":
          await _postDodgeResult(attacker, target, attackData.skillName, "miss");
          await message.setFlag("smt-rpg", "attackData", { ...attackData, resolved: true });
          return;

        case "downgrade":
          rawPower = Math.floor(rawPower / 2);
          isCritical = false;
          await _postDodgeResult(attacker, target, attackData.skillName, "downgrade");
          break;

        case "fumble":
          dodgeFumble = true;
          await _postDodgeResult(attacker, target, attackData.skillName, "fumble");
          break;

        case "fail":
          await _postDodgeResult(attacker, target, attackData.skillName, "fail");
          break;
      }
    }

    // Crit-on-incoming-Phys (p.66): a physical attack that lands on a target held
    // by a Restrain/Freeze/Shock/Stone ailment is forced critical. This reuses the
    // existing crit path in applyDamage/calculateDamage (which skips resistance);
    // affinity/drain/repel/null are untouched. The triggering ailments are all
    // common-slot ailments (CONFIG.SMT.critOnPhysAilments), so the single
    // system.ailment slot is the authoritative state to read; Death/Curse are
    // tracked as separate flags and never appear in that list. Applied after the
    // dodge switch so it reflects the hit as it actually lands.
    if (isPhysical && _forcesCritOnPhys(target)) {
      isCritical = true;
      if (CONFIG.SMT.debug) console.log("smt-rpg | Crit-on-Phys forced", {
        target: target.name, ailment: target.system.ailment
      });
    }

    const dmgResult = await target.applyDamage({
      rawPower,
      element,
      isPhysical,
      isCritical,
      attacker,
      skillName: attackData.skillName,
      dodgeFumble
    });

    if (CONFIG.SMT.debug) console.log("smt-rpg | Ailment Pre-Check", {
      dmgResult: { isNull: dmgResult?.isNull, isDrain: dmgResult?.isDrain, isRepel: dmgResult?.isRepel },
      ailmentType, ailmentRate,
      dmgResultExists: !!dmgResult
    });
    if (dmgResult && !dmgResult.isNull && !dmgResult.isDrain && !dmgResult.isRepel
        && ailmentType && ailmentType !== "none" && ailmentRate > 0) {
      await resolveAilment({
        target, attacker,
        ailmentType,
        baseRate: ailmentRate,
        element,
        isCritical,
        dodgeFumble,
        targetTokenUuid: attackData.targetTokenUuid
      });
    }

    await message.setFlag("smt-rpg", "attackData", { ...attackData, resolved: true });
  } finally {
    _inFlight.delete(message.id);
  }
}

/**
 * Whether a target's current common ailment forces an incoming physical attack to
 * crit (p.66). Reads the single system.ailment slot against
 * CONFIG.SMT.critOnPhysAilments (Restrain/Freeze/Shock/Stone).
 *
 * @param {SMTActor} target - the actor receiving the physical attack.
 * @returns {boolean}
 */
function _forcesCritOnPhys(target) {
  const ailment = target?.system?.ailment ?? "none";
  return ailment !== "none" && CONFIG.SMT.critOnPhysAilments.includes(ailment);
}

function _resolveDodgeOutcome(hitIsCritical, dodgeResult) {
  // rollPercentile's return omits isFumble, so detect the fumble from the raw roll.
  if (dodgeResult.result === CONFIG.SMT.check.fumble) return "fumble";
  if (dodgeResult.isCritical) return "miss";
  if (dodgeResult.isSuccess && !hitIsCritical) return "miss";
  if (dodgeResult.isSuccess && hitIsCritical) return "downgrade";
  return "fail";
}

async function _postDodgeResult(attacker, target, skillName, outcome) {
  const outcomeKey = {
    miss: "SMT.DodgeDodged",
    downgrade: "SMT.DodgeDowngraded",
    fumble: "SMT.DodgeFumbled",
    fail: "SMT.DodgeFailed"
  }[outcome];

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/dodge-result.hbs",
    {
      targetName: target.name,
      skillName,
      outcome,
      outcomeText: game.i18n.localize(outcomeKey)
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content
  });
}

// ═══════════════════════════════════════════════
// Ailment Resolution
// ═══════════════════════════════════════════════

/**
 * Ailment infliction roll (p.67). Rate is modified by affinity/crit/fumble then
 * clamped to CONFIG.SMT.ailmentRate.min..max. Stacking model (p.67-68):
 *  - Death and Curse (CONFIG.SMT.specialAilments) set their own boolean flags
 *    (system.deathAilment / system.curseAilment) and do NOT enter the common-
 *    ailment priority comparison — a target can hold them alongside one common ailment.
 *  - Every other ailment competes for the single system.ailment slot; the lower
 *    CONFIG.SMT.ailmentPriority number wins (an unmapped type defaults to 99).
 *
 * @param {object}    params
 * @param {SMTActor}  params.target          - the actor the ailment is inflicted on.
 * @param {SMTActor}  params.attacker        - the attacking actor (chat speaker).
 * @param {string}    params.ailmentType     - ailment type key (validated against CONFIG.SMT.ailments).
 * @param {number}    params.baseRate        - base infliction rate before affinity/crit/fumble.
 * @param {string}    params.element         - element key (selects ailment vs damage affinity table).
 * @param {boolean}   params.isCritical      - doubles the rate (p.67).
 * @param {boolean}   params.dodgeFumble     - doubles the rate (p.67).
 * @param {string}    params.targetTokenUuid - target token UUID for the authoritative actor update.
 * @returns {Promise<void>}
 */
export async function resolveAilment({ target, attacker, ailmentType, baseRate, element, isCritical, dodgeFumble, targetTokenUuid }) {
  // Validate flag-sourced inputs: unknown type/element collapse to "none".
  ailmentType = _sanitizeAilmentType(ailmentType);
  element = _sanitizeElement(element);
  if (ailmentType === "none") return;

  // Ailment elements use ailmentAffinities; others use damage affinities
  const isAilmentElement = CONFIG.SMT.ailmentElements.has(element);
  const affinity = isAilmentElement
    ? (target.system.ailmentAffinities?.[element] ?? "normal")
    : (target.system.affinities?.[element] ?? "normal");

  if (affinity === "null" || affinity === "drain" || affinity === "repel") return;

  let rate = baseRate;
  if (affinity === "weak") rate *= 2;
  if (affinity === "strong") rate *= 0.5;
  if (isCritical) rate *= 2;
  if (dodgeFumble) rate *= 2;

  // Clamp to CONFIG.SMT.ailmentRate.min..max. 0/non-finite -> 0 -> bail.
  rate = _sanitizeAilmentRate(rate);
  if (rate <= 0) return;

  const roll = new Roll("1d100");
  await roll.evaluate();
  const success = roll.total <= rate;

  if (CONFIG.SMT.debug) console.log("smt-rpg | Ailment Check", {
    target: target.name, ailmentType, baseRate, element, affinity,
    isCritical, dodgeFumble, effectiveRate: rate,
    roll: roll.total, success
  });

  if (success) {
    const targetActor = getActorFromTokenUuid(targetTokenUuid) ?? target;

    if (CONFIG.SMT.specialAilments.includes(ailmentType)) {
      // Death / Curse (p.67): set the dedicated boolean flag; stacks alongside the
      // common-ailment slot rather than competing for it.
      await targetActor.update({ [`system.${ailmentType}Ailment`]: true });
    } else {
      // Common ailment: lower CONFIG.SMT.ailmentPriority number wins the single slot (p.68).
      const currentAilment = target.system.ailment ?? "none";
      const priorities = CONFIG.SMT.ailmentPriority;
      const newPriority = priorities[ailmentType] ?? 99;
      const currentPriority = currentAilment === "none" ? 99 : (priorities[currentAilment] ?? 99);

      if (currentAilment === "none" || newPriority < currentPriority) {
        await targetActor.update({ "system.ailment": ailmentType });
      }
    }
  }

  const ailmentLabel = game.i18n.localize(CONFIG.SMT.ailments[ailmentType] ?? ailmentType);
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/ailment-result.hbs",
    {
      targetName: target.name,
      ailmentLabel,
      rate,
      roll: roll.total,
      success
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content,
    rolls: [roll]
  });
}

// ═══════════════════════════════════════════════
// Fate Point Resolution Functions
// ═══════════════════════════════════════════════

/**
 * Build the checkData flag payload (see the CheckData typedef in checks.mjs) in one
 * place so item.use, the sheet strike/shoot handlers, and any future caller agree on
 * the shape. Numeric inputs are taken as already-trusted (computed locally, not from
 * a flag); resolveCheckReroll/Boost sanitize them again on read.
 *
 * @param {object}    params
 * @param {SMTActor}  params.actor                - the acting actor.
 * @param {object}    params.checkResult          - { result, isSuccess, isCritical, messageId } from rollPercentile.
 * @param {number}    params.tn                   - the check target number (becomes both current & original TN).
 * @param {boolean}   params.hasPowerRoll         - whether a power roll follows on success.
 * @param {number}    params.basePower            - actor base physical/magical power for the power roll.
 * @param {number}    [params.skillPower=0]       - the skill's own power contribution.
 * @param {string}    params.element              - damage/affinity element key.
 * @param {boolean}   params.isPhysical           - true for physical-attack skills.
 * @param {string}    params.skillName            - skill display name.
 * @param {string[]}  [params.targetTokenUuids]   - manually-targeted token UUIDs at use time.
 * @param {string}    [params.targetsString="1"]  - the skill's raw targets string.
 * @param {string}    [params.ailmentType="none"] - inflicted ailment type, or "none".
 * @param {number}    [params.ailmentRate=0]      - base ailment infliction rate (percent).
 * @param {boolean}   [params.hasMight=false]     - whether the Might passive widened the crit threshold.
 * @returns {import("./checks.mjs").CheckData}
 */
export function buildCheckData({ actor, checkResult, tn, hasPowerRoll, basePower, skillPower = 0, element, isPhysical, skillName, targetTokenUuids = null, targetsString = "1", ailmentType = "none", ailmentRate = 0, hasMight = false }) {
  return {
    actorTokenUuid: getTokenUuid(actor) ?? actor.id,
    rollResult: checkResult.result,
    isSuccess: checkResult.isSuccess,
    isCritical: checkResult.isCritical,
    currentTN: tn,
    originalTN: tn,
    hasPowerRoll,
    basePower,
    skillPower,
    element,
    isPhysical,
    skillName,
    targetTokenUuids: targetTokenUuids ?? Array.from(game.user.targets).map(t => t.document?.uuid).filter(Boolean),
    targetsString,
    ailmentType,
    ailmentRate,
    hasMight,
    resolved: false
  };
}

/**
 * FP reroll: spend CONFIG.SMT.fate.cost, roll a fresh d100, re-evaluate, and cascade
 * if the outcome flipped. Re-reads the live flag and bails if already resolved.
 *
 * @param {ChatMessage} message - the originating check card.
 * @param {import("./checks.mjs").CheckData} checkData - the checkData flag payload.
 * @returns {Promise<void>}
 */
export async function resolveCheckReroll(message, checkData) {
  // Idempotency: re-read the live flag; bail if spent.
  const live = message.getFlag("smt-rpg", "checkData");
  if (!live || live.resolved) return;
  checkData = live;

  // Claim before the first await so a concurrent click cannot also pass the
  // resolved-flag check above and spend a second Fate Point. Freed in finally.
  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const actor = getActorFromTokenUuid(checkData.actorTokenUuid);
    if (!actor || actor.system.fatePoints.value <= 0) return;

    await actor.update({ "system.fatePoints.value": actor.system.fatePoints.value - CONFIG.SMT.fate.cost });

    // Stun caps the attacker's hit TN at CONFIG.SMT.stun.hitCapPct (p.66). Re-cap
    // here so the reroll re-evaluates against the cap (the stored currentTN was
    // capped at use time, but the attacker may have become stunned since), and
    // persist the capped TN so any cascade stays consistent with what was rolled.
    const currentTN = applyStunHitCap(actor, _sanitizeAmount(checkData.currentTN));
    const roll = new Roll("1d100");
    await roll.evaluate();
    const newResult = roll.total;
    const evaluated = evaluatePercentile(newResult, currentTN, { hasMight: !!checkData.hasMight });
    const outcome = game.i18n.localize(evaluated.outcomeKey);

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/percentile-roll.hbs",
      { label: `${checkData.skillName} — ${game.i18n.localize("SMT.FateReroll")}`, result: newResult, tn: currentTN, outcome, cssClass: evaluated.cssClass }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content, rolls: [roll], sound: CONFIG.sounds.dice
    });

    const oldSuccess = checkData.isSuccess;
    const newCheckData = { ...checkData, currentTN, rollResult: newResult, isSuccess: evaluated.isSuccess, isCritical: evaluated.isCritical };

    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Reroll", {
      actor: actor.name, skill: checkData.skillName,
      oldRoll: checkData.rollResult, newRoll: newResult,
      tn: currentTN, oldSuccess, newSuccess: evaluated.isSuccess,
      fpRemaining: actor.system.fatePoints.value
    });

    await _cascadeCheckChange(message, checkData, newCheckData, oldSuccess, evaluated.isSuccess, actor);
  } finally {
    _inFlight.delete(message.id);
  }
}

/**
 * FP boost: spend CONFIG.SMT.fate.cost, add CONFIG.SMT.fate.boostTN to the TN, and
 * re-evaluate the same roll. Re-reads the live flag and bails if already resolved.
 *
 * @param {ChatMessage} message - the originating check card.
 * @param {import("./checks.mjs").CheckData} checkData - the checkData flag payload.
 * @returns {Promise<void>}
 */
export async function resolveCheckBoost(message, checkData) {
  // Idempotency: re-read the live flag; bail if spent.
  const live = message.getFlag("smt-rpg", "checkData");
  if (!live || live.resolved) return;
  checkData = live;

  // Claim before the first await so a concurrent click cannot also pass the
  // resolved-flag check above and spend a second Fate Point. Freed in finally.
  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const actor = getActorFromTokenUuid(checkData.actorTokenUuid);
    if (!actor || actor.system.fatePoints.value <= 0) return;

    await actor.update({ "system.fatePoints.value": actor.system.fatePoints.value - CONFIG.SMT.fate.cost });

    const rollResult = _sanitizeAmount(checkData.rollResult);
    // Boost raises the TN, then the stun cap (p.66) clamps it: a stunned attacker
    // cannot Boost past CONFIG.SMT.stun.hitCapPct. The capped TN is persisted into
    // currentTN so it is what any later re-evaluation sees.
    const newTN = applyStunHitCap(actor, _sanitizeAmount(checkData.currentTN) + CONFIG.SMT.fate.boostTN);
    const evaluated = evaluatePercentile(rollResult, newTN, { hasMight: !!checkData.hasMight });
    const outcome = game.i18n.localize(evaluated.outcomeKey);

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/percentile-roll.hbs",
      { label: `${checkData.skillName} — ${game.i18n.localize("SMT.FateBoostTN")}`, result: rollResult, tn: newTN, outcome, cssClass: evaluated.cssClass }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });

    const oldSuccess = checkData.isSuccess;
    const newCheckData = { ...checkData, currentTN: newTN, isSuccess: evaluated.isSuccess, isCritical: evaluated.isCritical };

    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Boost TN", {
      actor: actor.name, skill: checkData.skillName,
      roll: rollResult, oldTN: checkData.currentTN, newTN,
      oldSuccess, newSuccess: evaluated.isSuccess,
      fpRemaining: actor.system.fatePoints.value
    });

    await _cascadeCheckChange(message, checkData, newCheckData, oldSuccess, evaluated.isSuccess, actor);
  } finally {
    _inFlight.delete(message.id);
  }
}

/**
 * Funnel for both FP reroll and boost: persist the new checkData (marked resolved),
 * then cascade — trigger the power roll on a fail->success, or cancel pending attacks
 * on a success->fail. Setting resolved here spends the card so it cannot be reused on
 * a later re-render.
 *
 * @param {ChatMessage} message - the originating check card.
 * @param {import("./checks.mjs").CheckData} oldCheckData - the pre-change payload.
 * @param {import("./checks.mjs").CheckData} newCheckData - the post-change payload.
 * @param {boolean}  oldSuccess - success state before the FP action.
 * @param {boolean}  newSuccess - success state after the FP action.
 * @param {SMTActor} actor       - the acting actor.
 * @returns {Promise<void>}
 */
async function _cascadeCheckChange(message, oldCheckData, newCheckData, oldSuccess, newSuccess, actor) {
  // Spend the card so it is not reusable on every re-render.
  await message.setFlag("smt-rpg", "checkData", { ...newCheckData, resolved: true });

  if (!oldSuccess && newSuccess && newCheckData.hasPowerRoll) {
    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Cascade: fail→success, triggering power roll");
    await _continueSkillFlow(newCheckData, actor, message.id);
  } else if (oldSuccess && !newSuccess) {
    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Cascade: success→fail, cancelling pending attacks");
    await _cancelPendingAttacks(message.id);
  }
}

/**
 * Continue the skill flow after a Fate Point flips a check fail->success: roll power
 * and post the pending attacks. Flag-sourced power inputs are sanitized before rolling.
 *
 * @param {import("./checks.mjs").CheckData} checkData - the (now-successful) checkData payload.
 * @param {SMTActor} actor          - the acting actor.
 * @param {string}   checkMessageId - id of the originating check card (for FP cascade linkage).
 * @returns {Promise<void>}
 */
async function _continueSkillFlow(checkData, actor, checkMessageId) {
  const basePower = _sanitizeAmount(checkData.basePower);
  const skillPower = _sanitizeAmount(checkData.skillPower);
  const powerResult = await actor.rollPower(
    basePower, skillPower,
    `${checkData.skillName} — ${game.i18n.localize("SMT.Power")}`,
    checkData.isCritical
  );

  // Resolve the use-time UUID list into live tokens, then share the post pipeline.
  const targetUuids = checkData.targetTokenUuids ?? [];
  const targets = targetUuids
    .map(uuid => fromUuidSync(uuid)?.object)
    .filter(Boolean);

  await postAttacksToTargets({
    attacker: actor,
    targets,
    rawPower: powerResult.total,
    element: checkData.element,
    isPhysical: checkData.isPhysical,
    isCritical: powerResult.isCritical,
    skillName: checkData.skillName,
    checkMessageId,
    ailmentType: checkData.ailmentType ?? "none",
    ailmentRate: checkData.ailmentRate ?? 0
  });
}

// Cancel pending attacks when a check is retroactively failed via FP
async function _cancelPendingAttacks(checkMessageId) {
  for (const msg of game.messages) {
    const attackData = msg.getFlag("smt-rpg", "attackData");
    if (attackData && attackData.checkMessageId === checkMessageId && !attackData.resolved) {
      await msg.setFlag("smt-rpg", "attackData", { ...attackData, resolved: true });
    }
  }
}

/**
 * FP halve damage: spend CONFIG.SMT.fate.cost, halve the current damage
 * (CONFIG.SMT.fate.halveDivisor), and restore the HP difference. Re-reads the live
 * flag and bails if already resolved; marks the card resolved at the end so it is
 * single-use. Flag-sourced damage is sanitized before the HP update.
 *
 * @param {ChatMessage} message - the damage-result card.
 * @param {import("./checks.mjs").DamageData} damageData - the damageData flag payload.
 * @returns {Promise<void>}
 */
export async function resolveHalveDamage(message, damageData) {
  // Idempotency: re-read the live flag; bail if spent.
  const live = message.getFlag("smt-rpg", "damageData");
  if (!live || live.resolved) return;
  damageData = live;

  // Claim before the first await so a concurrent click cannot also pass the
  // resolved-flag check above and spend a second Fate Point / re-heal. Freed in finally.
  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const target = getActorFromTokenUuid(damageData.targetTokenUuid);
    if (!target || target.system.fatePoints.value <= 0) return;

    const oldDamage = _sanitizeAmount(damageData.currentDamage);
    if (oldDamage <= 0) return;

    await target.update({ "system.fatePoints.value": target.system.fatePoints.value - CONFIG.SMT.fate.cost });

    const newDamage = Math.floor(oldDamage / CONFIG.SMT.fate.halveDivisor);
    const hpRestored = oldDamage - newDamage;
    const newHp = Math.min(target.system.hp.value + hpRestored, target.system.hp.max);
    await target.update({ "system.hp.value": newHp });

    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Halve Damage", {
      target: target.name, originalDamage: damageData.originalDamage,
      oldDamage, newDamage, hpRestored, newHp,
      fpRemaining: target.system.fatePoints.value
    });

    // Spend the card: persist the halved damage and mark resolved.
    await message.setFlag("smt-rpg", "damageData", {
      ...damageData,
      currentDamage: newDamage,
      resolved: true
    });

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/damage-result.hbs",
      {
        targetName: target.name,
        skillName: game.i18n.localize("SMT.FateHalveDamage"),
        affinity: "normal",
        rawPower: damageData.originalDamage,
        afterAffinity: 0,
        resistanceApplied: 0,
        finalDamage: newDamage,
        isCritical: false, isPhysical: false,
        isNull: false, isDrain: false, isRepel: false,
        dodgeFumble: false,
        // Resulting-HP footer (matches actor.applyDamage's card): show the target's
        // HP after the heal-back so the halved outcome is readable at a glance.
        targetHp: newHp,
        targetHpMax: target.system.hp.max,
        targetDefeated: newHp <= 0
      }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content
    });
  } finally {
    _inFlight.delete(message.id);
  }
}
