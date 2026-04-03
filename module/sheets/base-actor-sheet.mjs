import { SMT } from "../config.mjs";
import { ELEMENTS, AILMENT_ELEMENTS, STATS } from "../data/fields.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class SMTBaseActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["smt-rpg", "actor-sheet"],
    tag: "form",
    form: {
      submitOnChange: true
    },
    window: {
      resizable: true
    },
    actions: {
      rollCheck: SMTBaseActorSheet.#onRollCheck,
      strike: SMTBaseActorSheet.#onStrike,
      shoot: SMTBaseActorSheet.#onShoot,
      useSkill: SMTBaseActorSheet.#onUseSkill,
      useItem: SMTBaseActorSheet.#onUseItem,
      editItem: SMTBaseActorSheet.#onEditItem,
      deleteItem: SMTBaseActorSheet.#onDeleteItem,
      viewItem: SMTBaseActorSheet.#onViewItem,
      createItem: SMTBaseActorSheet.#onCreateItem,
      editImage: SMTBaseActorSheet.#onEditImage,
      toggleEquip: SMTBaseActorSheet.#onToggleEquip,
      updateQuantity: SMTBaseActorSheet.#onUpdateQuantity
    }
  };

  // Stat entries for template
  _prepareStatEntries() {
    const sys = this.document.system;
    const actor = this.document;
    const favoredStat = sys.favoredStat ?? "";
    return STATS.map(key => {
      const bonus = sys.statBonuses[key];
      const bonusSources = this._getStatBonusSources(actor, key, bonus);
      return {
        key,
        fullLabel: SMT.stats[key],
        abbrLabel: SMT.statsAbbr[key],
        base: sys[key],
        bonus,
        bonusTooltip: bonusSources,
        total: sys[`${key}Total`],
        tn: sys[`${key}TN`],
        isFavored: key === favoredStat
      };
    });
  }

  // Tooltip showing stat bonus sources
  _getStatBonusSources(actor, stat, totalBonus) {
    if (!totalBonus) return "";
    const sources = [];
    // Magatama (Fiend)
    if (actor.type === "fiend" && actor.system.activeMagatama) {
      const mag = actor.items.get(actor.system.activeMagatama);
      if (mag?.type === "magatama") {
        const magBonus = mag.system.statBonuses[stat] ?? 0;
        if (magBonus) sources.push(`${mag.name}: +${magBonus}`);
      }
    }
    if (sources.length) return sources.join("\n");
    return `${game.i18n.localize("SMT.StatBonuses")}: +${totalBonus}`;
  }

  // Affinity entries for template
  _prepareAffinityEntries() {
    const affinities = this.document.system.affinities;
    return ELEMENTS.map(key => ({
      key,
      label: SMT.elements[key],
      rating: affinities[key]
    }));
  }

  // Ailment affinity entries for template
  _prepareAilmentAffinityEntries() {
    const ailmentAffinities = this.document.system.ailmentAffinities;
    return AILMENT_ELEMENTS.map(key => ({
      key,
      label: SMT.elements[key],
      rating: ailmentAffinities[key]
    }));
  }

  // Skill items for template
  _prepareSkills() {
    return this.document.skills.map(s => ({
      ...s.toObject(),
      _id: s.id,
      isPassive: s.isPassive,
      costDisplay: s.costDisplay,
      tnDisplay: s.tnDisplay
    }));
  }

  // Enrich HTML bio fields for ProseMirror
  async _prepareEnrichedFields() {
    const sys = this.document.system;
    const fields = ["background1", "background2", "goal", "contacts", "bonds", "notes"];
    const enriched = {};
    for (const field of fields) {
      enriched[field] = await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys[field] ?? "", { async: true });
    }
    return enriched;
  }

  // Skill cap enforcement on drop
  async _onDropItem(event, item) {
    if (item.type === "skill") {
      const currentSkills = this.document.items.filter(i => i.type === "skill");
      if (currentSkills.length >= 8) {
        ui.notifications.warn(game.i18n.localize("SMT.Warnings.SkillCap"));
        return;
      }
    }
    return super._onDropItem(event, item);
  }

  // --- Action handlers ---

  static #onRollCheck(event, target) {
    const tn = parseInt(target.dataset.tn);
    const label = target.dataset.label || "Check";
    if (!isNaN(tn)) {
      this.document.rollPercentile(tn, label);
    }
  }

  static async #onStrike() {
    const actor = this.document;
    const { postPendingAttack, getTokenUuid, resolveTargets } = await import("../helpers/combat.mjs");
    const skillName = game.i18n.localize("SMT.BasicAttack");
    const tn = actor.system.strengthTN;
    const attackerTokenUuid = getTokenUuid(actor) ?? actor.id;
    const hasMight = actor.items.some(i => i.type === "skill" && i.name === "Might");
    const label = `${skillName} (${game.i18n.localize("SMT.Stat.Strength")})`;
    const checkResult = await actor.rollPercentile(tn, label, { hasMight });

    if (actor.system.fatePoints.value > 0) {
      const msg = game.messages.get(checkResult.messageId);
      if (msg) {
        await msg.setFlag("smt-rpg", "checkData", {
          actorTokenUuid: attackerTokenUuid, rollResult: checkResult.result,
          isSuccess: checkResult.isSuccess, isCritical: checkResult.isCritical,
          currentTN: tn, originalTN: tn,
          hasPowerRoll: true, basePower: actor.system.basePhysicalPower,
          skillPower: 0, element: "phys", isPhysical: true, skillName,
          targetTokenUuids: Array.from(game.user.targets).map(t => t.document?.uuid).filter(Boolean),
          hasMight, ailmentType: "none", ailmentRate: 0,
          resolved: false
        });
      }
    }

    if (checkResult.isSuccess) {
      const powerResult = await actor.rollPower(
        actor.system.basePhysicalPower, 0,
        `${skillName} — ${game.i18n.localize("SMT.Power")}`,
        checkResult.isCritical
      );
      const targets = resolveTargets(actor, "1");
      if (!targets.length) {
        ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
        return;
      }
      for (const token of targets) {
        if (!token.actor) continue;
        await postPendingAttack({
          attacker: actor, target: token.actor,
          attackerTokenUuid, targetTokenUuid: token.document.uuid,
          rawPower: powerResult.total, element: "phys",
          isPhysical: true, isCritical: powerResult.isCritical,
          skillName, checkMessageId: checkResult.messageId
        });
      }
    }
  }

  static async #onShoot() {
    const actor = this.document;
    const { postPendingAttack, getTokenUuid, resolveTargets } = await import("../helpers/combat.mjs");
    const rw = actor.system.rangedWeapon;
    if (!rw) return;

    const weapon = actor.items.find(i => i.type === "gear" && i.system.gearType === "weapon-ranged" && i.system.equipped);
    if (!weapon || weapon.system.ammo.value <= 0) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoAmmo"));
      return;
    }
    await weapon.update({ "system.ammo.value": weapon.system.ammo.value - 1 });

    const skillName = game.i18n.localize("SMT.Shoot");
    const attackerTokenUuid = getTokenUuid(actor) ?? actor.id;
    const label = `${skillName} (${game.i18n.localize("SMT.Stat.Agility")})`;
    const checkResult = await actor.rollPercentile(rw.tn, label);

    if (actor.system.fatePoints.value > 0) {
      const msg = game.messages.get(checkResult.messageId);
      if (msg) {
        await msg.setFlag("smt-rpg", "checkData", {
          actorTokenUuid: attackerTokenUuid, rollResult: checkResult.result,
          isSuccess: checkResult.isSuccess, isCritical: checkResult.isCritical,
          currentTN: rw.tn, originalTN: rw.tn,
          hasPowerRoll: true, basePower: rw.power,
          skillPower: 0, element: "phys", isPhysical: true, skillName,
          targetTokenUuids: Array.from(game.user.targets).map(t => t.document?.uuid).filter(Boolean),
          resolved: false
        });
      }
    }
    if (checkResult.isSuccess) {
      const powerResult = await actor.rollPower(
        rw.power, 0,
        `${skillName} — ${game.i18n.localize("SMT.Power")}`,
        checkResult.isCritical
      );
      const targets = resolveTargets(actor, "1");
      if (!targets.length) {
        ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
        return;
      }
      for (const token of targets) {
        if (!token.actor) continue;
        await postPendingAttack({
          attacker: actor, target: token.actor,
          attackerTokenUuid, targetTokenUuid: token.document.uuid,
          rawPower: powerResult.total, element: "phys",
          isPhysical: true, isCritical: powerResult.isCritical,
          skillName, checkMessageId: checkResult.messageId
        });
      }
    }
  }

  static #onUseSkill(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.use();
  }

  static #onUseItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.useConsumable();
  }

  static #onEditItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  static #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.delete();
  }

  static #onViewItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const typeLabel = game.i18n.localize(`TYPES.Item.${type}`);
    const itemData = {
      name: `${game.i18n.localize("SMT.New")} ${typeLabel}`,
      type
    };

    if (type === "skill") {
      const currentSkills = this.document.items.filter(i => i.type === "skill");
      if (currentSkills.length >= 8) {
        ui.notifications.warn(game.i18n.localize("SMT.Warnings.SkillCap"));
        return;
      }
    }

    const created = await this.document.createEmbeddedDocuments("Item", [itemData]);
    if (created.length) created[0].sheet.render(true);
  }

  static #onToggleEquip(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.update({ "system.equipped": !item.system.equipped });
  }

  static #onUpdateQuantity(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.update({ "system.quantity": parseInt(target.value) || 0 });
  }

  static #onEditImage(event, target) {
    const fp = new FilePicker({
      type: "image",
      current: this.document.img,
      callback: (path) => this.document.update({ img: path })
    });
    fp.browse();
  }
}
