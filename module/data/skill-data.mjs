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
      // Shots fired per use for ranged-attack skills (Double Tap = 2); ignored for other types.
      shots: new NumberField({ integer: true, min: 1, initial: 1 }),
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
      // Recovery skills are four effects, not one (p.100, p.104): heal, cure, revive,
      // and — for Recarmdra alone — kill the caster afterwards. Resolved through
      // helpers/recovery.mjs recoveryPlan(). Names mirror ConsumableData deliberately,
      // since the two paths express the same book effects.
      healFull: new BooleanField({ initial: false }),
      // "none" | CONFIG.SMT.skillCureAll | a whitespace- or comma-separated list of
      // ailment keys (Patra is "restrain sleep panic"). Parsed by curedAilments().
      curesAilment: new StringField({ initial: "none" }),
      revive: new BooleanField({ initial: false }),
      reviveFull: new BooleanField({ initial: false }),
      selfKO: new BooleanField({ initial: false }),
      // Mechanical passive this skill grants (Amplify / Might, p.109-110); "none" = no effect. Resolution in helpers/passives.mjs.
      passiveEffect: new StringField({
        initial: "none",
        choices: Object.keys(CONFIG.SMT.passiveEffects)
      }),
      inheritanceType: new StringField({ initial: "" }),
      // Fractional-HP attacks (p.102-103): "reduced to half their current HP" /
      // "to 20% of their current HP" / "to 1 HP". Not damage maths — the target's
      // CURRENT HP decides the number, so these carry no potency. helpers/damage.mjs
      // fractionalEnd() is the single resolver.
      fractionalHP: new StringField({
        initial: "none",
        choices: ["none", "half", "toPercent", "toOne"]
      }),
      fractionalPercent: new NumberField({ integer: true, min: 1, max: 99, initial: 20 }),
      // "Fate points cannot reduce this amount." Printed on Thunderclap, Holy Wrath,
      // Godly Light and Evil Gaze — NOT on Sol Niger, which the book leaves bare.
      // Blocks the Halve Damage button on the resulting card.
      fpImmune: new BooleanField({ initial: false }),
      // Drain skills (p.103): damage as normal, then the caster recovers what the
      // target actually lost. Deathtouch drains HP, Mana Drain MP, Life Drain and
      // Domination both. Distinct from the Drain AFFINITY.
      drainsHP: new BooleanField({ initial: false }),
      drainsMP: new BooleanField({ initial: false }),
      // Conditional instant kill riding an attack: "50% chance to Instant Kill a
      // Stoned target" (Zan group, p.98), "Instant Kill all Sleeping targets"
      // (Eternal Rest). The condition is the target's ailment BEFORE the hit.
      killCondition: new SchemaField({
        ailment: new StringField({ initial: "none" }),
        rate: new NumberField({ integer: true, min: 0, max: 100, initial: 0 })
      }),
      // Use limits (p.96). "none" is the overwhelming majority; a skill that states
      // no limit gets none, because inventing one forbids a legal action. The ledger
      // lives on the actor, keyed by period and skill name — see helpers/uses.mjs.
      // Barrier skills (p.101): Tetraja, Makarakarn, Tetrakarn. "none" = not a barrier.
      // The rating each grants, and whether it runs on rounds or on charges, lives in
      // CONFIG.SMT.barriers — the skill only names which one it is. Resolution in
      // helpers/barriers.mjs.
      barrier: new StringField({
        initial: "none",
        choices: ["none", ...Object.keys(CONFIG.SMT.barriers)]
      }),
      // Press skills (p.96): Beast Eye and Dragon Eye. "They cost one action to apply.
      // Beast Eye spends one action to grant two actions... Dragon Eye takes one action
      // to grant four actions." Stored GROSS — the action it costs is charged by the
      // same budget every other action goes through, so the book's "effectively one
      // additional action" is arithmetic rather than a second number to keep in sync.
      // 0 = not a press skill. Resolution in helpers/actions.mjs.
      grantsActions: new NumberField({ integer: true, min: 0, initial: 0 }),
      useLimit: new SchemaField({
        period: new StringField({
          initial: "none",
          choices: ["none", "round", "combat", "scenario"]
        }),
        count: new NumberField({ integer: true, min: 1, initial: 1 })
      })
    };
  }
}
