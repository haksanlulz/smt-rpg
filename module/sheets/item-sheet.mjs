import { SMT } from "../config.mjs";
import { ELEMENTS } from "../data/fields.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class SMTItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["smt-rpg", "item-sheet"],
    tag: "form",
    position: { width: 520, height: 480 },
    actions: {
      editImage: SMTItemSheet.#onEditImage
    },
    form: {
      submitOnChange: true
    },
    window: {
      resizable: true
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/smt-rpg/templates/item/skill-sheet.hbs"
    }
  };

  // Template per item type.
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.sheet.template = `systems/smt-rpg/templates/item/${this.document.type}-sheet.hbs`;
    return parts;
  }

  // Coerce blanked numeric inputs before validation: v14 drops data-dtype, so a cleared number
  // field submits "" which a non-nullable NumberField rejects. Map empty system.* NumberFields
  // to null (nullable) or initial/0 so the clear persists.
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

  async _prepareContext(options) {
    const context = {
      item: this.document,
      system: this.document.system,
      source: this.document.toObject().system,
      editable: this.isEditable,

      // Common dropdown choices
      elementChoices: SMT.elements,
      affinityChoices: SMT.affinityRatings,
      statChoices: SMT.stats,
      statLabels: SMT.stats,
      skillTypeChoices: SMT.skillTypes,
      buffEffectChoices: SMT.buffEffectChoices,
      passiveEffectChoices: SMT.passiveEffectChoices,
      gearTypeChoices: SMT.gearTypes,
      consumableTypeChoices: SMT.consumableTypes,
      ailmentChoices: SMT.ailments,
      statKeys: ["strength", "magic", "vitality", "agility", "luck"]
    };

    // Consumable-specific display flags
    if (this.document.type === "consumable") {
      const ct = this.document.system.consumableType;
      context.showHealing = ct === "medicine" || ct === "gem" || ct === "bead";
      context.showAttack = ct === "rock";
    }

    // Magatama-specific affinity entries
    if (this.document.type === "magatama") {
      const affinities = this.document.system.affinities;
      context.affinityEntries = ELEMENTS.map(key => ({
        key,
        label: SMT.elements[key],
        rating: affinities[key]
      }));
    }

    return context;
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
