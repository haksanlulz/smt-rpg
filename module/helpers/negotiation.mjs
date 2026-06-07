// negotiation.mjs — demon-talk / negotiation helpers (p.72-78, p.112)

import { SMT } from "../config.mjs";
import { evaluatePercentile } from "./checks.mjs";

// Look a 1d10 roll up in an inclusive [min,max] band table; last band catches 0/10.
export function lookupBand(table, roll) {
  if (!Array.isArray(table) || !table.length) return null;
  const r = roll === 0 ? 10 : roll;
  return table.find(e => r >= e.min && r <= e.max) ?? table[table.length - 1];
}

// Macca demand (p.75): maccaPerLevel*level + dieRoll*maccaDieMultiplier.
export function maccaDemand(level, dieRoll) {
  const d = SMT.talk.demand;
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  const die = Math.max(0, Math.floor(Number(dieRoll) || 0));
  return (lvl * d.maccaPerLevel) + (die * d.maccaDieMultiplier);
}

// HP demand (p.76): hpPercent% of the demon's own max HP, floored.
export function hpDemand(demonMaxHp) {
  const max = Math.max(0, Math.floor(Number(demonMaxHp) || 0));
  return Math.floor(max * SMT.talk.demand.hpPercent / 100);
}

// Negotiation-check bonus a talk skill grants (p.75/112).
export function talkCheckBonus(isTalkSkill) {
  return isTalkSkill ? SMT.negotiation.talkBonus : 0;
}

// Conversation stoppers the engine can decide (p.73); returns an i18n key or null.
// The rest (Kagutsuchi Full, 8+ cards, GM call) are GM-only and not handled here.
export function negotiationBlockReason(system) {
  if (!system) return null;
  if (system.negotiable === false) return "SMT.Talk.Block.NotNegotiable";
  if (SMT.talk.bossBlocks && system.isBoss) return "SMT.Talk.Block.Boss";
  if (system.deathAilment) return "SMT.Talk.Block.CannotAct";
  const ailment = system.ailment ?? "none";
  if (ailment !== "none" && SMT.talk.cannotActAilments.includes(ailment)) {
    return "SMT.Talk.Block.CannotAct";
  }
  return null;
}

// Synchronous in-flight guard (keyed by message id) closing the await window the
// persisted `resolved` flag leaves open between concurrent clicks.
const _inFlight = new Set();

// GM or owner of either side may drive the card (recruit flag or talker HP).
async function _canDriveNegotiation(talker, target) {
  const { canModifyEffects } = await import("./effects.mjs");
  return (talker && canModifyEffects(talker)) || (target && canModifyEffects(target));
}

// Begin a negotiation (p.72): gate, roll the check, post the GM-driven card.
export async function startNegotiation({ talker, target, skillName, impressMatch = false }) {
  if (!talker || !target) return null;

  // Conversation stoppers (p.73).
  const block = negotiationBlockReason(target.system);
  if (block) {
    ui.notifications.warn(game.i18n.format("SMT.Talk.Blocked", {
      name: target.name, reason: game.i18n.localize(block)
    }));
    return null;
  }

  // +talkBonus% (p.75/112); impress match widens crit via the hasMight path (p.76).
  const baseTN = Number(talker.system.negotiationTN) || 0;
  const tn = baseTN + talkCheckBonus(true);

  const roll = new Roll("1d100");
  await roll.evaluate();
  const evaluated = evaluatePercentile(roll.total, tn, { hasMight: !!impressMatch });

  if (CONFIG.SMT.debug) console.log("smt-rpg | Negotiation Check", {
    talker: talker.name, target: target.name, skillName,
    baseTN, tn, impressMatch, roll: roll.total,
    isSuccess: evaluated.isSuccess, isCritical: evaluated.isCritical
  });

  const { getTokenUuid } = await import("./combat.mjs");
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/negotiation.hbs",
    {
      talkerName: talker.name,
      targetName: target.name,
      skillName,
      tn,
      roll: roll.total,
      outcome: game.i18n.localize(evaluated.outcomeKey),
      cssClass: evaluated.cssClass,
      isSuccess: evaluated.isSuccess,
      isCritical: evaluated.isCritical,
      isFumble: evaluated.isFumble,
      impressMatch,
      resolved: false
    }
  );

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: talker }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice
  });

  await message.setFlag("smt-rpg", "negotiationData", {
    talkerTokenUuid: getTokenUuid(talker) ?? talker.id,
    targetTokenUuid: getTokenUuid(target) ?? target.id,
    skillName,
    tn,
    roll: roll.total,
    isSuccess: evaluated.isSuccess,
    isCritical: evaluated.isCritical,
    isFumble: evaluated.isFumble,
    impressMatch,
    resolved: false
  });

  return message;
}

// Demand / Gift rolls (p.73-76)

// Roll one demand (p.75). Does not consume the card; gated + single-fire.
export async function resolveDemand(message, kind) {
  const data = message.getFlag("smt-rpg", "negotiationData");
  if (!data || data.resolved) return;
  if (!SMT.talk.demands.includes(kind)) return;

  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const { getActorFromTokenUuid } = await import("./combat.mjs");
    const talker = getActorFromTokenUuid(data.talkerTokenUuid);
    const target = getActorFromTokenUuid(data.targetTokenUuid);
    if (!target) return;
    if (!(await _canDriveNegotiation(talker, target))) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }

    const rolls = [];
    let line;
    if (kind === "none") {
      line = game.i18n.localize("SMT.Talk.Demand.NoneLine");
    } else if (kind === "macca") {
      const roll = await new Roll(SMT.talk.demand.maccaDie).evaluate();
      rolls.push(roll);
      const amount = maccaDemand(target.system.level, roll.total);
      line = game.i18n.format("SMT.Talk.Demand.MaccaLine", { amount });
    } else if (kind === "hp") {
      const amount = hpDemand(target.system.hp?.max);
      line = game.i18n.format("SMT.Talk.Demand.HPLine", { amount });
    } else { // item
      const roll = await new Roll("1d10").evaluate();
      rolls.push(roll);
      const entry = lookupBand(SMT.talk.itemDemandTable, roll.total);
      line = game.i18n.format("SMT.Talk.Demand.ItemLine", {
        item: game.i18n.localize(entry?.label ?? "SMT.Talk.Item.GMChoice")
      });
    }

    if (CONFIG.SMT.debug) console.log("smt-rpg | Negotiation Demand", {
      target: target.name, kind, line
    });

    await _postNotice(target, game.i18n.format("SMT.Talk.DemandPrefix", {
      name: target.name, demand: line
    }), rolls);
  } finally {
    _inFlight.delete(message.id);
  }
}

// Apply a terminal outcome (p.75) and spend the card.
export async function resolveNegotiationOutcome(message, outcome) {
  const live = message.getFlag("smt-rpg", "negotiationData");
  if (!live || live.resolved) return;
  if (!SMT.talk.outcomes.includes(outcome)) return;

  if (_inFlight.has(message.id)) return;
  _inFlight.add(message.id);
  try {
    const { getActorFromTokenUuid } = await import("./combat.mjs");
    const talker = getActorFromTokenUuid(live.talkerTokenUuid);
    const target = getActorFromTokenUuid(live.targetTokenUuid);
    if (!target) return;
    if (!(await _canDriveNegotiation(talker, target))) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }

    if (CONFIG.SMT.debug) console.log("smt-rpg | Negotiation Outcome", {
      talker: talker?.name, target: target.name, outcome
    });

    let line;
    switch (outcome) {
      case "deal":
        await _recruitDemon(talker, target);
        line = game.i18n.format("SMT.Talk.Outcome.Deal", { name: target.name });
        break;
      case "gift":
        await resolveGift(message, talker, target);
        line = game.i18n.format("SMT.Talk.Outcome.Gift", { name: target.name });
        break;
      case "leave":
        line = game.i18n.format("SMT.Talk.Outcome.Leave", { name: target.name });
        break;
      case "angry":
        line = game.i18n.format("SMT.Talk.Outcome.Angry", { name: target.name });
        break;
      default: // break
        line = game.i18n.format("SMT.Talk.Outcome.Break", { name: target.name });
        break;
    }

    await message.setFlag("smt-rpg", "negotiationData", { ...live, resolved: true, outcome });
    await _postNotice(talker ?? target, line);
  } finally {
    _inFlight.delete(message.id);
  }
}

// Roll on the Gift Table (p.73); hp heals the talker, gem chains the Gem Table.
export async function resolveGift(message, talker, target) {
  const roll = await new Roll("1d10").evaluate();
  const entry = lookupBand(SMT.talk.giftTable, roll.total);
  const rolls = [roll];
  let detail = game.i18n.localize(entry?.label ?? "SMT.Talk.Gift.Cheer");

  if (entry?.kind === "hp" && talker) {
    const effectRoll = await new Roll("1d10").evaluate();
    rolls.push(effectRoll);
    const heal = Math.max(0, Math.floor(Number(effectRoll.total) || 0));
    const before = talker.system.hp.value;
    const newHp = Math.min(before + heal, talker.system.hp.max);
    await talker.update({ "system.hp.value": newHp });
    detail = game.i18n.format("SMT.Talk.Gift.HPLine", { name: talker.name, amount: newHp - before });
  } else if (entry?.kind === "gem") {
    const gemRoll = await new Roll("1d10").evaluate();
    rolls.push(gemRoll);
    const gem = lookupBand(SMT.talk.gemTable, gemRoll.total);
    detail = game.i18n.format("SMT.Talk.Gift.GemLine", { gem: game.i18n.localize(gem?.label ?? "SMT.Talk.Gem.Aquamarine") });
  }

  if (CONFIG.SMT.debug) console.log("smt-rpg | Negotiation Gift", {
    target: target.name, roll: roll.total, kind: entry?.kind, detail
  });

  await _postNotice(target, game.i18n.format("SMT.Talk.GiftPrefix", { name: target.name, gift: detail }), rolls);
}

// Flag a demon recruited on a Deal (p.75); roster bookkeeping stays with the GM.
async function _recruitDemon(talker, target) {
  if (!("recruited" in target.system)) return;
  await target.update({
    "system.recruited": true,
    "system.recruitedBy": talker?.name ?? ""
  });
}

// Post a short notice card, attaching dice when present.
async function _postNotice(actor, text, rolls = []) {
  const content = `<div class="smt-roll effect-notice"><p>${text}</p></div>`;
  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  };
  if (rolls.length) data.rolls = rolls;
  await ChatMessage.create(data);
}
