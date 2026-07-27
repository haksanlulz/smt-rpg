import SMTBaseActorData from "./base-actor.mjs";

const { StringField, BooleanField, SchemaField, NumberField } = foundry.data.fields;

export default class DemonData extends SMTBaseActorData {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      clan: new StringField({ initial: "fairy" }),
      // favoredStat / clan are free-form strings for now.
      favoredStat: new StringField({
        required: false,
        blank: true,
        initial: ""
      }),
      evolvePath: new SchemaField({
        demonName: new StringField({ initial: "" }),
        level: new NumberField({ integer: true, min: 0, initial: 0 }),
        partyLevel: new NumberField({ integer: true, min: 0, initial: 0 })
      }),
      // Inert: no boss HP/MP scaling applied to demons.
      // The book prints a Behavior for every general demon (p.123: "the keywords
      // that influence the demon's speech and conduct"), in the same
      // personality/gender/age shape npc-data already declares. Without the field
      // the compendium had real printed data with nowhere to put it.
      behavior: new SchemaField({
        personality: new StringField({ initial: "" }),
        gender: new StringField({ initial: "" }),
        age: new StringField({ initial: "" })
      }),
      // Which typed skills this demon can receive in fusion (p.80), printed as a
      // space-separated list: "Mouth Eye Lunge Weapon".
      inheritTraits: new StringField({ initial: "" }),
      isBoss: new BooleanField({ initial: false }),
      drops: new SchemaField({
        normalItems: new StringField({ initial: "" }),
        macca: new NumberField({ integer: true, min: 0, initial: 0 }),
        exp: new NumberField({ integer: true, min: 0, initial: 0 })
      }),
      negotiable: new BooleanField({ initial: true }),
      // Recruit record set when a Deal is reached in negotiation (p.75).
      recruited: new BooleanField({ initial: false }),
      recruitedBy: new StringField({ initial: "" })
    };
  }

  get expMultiplier() {
    return 1.3;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this._clampCurrentValues();
  }
}
