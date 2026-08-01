const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

export default class GearData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      gearType: new StringField({
        required: true,
        initial: "weapon-melee",
        choices: Object.keys(CONFIG.SMT.gearTypes)
      }),
      // The printed armor slot ("Head", "Body", "Leg", "Head/Body/Leg") — p.118 prints
      // it inside the Type column, and the one-armor-per-slot rule needs it to exist.
      // Free-form; empty for weapons and accessories. Not yet consumed by any rule.
      slot: new StringField({ initial: "" }),
      powerBonus: new NumberField({ integer: true, initial: 0 }),
      resistBonus: new SchemaField({
        physical: new NumberField({ integer: true, initial: 0 }),
        magical: new NumberField({ integer: true, initial: 0 })
      }),
      ammo: new SchemaField({
        max: new NumberField({ integer: true, min: 0, initial: 0 }),
        value: new NumberField({ integer: true, min: 0, initial: 0 })
      }),
      equipped: new BooleanField({ initial: false }),
      price: new NumberField({ integer: true, min: 0, initial: 0 }),
      description: new StringField({ initial: "" })
    };
  }
}
