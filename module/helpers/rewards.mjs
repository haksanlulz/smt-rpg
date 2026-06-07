// ═══════════════════════════════════════════════
// rewards.mjs — combat-end EXP / macca / loot payout (p.46, p.48).
//
// Role: when an encounter ends, harvest the defeated foes, total the EXP and macca
// they grant, gather their item drops, and pay the rewards out to the surviving
// party. The hard, rules-exact maths lives in the PURE functions at the top (no
// document or Foundry access, so they are unit-testable in plain node — see
// test/run-tests.mjs):
//   - expMultiplierForGap : the p.48 "10+ levels above the party" doubling.
//   - expForDefeat        : a single foe's EXP after that multiplier.
//   - partyLevelOf        : the party level (highest recipient level, p.48 curve).
//   - maccaShares         : split a macca total per the distribution model.
//   - parseDropItems / sanitizeDropName : turn an author-typed drops string into a
//                           clean, deduped item-name list (drops are forgeable).
// Every constant is read from CONFIG.SMT.rewards, never hard-coded here.
//
// grantCombatRewards() is the orchestration layer: GM-gated, it reads the combat,
// harvests foes (excluding friendly-disposition casualties, p.48), computes the
// totals via the pure helpers, writes EXP/macca/loot to the eligible PCs, posts a
// summary card, and stamps the combat so it pays out exactly once. The payout uses
// the same TOCTOU-safe dual guard the chat resolvers use: a persisted
// flags.smt-rpg.rewardsPaid on the combat plus an in-memory Set keyed by combat id,
// so an auto-payout on encounter end and a manual tracker payout cannot double-pay.
// ═══════════════════════════════════════════════

import { SMT } from "../config.mjs";

const FLAG_SCOPE = "smt-rpg";
const PAID_KEY = "rewardsPaid";

// Actor types that receive rewards (the player-controlled party). Demons a party
// owns level up from combat too (p.48 "All characters who participated"), so demon
// is included; npc is the streamlined foe sheet and never a recipient.
const RECIPIENT_TYPES = ["human", "fiend", "demon"];

// ═══════════════════════════════════════════════
// Resolution idempotency
// ═══════════════════════════════════════════════
// A combat can be paid out by the deleteCombat auto-hook and by the manual tracker
// control. Both call grantCombatRewards, which writes a persisted rewardsPaid flag
// AFTER its first await — leaving a TOCTOU window where two near-simultaneous calls
// both pass the flag check before either persists it. This synchronous in-flight
// set, keyed by combat id, closes that window: a payout claims the id before its
// first await and frees it in a finally, so a second concurrent entry returns
// immediately. It layers on top of the persisted rewardsPaid flag (which guards
// re-payout after the first has fully committed); it does not replace it.
const _inFlight = new Set();

// ═══════════════════════════════════════════════
// Pure reward maths (no document access — unit-testable)
// ═══════════════════════════════════════════════

/**
 * Clamp a reward value (EXP or macca) to [0, CONFIG.SMT.rewards.maxValue], flooring
 * to an integer; non-finite collapses to 0. Mirrors the chat/HP delta guards so an
 * author-forged drops field cannot mint an absurd grant.
 *
 * @param {number} value
 * @returns {number}
 */
export function sanitizeRewardValue(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.clamp(Math.floor(value), 0, CONFIG.SMT.rewards.maxValue);
}

/**
 * The EXP multiplier for a defeated foe whose level sits `gap` levels above the
 * party (p.48 "Notice"): below CONFIG.SMT.rewards.expBonus.threshold the multiplier
 * is 1; at or above it, EXP doubles once for each full `step` levels of gap —
 * factor ^ floor(gap / step). A non-positive gap (foe at or below party level)
 * always returns 1.
 *
 * @param {number} gap - defeated foe level minus party level.
 * @returns {number} the EXP multiplier (>= 1).
 */
export function expMultiplierForGap(gap) {
  const g = Number(gap) || 0;
  const { threshold, step, factor } = CONFIG.SMT.rewards.expBonus;
  if (g < threshold || step <= 0) return 1;
  return Math.pow(factor, Math.floor(g / step));
}

/**
 * EXP a single defeated foe grants, after the p.48 level-gap doubling. The base EXP
 * is the foe's authored drops value; the multiplier comes from how far the foe's
 * level exceeds the party level. Both inputs are coerced (drops are author-forgeable)
 * and the result is clamped to CONFIG.SMT.rewards.maxValue.
 *
 * @param {number} baseExp     - the foe's base EXP reward (drops.exp).
 * @param {number} foeLevel    - the defeated foe's level.
 * @param {number} partyLevel  - the party level the gap is measured against.
 * @returns {number} EXP granted (per participant, in full — p.48).
 */
export function expForDefeat(baseExp, foeLevel, partyLevel) {
  const base = sanitizeRewardValue(baseExp);
  if (base <= 0) return 0;
  const gap = (Number(foeLevel) || 0) - (Number(partyLevel) || 0);
  return sanitizeRewardValue(base * expMultiplierForGap(gap));
}

/**
 * The party level used for the p.48 EXP-gap bonus: the highest level among the
 * reward recipients (the party advances at its strongest member's pace for the
 * "10 levels above the party" comparison). Empty input yields 0.
 *
 * @param {number[]} levels - recipient levels.
 * @returns {number}
 */
export function partyLevelOf(levels) {
  let max = 0;
  for (const lvl of levels ?? []) {
    const n = Number(lvl) || 0;
    if (n > max) max = n;
  }
  return max;
}

/**
 * Split a harvested macca total across the eligible recipients per the distribution
 * model (p.48 leaves the split to the table, so this honours the world setting):
 *  - "shared"  : the total divided evenly, floored, so the bank is never inflated
 *                by the split (remainder is dropped, not minted) — same amount to each.
 *  - "per-pc"  : the FULL total to each recipient (a generous table model).
 * An unknown mode falls back to "shared". Returns the per-recipient amount; with no
 * recipients or a non-positive total it is 0.
 *
 * @param {number} total          - harvested macca total.
 * @param {number} recipientCount - number of eligible recipients.
 * @param {string} mode           - a CONFIG.SMT.rewards.maccaDistributionModes key.
 * @returns {number} macca granted to EACH recipient.
 */
export function maccaShares(total, recipientCount, mode) {
  const t = sanitizeRewardValue(total);
  const n = Math.max(0, Math.floor(Number(recipientCount) || 0));
  if (t <= 0 || n <= 0) return 0;
  if (mode === "per-pc") return t;
  // "shared" (and any unknown mode): even split, floored.
  return Math.floor(t / n);
}

/**
 * Sanitize a single author-typed drop item name (drops.normalItems is forgeable):
 * trim, collapse internal whitespace, strip HTML-significant characters so a name
 * can never inject markup into the item or the card, and cap the length. Returns ""
 * for empty/invalid input (the caller drops empties).
 *
 * @param {string} name
 * @returns {string} a clean plain-text item name, or "".
 */
export function sanitizeDropName(name) {
  if (typeof name !== "string") return "";
  return name
    .replace(/[<>&"'`]/g, " ")   // neutralize HTML-significant characters
    .replace(/\s+/g, " ")         // collapse whitespace
    .trim()
    .slice(0, 100);
}

/**
 * Parse an author-typed drops string into a clean, deduped list of item names.
 * Names are separated by commas or newlines, each sanitized via sanitizeDropName;
 * blanks are dropped and duplicates removed case-insensitively (order preserved).
 *
 * @param {string} dropsString - the foe's drops.normalItems value.
 * @returns {string[]} clean item names.
 */
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

// ═══════════════════════════════════════════════
// Orchestration (document access — GM-gated)
// ═══════════════════════════════════════════════

/**
 * Whether the current user may pay out combat rewards. Rewards mutate every party
 * member's EXP/macca/inventory, which is a world-wide write, so it is GM-only
 * (mirrors the GM gate fusion and the encounter-end stance cleanup use).
 * @returns {boolean}
 */
export function canGrantRewards() {
  return game.user.isGM;
}

/**
 * The configured macca distribution mode, read from the world setting and validated
 * against CONFIG.SMT.rewards.maccaDistributionModes; an unreadable/unknown value
 * falls back to the config default.
 * @returns {string}
 */
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

/**
 * Whether a token disposition is excluded from the defeated-foe harvest (p.48): a
 * friendly-disposition combatant that fell is a casualty, not loot. Reads the
 * CONFIG.SMT.rewards.excludedFoeDispositions names against foundry.CONST.
 * @param {number} disposition - a foundry.CONST.TOKEN_DISPOSITIONS value.
 * @returns {boolean}
 */
function _isExcludedFoeDisposition(disposition) {
  const D = foundry.CONST.TOKEN_DISPOSITIONS;
  return CONFIG.SMT.rewards.excludedFoeDispositions.some(name => D[name] === disposition);
}

/**
 * Harvest the defeated foes of an encounter (p.48): the distinct combatant actors
 * that ended at 0 HP and are NOT a friendly-disposition casualty. NPC foes and
 * hostile/neutral demons qualify; a downed PC/ally (friendly disposition) is
 * excluded so the party is never rewarded for its own losses. Deduped by actor so a
 * foe with several tokens is counted once.
 *
 * @param {Combat} combat - the ending encounter.
 * @returns {SMTActor[]} the defeated foe actors.
 */
export function harvestFoes(combat) {
  const foes = [];
  const seen = new Set();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant.actor;
    if (!actor || seen.has(actor.id)) continue;
    // Downed: 0 HP (the rules' "defeated"). A live combatant is not loot.
    if ((Number(actor.system?.hp?.value) || 0) > 0) continue;
    // Friendly-disposition casualties are not foes (the required p.48 fix). Read the
    // combatant's token disposition, falling back to the actor's prototype token.
    const disposition = combatant.token?.disposition
      ?? actor.prototypeToken?.disposition
      ?? foundry.CONST.TOKEN_DISPOSITIONS.HOSTILE;
    if (_isExcludedFoeDisposition(disposition)) continue;
    seen.add(actor.id);
    foes.push(actor);
  }
  return foes;
}

/**
 * The reward recipients of an encounter (p.48 "All characters who participated in
 * the combat, even if they are dead at the end of it, gain this EXP"): the distinct
 * RECIPIENT_TYPES combatant actors that are NOT among the harvested foes. Downed PCs
 * are kept (they still gain EXP); a foe is never also a recipient. Deduped by actor.
 *
 * @param {Combat} combat       - the ending encounter.
 * @param {SMTActor[]} foes     - the harvested foe actors (excluded from recipients).
 * @returns {SMTActor[]} the recipient actors.
 */
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

/**
 * Total the EXP, macca, and item drops of the harvested foes (p.46, p.48). EXP is
 * per-foe after the p.48 level-gap doubling (measured against the party level) and
 * summed — every participant later receives this full sum, never a divided share.
 * Macca is the plain sum of the foes' drops; loot is the deduped union of their
 * parsed item-name lists. All numeric drops are sanitized (author-forgeable).
 *
 * @param {SMTActor[]} foes       - the defeated foe actors.
 * @param {number}     partyLevel - the party level for the EXP-gap bonus.
 * @returns {{exp:number, macca:number, items:string[], breakdown:object[]}}
 */
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

/**
 * Grant an actor its EXP and per-recipient macca (p.48). EXP is added in full (never
 * divided); macca is the per-recipient share computed by the caller. Both adds are
 * clamped against CONFIG.SMT.rewards.maxValue overflow. One document write per actor.
 *
 * @param {SMTActor} actor       - the recipient.
 * @param {number}   exp         - EXP to add (in full).
 * @param {number}   maccaShare  - macca to add (the per-recipient share).
 * @returns {Promise<void>}
 */
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

/**
 * Create the looted items on a recipient as plain consumables (p.46 "find items").
 * Each name has already been sanitized by parseDropItems; the items are created as
 * generic consumables the GM can retype/price, carrying a flag marking their origin.
 *
 * @param {SMTActor} actor - the recipient to receive the loot.
 * @param {string[]} names - clean item names.
 * @returns {Promise<void>}
 */
async function _grantLootToActor(actor, names) {
  if (!names?.length) return;
  const itemData = names.map(name => ({
    name,
    type: "consumable",
    flags: { [FLAG_SCOPE]: { combatLoot: true } }
  }));
  await actor.createEmbeddedDocuments("Item", itemData);
}

/**
 * Pay out an encounter's combat rewards exactly once (p.46, p.48). GM-only. Harvests
 * the defeated foes (excluding friendly-disposition casualties), totals EXP/macca/
 * loot, grants EXP in full to every participant and macca per the distribution
 * setting, distributes loot (to the lowest-id recipient in shared mode, or to each
 * recipient in per-pc mode — matching the macca model), posts a summary card, and
 * stamps the combat so a later call is a no-op. Idempotent under the persisted
 * rewardsPaid flag plus the in-flight Set, so the auto- and manual-payout paths
 * cannot double-pay.
 *
 * @param {Combat} combat - the ending encounter.
 * @param {object} [options]
 * @param {boolean} [options.notifyEmpty=false] - warn (not just skip) when nothing is owed.
 * @returns {Promise<boolean>} true if a payout was made, false if blocked/skipped.
 */
export async function grantCombatRewards(combat, { notifyEmpty = false } = {}) {
  if (!canGrantRewards()) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.RewardsGM"));
    return false;
  }
  if (!combat) return false;

  // Idempotency (persisted): bail if this encounter already paid out.
  if (combat.getFlag(FLAG_SCOPE, PAID_KEY)) {
    if (notifyEmpty) ui.notifications.info(game.i18n.localize("SMT.Rewards.AlreadyPaid"));
    return false;
  }

  // Idempotency (in-flight): claim the combat id before the first await so a
  // concurrent auto/manual payout cannot also pass the flag check above.
  if (_inFlight.has(combat.id)) return false;
  _inFlight.add(combat.id);
  try {
    // Re-read the live flag now that we hold the claim (it may have been set between
    // the check above and the claim by an already-committed sibling call).
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
      // Nothing to pay (no foes, or foes carried no drops). Still stamp the combat
      // so repeated end-of-combat triggers do not re-scan, but post no card.
      await combat.setFlag(FLAG_SCOPE, PAID_KEY, true);
      if (notifyEmpty) ui.notifications.info(game.i18n.localize("SMT.Rewards.Nothing"));
      return false;
    }

    const mode = maccaDistributionMode();
    const perRecipientMacca = maccaShares(tally.macca, recipients.length, mode);

    // Lowest-id recipient is the de-facto party stash for shared-mode loot.
    const sortedRecipients = [...recipients].sort((a, b) => a.id.localeCompare(b.id));
    const lootHolders = mode === "per-pc" ? sortedRecipients : sortedRecipients.slice(0, 1);

    for (const actor of sortedRecipients) {
      await _grantToActor(actor, tally.exp, perRecipientMacca);
    }
    if (tally.items.length) {
      for (const holder of lootHolders) await _grantLootToActor(holder, tally.items);
    }

    // Stamp BEFORE posting the card so even a card-render failure cannot reopen the
    // payout window.
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

/**
 * Post the combat-reward summary card: the defeated foes with their EXP/macca, the
 * party-wide EXP grant, the macca distribution, and the loot found (p.46, p.48). GM
 * is the speaker.
 *
 * @param {object} params - see fields below.
 * @returns {Promise<void>}
 */
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
