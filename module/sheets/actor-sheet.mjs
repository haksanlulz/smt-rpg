import { SMT } from "../config.mjs";
import SMTBaseActorSheet from "./base-actor-sheet.mjs";

export default class SMTActorSheet extends SMTBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["smt-rpg", "actor-sheet"],
    position: { width: 700, height: 680 },
    actions: {
      switchTab: SMTActorSheet.#onSwitchTab
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/smt-rpg/templates/actor/actor-sheet.hbs"
    }
  };

  // Track active tab per sheet instance
  _activeTab = "combat";

  async _prepareContext(options) {
    const context = {
      actor: this.document,
      system: this.document.system,
      source: this.document.toObject().system,
      actorType: this.document.type,
      isFiend: this.document.type === "fiend",
      isDemon: this.document.type === "demon",
      isHuman: this.document.type === "human",
      editable: this.isEditable,
      activeTab: this._activeTab,

      // Class labels
      classLabel: SMT.actorClasses[this.document.type] ?? "",
      subclassLabel: this.document.type === "human"
        ? (SMT.humanSubclasses[this.document.system.subclass] ?? "")
        : "",

      // Item collections
      skills: this._prepareSkills(),
      magatamas: this.document.magatamas.map(m => ({ ...m.toObject(), _id: m.id })),
      gear: this.document.items.filter(i => i.type === "gear").map(g => ({ ...g.toObject(), _id: g.id })),
      consumables: this.document.consumables.map(c => ({ ...c.toObject(), _id: c.id })),

      // Stat and affinity entries
      statEntries: this._prepareStatEntries(),
      affinityEntries: this._prepareAffinityEntries(),
      ailmentAffinityEntries: this._prepareAilmentAffinityEntries(),

      // Active buff/stance chips + conditions strip
      effectChips: this._prepareEffectChips(),
      conditions: this._prepareConditions(),

      // Dropdown choices
      ailmentChoices: SMT.ailments,
      affinityChoices: SMT.affinityRatings,
      ailmentAffinityChoices: SMT.ailmentAffinityRatings,
      elementLabels: SMT.elements,
      gearTypeLabels: SMT.gearTypes,
      consumableTypeLabels: SMT.consumableTypes,
      statChoices: SMT.stats,
      clanChoices: SMT.demonClans,
      subclassChoices: SMT.humanSubclasses,

      // Enriched HTML for ProseMirror bio fields
      enriched: await this._prepareEnrichedFields()
    };

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#activateTab(this._activeTab);
  }

  #activateTab(tabName) {
    const el = this.element;
    if (!el) return;

    el.querySelectorAll(".sheet-tabs .item").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === tabName);
    });

    el.querySelectorAll(".sheet-body > .tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === tabName);
    });
  }

  static #onSwitchTab(event, target) {
    const tab = target.dataset.tab;
    if (tab) {
      this._activeTab = tab;
      this.#activateTab(tab);
    }
  }
}
