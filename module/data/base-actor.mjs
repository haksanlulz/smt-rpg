import { makeAffinitySchema, makeAilmentAffinitySchema, STATS } from "./fields.mjs";

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
      // Single common-ailment slot: holds the one highest-priority common
      // ailment (p.68). Death and Curse are special (p.67) and live OUTSIDE
      // this slot as the boolean flags below so they stack alongside it.
      ailment: new StringField({ initial: "none" }),
      deathAilment: new BooleanField({ initial: false }),
      curseAilment: new BooleanField({ initial: false }),
      background1: new HTMLField({ initial: "" }),
      background2: new HTMLField({ initial: "" }),
      goal: new HTMLField({ initial: "" }),
      contacts: new HTMLField({ initial: "" }),
      bonds: new HTMLField({ initial: "" }),
      notes: new HTMLField({ initial: "" })
    };
  }

  /**
   * HP multiplier for this actor's type (p.36). Sourced from
   * CONFIG.SMT.hpMultipliers keyed by actor type; falls back to the demon
   * value (6) when the type is unmapped.
   * @returns {number}
   */
  get hpMultiplier() {
    return CONFIG.SMT.hpMultipliers[this.parent.type] ?? CONFIG.SMT.hpMultipliers.demon;
  }

  /**
   * MP multiplier for this actor's type (p.36). Sourced from
   * CONFIG.SMT.mpMultipliers keyed by actor type; falls back to the demon
   * value (3) when the type is unmapped.
   * @returns {number}
   */
  get mpMultiplier() {
    return CONFIG.SMT.mpMultipliers[this.parent.type] ?? CONFIG.SMT.mpMultipliers.demon;
  }

  get expMultiplier() {
    return 1;
  }

  /**
   * Whether this actor has a passive skill granting Might (p.110), which
   * widens the crit threshold for basic strikes / physical attack skills.
   * Centralizes the name-based detection previously inlined at the attack
   * sites (combat / item / sheet) so they can read this getter instead.
   * @returns {boolean}
   */
  get hasMightPassive() {
    return this.parent?.items?.some(
      i => i.type === "skill" && i.name === CONFIG.SMT.mightPassiveName
    ) ?? false;
  }

  /**
   * HP/MP multiplier bonuses from passive skills (highest tier only — similar
   * abilities do not stack, p.109). Tier values are config-driven via
   * CONFIG.SMT.passiveBonuses keyed by skill name.
   * @returns {{hpBonus: number, mpBonus: number}}
   */
  _getPassiveMultiplierBonuses() {
    let hpBonus = 0;
    let mpBonus = 0;
    const hpTiers = CONFIG.SMT.passiveBonuses.hp;
    const mpTiers = CONFIG.SMT.passiveBonuses.mp;
    const skills = this.parent?.items?.filter(i => i.type === "skill" && i.system.skillType === "passive") ?? [];
    for (const skill of skills) {
      if (skill.name in hpTiers) hpBonus = Math.max(hpBonus, hpTiers[skill.name]);
      if (skill.name in mpTiers) mpBonus = Math.max(mpBonus, mpTiers[skill.name]);
    }
    return { hpBonus, mpBonus };
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

    // Clamping done in _clampCurrentValues() after subtype modifications

    // Resistances: (vitality|magic + level) / 2 (p.36)
    this.physicalResistance = Math.floor((this.vitalityTotal + lvl) / 2);
    this.magicalResistance = Math.floor((this.magicTotal + lvl) / 2);

    // Base power: stat + level (p.36)
    this.basePhysicalPower = this.strengthTotal + lvl;
    this.baseMagicalPower = this.magicTotal + lvl;

    // Dodge TN = agility TN + 10; Negotiation TN = (luck x 2) + 20 (p.35)
    this.dodgeTN = this.agilityTN + CONFIG.SMT.dodgeBonus;
    this.negotiationTN = (this.luckTotal * CONFIG.SMT.negotiation.multiplier) + CONFIG.SMT.negotiation.bonus;
    this.saveTN = this.vitalityTN;

    // Fate = (luck / 5) + 5 (p.36)
    this.fatePoints.max = Math.floor(this.luckTotal / CONFIG.SMT.fate.maxLuckDivisor) + CONFIG.SMT.fate.maxBase;
    // EXP needed for next level = level^3 (p.48); expMultiplier is a per-type system extension
    this.expNext = Math.floor(Math.pow(lvl + 1, 3) * this.expMultiplier);
  }

  _clampCurrentValues() {
    this.hp.value = Math.clamp(this.hp.value, 0, this.hp.max);
    this.mp.value = Math.clamp(this.mp.value, 0, this.mp.max);
    this.fatePoints.value = Math.clamp(this.fatePoints.value, 0, this.fatePoints.max);
  }
}
