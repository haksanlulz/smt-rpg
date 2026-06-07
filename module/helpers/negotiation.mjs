// ═══════════════════════════════════════════════
// negotiation.mjs — demon-talk / negotiation resolution helpers (p.72-78, p.112).
//
// Role: the rules engine behind the negotiation chat-card flow. A talk skill
// (skillType "talk-approach" / "talk-support") routes through SMTItem.use ->
// startNegotiation, which rolls the rulebook Negotiation check and posts a
// negotiation card. smt-rpg.mjs binds that card's buttons and calls the resolvers
// here via dynamic import (mirrors the combat-helper pattern, breaking the cycle).
//
// Division of labour (faithful to the book): the flowchart navigation, the demand-
// met judgement, and the demon's Reason are GM concerns (p.74-75) — the engine
// never invents a probability for them. What IS rulebook-exact is automated:
//   - the Negotiation check (d100 vs negotiationTN, +CONFIG.SMT.negotiation.talkBonus%
//     for any talk skill, crit range widened to TN/impressCritDivisor on an
//     impress-type match — reusing evaluatePercentile's hasMight crit-widen path);
//   - the demon-demand amounts (macca / HP / Item Demand Table);
//   - the Gift, Random Gem, and Item Demand tables (all 1d10).
// The GM drives the rest from buttons on the card.
//
// ChatMessage flag (namespace "smt-rpg"): negotiationData. Like every other flag it
// is author-forgeable, so the resolvers re-read it, gate on canModifyEffects, and
// coerce numerics before they feed a roll or an actor write.
//
// Section index:
//   - Pure helpers           (lookupBand … negotiationBlockReason)
//   - Negotiation check       (startNegotiation)
//   - Outcome resolution      (resolveNegotiationOutcome)
//   - Demand / Gift rolls      (resolveDemand … resolveGift)
// ═══════════════════════════════════════════════

import { SMT } from "../config.mjs";
import { evaluatePercentile } from "./checks.mjs";

// ═══════════════════════════════════════════════
// Pure helpers (document-free; covered by test/run-tests.mjs)
// ═══════════════════════════════════════════════

/**
 * Look a 1d10-style roll up in an inclusive-[min,max]-band table (the Gift, Random
 * Gem, and Item Demand tables, p.73/76). Returns the matching entry, or the last
 * band as a fallback so the 0/10 face never falls through. Pure.
 *
 * @param {{min:number,max:number}[]} table - band table from CONFIG.SMT.talk.*.
 * @param {number} roll                       - the rolled value (1-10; 0 read as 10).
 * @returns {object|null} the matching band entry, or null for an empty table.
 */
export function lookupBand(table, roll) {
  if (!Array.isArray(table) || !table.length) return null;
  const r = roll === 0 ? 10 : roll;
  return table.find(e => r >= e.min && r <= e.max) ?? table[table.length - 1];
}

/**
 * Macca a demon demands (p.75): (maccaPerLevel × level) + (dieRoll × maccaDieMultiplier).
 * The level term is deterministic; the caller rolls CONFIG.SMT.talk.demand.maccaDie and
 * passes its total as dieRoll so this stays pure and unit-testable. Negative inputs
 * floor at 0. Pure.
 *
 * @param {number} level   - the demon's level.
 * @param {number} dieRoll - the rolled CONFIG.SMT.talk.demand.maccaDie total.
 * @returns {number} the macca demanded.
 */
export function maccaDemand(level, dieRoll) {
  const d = SMT.talk.demand;
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  const die = Math.max(0, Math.floor(Number(dieRoll) || 0));
  return (lvl * d.maccaPerLevel) + (die * d.maccaDieMultiplier);
}

/**
 * HP a demon demands as a cost (p.76): hpPercent% of the DEMON's own max HP, floored.
 * "This damage cannot be reduced via any means." Pure.
 *
 * @param {number} demonMaxHp - the demon's maximum HP.
 * @returns {number} the HP cost.
 */
export function hpDemand(demonMaxHp) {
  const max = Math.max(0, Math.floor(Number(demonMaxHp) || 0));
  return Math.floor(max * SMT.talk.demand.hpPercent / 100);
}

/**
 * The Negotiation-check bonus a talk skill grants (p.75/112). Every approach and
 * support talk skill grants the same flat +talkBonus%; a non-talk action grants 0.
 * Pure.
 *
 * @param {boolean} isTalkSkill - whether the initiating action is a talk skill.
 * @returns {number} the +% to add to negotiationTN.
 */
export function talkCheckBonus(isTalkSkill) {
  return isTalkSkill ? SMT.negotiation.talkBonus : 0;
}

/**
 * Why a target cannot be talked to right now, or null if negotiation is permitted
 * (p.73 "Conversation Stoppers"). Reads only the fields the rulebook ties to actor
 * state, so the gate works on both demon- and npc-type targets (both carry isBoss /
 * negotiable, and the shared ailment slot + deathAilment flag):
 *   - the target is not negotiable (system.negotiable === false);
 *   - the target is a Boss demon (system.isBoss, when CONFIG.SMT.talk.bossBlocks);
 *   - the target is made unable to act by Death or a CONFIG.SMT.talk.cannotActAilments
 *     ailment (Stoned/Shocked/Frozen/Restrained/Sleeping/Panicked).
 * The remaining stoppers (Kagutsuchi Full, 8+ demon cards, "when the GM says so") are
 * GM calls and are intentionally NOT decided here. Pure (reads a plain system object).
 *
 * @param {object} system - the target actor's system data (system.isBoss/negotiable/
 *                          ailment/deathAilment).
 * @returns {?string} an i18n key describing the block, or null if talk is allowed.
 */
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

// ═══════════════════════════════════════════════
// Idempotency (mirrors combat.mjs)
// ═══════════════════════════════════════════════
// Each resolver re-reads the persisted `resolved` flag and bails, but that guard is
// written only after the first await — so two concurrent clicks could both pass it.
// This synchronous in-flight set, keyed by message id, closes that window: a resolver
// claims its id before its first await and frees it in a finally. Layers on top of the
// `resolved` re-read; does not replace it.
const _inFlight = new Set();

// Reuse the chat-handler gate (effects.canModifyEffects: GM or owner) so a
// negotiation write only ever runs on a permitted client. A negotiation's writes can
// touch either side — the demon's recruit flag (Deal) or the talker's HP (gift) — so
// the GM or an owner of EITHER actor may drive the card, matching _bindNegotiationButtons.
async function _canDriveNegotiation(talker, target) {
  const { canModifyEffects } = await import("./effects.mjs");
  return (talker && canModifyEffects(talker)) || (target && canModifyEffects(target));
}

// ═══════════════════════════════════════════════
// Negotiation check (p.72-75)
// ═══════════════════════════════════════════════

/**
 * Begin a negotiation with a single target demon (p.72 "Approaching"). Resolves the
 * conversation-stopper gate (p.73), rolls the rulebook Negotiation check (d100 vs the
 * talker's negotiationTN, +CONFIG.SMT.negotiation.talkBonus% for the talk skill, crit
 * range widened to TN/impressCritDivisor when impressMatch is set, p.76), and posts a
 * negotiation card with the GM-driven outcome controls. The check itself is rolled
 * here; the flowchart navigation that follows is the GM's (the card surfaces the
 * outcome buttons but never auto-moves the demon).
 *
 * @param {object}   params
 * @param {SMTActor} params.talker        - the actor initiating the talk (rolls the check).
 * @param {SMTActor} params.target        - the demon/npc being negotiated with.
 * @param {string}   params.skillName     - the talk skill's display name.
 * @param {boolean}  [params.impressMatch=false] - GM flag: target matches the skill's impress type (p.76).
 * @returns {Promise<?ChatMessage>} the negotiation card, or null if blocked.
 */
export async function startNegotiation({ talker, target, skillName, impressMatch = false }) {
  if (!talker || !target) return null;

  // Conversation stoppers (p.73). A blocked target posts nothing and warns the user.
  const block = negotiationBlockReason(target.system);
  if (block) {
    ui.notifications.warn(game.i18n.format("SMT.Talk.Blocked", {
      name: target.name, reason: game.i18n.localize(block)
    }));
    return null;
  }

  // Negotiation check: talk skills grant +talkBonus% (p.75/112). The impress-type
  // match widens the crit range to TN/impressCritDivisor, which is exactly the Might
  // crit-widen path in evaluatePercentile — so we route it through hasMight rather
  // than duplicating the threshold rule.
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

// ═══════════════════════════════════════════════
// Demand / Gift rolls (p.73-76) — rulebook-exact dice
// ═══════════════════════════════════════════════

/**
 * Roll a demon demand (p.75) for the negotiation on this card. The GM chooses WHICH
 * demand a flowchart space shows; this rolls its rulebook-exact amount:
 *   - macca: (maccaPerLevel × demon level) + (CONFIG.SMT.talk.demand.maccaDie × maccaDieMultiplier);
 *   - hp:    hpPercent% of the demon's own max HP;
 *   - item:  1d10 on the Item Demand Table;
 *   - none:  the demon asks for nothing.
 * Posts a short demand notice with any roll. Reads the live flag; does not consume the
 * card (a negotiation makes several demands before a Deal/Break, p.75), but is gated +
 * single-fire so two clicks cannot double-post.
 *
 * @param {ChatMessage} message - the negotiation card.
 * @param {string}      kind    - a CONFIG.SMT.talk.demands entry ("none"|"macca"|"hp"|"item").
 * @returns {Promise<void>}
 */
export async function resolveDemand(message, kind) {
  const data = message.getFlag("smt-rpg", "negotiationData");
  if (!data || data.resolved) return; // a terminal outcome has closed the talk
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

/**
 * Resolve a terminal negotiation outcome (p.75): the GM moves the talk here on the
 * flowchart and this applies the rulebook-exact result, then spends the card so the
 * buttons cannot be re-used. Re-reads the live flag and bails if already resolved.
 *   - deal:  the demon joins / fulfils the request — recruit a demon to a demon card.
 *   - gift:  roll once on the Gift Table (resolveGift), then the demon leaves.
 *   - leave: the demon simply leaves.
 *   - angry: the demon is angered (cannot be talked to until it acts again).
 *   - break: the talk breaks down.
 *
 * @param {ChatMessage} message - the negotiation card.
 * @param {string}      outcome - a CONFIG.SMT.talk.outcomes entry.
 * @returns {Promise<void>}
 */
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

    // Spend the card: persist resolved + the chosen outcome so a re-render strips the
    // buttons and shows the final state.
    await message.setFlag("smt-rpg", "negotiationData", { ...live, resolved: true, outcome });
    await _postNotice(talker ?? target, line);
  } finally {
    _inFlight.delete(message.id);
  }
}

/**
 * Roll once on the Gift Table (p.73) and apply its rulebook-exact effect. Most gift
 * kinds are GM-narrated (the demon cheers, hands over macca/an item equal to its
 * drop); the two with mechanical effects are automated:
 *   - hp:  the talker recovers HP equal to a 1d10 effect roll (the book's "effect roll
 *          + the demon's Spell Effect"; the Spell-Effect bonus is the GM's to add);
 *   - gem: chain into the Random Gem Table (1d10) for the specific gem.
 * The demon then leaves (handled by the caller's outcome line).
 *
 * @param {ChatMessage} message - the negotiation card (for idempotent gating context).
 * @param {?SMTActor}   talker  - the talking actor (HP gift recipient).
 * @param {SMTActor}    target  - the demon giving the gift (chat speaker).
 * @returns {Promise<void>}
 */
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
    // Report the HP actually restored after the max cap, not the raw roll.
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

/**
 * Recruit a demon on a Deal (p.75 "the demon fulfils their side of the bargain, giving
 * you their demon card"). The negotiation engine automates the rulebook dice and the
 * recruit record but leaves party-roster bookkeeping to the GM: it flags the target
 * actor as recruited (system.recruited / system.recruitedBy) so the demon card is
 * recorded, without unsummoning the token or fabricating a new actor. Gated by the
 * caller (resolveNegotiationOutcome).
 *
 * @param {?SMTActor} talker - the recruiting actor (recorded as the recruiter).
 * @param {SMTActor}  target - the demon joining.
 * @returns {Promise<void>}
 */
async function _recruitDemon(talker, target) {
  // Only demon/npc targets carry the recruited fields; guard so a stray Deal on an
  // actor without them is a no-op write rather than a schema error.
  if (!("recruited" in target.system)) return;
  await target.update({
    "system.recruited": true,
    "system.recruitedBy": talker?.name ?? ""
  });
}

/**
 * Post a short negotiation notice card, optionally carrying its dice. Mirrors
 * effects.postEffectNotice's markup so negotiation lines read like the other
 * automation notices; rolls are attached when present so they are auditable.
 *
 * @param {SMTActor}  actor   - chat speaker.
 * @param {string}    text    - already-localized body.
 * @param {Roll[]}    [rolls] - dice to attach (omitted when empty).
 * @returns {Promise<void>}
 */
async function _postNotice(actor, text, rolls = []) {
  const content = `<div class="smt-roll effect-notice"><p>${text}</p></div>`;
  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  };
  if (rolls.length) data.rolls = rolls;
  await ChatMessage.create(data);
}
