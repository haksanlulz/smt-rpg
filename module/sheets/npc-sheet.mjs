import { SMT } from "../config.mjs";
import SMTBaseActorSheet from "./base-actor-sheet.mjs";

export default class SMTNPCSheet extends SMTBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["smt-rpg", "actor-sheet", "npc-sheet"],
    position: { width: 650, height: 600 },
  };

  static PARTS = {
    sheet: {
      template: "systems/smt-rpg/templates/actor/npc-sheet.hbs",
      scrollable: [""]
    }
  };

  async _prepareContext(options) {
    const sys = this.document.system;

    return {
      actor: this.document,
      system: sys,
      source: this.document.toObject().system,
      editable: this.isEditable,
      skills: this._prepareSkills(),
      statEntries: this._prepareStatEntries(),
      affinityEntries: this._prepareAffinityEntries(),
      ailmentAffinityEntries: this._prepareAilmentAffinityEntries(),
      effectChips: this._prepareEffectChips(),
      effectsList: this._prepareEffectsList(),
      conditions: this._prepareConditions(),
      ailmentChoices: SMT.ailments,
      affinityChoices: SMT.affinityRatings,
      ailmentAffinityChoices: SMT.ailmentAffinityRatings,
      elementLabels: SMT.elements
    };
  }

}
