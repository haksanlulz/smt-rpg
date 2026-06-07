import { makeAffinitySchema, makeAilmentAffinitySchema, STATS } from "./fields.mjs";
import { passiveMultiplierBonuses, hasMightEffect } from "../helpers/passives.mjs";

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

      // Buff/debuff accumulators (p.96). One field per axis in
      // CONFIG.SMT.buffAxes. ActiveEffect ADD-mode changes write into these; they
      // are re-zeroed every prepare cycle (prepareBaseData) and folded into the
      // derived combat stats (prepareDerivedData). Stored — not pure-derived — so
      // effect application has a schema-backed key to target.
      buffs: new SchemaField({
        physicalPower: new NumberField({ integer: true, initial: 0 }),
        magicalPower: new NumberField({ integer: true, initial: 0 }),
        resist: new NumberField({ integer: true, initial: 0 }),
        accuracy: new NumberField({ integer: true, initial: 0 }),
        dodge: new NumberField({ integer: true, initial: 0 })
      }),
      // Setup-action accumulators (p.64), likewise fed by ActiveEffect ADD-mode
      // changes. Concentrate holds the pending +% for the next named action;
      // Defend holds the dodge bonus active until the start of the next turn.
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
   * This actor's skill items (the carriers of passive effects). Source for the
   * passive-effect resolution below.
   * @returns {Array} skill items, or an empty array when the actor is unbound.
   */
  get _skillItems() {
    return this.parent?.items?.filter(i => i.type === "skill") ?? [];
  }

  /**
   * Whether this actor has a passive skill granting Might (p.110), which
   * widens the crit threshold for basic strikes / physical attack skills.
   * Centralizes the detection previously inlined at the attack sites (combat /
   * item / sheet) so they can read this getter instead. Resolution is enum-first
   * (system.passiveEffect) with a legacy skill-name fallback, via the shared
   * CONFIG.SMT.passiveEffects registry.
   * @returns {boolean}
   */
  get hasMightPassive() {
    return hasMightEffect(this._skillItems, CONFIG.SMT.passiveEffects);
  }

  /**
   * HP/MP multiplier bonuses from passive skills (highest tier only — similar
   * abilities do not stack, p.109). Each skill resolves to its
   * CONFIG.SMT.passiveEffects entry by system.passiveEffect, with a legacy
   * skill-name fallback; the pure resolver lives in helpers/passives.mjs.
   * @returns {{hpBonus: number, mpBonus: number}}
   */
  _getPassiveMultiplierBonuses() {
    // Amplify HP/MP bonuses come only from passive-type skills (p.109), matching the
    // pre-registry behavior so a non-passive skill that happens to share a legacy name
    // cannot grant a multiplier. (Might detection matches by name regardless, as before.)
    const passives = this._skillItems.filter(s => s.system?.skillType === "passive");
    return passiveMultiplierBonuses(passives, CONFIG.SMT.passiveEffects);
  }

  /**
   * Zero every buff/setup-action accumulator before ActiveEffects apply (their
   * ADD-mode changes write onto these fields), so each prepare cycle starts from
   * a clean slate and stale stacks cannot compound across renders. Keys mirror
   * CONFIG.SMT.buffAxes plus the concentrate/defend accumulators (p.96, p.64).
   */
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

    // Fold buff/debuff and Defend accumulators into the combat stats (p.96, p.64).
    this._applyBuffModifiers();

    // Fate = (luck / 5) + 5 (p.36)
    this.fatePoints.max = Math.floor(this.luckTotal / CONFIG.SMT.fate.maxLuckDivisor) + CONFIG.SMT.fate.maxBase;
    // EXP needed for next level = level^3 (p.48); expMultiplier is a per-type system extension
    this.expNext = Math.floor(Math.pow(lvl + 1, 3) * this.expMultiplier);
  }

  /**
   * Fold the effect-fed buff/debuff accumulators into the derived combat stats
   * (p.96), reading the base values the existing formulas already produced from
   * effect-modified stats. Applied AFTER those formulas so the buffs layer on
   * top rather than feed back into them:
   * - physicalPower / magicalPower → basePhysicalPower / baseMagicalPower
   *   (Tarukaja, Makakaja, and Tarunda — the universal attack-power debuff —
   *   land here);
   * - resist → both physical and magical resistance (Rakukaja / Rakunda);
   * - accuracy → the attack-check TNs only (Strength / Magic / Agility), never
   *   the save / negotiation / luck TNs (Sukukaja / Sukunda);
   * - dodge → the dodge TN, plus the Defend bonus (Sukukaja / Sukunda + Defend).
   * dodgeTN is read from agilityTN BEFORE this fold, so Sukukaja's dodge effect
   * comes solely from the dodge accumulator and the agility accumulator does not
   * cascade into it twice. Powers and resistances floor at 0 so debuffs cannot
   * drive them negative.
   */
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

    this.dodgeTN += this.buffs.dodge + this.defend.amount;
  }

  _clampCurrentValues() {
    this.hp.value = Math.clamp(this.hp.value, 0, this.hp.max);
    this.mp.value = Math.clamp(this.mp.value, 0, this.mp.max);
    this.fatePoints.value = Math.clamp(this.fatePoints.value, 0, this.fatePoints.max);
  }
}
