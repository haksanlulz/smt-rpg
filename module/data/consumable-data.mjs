const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

export default class ConsumableData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      consumableType: new StringField({
        required: true,
        initial: "medicine",
        choices: Object.keys(CONFIG.SMT.consumableTypes)
      }),
      effect: new StringField({ initial: "" }),
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      price: new NumberField({ integer: true, min: 0, initial: 0 }),
      description: new StringField({ initial: "" }),

      healHP: new NumberField({ integer: true, min: 0, initial: 0 }),
      healMP: new NumberField({ integer: true, min: 0, initial: 0 }),
      healFull: new BooleanField({ initial: false }),
      healAllAllies: new BooleanField({ initial: false }),
      curesAilment: new StringField({ initial: "none" }),
      revive: new BooleanField({ initial: false }),
      reviveFull: new BooleanField({ initial: false }),

      // Attack items (Rocks)
      attackPower: new NumberField({ integer: true, min: 0, initial: 0 }),
      attackElement: new StringField({ initial: "none" }),
      attackAll: new BooleanField({ initial: false }),
      attackAilment: new SchemaField({
        type: new StringField({ initial: "none" }),
        rate: new NumberField({ integer: true, min: 0, max: 100, initial: 0 })
      }),

      reusable: new BooleanField({ initial: false })
    };
  }
}
