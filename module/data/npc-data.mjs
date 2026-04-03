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
      negotiable: new BooleanField({ initial: true })
    };
  }

  get hpMultiplier() {
    return 6;
  }

  get mpMultiplier() {
    return 3;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // Boss trait: double HP and MP (p.123)
    if (this.isBoss) {
      this.hp.max = Math.floor(this.hp.max * 2);
      this.mp.max = Math.floor(this.mp.max * 2);
    }
    this._clampCurrentValues();
  }

  // Scale current HP/MP when boss trait is toggled to preserve ratio
  _preUpdate(changed, options, userId) {
    super._preUpdate(changed, options, userId);
    if (!("isBoss" in changed)) return;

    const wasBoss = this.isBoss;
    const willBeBoss = changed.isBoss;
    if (willBeBoss === wasBoss) return;

    if (willBeBoss) {
      changed.hp ??= {};
      changed.mp ??= {};
      changed.hp.value = this.hp.value * 2;
      changed.mp.value = this.mp.value * 2;
    } else {
      changed.hp ??= {};
      changed.mp ??= {};
      changed.hp.value = Math.floor(this.hp.value / 2);
      changed.mp.value = Math.floor(this.mp.value / 2);
    }
  }
}
