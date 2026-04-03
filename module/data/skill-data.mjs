const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

export default class SkillData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      skillType: new StringField({
        required: true,
        initial: "physical-attack",
        choices: [
          "physical-attack", "magical-attack", "spell",
          "recovery", "support", "debuff", "passive",
          "talk-approach", "talk-support"
        ]
      }),
      cost: new SchemaField({
        value: new NumberField({ integer: true, min: 0, initial: 0 }),
        resource: new StringField({ initial: "mp", choices: ["hp", "mp", "none"] })
      }),
      autoSuccess: new BooleanField({ initial: false }),
      customTN: new BooleanField({ initial: false }),
      tn: new NumberField({ integer: true, min: 0, initial: 0 }),
      checkStat: new StringField({
        initial: "strength",
        choices: ["strength", "magic", "vitality", "agility", "luck"]
      }),
      power: new NumberField({ integer: true, initial: 0 }),
      targets: new StringField({ initial: "1" }),
      element: new StringField({
        initial: "phys",
        choices: [
          "phys", "fire", "ice", "elec", "force",
          "mind", "nerve", "ruin", "dark", "light",
          "almighty", "recovery", "support", "none"
        ]
      }),
      effectDescription: new StringField({ initial: "" }),
      ailment: new SchemaField({
        type: new StringField({ initial: "none" }),
        rate: new NumberField({ integer: true, min: 0, max: 100, initial: 0 })
      }),
      inheritanceType: new StringField({ initial: "" })
    };
  }
}
