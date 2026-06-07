// Buff/debuff and setup-action effect helpers (p.96, p.64). Effects are stored as
// ActiveEffects whose `changes` ADD into the system.buffs.* / concentrate.amount /
// defend.amount accumulators that the actor folds into derived stats each prepare.

import { SMT } from "../config.mjs";

const FLAG_SCOPE = "smt-rpg";
const BUFF_KEY = "buff";
const CONCENTRATE_KEY = "concentrate";
const DEFEND_KEY = "defend";

export function canModifyEffects(actor) {
  return game.user.isGM || actor.canUserModify(game.user, "update");
}

// Existing stacks across same-sign effects whose axes overlap def's; they share
// one buffMaxStacks cap (p.96), so room is measured against the axis not the name.
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

// Signed magnitude off the effect's first change. Coerced — values are forgeable.
function magnitudeOf(effect) {
  return Number(effect?.changes?.[0]?.value) || 0;
}

// One non-exploding buffDie per stack, summed (p.96).
async function rollBuffMagnitude(stacks) {
  const roll = await new Roll(`${stacks}${SMT.buffDie}`).evaluate();
  const rolls = roll.dice[0]?.results?.map(r => r.result) ?? [roll.total];
  return { total: roll.total, rolls };
}

// Apply a -kaja/-nda buff (p.96): roll buffDie per new stack, honour the shared
// per-axis cap, accumulate the signed magnitude into one ADD change per moved axis.
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

  const usedBySharedAxes = stacksOnSharedAxes(actor, def);
  const room = Math.max(0, SMT.buffMaxStacks - usedBySharedAxes);
  const added = Math.min(Math.max(1, Number(stacks) || 1), room);
  if (added <= 0) {
    return { capped: true, key, label: def.label, sign: def.sign, targetName: actor.name };
  }

  const { total: rolled, rolls } = await rollBuffMagnitude(added);
  const newStacks = prior + added;

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

// Clear every buff/debuff of a group (Dekaja → "kaja", Dekunda → "nda"; p.96).
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

export function concentrateEffect(actor) {
  return actor?.effects.find(e => e.getFlag(FLAG_SCOPE, CONCENTRATE_KEY));
}

// Apply/extend a Concentrate bonus for a named action (p.64). Each cast adds one
// bonusPct; naming a different action starts fresh.
export async function applyConcentrate(actor, action) {
  if (!actor) return null;
  if (!canModifyEffects(actor)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return null;
  }
  const def = SMT.actionEffects.concentrate;
  const bonus = SMT.concentrate.bonusPct;
  const existing = concentrateEffect(actor);
  // Stacks accumulate only on the same named action.
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

// Spend the Concentrate bonus for an action (whole bonus spent regardless of
// outcome, p.64); nothing consumed if the held action differs. Returns the +%.
export async function consumeConcentrate(actor, action) {
  const effect = concentrateEffect(actor);
  if (!effect) return 0;
  const held = effect.getFlag(FLAG_SCOPE, CONCENTRATE_KEY)?.action;
  if (held && action && held !== action) return 0;
  const amount = magnitudeOf(effect);
  if (canModifyEffects(actor)) await effect.delete();
  return amount;
}

// Drop a Concentrate bonus when its holder is afflicted (p.64).
export async function dropConcentrateOnAilment(actor) {
  const effect = concentrateEffect(actor);
  if (effect && canModifyEffects(actor)) await effect.delete();
}

// Poison drain (p.66): a poisoned actor loses poison.die HP per non-reactive
// action. No-op if not poisoned. Call once at the start of such an action.
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

// Resolve start-of-turn ailment effects (p.66-68): auto-recovery, sleep regen,
// panic, then can't-act forfeit, in that order.
export async function processAilmentTurnStart(actor) {
  if (!actor) return;
  const ailment = actor.system.ailment ?? "none";
  if (ailment === "none") return;
  if (!canModifyEffects(actor)) return;

  const label = game.i18n.localize(SMT.ailments[ailment] ?? ailment);

  // Freeze/Shock auto-recover at the next turn start (p.66).
  if (SMT.autoRecoverAtTurnStart.includes(ailment)) {
    await actor.update({ "system.ailment": "none" });
    await postEffectNotice(actor, game.i18n.format("SMT.Ailment.Recovered", { name: actor.name, ailment: label }));
    return;
  }

  // Sleep regen: restore (regenStat + level) HP and MP each turn (p.66).
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

  // Panic: chance to act randomly off the table (p.67).
  if (ailment === "panic") {
    await _resolvePanic(actor);
    return;
  }

  // Incapacitating ailments forfeit the turn (p.66, p.68).
  if (SMT.cannotActAilments.includes(ailment)) {
    await postEffectNotice(actor, game.i18n.format("SMT.Ailment.CannotAct", { name: actor.name, ailment: label }));
  }
}

// Panic turn (p.67): chancePct% to roll panic.die off the table, post it, and
// apply its `inflicts` ailment; otherwise act normally.
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

  const content = `<div class="smt-roll effect-notice"><p>${game.i18n.format("SMT.Panic.Acts", { name: actor.name, effect: effectText })}</p></div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll]
  });

  // The table's sleep result (p.67) inflicts Sleep on the panicker.
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

export function defendEffect(actor) {
  return actor?.effects.find(e => e.getFlag(FLAG_SCOPE, DEFEND_KEY));
}

// Apply +defend.dodgeBonus until the actor's next turn (p.64). Does not stack.
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

// Remove Defend at the actor's turn start — it lasts only until then (p.64).
export async function clearDefend(actor) {
  const effect = defendEffect(actor);
  if (effect && canModifyEffects(actor)) await effect.delete();
}

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

// text must be already localized.
export async function postEffectNotice(actor, text) {
  const content = `<div class="smt-roll effect-notice"><p>${text}</p></div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}
