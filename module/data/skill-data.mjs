const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

export default class SkillData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      skillType: new StringField({
        required: true,
        initial: "physical-attack",
        choices: Object.keys(CONFIG.SMT.skillTypes)
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
      // Full element list (incl. recovery/support/none) lives in CONFIG.SMT.elements.
      element: new StringField({
        initial: "phys",
        choices: Object.keys(CONFIG.SMT.elements)
      }),
      effectDescription: new StringField({ initial: "" }),
      ailment: new SchemaField({
        type: new StringField({ initial: "none" }),
        rate: new NumberField({ integer: true, min: 0, max: 100, initial: 0 })
      }),
      // Buff/debuff this skill casts (p.96); "none" = not a buff skill. Resolved in SMTItem.use → _castBuff.
      buffEffect: new StringField({
        initial: "none",
        choices: Object.keys(CONFIG.SMT.buffEffectChoices)
      }),
      // Mechanical passive this skill grants (Amplify / Might, p.109-110); "none" = no effect. Resolution in helpers/passives.mjs.
      passiveEffect: new StringField({
        initial: "none",
        choices: Object.keys(CONFIG.SMT.passiveEffects)
      }),
      inheritanceType: new StringField({ initial: "" })
    };
  }
}
