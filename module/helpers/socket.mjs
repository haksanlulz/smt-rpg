// GM-proxy relay for remote play.
//
// The multi-phase combat pipeline mutates documents the clicking user often cannot
// touch: the attack card's flags belong to the attacker's author, a repelled hit
// updates the ATTACKER from the defender's click, a cast buff creates Active Effects
// on the whole other side, and negotiation moves items between two actors. On a solo
// GM client every one of those succeeds silently; on a player client every one is a
// permission error. This module routes them: a GM runs the handler locally —
// byte-for-byte today's behavior — and a player emits the action to the active GM's
// client, which executes the same handler.
//
// THE PAYLOAD RULE, load-bearing: an emitted payload carries IDS AND ENUM KEYS ONLY —
// message ids, token uuids, config keys, a row index. Never a damage number, never a
// power, never an HP value. The GM-side handler re-reads everything numeric from the
// message flags and documents it already trusts, which is the same author-forgeable-
// flags discipline the sanitizers in combat.mjs exist for. A forged socket payload
// can therefore at worst press a button that exists, never invent a number.
//
// The pure core (routes, registry, validation) has no Foundry access and is covered
// by test/socket-relay.test.mjs; the dispatch layer is Foundry-coupled and is not.

export const SOCKET_NAME = "system.smt-rpg";

// Every relayable action and the EXACT payload keys it accepts. `types` are checked
// by validRelayPayload; extra keys reject the payload outright.
export const RELAY_ACTIONS = {
  resolveAttack: { messageId: "string", index: "number", skipDodge: "boolean" },
  halveDamage: { messageId: "string" },
  luckSmiles: { messageId: "string", index: "number" },
  counterAttack: { messageId: "string" },
  negotiationDemand: { messageId: "string", kind: "string" },
  negotiationOutcome: { messageId: "string", outcome: "string" },
  buffCast: { casterTokenUuid: "string", targetTokenUuids: "string[]", key: "string" },
  buffClear: { casterTokenUuid: "string", targetTokenUuids: "string[]", key: "string" },
  provoke: { casterTokenUuid: "string", targetTokenUuids: "string[]" },
  // No `round` key, and that is a decision rather than an omission. p.101's clock
  // starts when the barrier is CAST, so carrying the caster's round would be very
  // slightly more correct than re-reading it GM-side — but the payload allowlist is
  // the constraint this whole module exists to hold, and widening it permanently to
  // close a window measured in milliseconds is the wrong trade. The GM re-reads
  // game.combat.round like it re-reads every other number.
  barrierRaise: { casterTokenUuid: "string", targetTokenUuids: "string[]", kind: "string" }
};

// Words that must never appear as payload keys: if one does, someone is trying to
// carry a computed number across the wire instead of letting the GM re-read it.
export const FORBIDDEN_PAYLOAD_KEYS =
  ["rawPower", "power", "damage", "hp", "mp", "total", "amount", "rate", "tn"];

// Where a call runs. GMs always run locally (identical to the solo behavior);
// players relay to the active GM; with no GM connected the action is refused
// rather than half-run.
export function relayRoute({ isGM, hasActiveGM }) {
  if (isGM) return "local";
  if (hasActiveGM) return "emit";
  return "blocked";
}

export function validRelayPayload(action, data) {
  const spec = RELAY_ACTIONS[action];
  if (!spec || typeof data !== "object" || data === null) return false;
  const keys = Object.keys(data);
  if (keys.length !== Object.keys(spec).length) return false;
  for (const [key, type] of Object.entries(spec)) {
    const v = data[key];
    if (type === "string" && typeof v !== "string") return false;
    if (type === "number" && (!Number.isInteger(v) || v < 0)) return false;
    if (type === "boolean" && typeof v !== "boolean") return false;
    if (type === "string[]" && (!Array.isArray(v) || v.some(s => typeof s !== "string"))) return false;
  }
  return true;
}

// ---------------------------------------------------------------- Foundry side

export function registerRelay() {
  game.socket.on(SOCKET_NAME, async ({ action, data } = {}) => {
    // Exactly one client executes: the active GM's.
    if (!game.users.activeGM?.isSelf) return;
    if (!validRelayPayload(action, data)) {
      console.warn("smt-rpg | relay refused a malformed payload", { action, data });
      return;
    }
    await dispatchRelay(action, data);
  });
}

// Route a UI action. GM → run now; player → hand it to the GM; nobody → refuse loudly.
export async function runRelayed(action, data) {
  if (!validRelayPayload(action, data)) {
    throw new Error(`smt-rpg relay: malformed payload for ${action}`);
  }
  const route = relayRoute({
    isGM: game.user.isGM,
    hasActiveGM: !!game.users.activeGM
  });
  if (route === "local") return dispatchRelay(action, data);
  if (route === "blocked") {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoActiveGM"));
    return null;
  }
  game.socket.emit(SOCKET_NAME, { action, data });
  return null;
}

// The handlers. Ids in, documents re-read, existing helpers run — nothing here
// computes a number the flags do not already carry.
async function dispatchRelay(action, data) {
  const combat = () => import("./combat.mjs");
  const message = "messageId" in data ? game.messages.get(data.messageId) : null;
  if ("messageId" in data && !message) return;

  switch (action) {
    case "resolveAttack": {
      const { resolveAttack } = await combat();
      return resolveAttack(message, data.index, data.skipDodge);
    }
    case "halveDamage": {
      const { resolveHalveDamage } = await combat();
      const damageData = message.getFlag("smt-rpg", "damageData");
      if (damageData) return resolveHalveDamage(message, damageData);
      return null;
    }
    case "luckSmiles": {
      const { resolveLuckSmiles } = await combat();
      return resolveLuckSmiles(message, data.index);
    }
    case "counterAttack": {
      const { resolveCounterAttack } = await combat();
      const counterData = message.getFlag("smt-rpg", "counterData");
      if (counterData) return resolveCounterAttack(message, counterData);
      return null;
    }
    case "negotiationDemand": {
      const { resolveDemand } = await import("./negotiation.mjs");
      return resolveDemand(message, data.kind);
    }
    case "negotiationOutcome": {
      const { resolveNegotiationOutcome } = await import("./negotiation.mjs");
      return resolveNegotiationOutcome(message, data.outcome);
    }
    case "buffCast": {
      const { applyBuff, postBuffCard } = await import("./effects.mjs");
      const { getActorFromTokenUuid } = await combat();
      const caster = getActorFromTokenUuid(data.casterTokenUuid);
      for (const uuid of data.targetTokenUuids) {
        const target = getActorFromTokenUuid(uuid);
        if (!target) continue;
        const summary = await applyBuff(target, data.key, { source: caster });
        await postBuffCard(caster, summary);
      }
      return null;
    }
    case "buffClear": {
      const { clearBuffGroup, postEffectNotice } = await import("./effects.mjs");
      const { getActorFromTokenUuid } = await combat();
      const caster = getActorFromTokenUuid(data.casterTokenUuid);
      const group = CONFIG.SMT.buffDispels[data.key];
      if (!group) return null;
      let cleared = 0;
      for (const uuid of data.targetTokenUuids) {
        const target = getActorFromTokenUuid(uuid);
        if (target) cleared += await clearBuffGroup(target, group);
      }
      const label = game.i18n.localize(CONFIG.SMT.buffEffectChoices[data.key]);
      await postEffectNotice(caster,
        game.i18n.format("SMT.EffectMsg.Dispelled", { skill: label, count: cleared }));
      return null;
    }
    case "barrierRaise": {
      const { applyBarrier, postEffectNotice } = await import("./effects.mjs");
      const { getActorFromTokenUuid } = await combat();
      if (!CONFIG.SMT.barriers[data.kind]) return null;
      const caster = getActorFromTokenUuid(data.casterTokenUuid);
      // Outside a started combat there is no round for p.101's clock to count from,
      // and the barrier then stands until combat end. See the payload note above for
      // why this is re-read here rather than carried.
      const round = game.combat?.started ? game.combat.round : null;
      const names = [];
      for (const uuid of data.targetTokenUuids) {
        const ally = getActorFromTokenUuid(uuid);
        if (!ally) continue;
        if (await applyBarrier(ally, data.kind, { round })) names.push(ally.name);
      }
      if (names.length) {
        await postEffectNotice(caster, game.i18n.format("SMT.Barrier.Raised", {
          barrier: game.i18n.localize(CONFIG.SMT.barriers[data.kind].label),
          names: names.join(", ")
        }));
      }
      return null;
    }
    case "provoke": {
      const { applyProvoke } = await import("./effects.mjs");
      const { getActorFromTokenUuid } = await combat();
      const caster = getActorFromTokenUuid(data.casterTokenUuid);
      const lines = [];
      for (const uuid of data.targetTokenUuids) {
        const foe = getActorFromTokenUuid(uuid);
        if (!foe) continue;
        const res = await applyProvoke(foe, { source: caster });
        if (res) lines.push(`${foe.name}: −${res.amount} resist, +${res.amount} power`);
      }
      if (lines.length) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: caster }),
          content: `<div class="smt-roll effect-notice"><p>${lines.join("<br>")}</p></div>`
        });
      }
      return null;
    }
  }
  return null;
}
