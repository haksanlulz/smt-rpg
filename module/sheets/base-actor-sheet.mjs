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
      reload: SMTBaseActorSheet.#onReload,
      concentrate: SMTBaseActorSheet.#onConcentrate,
      defend: SMTBaseActorSheet.#onDefend,
      levelUp: SMTBaseActorSheet.#onLevelUp,
      removeEffect: SMTBaseActorSheet.#onRemoveEffect,
      clearAilment: SMTBaseActorSheet.#onClearAilment,
      saveAilment: SMTBaseActorSheet.#onSaveAilment,
      clearDeath: SMTBaseActorSheet.#onClearDeath,
      clearCurse: SMTBaseActorSheet.#onClearCurse,
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

  // `base` binds to the source stat so derived/magatama mutations don't round-trip on submit.
  _prepareStatEntries() {
    const sys = this.document.system;
    const src = this.document._source.system ?? {};
    const actor = this.document;
    const favoredStat = sys.favoredStat ?? "";
    return STATS.map(key => {
      const bonus = sys.statBonuses[key];
      const bonusSources = this._getStatBonusSources(actor, key, bonus);
      return {
        key,
        fullLabel: SMT.stats[key],
        abbrLabel: SMT.statsAbbr[key],
        base: src[key] ?? sys[key],
        bonus,
        bonusTooltip: bonusSources,
        total: sys[`${key}Total`],
        tn: sys[`${key}TN`],
        isFavored: key === favoredStat
      };
    });
  }

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

  // `rating` binds the source affinity; `effective` only colours the cell, so a magatama
  // override shows without being written back on submit.
  _prepareAffinityEntries() {
    const affinities = this.document.system.affinities;
    const source = this.document._source.system.affinities ?? {};
    return ELEMENTS.map(key => ({
      key,
      label: SMT.elements[key],
      // Fall back to the prepared value if the key is absent from source (older actor).
      rating: source[key] ?? affinities[key],
      effective: affinities[key]
    }));
  }

  // `rating` binds the source value; `effective` is for cell colouring.
  _prepareAilmentAffinityEntries() {
    const ailmentAffinities = this.document.system.ailmentAffinities;
    const source = this.document._source.system.ailmentAffinities ?? {};
    return AILMENT_ELEMENTS.map(key => ({
      key,
      label: SMT.elements[key],
      rating: source[key] ?? ailmentAffinities[key],
      effective: ailmentAffinities[key]
    }));
  }

  _prepareSkills() {
    return this.document.skills.map(s => ({
      ...s.toObject(),
      _id: s.id,
      isPassive: s.isPassive,
      costDisplay: s.costDisplay,
      tnDisplay: s.tnDisplay
    }));
  }

  // Buff/Concentrate/Defend effects as combat-tab chips. Keeps only effects with our flags,
  // so the status-only ailment-mirror effects never show here. Buff chips carry stacks (p.96).
  _prepareEffectChips() {
    const chips = [];
    for (const e of this.document.appliedEffects) {
      const f = e.flags?.["smt-rpg"];
      if (!f) continue;
      let kind = null;
      let stacks = 0;
      if (f.buff) { kind = "buff"; stacks = Number(f.buff.stacks) || 0; }
      else if (f.concentrate) kind = "concentrate";
      else if (f.defend !== undefined) kind = "defend";
      if (!kind) continue;
      // showStacks precomputed so the template needs no comparison helper.
      chips.push({ id: e.id, name: e.name, img: e.img, stacks, kind, showStacks: stacks > 1 });
    }
    return chips;
  }

  // Condition-strip data: common-ailment slot (p.68), Death/Curse flags (p.67), and buff/stance
  // icons. Ailment + flags get a clear control; the icons are display-only.
  _prepareConditions() {
    const sys = this.document.system;
    const ailmentKey = sys.ailment ?? "none";
    const ailment = ailmentKey !== "none"
      ? {
          key: ailmentKey,
          label: SMT.ailments[ailmentKey] ?? ailmentKey,
          // Save-eligible ailments (p.69) get a one-click save control on the pip.
          canSave: SMT.ailmentSave.eligible.includes(ailmentKey)
        }
      : null;
    const marks = this._prepareEffectChips().map(c => ({ img: c.img, name: c.name }));
    const death = !!sys.deathAilment;
    const curse = !!sys.curseAilment;
    // `any` precomputed so the partial gates on one boolean, no `or` helper.
    const any = !!ailment || death || curse || marks.length > 0;
    return { ailment, death, curse, marks, any };
  }

  async _prepareEnrichedFields() {
    const sys = this.document.system;
    const fields = ["background1", "background2", "goal", "contacts", "bonds", "notes"];
    const enriched = {};
    for (const field of fields) {
      enriched[field] = await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys[field] ?? "");
    }
    return enriched;
  }

  // Coerce blanked numeric inputs before validation: v14 drops data-dtype, so a cleared number
  // input submits "" which a non-nullable NumberField rejects. Map empty system.* NumberFields
  // to null (nullable) or initial/0 so the clear sticks.
  _prepareSubmitData(event, form, formData) {
    const obj = formData.object;
    const schema = this.document.system.schema;
    for (const key of Object.keys(obj)) {
      if (!key.startsWith("system.")) continue;
      const val = obj[key];
      if (typeof val !== "string") continue;
      const field = schema.getField(key.slice(7));
      if (!(field instanceof foundry.data.fields.NumberField)) continue;
      if (val.trim() === "") {
        obj[key] = field.nullable ? null : (field.initial ?? 0);
      }
    }
    return super._prepareSubmitData(event, form, formData);
  }

  // Skill cap enforcement on drop
  async _onDropItem(event, item) {
    if (item.type === "skill") {
      const currentSkills = this.document.items.filter(i => i.type === "skill");
      if (currentSkills.length >= CONFIG.SMT.skillCap) {
        ui.notifications.warn(game.i18n.localize("SMT.Warnings.SkillCap"));
        return;
      }
    }
    return super._onDropItem(event, item);
  }

  // Action handlers

  static #onRollCheck(event, target) {
    const tn = parseInt(target.dataset.tn);
    const label = target.dataset.label || "Check";
    if (!isNaN(tn)) {
      this.document.rollPercentile(tn, label);
    }
  }

  // Basic melee strike: percentile vs Strength TN, then power roll + pending attacks.
  static async #onStrike() {
    const actor = this.document;
    const { postAttacksToTargets, buildCheckData, resolveTargets, applyStunHitCap } = await import("../helpers/combat.mjs");
    // A basic strike is a non-reactive action: a poisoned attacker drains HP (p.66).
    const { applyPoisonDrain, consumeConcentrate } = await import("../helpers/effects.mjs");
    await applyPoisonDrain(actor);
    const skillName = game.i18n.localize("SMT.BasicAttack");
    const hasMight = actor.system.hasMightPassive;
    let label = `${skillName} (${game.i18n.localize("SMT.Stat.Strength")})`;

    // Spend any Concentrate bonus for this action onto the hit TN (p.64), then the stun cap (p.66).
    let tn = actor.system.strengthTN;
    const concentrate = await consumeConcentrate(actor, skillName);
    if (concentrate) {
      tn += concentrate;
      label += ` +${concentrate}%`;
    }
    tn = applyStunHitCap(actor, tn);

    const checkResult = await actor.rollPercentile(tn, label, { hasMight });

    if (actor.system.fatePoints.value > 0) {
      const msg = game.messages.get(checkResult.messageId);
      if (msg) {
        await msg.setFlag("smt-rpg", "checkData", buildCheckData({
          actor, checkResult, tn,
          hasPowerRoll: true, basePower: actor.system.basePhysicalPower,
          skillPower: 0, element: "phys", isPhysical: true, skillName,
          hasMight
        }));
      }
    }

    if (checkResult.isSuccess) {
      const powerResult = await actor.rollPower(
        actor.system.basePhysicalPower, 0,
        `${skillName} — ${game.i18n.localize("SMT.Power")}`,
        checkResult.isCritical,
        actor.system.physicalPowerBonusDice
      );
      await postAttacksToTargets({
        attacker: actor,
        targets: resolveTargets(actor, "1"),
        rawPower: powerResult.total,
        element: "phys",
        isPhysical: true,
        isCritical: powerResult.isCritical,
        skillName,
        checkMessageId: checkResult.messageId
      });
    }
  }

  // Ranged shot: spends one ammo, percentile vs ranged-weapon TN, then power roll + attacks.
  // Ranged attacks don't benefit from Might, so hasMight stays false.
  static async #onShoot() {
    const actor = this.document;
    const { postAttacksToTargets, buildCheckData, resolveTargets, applyStunHitCap } = await import("../helpers/combat.mjs");
    const rw = actor.system.rangedWeapon;
    if (!rw) return;

    const weapon = actor.items.find(i => i.type === "gear" && i.system.gearType === "weapon-ranged" && i.system.equipped);
    if (!weapon || weapon.system.ammo.value <= 0) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoAmmo"));
      return;
    }
    await weapon.update({ "system.ammo.value": weapon.system.ammo.value - 1 });

    // Shooting is a non-reactive action: a poisoned attacker drains HP (p.66).
    const { applyPoisonDrain, consumeConcentrate } = await import("../helpers/effects.mjs");
    await applyPoisonDrain(actor);

    const skillName = game.i18n.localize("SMT.Shoot");
    let label = `${skillName} (${game.i18n.localize("SMT.Stat.Agility")})`;

    // Concentrate (p.64) then the stun cap (p.66) onto the TN.
    let tn = rw.tn;
    const concentrate = await consumeConcentrate(actor, skillName);
    if (concentrate) {
      tn += concentrate;
      label += ` +${concentrate}%`;
    }
    tn = applyStunHitCap(actor, tn);

    const checkResult = await actor.rollPercentile(tn, label);

    if (actor.system.fatePoints.value > 0) {
      const msg = game.messages.get(checkResult.messageId);
      if (msg) {
        await msg.setFlag("smt-rpg", "checkData", buildCheckData({
          actor, checkResult, tn,
          hasPowerRoll: true, basePower: rw.power,
          skillPower: 0, element: "phys", isPhysical: true, skillName
        }));
      }
    }

    if (checkResult.isSuccess) {
      const powerResult = await actor.rollPower(
        rw.power, 0,
        `${skillName} — ${game.i18n.localize("SMT.Power")}`,
        checkResult.isCritical
      );
      await postAttacksToTargets({
        attacker: actor,
        targets: resolveTargets(actor, "1"),
        rawPower: powerResult.total,
        element: "phys",
        isPhysical: true,
        isCritical: powerResult.isCritical,
        skillName,
        checkMessageId: checkResult.messageId
      });
    }
  }

  // Reload the equipped firearm to full (a full action; GM tracks the action cost). p.63.
  static async #onReload() {
    const actor = this.document;
    const weapon = actor.items.find(i => i.type === "gear" && i.system.gearType === "weapon-ranged" && i.system.equipped);
    if (!weapon) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoRangedWeapon"));
      return;
    }
    const max = Number(weapon.system.ammo?.max) || 0;
    if ((Number(weapon.system.ammo?.value) || 0) >= max) {
      ui.notifications.info(game.i18n.localize("SMT.Reload.Full"));
      return;
    }
    await weapon.update({ "system.ammo.value": max });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="smt-roll effect-notice"><p>${game.i18n.format("SMT.Reload.Done", { name: actor.name })}</p></div>`
    });
  }

  // Concentrate (p.64): pick an action via DialogV2, then hold a bonus for its next hit check.
  // The picked string must match what the attack site passes to consumeConcentrate.
  static async #onConcentrate() {
    const actor = this.document;
    const { applyConcentrate, postEffectNotice, canModifyEffects } = await import("../helpers/effects.mjs");
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }

    // Actions that make a hit check: basic strike, ranged shot (if armed), non-passive skills.
    const options = [game.i18n.localize("SMT.BasicAttack")];
    if (actor.system.hasRangedWeapon) options.push(game.i18n.localize("SMT.Shoot"));
    for (const skill of actor.skills) if (!skill.isPassive) options.push(skill.name);

    const optionTags = options
      .map(o => `<option value="${foundry.utils.escapeHTML(o)}">${foundry.utils.escapeHTML(o)}</option>`)
      .join("");
    const action = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("SMT.Action.Concentrate") },
      content: `<p>${game.i18n.localize("SMT.Action.ConcentratePrompt")}</p>`
        + `<select name="action" style="width:100%;">${optionTags}</select>`,
      ok: {
        label: game.i18n.localize("SMT.Action.Concentrate"),
        callback: (event, button) => button.form.elements.action.value
      }
    }).catch(() => null);
    if (!action) return;

    const result = await applyConcentrate(actor, action);
    if (result) {
      await postEffectNotice(actor, game.i18n.format("SMT.EffectMsg.Concentrated", {
        action: result.action, amount: result.amount
      }));
    }
  }

  // Defend (p.64): forego an action for a dodge bonus until the actor's next turn.
  static async #onDefend() {
    const actor = this.document;
    const { applyDefend, postEffectNotice } = await import("../helpers/effects.mjs");
    const result = await applyDefend(actor);
    if (result) {
      await postEffectNotice(actor, game.i18n.format("SMT.EffectMsg.Defended", { amount: result.amount }));
    }
  }

  // Level up (p.48): confirm via DialogV2, then route through actor.levelUp (gated,
  // re-checks readiness, resets EXP + full-heals). Stat/skill choices stay the player's (p.49).
  static async #onLevelUp() {
    const actor = this.document;
    const { canModifyEffects } = await import("../helpers/effects.mjs");
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }
    if (!actor.system.canLevelUp) {
      ui.notifications.info(game.i18n.localize("SMT.LevelUp.NotReady"));
      return;
    }

    const current = actor.system.level;
    const next = current + 1;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SMT.LevelUp.Title") },
      content: `<p>${game.i18n.format("SMT.LevelUp.Prompt", { name: actor.name, current, next })}</p>`
        + `<ul class="smt-levelup-effects">`
        + `<li>${game.i18n.localize("SMT.LevelUp.StatPoint")}</li>`
        + `<li>${game.i18n.localize("SMT.LevelUp.FullHeal")}</li>`
        + `<li>${game.i18n.localize("SMT.LevelUp.Recalc")}</li>`
        + `<li>${game.i18n.localize("SMT.LevelUp.SkillChance")}</li>`
        + `</ul>`,
      yes: { label: game.i18n.localize("SMT.LevelUp.Confirm") },
      no: { label: game.i18n.localize("SMT.Cancel") }
    }).catch(() => false);
    if (!confirmed) return;

    await actor.levelUp();
  }

  static async #onRemoveEffect(event, target) {
    const { canModifyEffects } = await import("../helpers/effects.mjs");
    const actor = this.document;
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }
    const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
    const effect = actor.effects.get(effectId);
    if (effect) await effect.delete();
  }

  // Clear the common-ailment slot (p.68). The write fires updateActor, re-mirroring HUD icons.
  static async #onClearAilment() {
    const { canModifyEffects } = await import("../helpers/effects.mjs");
    const actor = this.document;
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }
    if (actor.system.ailment !== "none") await actor.update({ "system.ailment": "none" });
  }

  // Attempt the start-of-turn save against the common ailment (p.69). Delegates to
  // effects.attemptAilmentSave (gated, once-per-turn lock, shared percentile ladder).
  static async #onSaveAilment() {
    const { attemptAilmentSave } = await import("../helpers/effects.mjs");
    await attemptAilmentSave(this.document);
  }

  // Clear the Death flag (p.67).
  static async #onClearDeath() {
    const { canModifyEffects } = await import("../helpers/effects.mjs");
    const actor = this.document;
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }
    if (actor.system.deathAilment) await actor.update({ "system.deathAilment": false });
  }

  // Clear the Curse flag (p.67).
  static async #onClearCurse() {
    const { canModifyEffects } = await import("../helpers/effects.mjs");
    const actor = this.document;
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }
    if (actor.system.curseAilment) await actor.update({ "system.curseAilment": false });
  }

  // Disables the button while use() is in-flight so a double-click can't double-spend the cost.
  static async #onUseSkill(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;
    target.disabled = true;
    try {
      await item.use();
    } finally {
      target.disabled = false;
    }
  }

  // Disables the button while useConsumable() is in-flight so a double-click can't consume two.
  static async #onUseItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;
    target.disabled = true;
    try {
      await item.useConsumable();
    } finally {
      target.disabled = false;
    }
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
      if (currentSkills.length >= CONFIG.SMT.skillCap) {
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

  // v13+ FilePicker (replaces deprecated `new FilePicker`).
  static #onEditImage(event, target) {
    new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.document.img,
      callback: (path) => this.document.update({ img: path })
    }).browse();
  }
}
