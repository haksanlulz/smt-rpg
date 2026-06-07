import SMTBaseActorData from "./base-actor.mjs";

const { StringField, BooleanField, SchemaField, NumberField } = foundry.data.fields;

export default class NPCData extends SMTBaseActorData {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      clan: new StringField({ initial: "" }),
      isBoss: new BooleanField({ initial: false }),
      behavior: new SchemaField({
        personality: new StringField({ initial: "" }),
        gender: new StringField({ initial: "" }),
        age: new StringField({ initial: "" })
      }),
      drops: new SchemaField({
        normalItems: new StringField({ initial: "" }),
        macca: new NumberField({ integer: true, min: 0, initial: 0 }),
        exp: new NumberField({ integer: true, min: 0, initial: 0 })
      }),
      negotiable: new BooleanField({ initial: true }),
      // Recruit record set on a negotiation Deal (p.75).
      recruited: new BooleanField({ initial: false }),
      recruitedBy: new StringField({ initial: "" })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // Boss trait: double HP and MP (p.123)
    if (this.isBoss) {
      const boss = CONFIG.SMT.bossHpMpMultiplier;
      this.hp.max = Math.floor(this.hp.max * boss);
      this.mp.max = Math.floor(this.mp.max * boss);
    }
    this._clampCurrentValues();
  }

  // Scale current HP/MP when boss trait toggles, preserving ratio (p.123). v14: async, false vetoes.
  async _preUpdate(changed, options, user) {
    const result = await super._preUpdate(changed, options, user);
    if (result === false) return false;

    if (!("isBoss" in changed)) return;

    const wasBoss = this.isBoss;
    const willBeBoss = changed.isBoss;
    if (willBeBoss === wasBoss) return;

    const boss = CONFIG.SMT.bossHpMpMultiplier;
    changed.hp ??= {};
    changed.mp ??= {};
    if (willBeBoss) {
      changed.hp.value = this.hp.value * boss;
      changed.mp.value = this.mp.value * boss;
    } else {
      changed.hp.value = Math.floor(this.hp.value / boss);
      changed.mp.value = Math.floor(this.mp.value / boss);
    }
  }
}
