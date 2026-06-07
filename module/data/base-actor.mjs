import { makeAffinitySchema, makeAilmentAffinitySchema, STATS } from "./fields.mjs";
import { passiveMultiplierBonuses, hasMightEffect } from "../helpers/passives.mjs";
import { expThresholdForLevel, canLevelUp } from "../helpers/advancement.mjs";

const { SchemaField, NumberField, StringField, BooleanField, HTMLField } = foundry.data.fields;

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
      // Single common-ailment slot (p.68); Death/Curse are separate flags so they stack alongside it (p.67).
      ailment: new StringField({ initial: "none" }),
      deathAilment: new BooleanField({ initial: false }),
      curseAilment: new BooleanField({ initial: false }),

      // Buff/debuff accumulators (p.96); stored so effects have a key to target, re-zeroed each prepare.
      buffs: new SchemaField({
        physicalPower: new NumberField({ integer: true, initial: 0 }),
        magicalPower: new NumberField({ integer: true, initial: 0 }),
        resist: new NumberField({ integer: true, initial: 0 }),
        accuracy: new NumberField({ integer: true, initial: 0 }),
        dodge: new NumberField({ integer: true, initial: 0 })
      }),
      // Setup-action accumulators (p.64): Concentrate's pending +%, Defend's dodge bonus.
      concentrate: new SchemaField({
        amount: new NumberField({ integer: true, initial: 0 })
      }),
      defend: new SchemaField({
        amount: new NumberField({ integer: true, initial: 0 })
      }),

      background1: new HTMLField({ initial: "" }),
      background2: new HTMLField({ initial: "" }),
      goal: new HTMLField({ initial: "" }),
      contacts: new HTMLField({ initial: "" }),
      bonds: new HTMLField({ initial: "" }),
      notes: new HTMLField({ initial: "" })
    };
  }

  // p.36; falls back to demon value when type unmapped.
  get hpMultiplier() {
    return CONFIG.SMT.hpMultipliers[this.parent.type] ?? CONFIG.SMT.hpMultipliers.demon;
  }

  // p.36; falls back to demon value when type unmapped.
  get mpMultiplier() {
    return CONFIG.SMT.mpMultipliers[this.parent.type] ?? CONFIG.SMT.mpMultipliers.demon;
  }

  get expMultiplier() {
    return 1;
  }

  get _skillItems() {
    return this.parent?.items?.filter(i => i.type === "skill") ?? [];
  }

  // Might passive widens the crit threshold for strikes/physical attacks (p.110).
  get hasMightPassive() {
    return hasMightEffect(this._skillItems, CONFIG.SMT.passiveEffects);
  }

  // HP/MP multiplier bonuses from passive skills, highest tier only (p.109).
  _getPassiveMultiplierBonuses() {
    // Amplify bonuses come only from passive-type skills (p.109).
    const passives = this._skillItems.filter(s => s.system?.skillType === "passive");
    return passiveMultiplierBonuses(passives, CONFIG.SMT.passiveEffects);
  }

  // Zero the buff/setup accumulators before effects apply (p.96, p.64).
  prepareBaseData() {
    super.prepareBaseData();
    this.buffs.physicalPower = 0;
    this.buffs.magicalPower = 0;
    this.buffs.resist = 0;
    this.buffs.accuracy = 0;
    this.buffs.dodge = 0;
    this.concentrate.amount = 0;
    this.defend.amount = 0;
  }

  prepareDerivedData() {
    const lvl = this.level;

    for (const stat of STATS) {
      this[`${stat}Total`] = Math.min(this[stat] + this.statBonuses[stat], 40);
    }

    // Stat TNs: (stat x 5) + level (p.35)
    const tnPerStat = CONFIG.SMT.tnPerStat;
    this.strengthTN = (this.strengthTotal * tnPerStat) + lvl;
    this.magicTN = (this.magicTotal * tnPerStat) + lvl;
    this.vitalityTN = (this.vitalityTotal * tnPerStat) + lvl;
    this.agilityTN = (this.agilityTotal * tnPerStat) + lvl;
    this.luckTN = (this.luckTotal * tnPerStat) + lvl;

    // HP/MP = (vitality|magic + level) x (multiplier + passive bonus) (p.36, p.109)
    const { hpBonus, mpBonus } = this._getPassiveMultiplierBonuses();
    this.hp.max = (this.vitalityTotal + lvl) * (this.hpMultiplier + hpBonus);
    this.mp.max = (this.magicTotal + lvl) * (this.mpMultiplier + mpBonus);

    // Resistances: (vitality|magic + level) / 2 (p.36)
    this.physicalResistance = Math.floor((this.vitalityTotal + lvl) / 2);
    this.magicalResistance = Math.floor((this.magicTotal + lvl) / 2);

    // Base power: stat + level (p.36)
    this.basePhysicalPower = this.strengthTotal + lvl;
    this.baseMagicalPower = this.magicTotal + lvl;

    // Dodge TN = agility + 10; Negotiation TN = (luck x 2) + 20 (p.35). Both are NOT level-based.
    this.dodgeTN = this.agilityTotal + CONFIG.SMT.dodgeBonus;
    this.negotiationTN = (this.luckTotal * CONFIG.SMT.negotiation.multiplier) + CONFIG.SMT.negotiation.bonus;
    this.saveTN = this.vitalityTN;

    this._applyBuffModifiers();

    // Fate = (luck / 5) + 5 (p.36)
    this.fatePoints.max = Math.floor(this.luckTotal / CONFIG.SMT.fate.maxLuckDivisor) + CONFIG.SMT.fate.maxBase;
    // EXP for next level = (level+1)^3 x expMultiplier (p.48), via the shared curve.
    this.expNext = expThresholdForLevel(lvl + 1, this.expMultiplier);
  }

  // True once banked EXP meets the next level's threshold and the cap isn't reached (p.48).
  get canLevelUp() {
    return canLevelUp(this.exp, this.level, this.expMultiplier);
  }

  // Fold buff/debuff accumulators into combat stats (p.96). Powers/resists floor at 0.
  _applyBuffModifiers() {
    this.basePhysicalPower = Math.max(0, this.basePhysicalPower + this.buffs.physicalPower);
    this.baseMagicalPower = Math.max(0, this.baseMagicalPower + this.buffs.magicalPower);

    this.physicalResistance = Math.max(0, this.physicalResistance + this.buffs.resist);
    this.magicalResistance = Math.max(0, this.magicalResistance + this.buffs.resist);

    const acc = this.buffs.accuracy;
    if (acc) {
      this.strengthTN += acc;
      this.magicTN += acc;
      this.agilityTN += acc;
    }

    // dodgeTN is based on raw agility, independent of the accuracy fold above; only the dodge axis applies here.
    this.dodgeTN += this.buffs.dodge + this.defend.amount;
  }

  _clampCurrentValues() {
    this.hp.value = Math.clamp(this.hp.value, 0, this.hp.max);
    this.mp.value = Math.clamp(this.mp.value, 0, this.mp.max);
    this.fatePoints.value = Math.clamp(this.fatePoints.value, 0, this.fatePoints.max);
  }
}
