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

  if (ts.includes("foe") || ts.includes("enem")) {
    return candidates.filter(t => {
      const d = t.document.disposition;
      if (actorDisp === foundry.CONST.TOKEN_DISPOSITIONS.FRIENDLY) return d === foundry.CONST.TOKEN_DISPOSITIONS.HOSTILE;
      if (actorDisp === foundry.CONST.TOKEN_DISPOSITIONS.HOSTILE) return d === foundry.CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      return d !== actorDisp;
    });
  }

  if (ts.includes("all") && ts.includes("all")) {
    if (ts.includes("all") && !ts.includes("foe") && !ts.includes("enem")) {
      return candidates.filter(t => t.document.disposition === actorDisp);
    }
  }

  if (ts.includes("ally") || ts.includes("allies")) {
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

// Post pending attack card. Damage applied later via Dodge/Apply buttons.
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

// Resolve dodge attempt and apply damage
export async function resolveAttack(message, attackData, skipDodge = false) {
  const attacker = getActorFromTokenUuid(attackData.attackerTokenUuid);
  const target = getActorFromTokenUuid(attackData.targetTokenUuid);
  if (!attacker || !target) return;

  let { rawPower, isCritical } = attackData;
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

  const dmgResult = await target.applyDamage({
    rawPower,
    element: attackData.element,
    isPhysical: attackData.isPhysical,
    isCritical,
    attacker,
    skillName: attackData.skillName,
    dodgeFumble
  });

  if (CONFIG.SMT.debug) console.log("smt-rpg | Ailment Pre-Check", {
    dmgResult: { isNull: dmgResult?.isNull, isDrain: dmgResult?.isDrain, isRepel: dmgResult?.isRepel },
    ailmentType: attackData.ailmentType, ailmentRate: attackData.ailmentRate,
    dmgResultExists: !!dmgResult
  });
  if (dmgResult && !dmgResult.isNull && !dmgResult.isDrain && !dmgResult.isRepel
      && attackData.ailmentType && attackData.ailmentType !== "none" && attackData.ailmentRate > 0) {
    await resolveAilment({
      target, attacker,
      ailmentType: attackData.ailmentType,
      baseRate: attackData.ailmentRate,
      element: attackData.element,
      isCritical,
      dodgeFumble,
      targetTokenUuid: attackData.targetTokenUuid
    });
  }

  await message.setFlag("smt-rpg", "attackData", { ...attackData, resolved: true });
}

function _resolveDodgeOutcome(hitIsCritical, dodgeResult) {
  const isFumble = dodgeResult.result === 100;
  if (isFumble) return "fumble";
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

// Ailment infliction roll (p.67). Rate modified by affinity/crit/fumble, clamped 5-95%.
export async function resolveAilment({ target, attacker, ailmentType, baseRate, element, isCritical, dodgeFumble, targetTokenUuid }) {
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

  rate = Math.floor(rate);
  rate = Math.clamp(rate, 5, 95);

  const roll = new Roll("1d100");
  await roll.evaluate();
  const success = roll.total <= rate;

  if (CONFIG.SMT.debug) console.log("smt-rpg | Ailment Check", {
    target: target.name, ailmentType, baseRate, element, affinity,
    isCritical, dodgeFumble, effectiveRate: rate,
    roll: roll.total, success
  });

  if (success) {
    // Higher priority (lower number) ailments replace lower ones
    const currentAilment = target.system.ailment ?? "none";
    const priorities = CONFIG.SMT.ailmentPriority;
    const newPriority = priorities[ailmentType] ?? 99;
    const currentPriority = currentAilment === "none" ? 99 : (priorities[currentAilment] ?? 99);

    if (newPriority < currentPriority || currentAilment === "none") {
      const targetActor = getActorFromTokenUuid(targetTokenUuid) ?? target;
      await targetActor.update({ "system.ailment": ailmentType });
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

// Evaluate d100 vs TN (pure function)
function _evaluatePercentile(result, tn, hasMight = false) {
  if (result === 100) return { isSuccess: false, isCritical: false, cssClass: "fumble", outcome: game.i18n.localize("SMT.Roll.Fumble") };
  if (result >= 96) return { isSuccess: false, isCritical: false, cssClass: "auto-fail", outcome: game.i18n.localize("SMT.Roll.AutoFail") };
  if (result === 1 || result <= Math.floor(tn / (hasMight ? 5 : 10))) return { isSuccess: true, isCritical: true, cssClass: "critical", outcome: game.i18n.localize("SMT.Roll.Critical") };
  if (result <= tn) return { isSuccess: true, isCritical: false, cssClass: "success", outcome: game.i18n.localize("SMT.Roll.Success") };
  return { isSuccess: false, isCritical: false, cssClass: "failure", outcome: game.i18n.localize("SMT.Roll.Failure") };
}

// FP reroll: spend 1 FP, roll new d100, cascade if outcome changed
export async function resolveCheckReroll(message, checkData) {
  const actor = getActorFromTokenUuid(checkData.actorTokenUuid);
  if (!actor || actor.system.fatePoints.value <= 0) return;

  await actor.update({ "system.fatePoints.value": actor.system.fatePoints.value - 1 });

  const roll = new Roll("1d100");
  await roll.evaluate();
  const newResult = roll.total;
  const evaluated = _evaluatePercentile(newResult, checkData.currentTN, checkData.hasMight);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/percentile-roll.hbs",
    { label: `${checkData.skillName} — ${game.i18n.localize("SMT.FateReroll")}`, result: newResult, tn: checkData.currentTN, outcome: evaluated.outcome, cssClass: evaluated.cssClass }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content, rolls: [roll], sound: CONFIG.sounds.dice
  });

  const oldSuccess = checkData.isSuccess;
  const newCheckData = { ...checkData, rollResult: newResult, isSuccess: evaluated.isSuccess, isCritical: evaluated.isCritical };

  if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Reroll", {
    actor: actor.name, skill: checkData.skillName,
    oldRoll: checkData.rollResult, newRoll: newResult,
    tn: checkData.currentTN, oldSuccess, newSuccess: evaluated.isSuccess,
    fpRemaining: actor.system.fatePoints.value
  });

  await _cascadeCheckChange(message, checkData, newCheckData, oldSuccess, evaluated.isSuccess, actor);
}

// FP boost: spend 1 FP, add +20 to TN, re-evaluate same roll
export async function resolveCheckBoost(message, checkData) {
  const actor = getActorFromTokenUuid(checkData.actorTokenUuid);
  if (!actor || actor.system.fatePoints.value <= 0) return;

  await actor.update({ "system.fatePoints.value": actor.system.fatePoints.value - 1 });

  const newTN = checkData.currentTN + 20;
  const evaluated = _evaluatePercentile(checkData.rollResult, newTN, checkData.hasMight);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/percentile-roll.hbs",
    { label: `${checkData.skillName} — ${game.i18n.localize("SMT.FateBoostTN")}`, result: checkData.rollResult, tn: newTN, outcome: evaluated.outcome, cssClass: evaluated.cssClass }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });

  const oldSuccess = checkData.isSuccess;
  const newCheckData = { ...checkData, currentTN: newTN, isSuccess: evaluated.isSuccess, isCritical: evaluated.isCritical };

  if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Boost TN", {
    actor: actor.name, skill: checkData.skillName,
    roll: checkData.rollResult, oldTN: checkData.currentTN, newTN,
    oldSuccess, newSuccess: evaluated.isSuccess,
    fpRemaining: actor.system.fatePoints.value
  });

  await _cascadeCheckChange(message, checkData, newCheckData, oldSuccess, evaluated.isSuccess, actor);
}

// Handle cascade when FP changes a check result (fail->success or success->fail)
async function _cascadeCheckChange(message, oldCheckData, newCheckData, oldSuccess, newSuccess, actor) {
  await message.setFlag("smt-rpg", "checkData", newCheckData);

  if (!oldSuccess && newSuccess && newCheckData.hasPowerRoll) {
    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Cascade: fail→success, triggering power roll");
    await _continueSkillFlow(newCheckData, actor, message.id);
  } else if (oldSuccess && !newSuccess) {
    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Cascade: success→fail, cancelling pending attacks");
    await _cancelPendingAttacks(message.id);
  }
}

// Continue skill flow after fail->success via FP
async function _continueSkillFlow(checkData, actor, checkMessageId) {
  const powerResult = await actor.rollPower(
    checkData.basePower, checkData.skillPower,
    `${checkData.skillName} — ${game.i18n.localize("SMT.Power")}`,
    checkData.isCritical
  );

  const targetUuids = checkData.targetTokenUuids ?? [];
  if (!targetUuids.length) {
    ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
    return;
  }

  for (const tgtUuid of targetUuids) {
    const target = getActorFromTokenUuid(tgtUuid);
    if (!target) continue;
    await postPendingAttack({
      attacker: actor, target,
      attackerTokenUuid: checkData.actorTokenUuid,
      targetTokenUuid: tgtUuid,
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

// FP halve damage: spend 1 FP, halve current damage, restore HP difference
export async function resolveHalveDamage(message, damageData) {
  const target = getActorFromTokenUuid(damageData.targetTokenUuid);
  if (!target || target.system.fatePoints.value <= 0) return;

  await target.update({ "system.fatePoints.value": target.system.fatePoints.value - 1 });

  const oldDamage = damageData.currentDamage;
  const newDamage = Math.floor(oldDamage / 2);
  const hpRestored = oldDamage - newDamage;
  const newHp = Math.min(target.system.hp.value + hpRestored, target.system.hp.max);
  await target.update({ "system.hp.value": newHp });

  if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Halve Damage", {
    target: target.name, originalDamage: damageData.originalDamage,
    oldDamage, newDamage, hpRestored, newHp,
    fpRemaining: target.system.fatePoints.value
  });

  await message.setFlag("smt-rpg", "damageData", {
    ...damageData,
    currentDamage: newDamage
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
      dodgeFumble: false
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content
  });
}
