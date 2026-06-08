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

// Token-HUD ailment icons, keyed by CONFIG.SMT.ailments id (p.67-68). Mirror system.ailment; see syncAilmentStatus.
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

  // Macca split model for combat-end rewards (p.48). EXP is always full per participant.
  game.settings.register("smt-rpg", "maccaDistribution", {
    name: "SMT.Settings.MaccaDistribution",
    hint: "SMT.Settings.MaccaDistributionHint",
    scope: "world",
    config: true,
    type: String,
    default: SMT.rewards.maccaDistributionDefault,
    choices: SMT.rewards.maccaDistributionModes
  });

  // Auto-pay combat rewards on encounter end (p.46, p.48); off = manual via tracker control.
  game.settings.register("smt-rpg", "autoGrantRewards", {
    name: "SMT.Settings.AutoGrantRewards",
    hint: "SMT.Settings.AutoGrantRewardsHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // GM keybind opens the fusion dialog (p.79). Dynamic import keeps fusion.mjs out of init.
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
  // SMTCombat adds the initiative tie-break die-off (p.63).
  CONFIG.Combat.documentClass = SMTCombat;

  // Mirror the system.json initiative formula (p.298) so runtime roll paths agree with it.
  if (game.system.initiative) {
    CONFIG.Combat.initiative = { formula: game.system.initiative, decimals: 0 };
  }

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
    "systems/smt-rpg/templates/chat/ailment-save.hbs",
    "systems/smt-rpg/templates/chat/item-use.hbs",
    "systems/smt-rpg/templates/chat/fusion-result.hbs",
    "systems/smt-rpg/templates/chat/negotiation.hbs",
    "systems/smt-rpg/templates/chat/reward-result.hbs"
  ]);

  console.log("smt-rpg | System initialized");
});

// Register buff/stance/ailment statuses on the HUD, concatenating onto core defaults.
// Ailment ids reuse CONFIG.SMT.ailments keys; ids matching a core status override it in place.
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

  // Buff / debuff statuses (p.96).
  for (const def of Object.values(SMT.buffs)) upsert(def.statusId, def.label, def.icon);
  // Concentrate / Defend (p.64).
  for (const def of Object.values(SMT.actionEffects)) upsert(def.statusId, def.label, def.icon);
  // Ailment slot icons (p.67-68); overrides any core status sharing the id.
  for (const [id, label] of Object.entries(SMT.ailments)) {
    upsert(id, label, AILMENT_ICONS[id] ?? "icons/svg/aura.svg");
  }

  CONFIG.statusEffects = list;
}

// Chat message button handlers
Hooks.on("renderChatMessageHTML", (message, html) => {
  _bindAttackButtons(message, html);
  _bindFateCheckButtons(message, html);
  _bindFateDamageButtons(message, html);
  _bindNegotiationButtons(message, html);
});

// Elect one responsible client so a hook that fires everywhere writes once: active GM if
// any is connected, else the lowest-id connected owner.
function _isResponsibleClient(actor) {
  if (game.users.some(u => u.active && u.isGM)) return game.user.isGM;
  const owner = game.users
    .filter(u => u.active && actor.testUserPermission(u, "OWNER"))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return owner?.id === game.user.id;
}

// Lowest-id active GM, for a world-wide write (e.g. reward payout) that must run on one client
// even with several GMs connected.
function _isResponsibleGM() {
  const gm = game.users
    .filter(u => u.active && u.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return gm?.id === game.user.id;
}

// Toggling a buff/stance status from the token HUD makes a bare ActiveEffect (statuses only).
// Backfill one cast's worth of magnitude/changes so a HUD toggle matches casting once.
Hooks.on("createActiveEffect", async (effect, options, userId) => {
  if (game.user.id !== userId) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;

  // A real cast already carries our flag + changes — leave it untouched.
  const flags = effect.flags?.["smt-rpg"];
  if (flags?.buff || flags?.concentrate || flags?.defend !== undefined) return;
  if (effect.changes?.length) return;

  const statusId = [...effect.statuses][0];
  if (!statusId) return;

  // Only buff/stance statuses backfill; ailments are mirrored from system.ailment and skipped.
  const buffKey = Object.keys(SMT.buffs).find(k => SMT.buffs[k].statusId === statusId);
  const isConcentrate = statusId === SMT.actionEffects.concentrate.statusId;
  const isDefend = statusId === SMT.actionEffects.defend.statusId;
  if (!buffKey && !isConcentrate && !isDefend) return;

  if (!(game.user.isGM || actor.canUserModify(game.user, "update"))) return;

  if (buffKey) {
    const def = SMT.buffs[buffKey];
    // One signed buffDie as an ADD change per axis; mirrors applyBuff's first-stack branch (p.96).
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
      // Empty action: consumeConcentrate treats a falsy held action as "any" (p.64).
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

// Ailment automation: a new common ailment drops Concentrate (p.64), then re-mirror the HUD
// icons from system.ailment + death/curse flags. Slot → HUD only, idempotent.
Hooks.on("updateActor", async (actor, changed) => {
  const ailmentChanged = changed.system?.ailment !== undefined;
  const deathChanged = changed.system?.deathAilment !== undefined;
  const curseChanged = changed.system?.curseAilment !== undefined;
  if (!ailmentChanged && !deathChanged && !curseChanged) return;
  if (!_isResponsibleClient(actor)) return;

  const { dropConcentrateOnAilment } = await import("./module/helpers/effects.mjs");

  if (ailmentChanged && changed.system.ailment !== "none") {
    await dropConcentrateOnAilment(actor);
  }

  await _syncAilmentStatus(actor);
});

// Mirror system.ailment + death/curse flags onto the HUD icons (p.67-68). One common-slot
// icon at a time; Death/Curse stack alongside. Removes stale ailment effects first.
async function _syncAilmentStatus(actor) {
  const ailmentIds = Object.keys(SMT.ailments);

  // Desired ids: the common slot plus any active special flags.
  const desired = new Set();
  const current = actor.system.ailment ?? "none";
  if (current !== "none") desired.add(current);
  if (actor.system.deathAilment) desired.add("death");
  if (actor.system.curseAilment) desired.add("curse");

  // Remove any owned ailment effect whose id is no longer desired.
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

// Start-of-turn automation (p.64, p.66-68): expire Defend, then resolve the common ailment's
// start-of-turn effect. Defend clears first. Funnelled through the responsible client.
Hooks.on("updateCombat", async (combat, changed) => {
  if (!("turn" in changed || "round" in changed)) return;
  const actor = combat.combatant?.actor;
  if (!actor) return;
  if (!_isResponsibleClient(actor)) return;
  const { clearDefend, processAilmentTurnStart, attemptAilmentSave } = await import("./module/helpers/effects.mjs");
  await clearDefend(actor);
  await processAilmentTurnStart(actor);
  // Start-of-turn save against a save-eligible ailment (p.69); no-op otherwise.
  await attemptAilmentSave(actor);
});

// Encounter end: pay out rewards (p.46, p.48), then clear Defend/Concentrate (p.64) from every
// combatant. Rewards run first (end-state HP still readable) and only if auto-grant is on; the
// payout is idempotent. Buff/debuff effects persist by design.
Hooks.on("deleteCombat", async (combat) => {
  if (!game.user.isGM) return;

  // Single elected GM so multiple GM clients cannot race the rewardsPaid flag.
  if (_isResponsibleGM() && game.settings.get("smt-rpg", "autoGrantRewards")) {
    const { grantCombatRewards } = await import("./module/helpers/rewards.mjs");
    await grantCombatRewards(combat);
  }

  const { clearDefend, dropConcentrateOnAilment } = await import("./module/helpers/effects.mjs");
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    await clearDefend(actor);
    // Despite the name, this just clears the Concentrate effect — what we want here too.
    await dropConcentrateOnAilment(actor);
  }
});

// Inject a GM-only "pay out rewards" button into the Combat Tracker controls (p.46, p.48).
// Added once per render; calls the same idempotent grantCombatRewards the auto-payout uses.
// Native control rather than a header-control hook: hook-added AppV2 header controls can't run
// a custom click handler.
Hooks.on("renderCombatTracker", (app, html, data) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root?.querySelector) return;

  const combat = data?.combat ?? app?.viewed ?? game.combat;
  if (!combat) return;

  // Re-render safety: never add a second button.
  if (root.querySelector("[data-action='smt-grant-rewards']")) return;

  // Controls bar across v13/v14 markup; fall back to root if the container class shifts.
  const controls = root.querySelector(".combat-controls")
    ?? root.querySelector("#combat-controls")
    ?? root.querySelector("nav.combat-controls")
    ?? root.querySelector(".combat-tracker-controls")
    ?? root;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "smt-grant-rewards";
  button.classList.add("smt-grant-rewards");
  button.innerHTML = `<i class="fas fa-coins"></i> ${game.i18n.localize("SMT.Rewards.PayOut")}`;
  button.title = game.i18n.localize("SMT.Rewards.PayOutHint");
  // Disable if already paid out.
  if (combat.getFlag("smt-rpg", "rewardsPaid")) {
    button.disabled = true;
    button.classList.add("paid");
  }
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    button.disabled = true;
    const { grantCombatRewards } = await import("./module/helpers/rewards.mjs");
    await grantCombatRewards(combat, { notifyEmpty: true });
  });

  controls.appendChild(button);
});

async function _bindAttackButtons(message, html) {
  const attackData = message.getFlag("smt-rpg", "attackData");
  if (!attackData || !Array.isArray(attackData.targets)) return;
  if (attackData.resolved) {
    html.querySelectorAll(".attack-buttons").forEach(el => el.remove());
    return;
  }
  const { resolveAttack, getActorFromTokenUuid } = await import("./module/helpers/combat.mjs");

  // Bind each target row independently; only the GM/target-owner may resolve that row.
  for (const rowEl of html.querySelectorAll(".attack-target-row")) {
    const index = Number(rowEl.dataset.index);
    const row = attackData.targets[index];
    const dodgeBtn = rowEl.querySelector("[data-action='dodge']");
    const applyBtn = rowEl.querySelector("[data-action='apply-damage']");
    if (!row || row.resolved) {
      rowEl.querySelector(".attack-buttons")?.remove();
      continue;
    }

    const target = getActorFromTokenUuid(row.targetTokenUuid);
    if (!target || !(game.user.isGM || target.canUserModify(game.user, "update"))) {
      if (dodgeBtn) dodgeBtn.disabled = true;
      if (applyBtn) applyBtn.disabled = true;
      continue;
    }

    // Disable both in this row on first click so an in-flight dodge can't be raced against Apply.
    const disableBoth = () => {
      if (dodgeBtn) dodgeBtn.disabled = true;
      if (applyBtn) applyBtn.disabled = true;
    };
    dodgeBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      disableBoth();
      await resolveAttack(message, index, false);
    });
    applyBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      disableBoth();
      await resolveAttack(message, index, true);
    });
  }
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

// Bind the negotiation card's demand and outcome buttons (p.73-76). Demands stay live across
// clicks; an outcome spends the card, so all outcome buttons disable on the first outcome click.
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
  // Gate: GM, or an owner of either side a resolver mutates.
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
        // Disable just this button briefly so a double-click can't double-post the demand.
        btn.disabled = true;
        try {
          await resolveDemand(message, btn.dataset.kind);
        } finally {
          btn.disabled = false;
        }
      } else {
        // Outcome spends the card: disable every outcome button up front against a race.
        for (const o of outcomeBtns) o.disabled = true;
        await resolveNegotiationOutcome(message, btn.dataset.outcome);
      }
    });
  }
}
