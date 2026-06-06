import { SMT } from "./module/config.mjs";
import SMTActor from "./module/documents/actor.mjs";
import SMTItem from "./module/documents/item.mjs";
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
    "systems/smt-rpg/templates/chat/percentile-roll.hbs",
    "systems/smt-rpg/templates/chat/power-roll.hbs",
    "systems/smt-rpg/templates/chat/auto-success.hbs",
    "systems/smt-rpg/templates/chat/damage-result.hbs",
    "systems/smt-rpg/templates/chat/attack-pending.hbs",
    "systems/smt-rpg/templates/chat/dodge-result.hbs",
    "systems/smt-rpg/templates/chat/ailment-result.hbs",
    "systems/smt-rpg/templates/chat/item-use.hbs"
  ]);

  console.log("smt-rpg | System initialized");
});

// --- Chat message button handlers ---
Hooks.on("renderChatMessageHTML", (message, html) => {
  _bindAttackButtons(message, html);
  _bindFateCheckButtons(message, html);
  _bindFateDamageButtons(message, html);
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
