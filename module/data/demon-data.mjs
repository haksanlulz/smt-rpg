import SMTBaseActorData from "./base-actor.mjs";

const { StringField, BooleanField, SchemaField, NumberField } = foundry.data.fields;

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
      }),
      // Boss flag, reward drops, and negotiability mirror NPCData so reward and
      // negotiation logic can read the same fields on demon- and npc-type actors.
      // Inert here by design (no boss HP/MP scaling applied to demons).
      isBoss: new BooleanField({ initial: false }),
      drops: new SchemaField({
        normalItems: new StringField({ initial: "" }),
        macca: new NumberField({ integer: true, min: 0, initial: 0 }),
        exp: new NumberField({ integer: true, min: 0, initial: 0 })
      }),
      negotiable: new BooleanField({ initial: true })
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
