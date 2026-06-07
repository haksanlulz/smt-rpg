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
      concentrate: SMTBaseActorSheet.#onConcentrate,
      defend: SMTBaseActorSheet.#onDefend,
      removeEffect: SMTBaseActorSheet.#onRemoveEffect,
      clearAilment: SMTBaseActorSheet.#onClearAilment,
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

  // Stat entries for template. `base` is the SOURCE stat (what the editable input
  // binds to) so derived/magatama-fed mutations never round-trip back into the
  // stored stat on submit; `total`/`tn` stay prepared for display.
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

  // Affinity entries for template. The editable <select> binds to `rating` (the
  // SOURCE affinity), while `effective` is the prepared value used only to colour
  // the cell — so a Fiend's active-magatama affinity override (applied in
  // prepareDerivedData) is shown by colour without being written back into the
  // stored affinity on submit.
  _prepareAffinityEntries() {
    const affinities = this.document.system.affinities;
    const source = this.document._source.system.affinities ?? {};
    return ELEMENTS.map(key => ({
      key,
      label: SMT.elements[key],
      // Fall back to the prepared value if a key is absent from source (e.g. an
      // actor stored before the element existed) so the <select> still has a
      // matching option.
      rating: source[key] ?? affinities[key],
      effective: affinities[key]
    }));
  }

  // Ailment affinity entries for template. `rating` is the SOURCE value bound by
  // the editable <select>; `effective` is the prepared value for cell colouring.
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

  /**
   * Active buff/debuff and Concentrate/Defend effects for the combat tab, as chips
   * with display data. Reads actor.appliedEffects (effects whose changes are live)
   * and keeps only the ones carrying our bookkeeping flags — so the ailment-mirror
   * effects (which are status-only, no changes, and shown by the conditions strip)
   * are never rendered as chips. Buff chips carry their stack count (p.96).
   * @returns {{id:string,name:string,img:string,stacks:number,kind:string}[]}
   */
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

  /**
   * Condition-strip data for the sheet header: the single common-ailment slot
   * (p.68), the two special Death/Curse flags (p.67), and the active buff/stance
   * effects rendered as small icons. The common ailment and the special flags each
   * get a one-click clear control; the buff/stance icons are display-only (removed
   * from the combat-tab chips). Sourced from CONFIG.SMT.ailments for the labels.
   * @returns {{ailment:?{key:string,label:string}, death:boolean, curse:boolean, marks:{img:string,name:string}[]}}
   */
  _prepareConditions() {
    const sys = this.document.system;
    const ailmentKey = sys.ailment ?? "none";
    const ailment = ailmentKey !== "none"
      ? { key: ailmentKey, label: SMT.ailments[ailmentKey] ?? ailmentKey }
      : null;
    const marks = this._prepareEffectChips().map(c => ({ img: c.img, name: c.name }));
    const death = !!sys.deathAilment;
    const curse = !!sys.curseAilment;
    // `any` precomputed so the conditions partial can gate on one boolean rather
    // than an `or` helper (keeps the template dependency-free).
    const any = !!ailment || death || curse || marks.length > 0;
    return { ailment, death, curse, marks, any };
  }

  // Enrich HTML bio fields for ProseMirror
  async _prepareEnrichedFields() {
    const sys = this.document.system;
    const fields = ["background1", "background2", "goal", "contacts", "bonds", "notes"];
    const enriched = {};
    for (const field of fields) {
      enriched[field] = await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys[field] ?? "");
    }
    return enriched;
  }

  /**
   * Coerce blanked numeric inputs before the form submit validates. v14 sheets
   * drop the legacy `data-dtype` attribute (TypeDataModel handles coercion), but
   * a number input the user clears submits an empty string — which a non-nullable
   * NumberField casts to NaN and rejects, silently dropping the edit. Map each
   * empty `system.*` value that targets a NumberField to a safe fallback (null
   * when the field is nullable, otherwise its initial or 0) so clearing a field
   * sticks. Only string values are touched; everything else passes through.
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   * @returns {object}
   */
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

  // --- Action handlers ---

  static #onRollCheck(event, target) {
    const tn = parseInt(target.dataset.tn);
    const label = target.dataset.label || "Check";
    if (!isNaN(tn)) {
      this.document.rollPercentile(tn, label);
    }
  }

  /**
   * Basic melee strike: percentile vs Strength TN, then power roll + pending attacks
   * (shares buildCheckData / postAttacksToTargets with item.use and #onShoot).
   * Might detection reads the actor getter.
   */
  static async #onStrike() {
    const actor = this.document;
    const { postAttacksToTargets, buildCheckData, resolveTargets, applyStunHitCap } = await import("../helpers/combat.mjs");
    // A basic strike is a non-reactive action: a poisoned attacker drains HP (p.66).
    const { applyPoisonDrain, consumeConcentrate } = await import("../helpers/effects.mjs");
    await applyPoisonDrain(actor);
    const skillName = game.i18n.localize("SMT.BasicAttack");
    const hasMight = actor.system.hasMightPassive;
    let label = `${skillName} (${game.i18n.localize("SMT.Stat.Strength")})`;

    // Concentrate: spend any bonus held for this named action, adding its +% to the
    // hit TN (p.64). Consumed regardless of the result; mirrors item.use(). The stun
    // cap (p.66) is applied to the single TN after the Concentrate bonus so it flows
    // identically into the roll and buildCheckData (keeping any Fate re-eval consistent).
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

  /**
   * Ranged shot: spends one ammo, percentile vs the ranged-weapon TN, then power roll
   * + pending attacks (shares buildCheckData / postAttacksToTargets). Ranged
   * attacks do not benefit from Might, so hasMight stays at its false default.
   */
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

    // Concentrate (p.64) then the stun cap (p.66), applied to the single TN so the
    // same value flows into the roll and buildCheckData (Fate re-eval stays consistent).
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

  /**
   * Concentrate (p.64): pick one of the actor's strike/shoot/non-passive skills via
   * DialogV2, then hold a +CONFIG.SMT.concentrate.bonusPct% bonus for that named
   * action's next hit check. The named action's string must match what the attack
   * site passes to consumeConcentrate (the basic-attack/shoot label, or a skill's
   * name). Gated inside applyConcentrate (GM/owner); user-supplied skill names are
   * HTML-escaped in the option list.
   */
  static async #onConcentrate() {
    const actor = this.document;
    const { applyConcentrate, postEffectNotice, canModifyEffects } = await import("../helpers/effects.mjs");
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }

    // Offer the basic strike, ranged shot (if armed), and every non-passive skill —
    // the actions that make a hit check and can therefore carry a Concentrate bonus.
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
      await postEffectNotice(actor, game.i18n.format("SMT.Effect.Concentrated", {
        action: result.action, amount: result.amount
      }));
    }
  }

  /**
   * Defend (p.64): forego an action for +CONFIG.SMT.defend.dodgeBonus% dodge until
   * the start of the actor's next turn. Gated inside applyDefend (GM/owner); the
   * effect is auto-cleared at turn start / encounter end by the combat hooks.
   */
  static async #onDefend() {
    const actor = this.document;
    const { applyDefend, postEffectNotice } = await import("../helpers/effects.mjs");
    const result = await applyDefend(actor);
    if (result) {
      await postEffectNotice(actor, game.i18n.format("SMT.Effect.Defended", { amount: result.amount }));
    }
  }

  /**
   * Remove a buff/debuff or Concentrate/Defend effect from the combat-tab chip
   * strip. Gated (GM/owner) so a non-permitted viewer cannot delete it.
   */
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

  /**
   * Clear the actor's common-ailment slot from the conditions strip (p.68). Writing
   * system.ailment fires the updateActor hook, which re-mirrors the HUD icons.
   */
  static async #onClearAilment() {
    const { canModifyEffects } = await import("../helpers/effects.mjs");
    const actor = this.document;
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }
    if (actor.system.ailment !== "none") await actor.update({ "system.ailment": "none" });
  }

  /** Clear the special Death flag from the conditions strip (p.67). */
  static async #onClearDeath() {
    const { canModifyEffects } = await import("../helpers/effects.mjs");
    const actor = this.document;
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }
    if (actor.system.deathAilment) await actor.update({ "system.deathAilment": false });
  }

  /** Clear the special Curse flag from the conditions strip (p.67). */
  static async #onClearCurse() {
    const { canModifyEffects } = await import("../helpers/effects.mjs");
    const actor = this.document;
    if (!canModifyEffects(actor)) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return;
    }
    if (actor.system.curseAilment) await actor.update({ "system.curseAilment": false });
  }

  /**
   * Use a skill. Awaits the full use() flow and disables the triggering button while
   * in-flight so a double-click cannot double-spend the skill's cost.
   */
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

  /**
   * Use a consumable. Awaits useConsumable() and disables the triggering button while
   * in-flight so a double-click cannot consume two of the item.
   */
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

  /** Open the v13+ FilePicker to choose the actor image (replaces deprecated `new FilePicker`). */
  static #onEditImage(event, target) {
    new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.document.img,
      callback: (path) => this.document.update({ img: path })
    }).browse();
  }
}
