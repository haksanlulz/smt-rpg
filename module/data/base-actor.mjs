import { makeAffinitySchema, makeAilmentAffinitySchema, STATS } from "./fields.mjs";

const { SchemaField, NumberField, StringField, HTMLField } = foundry.data.fields;

export default class SMTBaseActorData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      strength: new NumberField({ required: true, integer: true, min: 0, max: 40, initial: 1 }),
      magic: new NumberField({ required: true, integer: true, min: 0, max: 40, initial: 1 }),
      vitality: new NumberField({ required: true, integer: true, min: 0, max: 40, initial: 1 }),
      agility: new NumberField({ required: true, integer: true, min: 0, max: 40, initial: 1 }),
      luck: new NumberField({ required: true, integer: true, min: 0, max: 40, initial: 1 }),

      statBonuses: new SchemaField({
        strength: new NumberField({ integer: true, initial: 0 }),
        magic: new NumberField({ integer: true, initial: 0 }),
        vitality: new NumberField({ integer: true, initial: 0 }),
        agility: new NumberField({ integer: true, initial: 0 }),
        luck: new NumberField({ integer: true, initial: 0 })
      }),

      level: new NumberField({ required: true, integer: true, min: 1, max: 100, initial: 1 }),
      exp: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

      hp: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
      }),
      mp: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 5 })
      }),

      fatePoints: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 5 })
      }),

      macca: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      affinities: makeAffinitySchema(),
      ailmentAffinities: makeAilmentAffinitySchema(),
      ailment: new StringField({ initial: "none" }),
      background1: new HTMLField({ initial: "" }),
      background2: new HTMLField({ initial: "" }),
      goal: new HTMLField({ initial: "" }),
      contacts: new HTMLField({ initial: "" }),
      bonds: new HTMLField({ initial: "" }),
      notes: new HTMLField({ initial: "" })
    };
  }

  get hpMultiplier() {
    return 6;
  }

  get mpMultiplier() {
    return 3;
  }

  get expMultiplier() {
    return 1;
  }

  // HP/MP multiplier bonuses from passive skills (highest only, don't stack)
  _getPassiveMultiplierBonuses() {
    let hpBonus = 0;
    let mpBonus = 0;
    const skills = this.parent?.items?.filter(i => i.type === "skill" && i.system.skillType === "passive") ?? [];
    for (const skill of skills) {
      switch (skill.name) {
        case "Life Bonus": hpBonus = Math.max(hpBonus, 1); break;
        case "Life Gain": hpBonus = Math.max(hpBonus, 2); break;
        case "Life Surge": hpBonus = Math.max(hpBonus, 3); break;
        case "Mana Bonus": mpBonus = Math.max(mpBonus, 1); break;
        case "Mana Gain": mpBonus = Math.max(mpBonus, 2); break;
        case "Mana Surge": mpBonus = Math.max(mpBonus, 3); break;
      }
    }
    return { hpBonus, mpBonus };
  }

  prepareDerivedData() {
    const lvl = this.level;

    for (const stat of STATS) {
      this[`${stat}Total`] = Math.min(this[stat] + this.statBonuses[stat], 40);
    }

    // TNs: (stat x 5) + level
    this.strengthTN = (this.strengthTotal * 5) + lvl;
    this.magicTN = (this.magicTotal * 5) + lvl;
    this.vitalityTN = (this.vitalityTotal * 5) + lvl;
    this.agilityTN = (this.agilityTotal * 5) + lvl;
    this.luckTN = (this.luckTotal * 5) + lvl;

    const { hpBonus, mpBonus } = this._getPassiveMultiplierBonuses();
    this.hp.max = (this.vitalityTotal + lvl) * (this.hpMultiplier + hpBonus);
    this.mp.max = (this.magicTotal + lvl) * (this.mpMultiplier + mpBonus);

    // Clamping done in _clampCurrentValues() after subtype modifications

    this.physicalResistance = Math.floor((this.vitalityTotal + lvl) / 2);
    this.magicalResistance = Math.floor((this.magicTotal + lvl) / 2);

    this.basePhysicalPower = this.strengthTotal + lvl;
    this.baseMagicalPower = this.magicTotal + lvl;

    this.dodgeTN = this.agilityTN + 10;
    this.negotiationTN = (this.luckTotal * 2) + 20;
    this.saveTN = this.vitalityTN;

    this.fatePoints.max = Math.floor(this.luckTotal / 5) + 5;
    this.expNext = Math.floor(Math.pow(lvl + 1, 3) * this.expMultiplier);
  }

  _clampCurrentValues() {
    this.hp.value = Math.clamp(this.hp.value, 0, this.hp.max);
    this.mp.value = Math.clamp(this.mp.value, 0, this.mp.max);
    this.fatePoints.value = Math.clamp(this.fatePoints.value, 0, this.fatePoints.max);
  }
}
