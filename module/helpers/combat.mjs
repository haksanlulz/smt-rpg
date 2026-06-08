import { evaluatePercentile } from "./checks.mjs";

// Resolvers claim a message id here before their first await, guarding double-click/concurrent re-entry on top of the persisted `resolved` flag.
const _inFlight = new Set();

// Stun caps an attacker's hit TN at CONFIG.SMT.stun.hitCapPct (p.66).
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

// Flag validation: ChatMessage flags are author-forgeable, so coerce before use.

const MAX_FLAG_VALUE = 1_000_000;

function _sanitizeAmount(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.clamp(Math.floor(value), 0, MAX_FLAG_VALUE);
}

function _sanitizeElement(element) {
  return element in CONFIG.SMT.elements ? element : "none";
}

function _sanitizeAilmentType(ailmentType) {
  return ailmentType in CONFIG.SMT.ailments ? ailmentType : "none";
}

// 0 stays 0 so the rate>0 gate can short-circuit.
function _sanitizeAilmentRate(rate) {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const { min, max } = CONFIG.SMT.ailmentRate;
  return Math.clamp(Math.floor(rate), min, max);
}

// Targeting

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

  // "foe" matched first so "All Foes" never falls through to the ally branch.
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

// Attack / Dodge

// Post one pending-attack card per target.
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

// Post a single pending-attack card; damage applied later via Dodge/Apply.
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

// Resolve a pending attack: optional dodge roll, apply damage, then ailment on a hit.
export async function resolveAttack(message, attackData, skipDodge = false) {
  const live = message.getFlag("smt-rpg", "attackData");
  if (!live || live.resolved) return;
  attackData = live;

  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const attacker = getActorFromTokenUuid(attackData.attackerTokenUuid);
    const target = getActorFromTokenUuid(attackData.targetTokenUuid);
    if (!attacker || !target) return;

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

    // Phys hit on a Restrain/Freeze/Shock/Stone target is forced crit (p.66).
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

// p.66
function _forcesCritOnPhys(target) {
  const ailment = target?.system?.ailment ?? "none";
  return ailment !== "none" && CONFIG.SMT.critOnPhysAilments.includes(ailment);
}

function _resolveDodgeOutcome(hitIsCritical, dodgeResult) {
  // rollPercentile omits isFumble, so detect it from the raw roll.
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

// Ailment Resolution

// Ailment infliction roll (p.67). Death/Curse set their own flags; others contend for the single system.ailment slot.
export async function resolveAilment({ target, attacker, ailmentType, baseRate, element, isCritical, dodgeFumble, targetTokenUuid }) {
  ailmentType = _sanitizeAilmentType(ailmentType);
  element = _sanitizeElement(element);
  if (ailmentType === "none") return;

  // Ailment elements use ailmentAffinities; others use damage affinities.
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
      // Death / Curse: dedicated flag, stacks alongside the common slot (p.67).
      await targetActor.update({ [`system.${ailmentType}Ailment`]: true });
    } else {
      // Lower priority number wins the single slot (p.68).
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

// Fate Point Resolution

// Build the checkData flag payload. Numeric inputs are trusted here; reroll/boost re-sanitize on read.
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

// FP reroll: spend cost, roll a fresh d100, re-evaluate, cascade if the outcome flipped.
export async function resolveCheckReroll(message, checkData) {
  const live = message.getFlag("smt-rpg", "checkData");
  if (!live || live.resolved) return;
  checkData = live;

  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const actor = getActorFromTokenUuid(checkData.actorTokenUuid);
    if (!actor || actor.system.fatePoints.value <= 0) return;

    await actor.update({ "system.fatePoints.value": actor.system.fatePoints.value - CONFIG.SMT.fate.cost });

    // Re-cap: attacker may have become stunned since use time (p.66).
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

// FP boost: spend cost, add boostTN to the TN, re-evaluate the same roll.
export async function resolveCheckBoost(message, checkData) {
  const live = message.getFlag("smt-rpg", "checkData");
  if (!live || live.resolved) return;
  checkData = live;

  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const actor = getActorFromTokenUuid(checkData.actorTokenUuid);
    if (!actor || actor.system.fatePoints.value <= 0) return;

    await actor.update({ "system.fatePoints.value": actor.system.fatePoints.value - CONFIG.SMT.fate.cost });

    const rollResult = _sanitizeAmount(checkData.rollResult);
    // Stun cap clamps the boosted TN (p.66).
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

// Shared by reroll and boost: persist the new check state, then trigger power roll on fail->success or cancel attacks on
// success->fail. Left UNRESOLVED so more fate points can be spent on the same roll (reroll repeatedly, stack +20% TN; p.59);
// the per-spend FP-balance check caps it, and _inFlight still guards double-click races. currentTN carries across rerolls.
async function _cascadeCheckChange(message, oldCheckData, newCheckData, oldSuccess, newSuccess, actor) {
  await message.setFlag("smt-rpg", "checkData", { ...newCheckData, resolved: false });

  if (!oldSuccess && newSuccess && newCheckData.hasPowerRoll) {
    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Cascade: fail→success, triggering power roll");
    await _continueSkillFlow(newCheckData, actor, message.id);
  } else if (oldSuccess && !newSuccess) {
    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Cascade: success→fail, cancelling pending attacks");
    await _cancelPendingAttacks(message.id);
  }
}

// After an FP flips a check fail->success: roll power and post the pending attacks.
async function _continueSkillFlow(checkData, actor, checkMessageId) {
  const basePower = _sanitizeAmount(checkData.basePower);
  const skillPower = _sanitizeAmount(checkData.skillPower);
  const powerResult = await actor.rollPower(
    basePower, skillPower,
    `${checkData.skillName} — ${game.i18n.localize("SMT.Power")}`,
    checkData.isCritical,
    checkData.isPhysical ? actor.system.physicalPowerBonusDice : ""
  );

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

// FP halve damage: spend cost, halve current damage, restore the HP difference.
export async function resolveHalveDamage(message, damageData) {
  const live = message.getFlag("smt-rpg", "damageData");
  if (!live || live.resolved) return;
  damageData = live;

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

    // Left UNRESOLVED so the same hit can be halved again (1/4, 1/8, ...) per p.59; capped by FP balance and the oldDamage<=0 guard.
    await message.setFlag("smt-rpg", "damageData", {
      ...damageData,
      currentDamage: newDamage,
      resolved: false
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
