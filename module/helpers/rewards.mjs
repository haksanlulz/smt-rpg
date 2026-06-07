// rewards.mjs — combat-end EXP / macca / loot payout (p.46, p.48)

import { SMT } from "../config.mjs";

const FLAG_SCOPE = "smt-rpg";
const PAID_KEY = "rewardsPaid";

// Reward recipients; npc is the foe sheet and never gets paid.
const RECIPIENT_TYPES = ["human", "fiend", "demon"];

// In-flight guard (keyed by combat id) closing the await window the persisted
// rewardsPaid flag leaves open between the auto-hook and manual-tracker payouts.
const _inFlight = new Set();

// Clamp a reward to [0, maxValue], floored.
export function sanitizeRewardValue(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.clamp(Math.floor(value), 0, CONFIG.SMT.rewards.maxValue);
}

// EXP multiplier for a foe `gap` levels above the party (p.48): factor^floor(gap/step).
export function expMultiplierForGap(gap) {
  const g = Number(gap) || 0;
  const { threshold, step, factor } = CONFIG.SMT.rewards.expBonus;
  if (g < threshold || step <= 0) return 1;
  return Math.pow(factor, Math.floor(g / step));
}

// EXP one foe grants after the gap doubling (p.48).
export function expForDefeat(baseExp, foeLevel, partyLevel) {
  const base = sanitizeRewardValue(baseExp);
  if (base <= 0) return 0;
  const gap = (Number(foeLevel) || 0) - (Number(partyLevel) || 0);
  return sanitizeRewardValue(base * expMultiplierForGap(gap));
}

// Party level for the gap bonus (p.48): highest recipient level.
export function partyLevelOf(levels) {
  let max = 0;
  for (const lvl of levels ?? []) {
    const n = Number(lvl) || 0;
    if (n > max) max = n;
  }
  return max;
}

// Per-recipient macca: "per-pc" gives each the full total, else an even floored split.
export function maccaShares(total, recipientCount, mode) {
  const t = sanitizeRewardValue(total);
  const n = Math.max(0, Math.floor(Number(recipientCount) || 0));
  if (t <= 0 || n <= 0) return 0;
  if (mode === "per-pc") return t;
  return Math.floor(t / n);
}

// Clean one author-typed drop name: strip HTML-significant chars, collapse, cap.
export function sanitizeDropName(name) {
  if (typeof name !== "string") return "";
  return name
    .replace(/[<>&"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

// Parse a drops string (comma/newline separated) into clean, deduped names.
export function parseDropItems(dropsString) {
  if (typeof dropsString !== "string" || !dropsString.trim()) return [];
  const seen = new Set();
  const out = [];
  for (const raw of dropsString.split(/[,\n]/)) {
    const name = sanitizeDropName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Orchestration (GM-gated)

export function canGrantRewards() {
  return game.user.isGM;
}

// Configured macca distribution mode, validated against config; falls back to default.
export function maccaDistributionMode() {
  let mode;
  try {
    mode = game.settings.get(FLAG_SCOPE, "maccaDistribution");
  } catch (_err) {
    mode = null;
  }
  return mode in CONFIG.SMT.rewards.maccaDistributionModes
    ? mode
    : CONFIG.SMT.rewards.maccaDistributionDefault;
}

// Whether a disposition is excluded from the harvest (friendly casualties, p.48).
function _isExcludedFoeDisposition(disposition) {
  const D = foundry.CONST.TOKEN_DISPOSITIONS;
  return CONFIG.SMT.rewards.excludedFoeDispositions.some(name => D[name] === disposition);
}

// Defeated foes (p.48): distinct combatants at 0 HP, minus friendly casualties.
export function harvestFoes(combat) {
  const foes = [];
  const seen = new Set();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant.actor;
    if (!actor || seen.has(actor.id)) continue;
    if ((Number(actor.system?.hp?.value) || 0) > 0) continue;
    const disposition = combatant.token?.disposition
      ?? actor.prototypeToken?.disposition
      ?? foundry.CONST.TOKEN_DISPOSITIONS.HOSTILE;
    if (_isExcludedFoeDisposition(disposition)) continue;
    seen.add(actor.id);
    foes.push(actor);
  }
  return foes;
}

// Recipients (p.48): distinct RECIPIENT_TYPES combatants that aren't foes; downed kept.
export function rewardRecipients(combat, foes) {
  const foeIds = new Set(foes.map(f => f.id));
  const recipients = [];
  const seen = new Set();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant.actor;
    if (!actor || seen.has(actor.id)) continue;
    if (foeIds.has(actor.id)) continue;
    if (!RECIPIENT_TYPES.includes(actor.type)) continue;
    seen.add(actor.id);
    recipients.push(actor);
  }
  return recipients;
}

// Total EXP/macca/loot of the foes (p.46, p.48); EXP summed in full, not divided.
export function tallyFoeRewards(foes, partyLevel) {
  let exp = 0;
  let macca = 0;
  const items = [];
  const seenItems = new Set();
  const breakdown = [];

  for (const foe of foes ?? []) {
    const drops = foe.system?.drops ?? {};
    const foeExp = expForDefeat(drops.exp, foe.system?.level, partyLevel);
    const foeMacca = sanitizeRewardValue(drops.macca);
    exp += foeExp;
    macca += foeMacca;

    for (const name of parseDropItems(drops.normalItems)) {
      const key = name.toLowerCase();
      if (seenItems.has(key)) continue;
      seenItems.add(key);
      items.push(name);
    }
    breakdown.push({ name: foe.name, level: Number(foe.system?.level) || 0, exp: foeExp, macca: foeMacca });
  }

  return {
    exp: sanitizeRewardValue(exp),
    macca: sanitizeRewardValue(macca),
    items,
    breakdown
  };
}

// Add EXP + macca share to one actor (p.48), clamped.
async function _grantToActor(actor, exp, maccaShare) {
  const update = {};
  if (exp > 0) {
    update["system.exp"] = sanitizeRewardValue((Number(actor.system.exp) || 0) + exp);
  }
  if (maccaShare > 0) {
    update["system.macca"] = sanitizeRewardValue((Number(actor.system.macca) || 0) + maccaShare);
  }
  if (Object.keys(update).length) await actor.update(update);
}

// Create looted items on a recipient as generic consumables (p.46).
async function _grantLootToActor(actor, names) {
  if (!names?.length) return;
  const itemData = names.map(name => ({
    name,
    type: "consumable",
    flags: { [FLAG_SCOPE]: { combatLoot: true } }
  }));
  await actor.createEmbeddedDocuments("Item", itemData);
}

// Pay out an encounter's rewards once (p.46, p.48). GM-only, idempotent.
export async function grantCombatRewards(combat, { notifyEmpty = false } = {}) {
  if (!canGrantRewards()) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.RewardsGM"));
    return false;
  }
  if (!combat) return false;

  if (combat.getFlag(FLAG_SCOPE, PAID_KEY)) {
    if (notifyEmpty) ui.notifications.info(game.i18n.localize("SMT.Rewards.AlreadyPaid"));
    return false;
  }

  if (_inFlight.has(combat.id)) return false;
  _inFlight.add(combat.id);
  try {
    // Re-check now that we hold the claim, in case a sibling call just committed.
    if (combat.getFlag(FLAG_SCOPE, PAID_KEY)) return false;

    const foes = harvestFoes(combat);
    const recipients = rewardRecipients(combat, foes);

    if (!recipients.length) {
      if (notifyEmpty) ui.notifications.warn(game.i18n.localize("SMT.Warnings.RewardsNoRecipients"));
      return false;
    }

    const partyLevel = partyLevelOf(recipients.map(r => r.system?.level));
    const tally = tallyFoeRewards(foes, partyLevel);

    if (tally.exp <= 0 && tally.macca <= 0 && !tally.items.length) {
      // Nothing owed: stamp so repeated triggers don't re-scan, but post no card.
      await combat.setFlag(FLAG_SCOPE, PAID_KEY, true);
      if (notifyEmpty) ui.notifications.info(game.i18n.localize("SMT.Rewards.Nothing"));
      return false;
    }

    const mode = maccaDistributionMode();
    const perRecipientMacca = maccaShares(tally.macca, recipients.length, mode);

    // Lowest-id recipient is the party stash for shared-mode loot.
    const sortedRecipients = [...recipients].sort((a, b) => a.id.localeCompare(b.id));
    const lootHolders = mode === "per-pc" ? sortedRecipients : sortedRecipients.slice(0, 1);

    for (const actor of sortedRecipients) {
      await _grantToActor(actor, tally.exp, perRecipientMacca);
    }
    if (tally.items.length) {
      for (const holder of lootHolders) await _grantLootToActor(holder, tally.items);
    }

    // Stamp before posting so a card-render failure can't reopen the payout.
    await combat.setFlag(FLAG_SCOPE, PAID_KEY, true);

    await postRewardCard({
      foes: tally.breakdown,
      recipients: recipients.map(r => r.name),
      exp: tally.exp,
      maccaTotal: tally.macca,
      maccaPerRecipient: perRecipientMacca,
      mode,
      items: tally.items,
      lootHolders: lootHolders.map(h => h.name)
    });

    if (CONFIG.SMT.debug) console.log("smt-rpg | Combat Rewards", {
      foes: tally.breakdown, recipients: recipients.map(r => r.name),
      partyLevel, exp: tally.exp, maccaTotal: tally.macca,
      maccaPerRecipient: perRecipientMacca, mode, items: tally.items
    });

    return true;
  } finally {
    _inFlight.delete(combat.id);
  }
}

// Post the reward summary card (p.46, p.48).
export async function postRewardCard({ foes, recipients, exp, maccaTotal, maccaPerRecipient, mode, items, lootHolders }) {
  const modeLabel = game.i18n.localize(
    CONFIG.SMT.rewards.maccaDistributionModes[mode] ?? CONFIG.SMT.rewards.maccaDistributionModes.shared
  );
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/reward-result.hbs",
    {
      foes,
      recipients,
      recipientCount: recipients.length,
      exp,
      maccaTotal,
      maccaPerRecipient,
      isShared: mode !== "per-pc",
      modeLabel,
      items,
      lootHolders,
      hasItems: items.length > 0
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("SMT.Rewards.Title") }),
    content
  });
}
