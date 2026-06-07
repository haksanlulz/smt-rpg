import { SMT } from "./module/config.mjs";
import SMTActor from "./module/documents/actor.mjs";
import SMTItem from "./module/documents/item.mjs";
import SMTCombat from "./module/documents/combat.mjs";
import FiendData from "./module/data/fiend-data.mjs";
import DemonData from "./module/data/demon-data.mjs";
import HumanData from "./module/data/human-data.mjs";
import NPCData from "./module/data/npc-data.mjs";
import SkillData from "./module/data/skill-data.mjs";
import MagatamaData from "./module/data/magatama-data.mjs";
import GearData from "./module/data/gear-data.mjs";
import ConsumableData from "./module/data/consumable-data.mjs";
import SMTActorSheet from "./module/sheets/actor-sheet.mjs";
import SMTNPCSheet from "./module/sheets/npc-sheet.mjs";
import SMTItemSheet from "./module/sheets/item-sheet.mjs";

// Token-HUD icons for the single common-ailment slot and the two special
// ailment flags (p.67-68). Presentation only — the rules state of record is
// system.ailment / system.deathAilment / system.curseAilment, which these icons
// merely mirror (see syncAilmentStatus). Keyed by the CONFIG.SMT.ailments id so
// a registered status maps cleanly back onto that slot.
const AILMENT_ICONS = {
  death: "icons/svg/skull.svg",
  stone: "icons/svg/paralysis.svg",
  fly: "icons/svg/wing.svg",
  stun: "icons/svg/daze.svg",
  charm: "icons/svg/heal.svg",
  poison: "icons/svg/poison.svg",
  mute: "icons/svg/silenced.svg",
  restrain: "icons/svg/net.svg",
  freeze: "icons/svg/frozen.svg",
  sleep: "icons/svg/sleep.svg",
  panic: "icons/svg/stoned.svg",
  shock: "icons/svg/lightning.svg",
  curse: "icons/svg/terror.svg"
};

Hooks.once("init", () => {
  console.log("smt-rpg | Initializing Shin Megami Tensei: Tokyo Conception");

  CONFIG.SMT = SMT;
  SMT.debug = false; // toggle: CONFIG.SMT.debug = true

  game.settings.register("smt-rpg", "targetingMode", {
    name: "SMT.Settings.TargetingMode",
    hint: "SMT.Settings.TargetingModeHint",
    scope: "world",
    config: true,
    type: String,
    default: "combat",
    choices: {
      combat: "SMT.Settings.TargetingCombat",
      scene: "SMT.Settings.TargetingScene"
    }
  });

  // Demon fusion (p.79): a GM keybinding opens the fusion dialog. Dynamic import
  // keeps fusion.mjs out of the init bundle (mirrors the combat-helper pattern) and
  // the onDown handler is gated GM-side inside openFusionDialog.
  game.keybindings.register("smt-rpg", "openFusion", {
    name: "SMT.Keybind.OpenFusion",
    hint: "SMT.Keybind.OpenFusionHint",
    editable: [{ key: "KeyF", modifiers: ["Control", "Shift"] }],
    restricted: true, // GM only
    onDown: () => {
      import("./module/helpers/fusion.mjs").then(m => m.openFusionDialog());
      return true;
    }
  });

  CONFIG.Actor.dataModels.fiend = FiendData;
  CONFIG.Actor.dataModels.demon = DemonData;
  CONFIG.Actor.dataModels.human = HumanData;
  CONFIG.Actor.dataModels.npc = NPCData;

  CONFIG.Item.dataModels.skill = SkillData;
  CONFIG.Item.dataModels.magatama = MagatamaData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.consumable = ConsumableData;

  CONFIG.Actor.documentClass = SMTActor;
  CONFIG.Item.documentClass = SMTItem;
  // SMTCombat adds the rulebook's flat initiative tie-break die-off (p.63) on top
  // of the standard initiative roll below.
  CONFIG.Combat.documentClass = SMTCombat;

  // Initiative is declared authoritatively in system.json
  // ("1d10x10 + @agilityTotal", p.298). Mirror that one declaration onto
  // CONFIG.Combat.initiative so any runtime roll path agrees with it without
  // re-typing the formula here (SMTActor.getRollData exposes @agilityTotal).
  if (game.system.initiative) {
    CONFIG.Combat.initiative = { formula: game.system.initiative, decimals: 0 };
  }

  // Register the buff/stance and ailment statuses on the token HUD. CONCATENATE
  // onto Foundry's defaults — never replace them — so core conditions remain
  // available. Buff/stance ids and icons are the same ones the cast helpers use
  // (CONFIG.SMT.buffs[*].statusId / actionEffects[*].statusId), so a HUD toggle
  // and a cast share one definition; the ailment ids are the CONFIG.SMT.ailments
  // keys mirrored from the system.ailment slot.
  _registerStatusEffects();

  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("smt-rpg", SMTActorSheet, {
    types: ["fiend", "demon", "human"],
    makeDefault: true,
    label: "SMT.Sheet.Actor"
  });
  foundry.documents.collections.Actors.registerSheet("smt-rpg", SMTNPCSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "SMT.Sheet.NPC"
  });

  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("smt-rpg", SMTItemSheet, {
    makeDefault: true,
    label: "SMT.Sheet.Item"
  });

  CONFIG.Actor.trackableAttributes = {
    fiend: { bar: ["hp", "mp"], value: ["fatePoints"] },
    demon: { bar: ["hp", "mp"], value: ["fatePoints"] },
    human: { bar: ["hp", "mp"], value: ["fatePoints"] },
    npc: { bar: ["hp", "mp"], value: [] }
  };

  foundry.applications.handlebars.loadTemplates([
    "systems/smt-rpg/templates/actor/partials/stats.hbs",
    "systems/smt-rpg/templates/actor/partials/combat.hbs",
    "systems/smt-rpg/templates/actor/partials/skills.hbs",
    "systems/smt-rpg/templates/actor/partials/affinities.hbs",
    "systems/smt-rpg/templates/actor/partials/conditions.hbs",
    "systems/smt-rpg/templates/chat/percentile-roll.hbs",
    "systems/smt-rpg/templates/chat/power-roll.hbs",
    "systems/smt-rpg/templates/chat/auto-success.hbs",
    "systems/smt-rpg/templates/chat/damage-result.hbs",
    "systems/smt-rpg/templates/chat/attack-pending.hbs",
    "systems/smt-rpg/templates/chat/dodge-result.hbs",
    "systems/smt-rpg/templates/chat/ailment-result.hbs",
    "systems/smt-rpg/templates/chat/item-use.hbs",
    "systems/smt-rpg/templates/chat/fusion-result.hbs",
    "systems/smt-rpg/templates/chat/negotiation.hbs"
  ]);

  console.log("smt-rpg | System initialized");
});

/**
 * Register the buff/debuff, Concentrate/Defend, and ailment statuses on the token
 * HUD without discarding Foundry's defaults. Buff/stance ids are smt-prefixed and
 * never collide with core, so they are concatenated. Ailment ids reuse the
 * CONFIG.SMT.ailments keys (poison, stun, …) — some of which match a core status
 * id — so for those we OVERRIDE the matching core entry's label/icon in place
 * rather than append a duplicate, keeping exactly one HUD entry per id (the same
 * id syncAilmentStatus mirrors). Ids with no core match are appended. The list is
 * sourced from config so the HUD, the cast helpers, and the ailment SSoT agree.
 */
function _registerStatusEffects() {
  const list = [...CONFIG.statusEffects];
  const indexById = new Map(list.map((s, i) => [s.id, i]));

  const upsert = (id, name, img) => {
    if (indexById.has(id)) {
      list[indexById.get(id)] = { ...list[indexById.get(id)], id, name, img };
    } else {
      indexById.set(id, list.length);
      list.push({ id, name, img });
    }
  };

  // Buff / debuff statuses (p.96) — id + icon from CONFIG.SMT.buffs (smt-prefixed).
  for (const def of Object.values(SMT.buffs)) upsert(def.statusId, def.label, def.icon);
  // Concentrate / Defend setup-action statuses (p.64).
  for (const def of Object.values(SMT.actionEffects)) upsert(def.statusId, def.label, def.icon);
  // Ailment slot icons (p.67-68) — one per CONFIG.SMT.ailments id; overrides any
  // core status sharing the id so a single entry maps onto the system.ailment slot.
  for (const [id, label] of Object.entries(SMT.ailments)) {
    upsert(id, label, AILMENT_ICONS[id] ?? "icons/svg/aura.svg");
  }

  CONFIG.statusEffects = list;
}

// --- Chat message button handlers ---
Hooks.on("renderChatMessageHTML", (message, html) => {
  _bindAttackButtons(message, html);
  _bindFateCheckButtons(message, html);
  _bindFateDamageButtons(message, html);
  _bindNegotiationButtons(message, html);
});

// ═══════════════════════════════════════════════
// Shared-mutation client election
// ═══════════════════════════════════════════════
// Several hooks fire on every connected client but must run their write exactly
// once. Funnel each through one responsible client: the active GM if any GM is
// connected (writes succeed regardless of token ownership), otherwise the
// connected owner with the lowest user id. Keeps automation single-fire without
// a socket relay.
function _isResponsibleClient(actor) {
  if (game.users.some(u => u.active && u.isGM)) return game.user.isGM;
  const owner = game.users
    .filter(u => u.active && actor.testUserPermission(u, "OWNER"))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return owner?.id === game.user.id;
}

// ═══════════════════════════════════════════════
// Token-HUD status backfill (buff / stance casts via the HUD)
// ═══════════════════════════════════════════════
// Toggling a buff/debuff or Concentrate/Defend status from the token HUD creates
// a bare ActiveEffect with only its `statuses` set — no rolled magnitude and no
// ADD-mode changes. Back-fill one cast's worth of data (a rolled CONFIG.SMT.buffDie
// per buff axis, or the fixed Concentrate/Defend bonus) so a HUD toggle behaves
// exactly like casting the effect once. Runs only on the client that created the
// effect, and skips any effect already carrying our flag/changes (a real cast),
// so it never double-applies.
Hooks.on("createActiveEffect", async (effect, options, userId) => {
  if (game.user.id !== userId) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;

  // A cast made through effects.mjs already carries our bookkeeping flag and the
  // ADD-mode changes — leave it untouched.
  const flags = effect.flags?.["smt-rpg"];
  if (flags?.buff || flags?.concentrate || flags?.defend !== undefined) return;
  if (effect.changes?.length) return;

  const statusId = [...effect.statuses][0];
  if (!statusId) return;

  // Only buff/stance statuses are backfilled. Ailment statuses are mirrored from
  // system.ailment (syncAilmentStatus) and carry no magnitude, so they are skipped.
  const buffKey = Object.keys(SMT.buffs).find(k => SMT.buffs[k].statusId === statusId);
  const isConcentrate = statusId === SMT.actionEffects.concentrate.statusId;
  const isDefend = statusId === SMT.actionEffects.defend.statusId;
  if (!buffKey && !isConcentrate && !isDefend) return;

  if (!(game.user.isGM || actor.canUserModify(game.user, "update"))) return;

  if (buffKey) {
    const def = SMT.buffs[buffKey];
    // One non-exploding CONFIG.SMT.buffDie, signed, written as an ADD change per
    // axis — mirrors applyBuff's first-stack branch (p.96).
    const roll = await new Roll(SMT.buffDie).evaluate();
    const magnitude = (Number(roll.total) || 0) * def.sign;
    const changes = def.axes.map(axis => ({
      key: `system.buffs.${axis}`,
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      value: String(magnitude)
    }));
    await effect.update({
      name: `${game.i18n.localize(def.label)} ×1`,
      changes,
      "flags.smt-rpg.buff": { effect: buffKey, group: def.group, stacks: 1 }
    });
  } else if (isConcentrate) {
    const bonus = SMT.concentrate.bonusPct;
    await effect.update({
      name: `${game.i18n.localize(SMT.actionEffects.concentrate.label)} +${bonus}%`,
      changes: [{ key: "system.concentrate.amount", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(bonus) }],
      // Empty action: a HUD-toggled Concentrate applies to the next named action,
      // since consumeConcentrate treats a falsy held action as "any" (p.64).
      "flags.smt-rpg.concentrate": { action: "" }
    });
  } else {
    const bonus = SMT.defend.dodgeBonus;
    await effect.update({
      name: `${game.i18n.localize(SMT.actionEffects.defend.label)} +${bonus}%`,
      changes: [{ key: "system.defend.amount", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(bonus) }],
      "flags.smt-rpg.defend": true
    });
  }
});

// ═══════════════════════════════════════════════
// Actor ailment automation
// ═══════════════════════════════════════════════
// When system.ailment changes:
//   (a) a new common ailment landing drops the actor's Concentrate (p.64) — a
//       held setup bonus is lost the moment an ailment takes hold;
//   (b) the token-HUD ailment icons are re-mirrored from the single source of
//       truth (system.ailment + the death/curse flags) via syncAilmentStatus.
// One-directional (slot → HUD) and idempotent: it only ever creates/deletes the
// ailment-tagged ActiveEffects it owns and never writes system.ailment, so it
// cannot loop with itself or with the createActiveEffect backfill above.
// Funnelled through the responsible client so the writes happen exactly once.
Hooks.on("updateActor", async (actor, changed) => {
  const ailmentChanged = changed.system?.ailment !== undefined;
  const deathChanged = changed.system?.deathAilment !== undefined;
  const curseChanged = changed.system?.curseAilment !== undefined;
  if (!ailmentChanged && !deathChanged && !curseChanged) return;
  if (!_isResponsibleClient(actor)) return;

  const { dropConcentrateOnAilment } = await import("./module/helpers/effects.mjs");

  // (a) A new common ailment (not a clear to "none") drops Concentrate (p.64).
  if (ailmentChanged && changed.system.ailment !== "none") {
    await dropConcentrateOnAilment(actor);
  }

  // (b) Mirror the ailment slot + special flags onto the HUD.
  await _syncAilmentStatus(actor);
});

/**
 * Mirror an actor's ailment state onto its token-HUD status icons (p.67-68).
 * The single common-ailment slot (system.ailment) plus the two special flags
 * (system.deathAilment / system.curseAilment) are the source of truth; this only
 * adds/removes the ailment-tagged ActiveEffects it owns to match. At most one
 * common-slot icon shows at a time (priority replaces, p.68); Death and Curse
 * stack alongside it as their own icons. Stale ailment effects are removed first.
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
async function _syncAilmentStatus(actor) {
  const ailmentIds = Object.keys(SMT.ailments);

  // Desired ailment ids: the one common slot, plus any active special flags.
  const desired = new Set();
  const current = actor.system.ailment ?? "none";
  if (current !== "none") desired.add(current);
  if (actor.system.deathAilment) desired.add("death");
  if (actor.system.curseAilment) desired.add("curse");

  // Remove any ailment-tagged effect we own whose id is no longer desired.
  const stale = actor.effects.filter(e => {
    if (e.getFlag("smt-rpg", "ailment") === undefined) return false;
    return [...e.statuses].some(s => ailmentIds.includes(s) && !desired.has(s));
  });
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));

  // Add an icon for any desired ailment not already shown.
  const toCreate = [];
  for (const id of desired) {
    if (actor.effects.some(e => e.statuses.has(id))) continue;
    toCreate.push({
      name: game.i18n.localize(SMT.ailments[id] ?? id),
      img: AILMENT_ICONS[id] ?? "icons/svg/aura.svg",
      statuses: [id],
      flags: { "smt-rpg": { ailment: id } }
    });
  }
  if (toCreate.length) await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
}

// ═══════════════════════════════════════════════
// Start-of-turn automation (p.64, p.66-68)
// ═══════════════════════════════════════════════
// When a combatant's turn begins:
//   (a) their Defend stance expires — Defend lasts only until the start of their
//       next turn (p.64);
//   (b) their common ailment resolves its start-of-turn effect (p.66-68):
//       Freeze/Shock auto-recover, Sleep regenerates HP/MP, Panic may force a random
//       action off the Panic table, and a fully incapacitating ailment posts a
//       "cannot act" notice. Defend is cleared first so a turn the ailment then skips
//       does not leave a now-irrelevant stance lingering.
// The hook fires on every client, so both writes are funnelled through the
// responsible client (the active GM if connected, so they succeed regardless of
// token ownership; otherwise the actor's lowest-id owner). combat.combatant is the
// new current combatant after the turn/round change.
Hooks.on("updateCombat", async (combat, changed) => {
  if (!("turn" in changed || "round" in changed)) return;
  const actor = combat.combatant?.actor;
  if (!actor) return;
  if (!_isResponsibleClient(actor)) return;
  const { clearDefend, processAilmentTurnStart } = await import("./module/helpers/effects.mjs");
  await clearDefend(actor);
  await processAilmentTurnStart(actor);
});

// Encounter end: clear any lingering temporary setup-action stances (Defend and
// Concentrate, p.64) from every combatant so they never bleed across encounters.
// Buff/debuff effects persist by design (no rules basis for auto-clearing them
// here) and are managed via Dekaja/Dekunda or manual removal. Run as the active
// GM so the batch clears every combatant regardless of token ownership.
Hooks.on("deleteCombat", async (combat) => {
  if (!game.user.isGM) return;
  const { clearDefend, dropConcentrateOnAilment } = await import("./module/helpers/effects.mjs");
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    await clearDefend(actor);
    // dropConcentrateOnAilment deletes the Concentrate effect if present; the
    // name reflects its other caller, but the action (clear Concentrate) is the
    // same one wanted at encounter end.
    await dropConcentrateOnAilment(actor);
  }
});

async function _bindAttackButtons(message, html) {
  const attackData = message.getFlag("smt-rpg", "attackData");
  if (!attackData) return;
  if (attackData.resolved) {
    html.querySelector(".attack-buttons")?.remove();
    return;
  }
  const { resolveAttack, getActorFromTokenUuid } = await import("./module/helpers/combat.mjs");

  // Only the GM or an owner of the target (whose HP/ailment/dodge this mutates) may
  // resolve the attack. Flags are author-forgeable, so this gate is the access control
  // until a GM-socket relay lands (later). Non-permitted users see disabled buttons.
  const target = getActorFromTokenUuid(attackData.targetTokenUuid);
  const dodgeBtn = html.querySelector("[data-action='dodge']");
  const applyBtn = html.querySelector("[data-action='apply-damage']");
  if (!target || !(game.user.isGM || target.canUserModify(game.user, "update"))) {
    if (dodgeBtn) dodgeBtn.disabled = true;
    if (applyBtn) applyBtn.disabled = true;
    return;
  }

  // Disable BOTH buttons on the first click so the in-flight dodge roll cannot be
  // raced against Apply-damage (resolveAttack also re-checks the resolved flag).
  const disableBoth = () => {
    if (dodgeBtn) dodgeBtn.disabled = true;
    if (applyBtn) applyBtn.disabled = true;
  };

  dodgeBtn?.addEventListener("click", async (event) => {
    event.preventDefault();
    disableBoth();
    await resolveAttack(message, attackData, false);
  });
  applyBtn?.addEventListener("click", async (event) => {
    event.preventDefault();
    disableBoth();
    await resolveAttack(message, attackData, true);
  });
}

async function _bindFateCheckButtons(message, html) {
  const checkData = message.getFlag("smt-rpg", "checkData");
  if (!checkData || checkData.resolved) return;
  const { getActorFromTokenUuid } = await import("./module/helpers/combat.mjs");
  const actor = getActorFromTokenUuid(checkData.actorTokenUuid);
  if (!actor || actor.system.fatePoints.value <= 0) return;
  // Only the GM or an owner of the acting actor may spend its Fate Points.
  if (!(game.user.isGM || actor.canUserModify(game.user, "update"))) return;
  const container = html.querySelector(".fate-buttons");
  if (!container || container.hasChildNodes()) return;

  const rerollBtn = document.createElement("button");
  rerollBtn.type = "button";
  rerollBtn.dataset.action = "fate-reroll";
  rerollBtn.textContent = game.i18n.localize("SMT.FateReroll");
  rerollBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    const { resolveCheckReroll } = await import("./module/helpers/combat.mjs");
    await resolveCheckReroll(message, message.getFlag("smt-rpg", "checkData"));
  });

  const boostBtn = document.createElement("button");
  boostBtn.type = "button";
  boostBtn.dataset.action = "fate-boost";
  boostBtn.textContent = game.i18n.localize("SMT.FateBoostTN");
  boostBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    const { resolveCheckBoost } = await import("./module/helpers/combat.mjs");
    await resolveCheckBoost(message, message.getFlag("smt-rpg", "checkData"));
  });

  container.append(rerollBtn, boostBtn);
}

async function _bindFateDamageButtons(message, html) {
  const damageData = message.getFlag("smt-rpg", "damageData");
  if (!damageData || damageData.resolved) return;
  const { getActorFromTokenUuid } = await import("./module/helpers/combat.mjs");
  const target = getActorFromTokenUuid(damageData.targetTokenUuid);
  if (!target || target.system.fatePoints.value <= 0 || damageData.currentDamage <= 0) return;
  // Only the GM or an owner of the damaged target may spend its Fate Points.
  if (!(game.user.isGM || target.canUserModify(game.user, "update"))) return;
  const container = html.querySelector(".fate-buttons");
  if (!container || container.hasChildNodes()) return;

  const halveBtn = document.createElement("button");
  halveBtn.type = "button";
  halveBtn.dataset.action = "fate-halve";
  halveBtn.textContent = game.i18n.localize("SMT.FateHalveDamage");
  halveBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    const { resolveHalveDamage } = await import("./module/helpers/combat.mjs");
    await resolveHalveDamage(message, message.getFlag("smt-rpg", "damageData"));
  });

  container.append(halveBtn);
}

/**
 * Bind the negotiation card's GM-driven controls (p.73-76): the demand-roll buttons
 * (None/Macca/HP/Item) and the terminal-outcome buttons (Deal/Gift/Leave/Angry/Break).
 * Mirrors the attack-button protocol: strips the controls once the card is resolved,
 * gates so only the GM or an owner of the talker/target can drive it (negotiation is a
 * GM-mediated flow whose writes touch those actors), and resolves via dynamic import
 * into negotiation.mjs. Demand buttons stay live across clicks (a negotiation makes
 * several demands before a Deal/Break, p.75); an outcome button spends the card, so
 * all outcome buttons are disabled on the first outcome click to avoid a race.
 */
async function _bindNegotiationButtons(message, html) {
  const data = message.getFlag("smt-rpg", "negotiationData");
  if (!data) return;
  if (data.resolved) {
    html.querySelector(".negotiation-buttons")?.remove();
    return;
  }
  const { getActorFromTokenUuid } = await import("./module/helpers/combat.mjs");
  const talker = getActorFromTokenUuid(data.talkerTokenUuid);
  const target = getActorFromTokenUuid(data.targetTokenUuid);

  const buttons = [...html.querySelectorAll(".negotiation-buttons button")];
  // Gate: GM, or an owner of either side whose state a resolver mutates (the demon's
  // recruit flag / the talker's HP). Non-permitted users see disabled controls.
  const permitted = game.user.isGM
    || (talker && talker.canUserModify(game.user, "update"))
    || (target && target.canUserModify(game.user, "update"));
  if (!permitted) {
    for (const btn of buttons) btn.disabled = true;
    return;
  }

  const outcomeBtns = buttons.filter(b => b.dataset.action === "negotiation-outcome");

  for (const btn of buttons) {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const { resolveDemand, resolveNegotiationOutcome } = await import("./module/helpers/negotiation.mjs");
      if (btn.dataset.action === "negotiation-demand") {
        // Demands repeat; disable just this button briefly so a double-click cannot
        // double-post the same demand, then re-enable for the next demand.
        btn.disabled = true;
        try {
          await resolveDemand(message, btn.dataset.kind);
        } finally {
          btn.disabled = false;
        }
      } else {
        // Outcome spends the card: disable every outcome button up front so the
        // in-flight resolution cannot be raced (resolveNegotiationOutcome also
        // re-reads the resolved flag).
        for (const o of outcomeBtns) o.disabled = true;
        await resolveNegotiationOutcome(message, btn.dataset.outcome);
      }
    });
  }
}
