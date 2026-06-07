import SMTBaseActorData from "./base-actor.mjs";
import { STATS } from "./fields.mjs";

const { StringField } = foundry.data.fields;

export default class FiendData extends SMTBaseActorData {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      activeMagatama: new StringField({ initial: "" })
    };
  }

  prepareDerivedData() {
    this._applyActiveMagatama();
    super.prepareDerivedData();
    this._clampCurrentValues();
  }

  _applyActiveMagatama() {
    if (!this.activeMagatama) return;
    const active = this.parent.items.get(this.activeMagatama);
    if (!active || active.type !== "magatama") return;

    const bonuses = active.system.statBonuses;
    for (const stat of STATS) {
      this.statBonuses[stat] += bonuses[stat] ?? 0;
    }

    const magAffinities = active.system.affinities;
    for (const [element, rating] of Object.entries(magAffinities)) {
      if (rating !== "normal") {
        this.affinities[element] = rating;
      }
    }
  }
}
