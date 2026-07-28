import { makeAffinitySchema, makeAilmentAffinitySchema, makeCategoryAffinitySchema, STATS } from "./fields.mjs";
import {
  passiveMultiplierBonuses, hasMightEffect, shootTnBonus, powerDiceFor,
  dodgeTnBonus, elementBoosts, hasEndureEffect, combatEndRecovery, counterEffect,
  affinityOverrides, betterAffinity
} from "../helpers/passives.mjs";
import { expThresholdForLevel, canLevelUp } from "../helpers/advancement.mjs";
import { resolveResourceMax } from "../helpers/resources.mjs";
import { flyStatTotals } from "../helpers/ailments.mjs";

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
      // Fixed maxima for stat blocks the formula cannot reproduce -- boss HP/MP is
      // hand-authored in the book (p.123-125). 0 means "derive normally".
      hpMaxOverride: new NumberField({ integer: true, min: 0, initial: 0 }),
      mpMaxOverride: new NumberField({ integer: true, min: 0, initial: 0 }),

      fatePoints: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 5 })
      }),

      macca: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      affinities: makeAffinitySchema(),
      ailmentAffinities: makeAilmentAffinitySchema(),
      // Category ratings, printed on stat blocks as "Strong Magic" / "Null Ailment
      // Attacks" (p.65). These are not elements: Magic applies to every magical
      // attack and STACKS with the element rating, while Ailment affects only the
      // ailment effect rate and never damage.
      categoryAffinities: makeCategoryAffinitySchema(),
      // Single common-ailment slot (p.68); Death/Curse are separate flags so they stack alongside it (p.67).
      ailment: new StringField({ initial: "none" }),
      deathAilment: new BooleanField({ initial: false }),
      curseAilment: new BooleanField({ initial: false }),
      // Set when a save against the current ailment has already been failed. Only
      // Freeze and Shock read it: p.68 gives them one failure, then a free recovery
      // at the following turn start. Reset whenever the ailment slot changes.
      ailmentSaveFailed: new BooleanField({ initial: false }),
      // Endure is once per combat (p.110); cleared when combat ends.
      endureUsed: new BooleanField({ initial: false }),

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
      // Aid's pending +% (p.64). Separate from Concentrate because the two are
      // different actions with different sources and stack independently.
      aid: new SchemaField({
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

  // Flat +Shoot-TN from passive skills (e.g. Sure Shot +10). Folded into rangedWeapon.tn.
  get rangedTnBonus() {
    const passives = this._skillItems.filter(s => s.system?.skillType === "passive");
    return shootTnBonus(passives, CONFIG.SMT.passiveEffects);
  }

  // Amplify, Shoot-TN, dodge, power-die, Boost, Endure and combat-end passives all
  // come only from passive-type skills (p.109).
  get _passiveSkills() {
    return this._skillItems.filter(s => s.system?.skillType === "passive");
  }

  // Extra physical power-roll dice (e.g. Powerful Strikes +1d10) as a roll fragment ("" if none).
  get physicalPowerBonusDice() {
    return powerDiceFor(this._passiveSkills, CONFIG.SMT.passiveEffects, "physical").join(" + ");
  }

  // The same, for spells and magical attacks (Powerful Spells, p.110).
  get magicalPowerBonusDice() {
    return powerDiceFor(this._passiveSkills, CONFIG.SMT.passiveEffects, "magical").join(" + ");
  }

  // { fire: 1.5, ... } for whichever elements a Boost passive covers (p.110).
  get elementPowerBoosts() {
    return elementBoosts(this._passiveSkills, CONFIG.SMT.passiveEffects);
  }

  // Multiplier applied to base power + potency BEFORE the power roll (p.110).
  boostFor(element) {
    return this.elementPowerBoosts[element] ?? 1;
  }

  // Best counterattack passive held, or null (Counter/Retaliate/Avenge, p.110).
  get counterPassive() {
    return counterEffect(this._passiveSkills, CONFIG.SMT.passiveEffects);
  }

  get hasEndurePassive() {
    return hasEndureEffect(this._passiveSkills, CONFIG.SMT.passiveEffects);
  }

  // { hpPct, mpPct } restored when combat ends (Life Aid / Mana Aid / Victory Cry, p.110).
  get combatEndRecoveryPct() {
    return combatEndRecovery(this._passiveSkills, CONFIG.SMT.passiveEffects);
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
    this.aid.amount = 0;
    this.defend.amount = 0;
  }

  prepareDerivedData() {
    const lvl = this.level;

    for (const stat of STATS) {
      this[`${stat}Total`] = Math.min(this[stat] + this.statBonuses[stat], 40);
    }

    // Fly flattens every stat but Agility to 1 (p.66). Operator ruling 2026-07-28:
    // that reaches everything below EXCEPT the HP/MP pools, so the pool stats are
    // read here, before the flattening, and nothing else is.
    const poolStats = { vitality: this.vitalityTotal, magic: this.magicTotal };
    if (this.ailment === "fly") {
      const flied = flyStatTotals(
        Object.fromEntries(STATS.map(s => [s, this[`${s}Total`]])),
        this.ailment
      );
      for (const stat of STATS) this[`${stat}Total`] = flied[stat];
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
    this.hp.max = resolveResourceMax({
      stat: poolStats.vitality, level: lvl,
      multiplier: this.hpMultiplier + hpBonus, override: this.hpMaxOverride
    });
    this.mp.max = resolveResourceMax({
      stat: poolStats.magic, level: lvl,
      multiplier: this.mpMultiplier + mpBonus, override: this.mpMaxOverride
    });

    // Resistances: (vitality|magic + level) / 2 (p.36)
    this.physicalResistance = Math.floor((this.vitalityTotal + lvl) / 2);
    this.magicalResistance = Math.floor((this.magicTotal + lvl) / 2);

    // Base power: stat + level (p.36)
    this.basePhysicalPower = this.strengthTotal + lvl;
    this.baseMagicalPower = this.magicTotal + lvl;

    // Dodge TN = agility + 10; Negotiation TN = (luck x 2) + 20 (p.35). Both are NOT level-based.
    // Expert Dodge (+5%, p.110) rides here with the flat base bonus.
    this.dodgeTN = this.agilityTotal + CONFIG.SMT.dodgeBonus
      + dodgeTnBonus(this._passiveSkills, CONFIG.SMT.passiveEffects);
    this.negotiationTN = (this.luckTotal * CONFIG.SMT.negotiation.multiplier) + CONFIG.SMT.negotiation.bonus;
    this.saveTN = this.vitalityTN;

    // Affinity Changer skills (p.109). Applied after any magatama override, and by
    // p.65's priority rather than last-writer-wins, so Anti-Fire cannot downgrade a
    // demon that already Repels Fire.
    for (const [element, rating] of Object.entries(affinityOverrides(this._passiveSkills, CONFIG.SMT.passiveEffects))) {
      if (element in this.affinities) {
        this.affinities[element] = betterAffinity(this.affinities[element], rating);
      }
    }

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
