import { evaluatePercentile, cascadePlan, multiActionPlan, multiActionTn } from "./checks.mjs";
import { halveDamageResult, affinityOutcome, killConditionMet } from "./damage.mjs";
import { canDodge, shatterPctFor } from "./ailments.mjs";
import { nullifyAttackEffect, attackAllApplies, drainOnStrike } from "./passives.mjs";
import { pinholeResistance, pinholeDodgeTn } from "./named-skills.mjs";
import { spendUse, ledgerKey } from "./uses.mjs";

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

// Attack riders off a flag (p.98/p.102-103). Flags are author-forgeable, so every
// leg is whitelisted: an unknown fractional kind or ailment key drops the rider
// entirely rather than doing something almost right.
function _sanitizeRiders(riders) {
  if (!riders || typeof riders !== "object") return null;
  const out = {};
  const kind = riders.fractional?.kind;
  if (kind === "half" || kind === "toPercent" || kind === "toOne") {
    const pct = Number.isFinite(riders.fractional.pct)
      ? Math.clamp(Math.floor(riders.fractional.pct), 1, 99) : 20;
    out.fractional = { kind, pct };
  }
  if (riders.fpImmune === true) out.fpImmune = true;
  if (riders.drains && (riders.drains.hp === true || riders.drains.mp === true)) {
    out.drains = { hp: riders.drains.hp === true, mp: riders.drains.mp === true };
  }
  const kc = riders.killCondition;
  if (kc && kc.ailment in CONFIG.SMT.ailments && kc.ailment !== "none") {
    const rate = _sanitizeAilmentRate(kc.rate);
    if (rate > 0) out.killCondition = { ailment: kc.ailment, rate };
  }
  return Object.keys(out).length ? out : null;
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

// Render the consolidated pending-attack card (one card, one row per target).
async function _renderPendingCard(attackData) {
  return foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/attack-pending.hbs",
    {
      skillName: attackData.skillName,
      rawPower: attackData.rawPower,
      isCritical: attackData.isCritical,
      element: attackData.element,
      isPhysical: attackData.isPhysical,
      targets: attackData.targets
    }
  );
}

// Post ONE pending-attack card covering every target (one power roll applied to all, p.96).
// Each target is a row with its own Dodge/Apply buttons; single-target is just a 1-row card.
// `damageMultiplier` is Retaliate/Avenge's ×2/×3 on the damage dealt (p.110), and
// `noCounter` marks a hit that must not itself provoke a counterattack — the free
// strikes from a fumbled flee (p.70) and a counterattack itself.
// `noDodge` suppresses the dodge step for every row on the card. Only the Fumble
// Effect Chart's hit row uses it (p.64: the attacker cannot dodge hitting themselves),
// which is why it is a property of the CARD rather than of the click — the same
// fumbled attack posts a second card for the allies, who may dodge as normal.
export async function postAttacksToTargets({ attacker, targets, rawPower, element, isPhysical, isCritical, skillName, checkMessageId = null, ailmentType = "none", ailmentRate = 0, damageMultiplier = 1, noCounter = false, noDodge = false, drainsStrike = false, riders = null }) {
  const valid = (targets ?? []).filter(t => t.actor);
  if (!valid.length) {
    ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
    return 0;
  }

  const attackData = {
    attackerTokenUuid: getTokenUuid(attacker) ?? attacker.id,
    rawPower, element, isPhysical, isCritical, skillName,
    ailmentType, ailmentRate, damageMultiplier, noCounter, noDodge, drainsStrike,
    riders: riders ?? null,
    checkMessageId: checkMessageId ?? null,
    targets: valid.map(t => ({
      targetTokenUuid: t.document.uuid,
      name: t.actor.name,
      resolved: false,
      outcome: null
    })),
    resolved: false
  };

  const content = await _renderPendingCard(attackData);
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content
  });
  await message.setFlag("smt-rpg", "attackData", attackData);
  return valid.length;
}

// Offer a multi-action (p.59-60). The book says "you MAY choose", so this asks rather
// than taking the maximum; declining is picking 1. Returns the parts taken.
//
// The per-option TN is shown because it is the whole trade — three actions at 70% is
// a different bet from one at 210%, and the player is the one making it.
export async function promptMultiAction(tn, plan, label) {
  if (!plan.eligible || plan.actions < 2) return 1;

  const options = [];
  for (let n = 1; n <= plan.actions; n++) {
    const each = multiActionTn(tn, n);
    const text = n === 1
      ? game.i18n.format("SMT.MultiAction.Single", { tn: each })
      : game.i18n.format("SMT.MultiAction.Repeat", { count: n, tn: each });
    options.push(`<option value="${n}">${foundry.utils.escapeHTML(text)}</option>`);
  }

  const picked = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("SMT.MultiAction.Title") },
    content: `<p>${game.i18n.format("SMT.MultiAction.Prompt", { action: label, tn })}</p>`
      + `<select name="parts" style="width:100%;">${options.join("")}</select>`,
    ok: {
      label: game.i18n.localize("SMT.MultiAction.Confirm"),
      callback: (event, button) => button.form.elements.parts.value
    }
  }).catch(() => null);

  const parts = Number(picked);
  return Number.isFinite(parts) && parts >= 1 ? Math.min(parts, plan.actions) : 1;
}

// A basic strike (p.63), shared by the sheet button and the Counter reaction so the
// two cannot drift apart.
//
// A counterattack is NOT an action — p.96 calls it "one free opportunity" — so a
// reaction pays none of the per-action costs (poison drain, Curse mishap) and spends
// no Concentrate bonus. It also cannot itself provoke a counterattack, or two demons
// with Counter would trade blows forever.
export async function performBasicStrike(actor, {
  targets, damageMultiplier = 1, isReaction = false, label: labelOverride = null
} = {}) {
  const { applyPoisonDrain, consumeSetupBonuses, rollCurseMishap } = await import("./effects.mjs");
  const skillName = labelOverride ?? game.i18n.localize("SMT.BasicAttack");
  const hasMight = actor.system.hasMightPassive;
  let label = `${skillName} (${game.i18n.localize("SMT.Stat.Strength")})`;
  let tn = actor.system.strengthTN;

  if (!isReaction) {
    await applyPoisonDrain(actor);
    await rollCurseMishap(actor);
    const setup = await consumeSetupBonuses(actor, game.i18n.localize("SMT.BasicAttack"));
    if (setup.total) {
      tn += setup.total;
      label += ` +${setup.total}%`;
    }
  }
  tn = applyStunHitCap(actor, tn);

  // Multi-action (p.59-60). A counterattack is exempt: p.96 grants "one free
  // opportunity" to make "a basic strike", singular.
  const parts = isReaction ? 1 : await promptMultiAction(tn, multiActionPlan(tn), skillName);
  const tnEach = multiActionTn(tn, parts);

  // Attack All (p.110): basic strikes hit every enemy. Always, so it
  // WIDENS a caller's single target rather than filling in a missing one, which is the
  // difference between the passive working and the passive only working when nothing
  // was selected. The counterattack carve-out is p.96's and is checked as `isReaction`:
  // p.96 carves this out explicitly: Attack All does not extend a counterattack.
  const widens = attackAllApplies(actor.items.filter(i => i.type === "skill"),
    CONFIG.SMT.passiveEffects, { isBasicStrike: true, isCounter: isReaction });
  const finalTargets = widens
    ? resolveTargets(actor, "All Foes")
    : (targets ?? resolveTargets(actor, "1"));

  let last = null;
  for (let part = 0; part < parts; part++) {
    // p.59: the target cannot be changed between uses, so finalTargets is resolved once.
    const partLabel = parts > 1 ? `${label} — ${part + 1}/${parts}` : label;
    const checkResult = await actor.rollPercentile(tnEach, partLabel, { hasMight });
    last = checkResult;

    if (actor.system.fatePoints.value > 0) {
      const msg = game.messages.get(checkResult.messageId);
      if (msg) {
        await msg.setFlag("smt-rpg", "checkData", buildCheckData({
          actor, checkResult, tn: tnEach,
          hasPowerRoll: true, basePower: actor.system.basePhysicalPower,
          skillPower: 0, element: "phys", isPhysical: true, skillName,
          targetTokenUuids: finalTargets.map(t => t.document?.uuid).filter(Boolean),
          hasMight
        }));
      }
    }

    if (!checkResult.isSuccess) continue;

    // Focus (p.105) names the basic strike first — this is its primary consumer. It
    // is read and cleared per PART, so a two-part multi-action doubles once, not twice.
    const focus = actor.focusFor(true);
    const powerResult = await actor.rollPower(
      actor.system.basePhysicalPower, 0,
      `${skillName} — ${game.i18n.localize("SMT.Power")}`,
      checkResult.isCritical,
      actor.system.physicalPowerBonusDice,
      1,
      focus.multiplier
    );
    if (focus.consumed) await actor.clearFocus();
    await postAttacksToTargets({
      attacker: actor,
      targets: finalTargets,
      rawPower: powerResult.total,
      element: "phys",
      isPhysical: true,
      isCritical: powerResult.isCritical,
      skillName,
      checkMessageId: checkResult.messageId,
      damageMultiplier,
      noCounter: isReaction,
      // Drain Attack (p.110) rides the attack card rather than firing here: the drain
      // is a fraction of the damage DEALT, which is not known until the target's HP is
      // written. Marking the card is what lets resolveAttack pay it from the real loss.
      drainsStrike: drainOnStrike(actor.items.filter(i => i.type === "skill"),
        CONFIG.SMT.passiveEffects, { hpDealt: 1, isBasicStrike: true }) > 0
    });
  }
  return last;
}

// Counter / Retaliate / Avenge (p.96, p.110). Rolls the chance and, on a hit, posts
// an OFFER rather than resolving it — the book is explicit that counterattacking is
// not mandatory: p.97 lets the attacker decline, e.g. against a target holding Tetrakarn.
async function _offerCounter({ defender, attacker, element, dodged, suppressed }) {
  const { counterEffect, counterTriggers } = await import("./passives.mjs");
  if (!attacker || !defender) return false;
  if (!counterTriggers({ element, dodged, suppressed })) return false;

  const effect = counterEffect(
    defender.items.filter(i => i.type === "skill" && i.system?.skillType === "passive"),
    CONFIG.SMT.passiveEffects
  );
  if (!effect) return false;

  const roll = new Roll("1d100");
  await roll.evaluate();
  const fires = roll.total <= CONFIG.SMT.counter.chancePct;

  if (CONFIG.SMT.debug) console.log("smt-rpg | Counter Chance", {
    defender: defender.name, attacker: attacker.name, effect,
    pct: CONFIG.SMT.counter.chancePct, roll: roll.total, fires
  });
  if (!fires) return false;

  const counterData = {
    defenderTokenUuid: getTokenUuid(defender) ?? defender.id,
    attackerTokenUuid: getTokenUuid(attacker) ?? attacker.id,
    effectId: effect.id,
    damageMultiplier: effect.multiplier,
    resolved: false
  };
  const label = game.i18n.localize(CONFIG.SMT.passiveEffects[effect.id]?.label ?? effect.id);
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/counter-offer.hbs",
    { defenderName: defender.name, attackerName: attacker.name, effectLabel: label, resolved: false }
  );
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    content, rolls: [roll]
  });
  await message.setFlag("smt-rpg", "counterData", counterData);
  return true;
}

// Take up a counterattack offer: one basic strike back at the original attacker.
export async function resolveCounterAttack(message, counterData) {
  const live = message.getFlag("smt-rpg", "counterData");
  if (!live || live.resolved) return;

  const defender = getActorFromTokenUuid(live.defenderTokenUuid);
  const attacker = getActorFromTokenUuid(live.attackerTokenUuid);
  if (!defender || !attacker) return;

  const token = fromUuidSync(live.attackerTokenUuid)?.object;
  const targets = token ? [token] : [];
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoTargets"));
    return;
  }

  await message.setFlag("smt-rpg", "counterData", { ...live, resolved: true });
  const label = game.i18n.localize(CONFIG.SMT.passiveEffects[live.effectId]?.label ?? live.effectId);
  await performBasicStrike(defender, {
    targets,
    damageMultiplier: _sanitizeAmount(live.damageMultiplier) || 1,
    isReaction: true,
    label
  });
}

// Luck Smiles (p.110): "Completely nullify the effects of an attack on you, 1/scenario
// only." Spends the use, then closes the row without resolving anything else.
//
// "the EFFECTS" is broader than the damage, which is why this short-circuits the whole
// row rather than zeroing a number: no dodge, no damage, no ailment roll, no rider, no
// counterattack. Rejecting after the spend would be worse than not offering it, so the
// budget is checked and spent BEFORE the row is touched.
export async function resolveLuckSmiles(message, index) {
  const live = message.getFlag("smt-rpg", "attackData");
  const row = live?.targets?.[index];
  if (!row || row.resolved) return;

  const target = getActorFromTokenUuid(row.targetTokenUuid);
  if (!target) return;

  const skills = target.items.filter(i => i.type === "skill");
  const effect = nullifyAttackEffect(skills, CONFIG.SMT.passiveEffects);
  if (!effect) return;

  // Runs through the ordinary p.96 ledger — `copies` is p.110's "may be learned
  // multiple times, allowing you to use it an additional time per scenario each",
  // which useBudget already means.
  const key = ledgerKey(effect.period, effect.id);
  const ledger = foundry.utils.deepClone(target.system.useLedger ?? {});
  const spend = spendUse({
    period: effect.period, count: effect.count, copies: effect.copies, spent: ledger[key] ?? 0
  });
  if (!spend.allowed) {
    ui.notifications.warn(game.i18n.format("SMT.Warnings.UseLimit", {
      skill: game.i18n.localize(CONFIG.SMT.passiveEffects[effect.id].label),
      period: game.i18n.localize(`SMT.UsePeriod.${effect.period}`)
    }));
    return;
  }
  ledger[key] = spend.spent;
  await target.update({ "system.useLedger": ledger });

  const { postEffectNotice } = await import("./effects.mjs");
  await postEffectNotice(target, game.i18n.format("SMT.Passive.LuckSmiles", { name: target.name }));
  await _markTargetResolved(message, index, game.i18n.localize("SMT.LuckSmilesButton"));
}

// Whether a target may still spend Luck Smiles. Synchronous because the render gate
// cannot await — passives.mjs is imported statically at the top of this file for that
// reason; the dynamic imports elsewhere here exist to break a cycle with item.mjs,
// which passives.mjs has no part in.
export function luckSmilesAvailable(actor) {
  if (!actor) return false;
  const effect = nullifyAttackEffect(actor.items.filter(i => i.type === "skill"), CONFIG.SMT.passiveEffects);
  if (!effect) return false;
  const spent = Number(actor.system.useLedger?.[ledgerKey(effect.period, effect.id)]) || 0;
  return spent < effect.count * effect.copies;
}

// Mark one target row resolved with a brief outcome string, then re-render the card in place.
async function _markTargetResolved(message, index, outcome) {
  const fresh = message.getFlag("smt-rpg", "attackData");
  if (!fresh || !Array.isArray(fresh.targets)) return;
  const targets = fresh.targets.map((t, i) => (i === index ? { ...t, resolved: true, outcome } : t));
  const attackData = { ...fresh, targets, resolved: targets.every(t => t.resolved) };
  const content = await _renderPendingCard(attackData);
  await message.update({ content, "flags.smt-rpg.attackData": attackData });
}

// Resolve ONE target row of a consolidated pending card: optional dodge, apply damage, ailment on hit.
// Detailed dodge/damage cards still post; a brief outcome folds into the row, which re-renders in place.
export async function resolveAttack(message, index, skipDodge = false) {
  const live = message.getFlag("smt-rpg", "attackData");
  if (!live || !Array.isArray(live.targets)) return;
  // A card marked noDodge skips it whatever the click said (p.64) — the flag is the
  // rule, and the button it belongs to is not rendered in the first place.
  if (live.noDodge) skipDodge = true;
  const row = live.targets[index];
  if (!row || row.resolved) return;

  const lockKey = `${message.id}:${index}`;
  if (_inFlight.has(lockKey)) return;
  _inFlight.add(lockKey);
  try {
    const attacker = getActorFromTokenUuid(live.attackerTokenUuid);
    const target = getActorFromTokenUuid(row.targetTokenUuid);
    if (!attacker || !target) return;

    let rawPower = _sanitizeAmount(live.rawPower);
    const element = _sanitizeElement(live.element);
    const ailmentType = _sanitizeAilmentType(live.ailmentType);
    const ailmentRate = _sanitizeAilmentRate(live.ailmentRate);
    const riders = _sanitizeRiders(live.riders);
    const isPhysical = !!live.isPhysical;
    let isCritical = !!live.isCritical;
    let dodgeFumble = false;
    let dodgeOutcome = null;
    // The kill condition reads the ailment the hit FOUND (p.98) — captured before
    // damage resolves, because the hit itself may wake a sleeper.
    const ailmentBefore = target.system.ailment ?? "none";

    // p.68's Dodge column reads N for Stone, Restrain, Freeze, Sleep and Shock —
    // those targets never get the roll, so the button must not offer them one.
    //
    // An ambushed combatant is defenseless until its first turn (p.71: "cannot take any
    // actions, dodging included"), which lands in the same place: no roll. The lost
    // dodge IS the mechanical cost of being ambushed, since nothing else could have
    // happened before their turn anyway.
    const dodgeDenied = !canDodge(target.system.ailment ?? "none")
      || !!target.effects.find(e => e.getFlag("smt-rpg", "defenseless"));

    // Pinhole (p.106): "Your target treats their resistance and dodge rate as being
    // halved FOR THIS ATTACK." Per-attack arguments, never stored effects — the card
    // carries the two flags and both halvings are applied at the point of use.
    const dodgeTN = pinholeDodgeTn(target.system.dodgeTN, { halves: !!live.riders?.halvesTargetDodge });

    if (!skipDodge && dodgeDenied) {
      await _postDodgeResult(attacker, target, live.skillName, "cannot");
    } else if (!skipDodge) {
      const dodgeResult = await target.rollPercentile(
        dodgeTN,
        `${target.name} — ${game.i18n.localize("SMT.DodgeLabel")}`
      );

      dodgeOutcome = _resolveDodgeOutcome(isCritical, dodgeResult);

      if (CONFIG.SMT.debug) console.log("smt-rpg | Dodge Resolution", {
        target: target.name, dodgeTN,
        dodgeRoll: dodgeResult.result, dodgeOutcome,
        hitWasCritical: isCritical
      });

      switch (dodgeOutcome) {
        case "miss":
          await _postDodgeResult(attacker, target, live.skillName, "miss");
          await _markTargetResolved(message, index, game.i18n.localize("SMT.DodgeDodged"));
          return;

        case "downgrade":
          rawPower = Math.floor(rawPower / 2);
          isCritical = false;
          await _postDodgeResult(attacker, target, live.skillName, "downgrade");
          break;

        case "fumble":
          dodgeFumble = true;
          await _postDodgeResult(attacker, target, live.skillName, "fumble");
          break;

        case "fail":
          await _postDodgeResult(attacker, target, live.skillName, "fail");
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

    // p.66 Stone: "when struck with a Phys element attack, you have a 30% chance to
    // shatter and die." Read before the hit resolves so nothing can clear the slot first.
    const shatterPct = shatterPctFor(target.system.ailment ?? "none", element);

    const dmgResult = await target.applyDamage({
      rawPower,
      element,
      isPhysical,
      isCritical,
      attacker,
      skillName: live.skillName,
      dodgeFumble,
      damageMultiplier: _sanitizeAmount(live.damageMultiplier) || 1,
      fractional: riders?.fractional ?? null,
      fpImmune: !!riders?.fpImmune,
      drains: riders?.drains ?? null,
      // Pinhole's other half (p.106). Passed as a resolved number rather than a flag so
      // applyDamage keeps one resistance input; the halving belongs to this attack.
      resistanceOverride: riders?.halvesTargetResist
        ? pinholeResistance(isPhysical ? target.system.physicalResistance : target.system.magicalResistance, { halves: true })
        : null
    });

    // Drain Attack (p.110): "recover HP equal to 25% of the damage dealt to the
    // target." Paid here rather than at the strike, because "dealt" is the HP the
    // target actually LOST — applyDamage floors at 0, so an overkill on a 5 HP target
    // deals 5 and drains 1, not a quarter of the raw hit.
    if (live.drainsStrike && attacker && dmgResult?.hpDealt > 0) {
      const healed = drainOnStrike(
        attacker.items.filter(i => i.type === "skill"),
        CONFIG.SMT.passiveEffects,
        { hpDealt: dmgResult.hpDealt, isBasicStrike: true }
      );
      if (healed > 0) {
        const hp = attacker.system.hp;
        const newHp = Math.min(hp.value + healed, hp.max);
        if (newHp !== hp.value) {
          await attacker.update({ "system.hp.value": newHp });
          const { postEffectNotice } = await import("./effects.mjs");
          await postEffectNotice(attacker, game.i18n.format("SMT.Passive.DrainAttack", {
            name: attacker.name, amount: newHp - hp.value
          }));
        }
      }
    }

    if (shatterPct > 0 && await _resolveStoneShatter(target, shatterPct)) {
      await _markTargetResolved(message, index, game.i18n.localize("SMT.Stone.Shattered"));
      return;
    }

    if (CONFIG.SMT.debug) console.log("smt-rpg | Ailment Pre-Check", {
      dmgResult: { isNull: dmgResult?.isNull, isDrain: dmgResult?.isDrain, isRepel: dmgResult?.isRepel },
      ailmentType, ailmentRate,
      dmgResultExists: !!dmgResult
    });
    // Conditional instant kill (Zan group p.98, Eternal Rest): fires only when the
    // hit landed and the target's PRE-HIT ailment matches the printed condition.
    if (dmgResult && !dmgResult.isNull && !dmgResult.isDrain && !dmgResult.isRepel
        && killConditionMet(riders?.killCondition, ailmentBefore)
        && target.system.hp.value > 0) {
      const roll = new Roll("1d100");
      await roll.evaluate();
      const killed = roll.total <= riders.killCondition.rate;
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker }),
        flavor: game.i18n.format(killed ? "SMT.KillCondition.Killed" : "SMT.KillCondition.Resisted", {
          target: target.name,
          ailment: game.i18n.localize(CONFIG.SMT.ailments[riders.killCondition.ailment]),
          rate: riders.killCondition.rate
        })
      });
      if (killed) {
        await target.update({ "system.hp.value": 0, "system.deathAilment": true });
        await _markTargetResolved(message, index, game.i18n.localize("SMT.KillCondition.Note"));
        return;
      }
    }

    if (dmgResult && !dmgResult.isNull && !dmgResult.isDrain && !dmgResult.isRepel
        && ailmentType && ailmentType !== "none" && ailmentRate > 0) {
      await resolveAilment({
        target, attacker,
        ailmentType,
        baseRate: ailmentRate,
        element,
        isPhysical,
        isCritical,
        dodgeFumble,
        targetTokenUuid: row.targetTokenUuid
      });
    }

    // Counter / Retaliate / Avenge (p.96). A dodged attack never reaches here, which
    // is correct — the passives read "when hit".
    await _offerCounter({
      defender: target, attacker, element,
      dodged: false, suppressed: !!live.noCounter
    });

    await _markTargetResolved(message, index, _damageOutcomeLabel(dmgResult, isCritical));
  } finally {
    _inFlight.delete(lockKey);
  }
}

// Brief per-row outcome for the consolidated card (the full damage card still posts separately).
function _damageOutcomeLabel(dmgResult, isCritical) {
  if (!dmgResult) return "—";
  if (dmgResult.isNull) return "Null";
  if (dmgResult.isDrain) return `Drain +${dmgResult.drainedAmount ?? 0}`;
  if (dmgResult.isRepel) return `Repel ${dmgResult.reflectedDamage ?? 0}`;
  return `−${dmgResult.finalDamage ?? 0}${isCritical ? " ★" : ""}`;
}

// p.66 Stone's shatter roll. Separate from damage on purpose: it kills outright and
// is not reduced by resistance, affinity or a Fate Point.
async function _resolveStoneShatter(target, pct) {
  const roll = new Roll("1d100");
  await roll.evaluate();
  const shattered = roll.total <= pct;

  if (CONFIG.SMT.debug) console.log("smt-rpg | Stone Shatter", {
    target: target.name, pct, roll: roll.total, shattered
  });

  const key = shattered ? "SMT.Stone.Shatters" : "SMT.Stone.Holds";
  const content = `<div class="smt-roll effect-notice"><p>${game.i18n.format(key, { name: target.name, pct })}</p></div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content,
    rolls: [roll]
  });

  if (shattered) await target.update({ "system.hp.value": 0, "system.deathAilment": true });
  return shattered;
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
    fail: "SMT.DodgeFailed",
    cannot: "SMT.DodgeCannot"
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
export async function resolveAilment({ target, attacker, ailmentType, baseRate, element, isPhysical = false, isCritical, dodgeFumble, targetTokenUuid }) {
  ailmentType = _sanitizeAilmentType(ailmentType);
  element = _sanitizeElement(element);
  if (ailmentType === "none") return;

  // Ailment elements use ailmentAffinities; others use damage affinities.
  const isAilmentElement = CONFIG.SMT.ailmentElements.has(element);
  const affinity = isAilmentElement
    ? (target.system.ailmentAffinities?.[element] ?? "normal")
    : (target.system.affinities?.[element] ?? "normal");

  // Category ratings stack with the element one (p.65): the worked example gives a
  // demon weak to Ice, Magic and Ailments a 32x effect-rate bonus, which is 2*2*2
  // for the ratings times 2 for the crit and 2 for the dodge fumble. Unlike damage,
  // the Ailment rating DOES apply here -- that is the whole of its effect.
  const cat = target.system.categoryAffinities ?? {};
  const outcome = affinityOutcome([
    affinity,
    isPhysical ? "normal" : (cat.magic ?? "normal"),
    cat.ailment ?? "normal"
  ]);
  if (outcome.absolute) return;

  let rate = baseRate * outcome.multiplier;
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
        // A new ailment is a fresh save clock: the p.68 "can only fail once" allowance
        // belongs to the ailment that earned it, not to whatever replaces it.
        await targetActor.update({ "system.ailment": ailmentType, "system.ailmentSaveFailed": false });
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
export function buildCheckData({ actor, checkResult, tn, hasPowerRoll, basePower, skillPower = 0, element, isPhysical, skillName, targetTokenUuids = null, targetsString = "1", ailmentType = "none", ailmentRate = 0, hasMight = false, riders = null }) {
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
    riders: riders ?? null,
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

  const plan = cascadePlan(newCheckData, { oldSuccess, newSuccess });
  if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Cascade", {
    skill: newCheckData.skillName, oldSuccess, newSuccess,
    hasPowerRoll: !!newCheckData.hasPowerRoll,
    ailmentType: newCheckData.ailmentType, ailmentRate: newCheckData.ailmentRate,
    plan
  });

  if (plan === "powerRoll") await _continueSkillFlow(newCheckData, actor, message.id);
  else if (plan === "fractionalAttack") await _continueFractionalAttack(newCheckData, actor, message.id);
  else if (plan === "ailmentOnly") await _continueAilmentOnly(newCheckData, actor);
  else if (plan === "cancel") await _cancelPendingAttacks(message.id);
}

// A skill whose whole effect is its ailment has no power roll and no pending-attack
// card, so a Fate Point that flips it to a success has to roll the ailment here —
// the same branch SMTItem#use takes on an un-rerolled success. isCritical carries,
// which is what doubles the effect rate when the reroll lands a critical (p.67).
async function _continueAilmentOnly(checkData, actor) {
  const targets = (checkData.targetTokenUuids ?? [])
    .map(uuid => ({ uuid, actor: getActorFromTokenUuid(uuid) }))
    .filter(t => t.actor);

  for (const t of targets) {
    await resolveAilment({
      target: t.actor,
      attacker: actor,
      ailmentType: checkData.ailmentType,
      baseRate: checkData.ailmentRate,
      element: checkData.element,
      isPhysical: !!checkData.isPhysical,
      isCritical: !!checkData.isCritical,
      dodgeFumble: false,
      targetTokenUuid: t.uuid
    });
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
    checkData.isPhysical ? actor.system.physicalPowerBonusDice : actor.system.magicalPowerBonusDice,
    actor.system.boostFor(checkData.element)
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
    ailmentRate: checkData.ailmentRate ?? 0,
    riders: _sanitizeRiders(checkData.riders)
  });
}

// After an FP flips a fractional-HP skill fail->success: no power to roll — the
// pending attack card IS the effect (p.102-103).
async function _continueFractionalAttack(checkData, actor, checkMessageId) {
  const targets = (checkData.targetTokenUuids ?? [])
    .map(uuid => fromUuidSync(uuid)?.object)
    .filter(Boolean);
  await postAttacksToTargets({
    attacker: actor,
    targets,
    rawPower: 0,
    element: checkData.element,
    isPhysical: checkData.isPhysical,
    isCritical: !!checkData.isCritical,
    skillName: checkData.skillName,
    checkMessageId,
    ailmentType: checkData.ailmentType ?? "none",
    ailmentRate: checkData.ailmentRate ?? 0,
    riders: _sanitizeRiders(checkData.riders)
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
  // "Fate points cannot reduce this amount" (p.102-103). The button is never
  // offered on such a card; this guard is the second lock on the same door, so a
  // macro or a relayed click cannot reach past the render gate.
  if (live.fpImmune) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FateImmune"));
    return;
  }
  damageData = live;

  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const target = getActorFromTokenUuid(damageData.targetTokenUuid);
    if (!target || target.system.fatePoints.value <= 0) return;

    const oldDamage = _sanitizeAmount(damageData.currentDamage);
    if (oldDamage <= 0) return;

    // Resolve from the HP the hit found, not the post-hit HP: an overkilled hit floored
    // at 0, so restoring the difference over-restores by exactly the overkill (GAUNTLET.md §6).
    // `hpBefore` is absent on cards written before 0.1.12 — those take the legacy path.
    const { newDamage, hpAfter: newHp } = halveDamageResult({
      hpBefore: damageData.hpBefore,
      hpNow: target.system.hp.value,
      hpMax: target.system.hp.max,
      currentDamage: oldDamage,
      divisor: CONFIG.SMT.fate.halveDivisor
    });

    // One write: FP and HP together, per the batch-update convention.
    await target.update({
      "system.fatePoints.value": target.system.fatePoints.value - CONFIG.SMT.fate.cost,
      "system.hp.value": newHp
    });

    if (CONFIG.SMT.debug) console.log("smt-rpg | Fate Halve Damage", {
      target: target.name, originalDamage: damageData.originalDamage,
      oldDamage, newDamage, hpBefore: damageData.hpBefore ?? "(legacy card)", newHp,
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
