import SMTBaseActorData from "./base-actor.mjs";

const { StringField, SchemaField, NumberField } = foundry.data.fields;

export default class DemonData extends SMTBaseActorData {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      clan: new StringField({ initial: "fairy" }),
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

  get hpMultiplier() {
    return 6;
  }

  get mpMultiplier() {
    return 3;
  }

  get expMultiplier() {
    return 1.3;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this._clampCurrentValues();
  }
}
