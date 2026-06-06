const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

export default class GearData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      gearType: new StringField({
        required: true,
        initial: "weapon-melee",
        choices: Object.keys(CONFIG.SMT.gearTypes)
      }),
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
