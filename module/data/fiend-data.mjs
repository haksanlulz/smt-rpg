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

    // Category axes (p.65) — Kamudo's "Ailment Attack Weak", Muspell's "Strong
    // Ailment Attack", Kamurogi's "Magic Weak". These are not elements and were
    // silently unrepresentable before 2026-07-29.
    const magCategories = active.system.categoryAffinities ?? {};
    for (const [category, rating] of Object.entries(magCategories)) {
      if (rating !== "normal" && category in this.categoryAffinities) {
        this.categoryAffinities[category] = rating;
      }
    }
  }
}
