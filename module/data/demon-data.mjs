import SMTBaseActorData from "./base-actor.mjs";

const { StringField, SchemaField, NumberField } = foundry.data.fields;

export default class DemonData extends SMTBaseActorData {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      clan: new StringField({ initial: "fairy" }),
      // NOTE: favoredStat / clan are free-form strings for now; a later pass may
      // constrain favoredStat to STATS and clan to CONFIG.SMT.demonClans keys.
      favoredStat: new StringField({
        required: false,
        blank: true,
        initial: ""
      }),
      evolvePath: new SchemaField({
        demonName: new StringField({ initial: "" }),
        level: new NumberField({ integer: true, min: 0, initial: 0 }),
        partyLevel: new NumberField({ integer: true, min: 0, initial: 0 })
      })
    };
  }

  // hpMultiplier/mpMultiplier inherited from SMTBaseActorData
  // (CONFIG.SMT.hpMultipliers.demon = 6, mpMultipliers.demon = 3, p.36).

  get expMultiplier() {
    return 1.3;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this._clampCurrentValues();
  }
}
