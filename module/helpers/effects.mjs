// Buff/debuff and setup-action effect helpers (p.96, p.64). Effects are stored as
// ActiveEffects whose `changes` ADD into the system.buffs.* / concentrate.amount /
// defend.amount accumulators that the actor folds into derived stats each prepare.

import { SMT } from "../config.mjs";
import { evaluatePercentile } from "./checks.mjs";
import { turnStartPlan, fumbledSaveResources } from "./ailments.mjs";
import { barrierExpiry, barrierActive, barrierConsumed } from "./barriers.mjs";

const FLAG_SCOPE = "smt-rpg";
const BUFF_KEY = "buff";
const CONCENTRATE_KEY = "concentrate";
const AID_KEY = "aid";
const DEFEND_KEY = "defend";
const BARRIER_KEY = "barrier";

// Once-per-turn ailment-save lock (p.69), keyed "<combatId>:<round>:<actorId>" so the
// turn automation and a manual Save can't re-roll the same turn.
const _saveLocks = new Set();

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

  if (CONFIG.SMT.debug) console.log("smt-rpg | Buff Applied", {
    actor: actor.name, key, addedStacks: added, rolled, rolls,
    totalStacks: newStacks, magnitude, axes: def.axes, formula: `${added}${SMT.buffDie}`
  });
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

// Provoke (p.105): a foe loses 1d10 resistance but gains the same amount to BOTH physical and
// magical power (one non-exploding roll, the "reckless" debuff). Stored as a removable smt-rpg effect.
export async function applyProvoke(actor, { source = null } = {}) {
  if (!actor) return null;
  if (!canModifyEffects(actor)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return null;
  }
  const roll = await new Roll("1d10").evaluate();
  const amount = Math.max(1, Number(roll.total) || 1);
  const label = game.i18n.localize("SMT.Buff.Provoke");
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${label} (−${amount} resist / +${amount} power)`,
    img: "icons/svg/downgrade.svg",
    changes: [
      { key: "system.buffs.resist", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(-amount) },
      { key: "system.buffs.physicalPower", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(amount) },
      { key: "system.buffs.magicalPower", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(amount) }
    ],
    disabled: false,
    flags: { [FLAG_SCOPE]: { [BUFF_KEY]: { effect: "provoke", group: "provoke", stacks: 1 } } }
  }]);
  if (CONFIG.SMT.debug) console.log("smt-rpg | Provoke", { caster: source?.name, target: actor.name, amount });
  return { amount, targetName: actor.name };
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

// Concentrate and Aid both hold a flat +% for ONE named action (p.64) and both are
// spent by taking it. Consumed through this single call so a future setup action
// cannot end up wired into three of the four sites that need it.
export async function consumeSetupBonuses(actor, action) {
  const concentrate = await consumeConcentrate(actor, action);
  const aid = await consumeAid(actor, action);
  return { total: concentrate + aid, concentrate, aid };
}

// Drop a Concentrate bonus when its holder is afflicted (p.64). Aid goes with it —
// p.64 says the same thing about Aid in the same words: "if the target is inflicted
// with any ailments after being aided, the aid effect is lost."
export async function dropConcentrateOnAilment(actor) {
  if (!canModifyEffects(actor)) return;
  for (const effect of [concentrateEffect(actor), ...aidEffects(actor)]) {
    if (effect) await effect.delete();
  }
}

// Every Aid effect on this actor. Plural by design: p.64 says "Aiding from multiple
// sources stacks", so each aider leaves its own, unlike Concentrate's single stack.
export function aidEffects(actor) {
  return actor?.effects.filter(e => e.getFlag(FLAG_SCOPE, AID_KEY)) ?? [];
}

// One character aids another (p.64): name a skill the target has, or their basic
// strike, and give +bonusPct to that action's TN. The aider rolls Luck; on a failure
// nothing is applied.
export async function applyAid(aider, target, action) {
  if (!aider || !target) return null;
  if (!canModifyEffects(target)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return null;
  }

  const stat = SMT.aid.checkStat;
  const tn = Number(aider.system[`${stat}TN`]) || 0;
  const label = `${game.i18n.localize(SMT.actionEffects.aid.label)} (${action})`;
  const check = await aider.rollPercentile(tn, `${label} — ${aider.name}`);
  if (!check.isSuccess) {
    await postEffectNotice(aider, game.i18n.format("SMT.Aid.Failed", { name: aider.name, target: target.name }));
    return { applied: false };
  }

  const def = SMT.actionEffects.aid;
  const bonus = SMT.aid.bonusPct;
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: `${game.i18n.localize(def.label)} (${action}) +${bonus}%`,
    img: def.icon,
    changes: [{ key: "system.aid.amount", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(bonus) }],
    statuses: [def.statusId],
    disabled: false,
    flags: { [FLAG_SCOPE]: { [AID_KEY]: { action, aiderId: aider.id } } }
  }]);

  await postEffectNotice(aider, game.i18n.format("SMT.Aid.Applied", {
    name: aider.name, target: target.name, action, bonus
  }));
  return { applied: true, action, bonus };
}

// Spend every Aid held for this action (p.64: "Once the named action is taken, all
// aid falls off afterward, regardless of whether the action succeeds or fails").
// Aid named for a different action is untouched. Returns the total +%.
export async function consumeAid(actor, action) {
  const effects = aidEffects(actor);
  if (!effects.length) return 0;

  let amount = 0;
  const spent = [];
  for (const effect of effects) {
    const held = effect.getFlag(FLAG_SCOPE, AID_KEY)?.action;
    if (held && action && held !== action) continue;
    amount += magnitudeOf(effect);
    spent.push(effect.id);
  }
  if (spent.length && canModifyEffects(actor)) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", spent);
  }
  return amount;
}

// Combat-end passives (p.110): Life Aid 20% max HP, Mana Aid 20% max MP, Victory Cry
// both in full. Also resets the once-per-combat trackers, since "once per combat" is
// only true if something clears them — Endure's is the one that matters.
export async function applyCombatEndRecovery(actor) {
  if (!actor || !canModifyEffects(actor)) return null;

  const { hpPct, mpPct } = actor.system.combatEndRecoveryPct ?? { hpPct: 0, mpPct: 0 };
  const update = {};
  if (actor.system.endureUsed) update["system.endureUsed"] = false;
  if (actor.system.ailmentSaveFailed) update["system.ailmentSaveFailed"] = false;

  let hpGain = 0;
  let mpGain = 0;
  if (hpPct > 0) {
    const target = Math.min(actor.system.hp.value + Math.floor(actor.system.hp.max * hpPct / 100), actor.system.hp.max);
    hpGain = target - actor.system.hp.value;
    if (hpGain > 0) update["system.hp.value"] = target;
  }
  if (mpPct > 0) {
    const target = Math.min(actor.system.mp.value + Math.floor(actor.system.mp.max * mpPct / 100), actor.system.mp.max);
    mpGain = target - actor.system.mp.value;
    if (mpGain > 0) update["system.mp.value"] = target;
  }

  if (!Object.keys(update).length) return null;
  await actor.update(update);

  if (CONFIG.SMT.debug) console.log("smt-rpg | Combat-End Recovery", {
    actor: actor.name, hpPct, mpPct, hpGain, mpGain
  });
  if (hpGain > 0 || mpGain > 0) {
    await postEffectNotice(actor, game.i18n.format("SMT.Passive.CombatEndRecovery", {
      name: actor.name, hp: hpGain, mp: mpGain
    }));
  }
  return { hpGain, mpGain };
}

// Curse mishap (p.67): "Whenever you take any action, there is a 30% chance that
// something bad befalls you. The GM will tell you what happens." Same trigger as the
// poison drain below, so it is called from the same four sites. Posts the prompt and
// stops there — what the mishap IS is the GM's call, so nothing is applied.
export async function rollCurseMishap(actor) {
  if (!actor?.system?.curseAilment) return false;
  if (!canModifyEffects(actor)) return false;

  const roll = await new Roll("1d100").evaluate();
  const mishap = roll.total <= SMT.curse.mishapPct;

  if (CONFIG.SMT.debug) console.log("smt-rpg | Curse Mishap", {
    actor: actor.name, pct: SMT.curse.mishapPct, roll: roll.total, mishap
  });
  if (!mishap) return false;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="smt-roll effect-notice"><p>${game.i18n.format("SMT.Curse.Mishap", { name: actor.name })}</p></div>`,
    rolls: [roll]
  });
  return true;
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

  // Freeze/Shock: the free recovery is owed only once a save has already been failed
  // (p.66, p.68). On the first turn start the plan is "save", so the forfeit below is
  // what happens if that save misses — which is the turn the ailment is supposed to cost.
  if (turnStartPlan(ailment, { saveFailed: !!actor.system.ailmentSaveFailed }) === "autoRecover") {
    await actor.update({ "system.ailment": "none", "system.ailmentSaveFailed": false });
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

// Whether an ailment accepts a start-of-turn save (p.69, p.68 Save column). Pure;
// reads only SMT.ailmentSave.eligible (Charm/Restrain/Sleep/Panic). Exported so the
// sheet (which control to show) and the tests share one definition.
export function isSaveEligibleAilment(ailment) {
  return SMT.ailmentSave.eligible.includes(ailment);
}

// Start-of-turn save against the common ailment (p.69): a percentile check on the save
// stat's TN (Vitality, via the shared saveTN) through evaluatePercentile; clears the slot
// on success. One attempt per turn, locked on "<combatId>:<round>:<actorId>". Posts a card.
export async function attemptAilmentSave(actor) {
  if (!actor) return null;
  const ailment = actor.system.ailment ?? "none";
  if (ailment === "none" || !isSaveEligibleAilment(ailment)) return null;
  if (!canModifyEffects(actor)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return null;
  }

  // One save per turn (p.69). No active combat -> no lock (a free out-of-combat attempt).
  const lockKey = game.combat ? `${game.combat.id}:${game.combat.round}:${actor.id}` : null;
  if (lockKey !== null && _saveLocks.has(lockKey)) {
    ui.notifications.info(game.i18n.localize("SMT.Save.AlreadyTried"));
    return null;
  }
  if (lockKey !== null) _saveLocks.add(lockKey);

  const tn = Number(actor.system.saveTN) || 0;
  const roll = await new Roll("1d100").evaluate();
  const result = roll.total;
  const evaluated = evaluatePercentile(result, tn);
  const recovered = evaluated.isSuccess;
  const label = game.i18n.localize(SMT.ailments[ailment] ?? ailment);

  if (CONFIG.SMT.debug) console.log("smt-rpg | Ailment Save", {
    actor: actor.name, ailment, tn, roll: result, recovered
  });

  // A failed save is remembered only for the two ailments the book gives a free
  // recovery to; for everyone else it would just be dead state (p.68).
  if (recovered) {
    await actor.update({ "system.ailment": "none", "system.ailmentSaveFailed": false });
  } else {
    const update = {};
    if (SMT.autoRecoverAtTurnStart.includes(ailment)) update["system.ailmentSaveFailed"] = true;

    // p.58 Fumble Effect Chart: a fumbled save keeps the ailment AND halves HP and MP.
    if (evaluated.isFumble) {
      const halved = fumbledSaveResources({ hp: actor.system.hp.value, mp: actor.system.mp.value });
      update["system.hp.value"] = halved.hp;
      update["system.mp.value"] = halved.mp;
      await postEffectNotice(actor, game.i18n.format("SMT.Save.FumbleHalved", {
        name: actor.name, hp: halved.hp, mp: halved.mp
      }));
    }
    if (Object.keys(update).length) await actor.update(update);
  }

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/ailment-save.hbs",
    {
      name: actor.name,
      ailmentLabel: label,
      statLabel: game.i18n.localize(SMT.stats[SMT.ailmentSave.stat] ?? SMT.ailmentSave.stat),
      tn,
      roll: result,
      outcomeText: game.i18n.localize(evaluated.outcomeKey),
      cssClass: evaluated.cssClass,
      recovered
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll]
  });

  return { recovered, roll: result, tn };
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

// ------------------------------------------------------------- barriers (p.101)

export function barrierEffect(actor, kind) {
  return actor?.effects.find(e => e.getFlag(FLAG_SCOPE, BARRIER_KEY)?.kind === kind);
}

// Raise a barrier on one ally (p.101). Re-casting refreshes rather than stacking: the
// printed sentences describe a state ("all allies Repel Phys"), not a magnitude, so
// there is nothing for a second copy to add. Refreshing IS the useful behaviour —
// Makarakarn cast again on the last round should carry the ally another round.
export async function applyBarrier(actor, kind, { round = null } = {}) {
  const def = SMT.barriers[kind];
  if (!actor || !def) return null;
  if (!canModifyEffects(actor)) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
    return null;
  }

  const data = {
    kind,
    expiresAfterRound: barrierExpiry(kind, round),
    charges: def.charges
  };
  const name = game.i18n.localize(def.label);
  const existing = barrierEffect(actor, kind);

  // No `changes`: an affinity is a string on a nested schema field, which no ADD or
  // OVERRIDE mode can reach usefully. The fold happens in derived data off this flag.
  if (existing) await existing.update({ [`flags.${FLAG_SCOPE}.${BARRIER_KEY}`]: data });
  else {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name, img: def.icon, changes: [], disabled: false,
      flags: { [FLAG_SCOPE]: { [BARRIER_KEY]: data } }
    }]);
  }

  if (SMT.debug) console.log("smt-rpg | Barrier raised", { actor: actor.name, ...data });
  return { kind, label: def.label, targetName: actor.name, ...data };
}

// Spend one charge after a barrier nullified a hit (p.101: Tetraja "returns to their
// normal affinity" once used). Called from the damage pipeline, which is the only place
// that can see both the base rating and the resolved one. No-op for the -karn pair,
// whose clock is rounds.
export async function consumeBarrierCharge(actor, { baseRating, effectiveRating } = {}) {
  if (!actor || !canModifyEffects(actor)) return null;

  for (const effect of actor.effects) {
    const data = effect.getFlag(FLAG_SCOPE, BARRIER_KEY);
    if (!data?.kind) continue;
    if (!barrierConsumed({ kind: data.kind, baseRating, effectiveRating })) continue;

    const charges = Math.max(0, (Number(data.charges) || 0) - 1);
    // At zero the effect is deleted rather than left disabled: a spent barrier that
    // still shows on the token reads as protection the ally does not have.
    if (charges > 0) await effect.update({ [`flags.${FLAG_SCOPE}.${BARRIER_KEY}.charges`]: charges });
    else await effect.delete();

    await postEffectNotice(actor, game.i18n.format("SMT.Barrier.Spent", {
      name: actor.name, barrier: game.i18n.localize(SMT.barriers[data.kind].label)
    }));
    return { kind: data.kind, charges };
  }
  return null;
}

// Drop every barrier. Fires at combat end alongside Defend and Focus — a barrier
// raised outside a round has no expiry to reach, so without this it would persist
// into the next fight.
export async function clearBarriers(actor) {
  if (!actor || !canModifyEffects(actor)) return 0;
  const ids = actor.effects.filter(e => e.getFlag(FLAG_SCOPE, BARRIER_KEY)).map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids.length;
}

// Retire round-clocked barriers whose last round has passed (p.101). Round-boundary
// housekeeping only — derived data already stops reading an expired barrier, so this
// removes the token icon rather than the effect.
export async function expireBarriers(actor, round) {
  if (!actor || !canModifyEffects(actor)) return 0;
  const ids = [];
  for (const effect of actor.effects) {
    const data = effect.getFlag(FLAG_SCOPE, BARRIER_KEY);
    if (data?.kind && !barrierActive(data, round)) ids.push(effect.id);
  }
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids.length;
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
