// ═══════════════════════════════════════════════
// effects.mjs — buff/debuff and setup-action effect helpers (p.96, p.64).
//
// Role: every mutation of a -kaja/-nda buff, a Dekaja/Dekunda dispel, or a
// Concentrate/Defend setup action goes through here. Buffs and the setup actions
// are stored as v14 ActiveEffects whose `changes` ADD into the system.buffs.*
// (and system.concentrate.amount / system.defend.amount) accumulators that
// SMTBaseActorData folds into the derived combat stats each prepare cycle. Effect
// helpers only need to write the accumulator magnitudes; the fold is automatic.
//
// Each cast rolls a non-exploding CONFIG.SMT.buffDie per stack and never adds base
// power. Effects keyed to the same STAT AXIS share one CONFIG.SMT.buffMaxStacks cap
// (p.96): a buff and a debuff on the same axis do not cancel slot-for-slot, but two
// effects of the same sign on overlapping axes compete for the four slots.
//
// Security: every mutator is gated by canModifyEffects (GM or owner) and coerces
// any effect-sourced magnitude with Number(x) || 0 before it feeds arithmetic —
// ActiveEffect change values are author-forgeable the same way chat flags are.
// ═══════════════════════════════════════════════

import { SMT } from "../config.mjs";

// Flag scope/keys for our effect bookkeeping. Mirrors the chat-flag namespace
// ("smt-rpg"). A buff effect stores { effect, group, stacks }; Concentrate stores
// { action }; Defend stores `true`. Kept local (not in config) since these are
// internal bookkeeping keys, not rules constants.
const FLAG_SCOPE = "smt-rpg";
const BUFF_KEY = "buff";
const CONCENTRATE_KEY = "concentrate";
const DEFEND_KEY = "defend";

/**
 * Whether the current user may mutate effects on an actor. Mirrors the chat
 * handler gate: GMs always may; otherwise the user needs update permission.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function canModifyEffects(actor) {
  return game.user.isGM || actor.canUserModify(game.user, "update");
}

/**
 * Total existing stacks on an actor across every same-sign effect whose axes
 * overlap a buff's axes. Effects sharing a stat axis count toward the shared
 * CONFIG.SMT.buffMaxStacks cap (p.96), so a re-cast measures room against the
 * axis, not the effect name.
 * @param {Actor} actor
 * @param {object} def  A CONFIG.SMT.buffs entry.
 * @returns {number}
 */
function stacksOnSharedAxes(actor, def) {
  const axes = new Set(def.axes);
  let total = 0;
  for (const effect of actor.effects) {
    const data = effect.getFlag(FLAG_SCOPE, BUFF_KEY);
    if (!data) continue;
    const otherDef = SMT.buffs[data.effect];
    if (!otherDef || otherDef.sign !== def.sign) continue;
    if (otherDef.axes.some(a => axes.has(a))) total += Number(data.stacks) || 0;
  }
  return total;
}

/**
 * The signed magnitude currently carried by a buff effect (read off its first
 * change). Coerced — change values are author-forgeable.
 * @param {ActiveEffect} [effect]
 * @returns {number}
 */
function magnitudeOf(effect) {
  return Number(effect?.changes?.[0]?.value) || 0;
}

/**
 * Roll the buff magnitude for a number of stacks: one non-exploding
 * CONFIG.SMT.buffDie per stack, summed (p.96). Base power is never included.
 * @param {number} stacks
 * @returns {Promise<{total:number, rolls:number[]}>}
 */
async function rollBuffMagnitude(stacks) {
  const roll = await new Roll(`${stacks}${SMT.buffDie}`).evaluate();
  const rolls = roll.dice[0]?.results?.map(r => r.result) ?? [roll.total];
  return { total: roll.total, rolls };
}

/**
 * Apply a -kaja/-nda buff to an actor, rolling CONFIG.SMT.buffDie per new stack
 * and updating (or creating) the backing ActiveEffect. Honours the shared
 * per-axis 4-stack cap and stores the running signed magnitude in the effect's
 * `changes` (one ADD change per axis the buff moves; sukukaja/sukunda move both
 * accuracy and dodge) so Foundry re-applies it every prepare cycle (p.96).
 *
 * @param {Actor} actor               The recipient.
 * @param {string} key               A CONFIG.SMT.buffs key, e.g. "tarukaja".
 * @param {object} [options]
 * @param {number} [options.stacks=1] How many stacks to add this cast.
 * @param {Actor}  [options.source]   The caster (for the chat speaker / card).
 * @returns {Promise<object|null>}    Summary for the chat card, or null if blocked.
 */
export async function applyBuff(actor, key, { stacks = 1, source = null } = {}) {
  const def = SMT.buffs[key];
  if (!actor || !def) return null;
  if (!canModifyEffects(actor)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return null;
  }

  const existing = actor.effects.find(
    e => e.getFlag(FLAG_SCOPE, BUFF_KEY)?.effect === key
  );
  const prior = Number(existing?.getFlag(FLAG_SCOPE, BUFF_KEY)?.stacks) || 0;

  // Remaining room under the shared-axis cap.
  const usedBySharedAxes = stacksOnSharedAxes(actor, def);
  const room = Math.max(0, SMT.buffMaxStacks - usedBySharedAxes);
  const added = Math.min(Math.max(1, Number(stacks) || 1), room);
  if (added <= 0) {
    return { capped: true, key, label: def.label, sign: def.sign, targetName: actor.name };
  }

  const { total: rolled, rolls } = await rollBuffMagnitude(added);
  const newStacks = prior + added;

  // Running signed magnitude for this effect (re-casts accumulate). Every axis
  // this buff moves gets an identical ADD change carrying that signed total.
  const magnitude = magnitudeOf(existing) + (rolled * def.sign);
  const changes = def.axes.map(axis => ({
    key: `system.buffs.${axis}`,
    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
    value: String(magnitude)
  }));

  const flagData = { effect: key, group: def.group, stacks: newStacks };
  const name = `${game.i18n.localize(def.label)} ×${newStacks}`;

  if (existing) {
    await existing.update({
      name,
      changes,
      [`flags.${FLAG_SCOPE}.${BUFF_KEY}`]: flagData
    });
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name,
      img: def.icon,
      changes,
      statuses: [def.statusId],
      disabled: false,
      flags: { [FLAG_SCOPE]: { [BUFF_KEY]: flagData } }
    }]);
  }

  return {
    key, label: def.label, sign: def.sign, group: def.group,
    rolls, rolled, total: Math.abs(magnitude), stacks: newStacks, max: SMT.buffMaxStacks,
    targetName: actor.name, casterName: source?.name ?? actor.name, capped: false
  };
}

/**
 * Clear every buff/debuff of a group from an actor (Dekaja → "kaja",
 * Dekunda → "nda"; p.96).
 * @param {Actor} actor
 * @param {string} group
 * @returns {Promise<number>} How many effects were removed.
 */
export async function clearBuffGroup(actor, group) {
  if (!actor) return 0;
  if (!canModifyEffects(actor)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return 0;
  }
  const ids = actor.effects
    .filter(e => e.getFlag(FLAG_SCOPE, BUFF_KEY)?.group === group)
    .map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids.length;
}

/**
 * The actor's active Concentrate effect, if any.
 * @param {Actor} actor
 * @returns {ActiveEffect|undefined}
 */
export function concentrateEffect(actor) {
  return actor?.effects.find(e => e.getFlag(FLAG_SCOPE, CONCENTRATE_KEY));
}

/**
 * Apply or extend a Concentrate bonus for a named action (p.64). Each cast adds
 * one CONFIG.SMT.concentrate.bonusPct stack to system.concentrate.amount; the
 * named action is recorded so the bonus can be matched and consumed when that
 * action is taken. Naming a different action starts a fresh hold.
 * @param {Actor} actor
 * @param {string} action  The named skill/strike, e.g. "Agi" or a strike label.
 * @returns {Promise<object|null>}
 */
export async function applyConcentrate(actor, action) {
  if (!actor) return null;
  if (!canModifyEffects(actor)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return null;
  }
  const def = SMT.actionEffects.concentrate;
  const bonus = SMT.concentrate.bonusPct;
  const existing = concentrateEffect(actor);
  // Stacks accumulate only while concentrating on the same named action.
  const heldAction = existing?.getFlag(FLAG_SCOPE, CONCENTRATE_KEY)?.action;
  const sameAction = !heldAction || heldAction === action;
  const priorAmount = sameAction ? magnitudeOf(existing) : 0;
  const amount = priorAmount + bonus;
  const stacks = amount / bonus;

  const changes = [{
    key: "system.concentrate.amount",
    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
    value: String(amount)
  }];
  const flagData = { action };
  const name = `${game.i18n.localize(def.label)} (${action}) +${amount}%`;

  if (existing) {
    await existing.update({
      name, changes,
      [`flags.${FLAG_SCOPE}.${CONCENTRATE_KEY}`]: flagData
    });
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name, img: def.icon, changes, statuses: [def.statusId], disabled: false,
      flags: { [FLAG_SCOPE]: { [CONCENTRATE_KEY]: flagData } }
    }]);
  }
  return { action, amount, stacks, targetName: actor.name };
}

/**
 * Consume the Concentrate bonus for an action and return the bonus it granted.
 * The whole bonus is spent regardless of how the action resolves (p.64). When
 * the held action differs from the one taken, nothing is consumed.
 * @param {Actor} actor
 * @param {string} action  The action being taken now.
 * @returns {Promise<number>} The +% consumed (0 if none applied).
 */
export async function consumeConcentrate(actor, action) {
  const effect = concentrateEffect(actor);
  if (!effect) return 0;
  const held = effect.getFlag(FLAG_SCOPE, CONCENTRATE_KEY)?.action;
  if (held && action && held !== action) return 0;
  const amount = magnitudeOf(effect);
  if (canModifyEffects(actor)) await effect.delete();
  return amount;
}

/**
 * Drop a Concentrate bonus when its holder is afflicted with an ailment (p.64).
 * Called from the actor update hook.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function dropConcentrateOnAilment(actor) {
  const effect = concentrateEffect(actor);
  if (effect && canModifyEffects(actor)) await effect.delete();
}

/**
 * Poison drain (p.66): a poisoned actor loses CONFIG.SMT.poison.die HP for each
 * NON-REACTIVE action it takes (attack, talk, aid, Concentrate, Defend, use-item
 * — never a reactive dodge). Call this once at the start of such an action; it is
 * a no-op if the actor is not poisoned. Rolls the die, lowers HP (floored at 0),
 * and posts a short notice card with the roll. The HP write is gated by
 * canModifyEffects so it only runs on a client allowed to mutate the actor.
 *
 * @param {Actor} actor - the acting actor.
 * @returns {Promise<{damage:number, newHp:number}|null>} the drain, or null if not poisoned / not permitted.
 */
export async function applyPoisonDrain(actor) {
  if (!actor || actor.system.ailment !== "poison") return null;
  if (!canModifyEffects(actor)) return null;

  const roll = await new Roll(SMT.poison.die).evaluate();
  const damage = Math.max(0, Math.floor(Number(roll.total) || 0));
  const newHp = Math.max(0, actor.system.hp.value - damage);
  await actor.update({ "system.hp.value": newHp });

  if (CONFIG.SMT.debug) console.log("smt-rpg | Poison Action Drain", {
    actor: actor.name, damage, newHp
  });

  const content = `<div class="smt-roll effect-notice"><p>${game.i18n.format("SMT.Poison.Drain", { name: actor.name, damage })}</p></div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll]
  });
  return { damage, newHp };
}

/**
 * Resolve the start-of-turn effects of the afflicted combatant's common ailment
 * (p.66-68). Called once when a combatant's turn begins. In order:
 *  1. Auto-recovery — Freeze and Shock end at the start of the next turn even on a
 *     failed save (CONFIG.SMT.autoRecoverAtTurnStart); the slot is cleared and a
 *     recovery notice posts. The combatant then acts normally that turn.
 *  2. Sleep regen — a sleeper restores HP and MP equal to (Vitality + level) at the
 *     start of each of its turns (CONFIG.SMT.sleep.regenStat); Sleep does not end here.
 *  3. Panic — CONFIG.SMT.panic.chancePct% chance to act randomly: roll the Panic
 *     table, post the rolled line, and apply its `inflicts` ailment if any (the
 *     7-8 "fall asleep" result inflicts Sleep, p.67).
 *  4. Cannot act — Freeze/Sleep/Shock/Restrain (CONFIG.SMT.cannotActAilments) forfeit
 *     the turn; a "cannot act" notice posts. (Step 1 already cleared Freeze/Shock, so
 *     only a still-active can't-act ailment reaches here.)
 * All HP/ailment writes are gated by canModifyEffects so this runs only on a client
 * allowed to mutate the actor (the caller also elects a single responsible client).
 *
 * @param {Actor} actor - the combatant whose turn is starting.
 * @returns {Promise<void>}
 */
export async function processAilmentTurnStart(actor) {
  if (!actor) return;
  const ailment = actor.system.ailment ?? "none";
  if (ailment === "none") return;
  if (!canModifyEffects(actor)) return;

  const label = game.i18n.localize(SMT.ailments[ailment] ?? ailment);

  // 1. Freeze / Shock auto-recover at the start of the next turn (p.66).
  if (SMT.autoRecoverAtTurnStart.includes(ailment)) {
    await actor.update({ "system.ailment": "none" });
    await postEffectNotice(actor, game.i18n.format("SMT.Ailment.Recovered", { name: actor.name, ailment: label }));
    return;
  }

  // 2. Sleep regen: restore (regenStat + level) HP and MP each turn (p.66).
  if (ailment === "sleep") {
    const stat = SMT.sleep.regenStat;
    const amount = Math.max(0, (Number(actor.system[`${stat}Total`]) || 0) + (Number(actor.system.level) || 0));
    if (amount > 0) {
      const newHp = Math.min(actor.system.hp.value + amount, actor.system.hp.max);
      const newMp = Math.min(actor.system.mp.value + amount, actor.system.mp.max);
      await actor.update({ "system.hp.value": newHp, "system.mp.value": newMp });
      await postEffectNotice(actor, game.i18n.format("SMT.Sleep.Regen", { name: actor.name, amount }));
    }
  }

  // 3. Panic: chance to act randomly off the Panic table (p.67).
  if (ailment === "panic") {
    await _resolvePanic(actor);
    return;
  }

  // 4. Fully incapacitating ailments forfeit the turn (p.66, p.68).
  if (SMT.cannotActAilments.includes(ailment)) {
    await postEffectNotice(actor, game.i18n.format("SMT.Ailment.CannotAct", { name: actor.name, ailment: label }));
  }
}

/**
 * Resolve a Panic turn (p.67): with CONFIG.SMT.panic.chancePct% probability the
 * combatant takes a random action — roll CONFIG.SMT.panic.die, look the result up
 * on the Panic table, post the rolled line, and apply its `inflicts` ailment (the
 * 7-8 "fall asleep" entry inflicts Sleep). Below the chance threshold they act
 * normally and only a short notice posts. Caller has already gated on canModifyEffects.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
async function _resolvePanic(actor) {
  const chanceRoll = await new Roll("1d100").evaluate();
  if (chanceRoll.total > SMT.panic.chancePct) {
    await postEffectNotice(actor, game.i18n.format("SMT.Panic.Steady", { name: actor.name }));
    return;
  }

  const roll = await new Roll(SMT.panic.die).evaluate();
  const entry = SMT.panic.table.find(e => roll.total >= e.min && roll.total <= e.max)
    ?? SMT.panic.table[SMT.panic.table.length - 1];
  const effectText = game.i18n.localize(entry.label);

  // Post the rolled Panic line as a short notice (consistent with the other
  // start-of-turn ailment notices), carrying the d10 so the roll is auditable.
  const content = `<div class="smt-roll effect-notice"><p>${game.i18n.format("SMT.Panic.Acts", { name: actor.name, effect: effectText })}</p></div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll]
  });

  // The Panic table's sleep result (p.67 entry 7-8) inflicts Sleep on the panicker.
  if (entry.inflicts) {
    const { resolveAilment, getTokenUuid } = await import("./combat.mjs");
    await resolveAilment({
      target: actor, attacker: actor,
      ailmentType: entry.inflicts,
      baseRate: SMT.ailmentRate.max,
      element: "none",
      isCritical: false, dodgeFumble: false,
      targetTokenUuid: getTokenUuid(actor) ?? actor.id
    });
  }
}

/**
 * The actor's active Defend effect, if any.
 * @param {Actor} actor
 * @returns {ActiveEffect|undefined}
 */
export function defendEffect(actor) {
  return actor?.effects.find(e => e.getFlag(FLAG_SCOPE, DEFEND_KEY));
}

/**
 * Apply a Defend bonus: +CONFIG.SMT.defend.dodgeBonus dodge until the start of
 * the actor's next turn (p.64). Defend does not stack with itself, so re-using
 * it leaves the single existing effect in place.
 * @param {Actor} actor
 * @returns {Promise<object|null>}
 */
export async function applyDefend(actor) {
  if (!actor) return null;
  if (!canModifyEffects(actor)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return null;
  }
  const def = SMT.actionEffects.defend;
  const bonus = SMT.defend.dodgeBonus;
  const existing = defendEffect(actor);
  const changes = [{
    key: "system.defend.amount",
    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
    value: String(bonus)
  }];
  const name = `${game.i18n.localize(def.label)} +${bonus}%`;
  if (!existing) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name, img: def.icon, changes, statuses: [def.statusId], disabled: false,
      flags: { [FLAG_SCOPE]: { [DEFEND_KEY]: true } }
    }]);
  }
  return { amount: bonus, targetName: actor.name };
}

/**
 * Remove an actor's Defend effect. Called when the actor's turn begins, since
 * Defend only lasts until the start of their next turn (p.64).
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function clearDefend(actor) {
  const effect = defendEffect(actor);
  if (effect && canModifyEffects(actor)) await effect.delete();
}

/**
 * Post a buff/debuff result chat card from an applyBuff summary.
 * @param {Actor} caster
 * @param {object} summary  The object returned by {@link applyBuff}.
 * @returns {Promise<void>}
 */
export async function postBuffCard(caster, summary) {
  if (!summary) return;
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/buff-result.hbs",
    {
      label: game.i18n.localize(summary.label),
      targetName: summary.targetName,
      isBuff: summary.sign > 0,
      rolls: summary.rolls,
      rolled: summary.rolled,
      total: summary.total,
      stacks: summary.stacks,
      max: summary.max,
      capped: summary.capped
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caster }),
    content
  });
}

/**
 * Post a short dispel/action notice card (Dekaja, Dekunda, Concentrate, Defend).
 * @param {Actor} actor
 * @param {string} text   Already-localized message body.
 * @returns {Promise<void>}
 */
export async function postEffectNotice(actor, text) {
  const content = `<div class="smt-roll effect-notice"><p>${text}</p></div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}
