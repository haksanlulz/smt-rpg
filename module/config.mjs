export const SMT = {};

SMT.elements = {
  phys: "SMT.Element.Phys",
  fire: "SMT.Element.Fire",
  ice: "SMT.Element.Ice",
  elec: "SMT.Element.Elec",
  force: "SMT.Element.Force",
  mind: "SMT.Element.Mind",
  nerve: "SMT.Element.Nerve",
  ruin: "SMT.Element.Ruin",
  dark: "SMT.Element.Dark",
  light: "SMT.Element.Light",
  almighty: "SMT.Element.Almighty",
  recovery: "SMT.Element.Recovery",
  support: "SMT.Element.Support",
  none: "SMT.Element.None"
};

SMT.affinityRatings = {
  normal: "SMT.Affinity.Normal",
  strong: "SMT.Affinity.Strong",
  null: "SMT.Affinity.Null",
  drain: "SMT.Affinity.Drain",
  repel: "SMT.Affinity.Repel",
  weak: "SMT.Affinity.Weak"
};

SMT.ailmentAffinityRatings = {
  normal: "SMT.Affinity.Normal",
  strong: "SMT.Affinity.Strong",
  null: "SMT.Affinity.Null",
  weak: "SMT.Affinity.Weak"
};

SMT.ailments = {
  death: "SMT.Ailment.Death",
  stone: "SMT.Ailment.Stone",
  fly: "SMT.Ailment.Fly",
  stun: "SMT.Ailment.Stun",
  charm: "SMT.Ailment.Charm",
  poison: "SMT.Ailment.Poison",
  mute: "SMT.Ailment.Mute",
  restrain: "SMT.Ailment.Restrain",
  freeze: "SMT.Ailment.Freeze",
  sleep: "SMT.Ailment.Sleep",
  panic: "SMT.Ailment.Panic",
  shock: "SMT.Ailment.Shock",
  curse: "SMT.Ailment.Curse"
};

// Lower number = higher priority (p.68). Only the single highest-priority
// common ailment occupies the one shared slot. Death and Curse are special
// (p.67) and are NOT listed here — they stack as separate flags (see below).
SMT.ailmentPriority = {
  stone: 1, fly: 2, stun: 3, charm: 4,
  poison: 5, mute: 6, restrain: 7, freeze: 8,
  sleep: 9, panic: 10, shock: 11
};

// Death and Curse (p.67) are tracked as separate boolean flags OUTSIDE the
// single common-ailment priority slot, so they stack alongside the one
// highest-priority common ailment rather than displacing it.
SMT.specialAilments = ["death", "curse"];

// Elements that use ailment affinities instead of damage affinities
SMT.ailmentElements = new Set(["mind", "nerve", "ruin", "dark"]);

SMT.stats = {
  strength: "SMT.Stat.Strength",
  magic: "SMT.Stat.Magic",
  vitality: "SMT.Stat.Vitality",
  agility: "SMT.Stat.Agility",
  luck: "SMT.Stat.Luck"
};

SMT.statsAbbr = {
  strength: "SMT.Stat.St",
  magic: "SMT.Stat.Ma",
  vitality: "SMT.Stat.Vi",
  agility: "SMT.Stat.Ag",
  luck: "SMT.Stat.Lu"
};

SMT.actorClasses = {
  fiend: "SMT.Class.Fiend",
  demon: "SMT.Class.Demon",
  human: "SMT.Class.Human"
};

SMT.humanSubclasses = {
  potential: "SMT.Subclass.Potential",
  reporter: "SMT.Subclass.Reporter",
  brawler: "SMT.Subclass.Brawler",
  swordsman: "SMT.Subclass.Swordsman",
  maiden: "SMT.Subclass.Maiden",
  sorcerer: "SMT.Subclass.Sorcerer",
  manikin: "SMT.Subclass.Manikin",
  soldier: "SMT.Subclass.Soldier"
};

SMT.demonClans = {
  deity: "Deity",
  megami: "Megami",
  fury: "Fury",
  lady: "Lady",
  kishin: "Kishin",
  holy: "Holy",
  yoma: "Yoma",
  fairy: "Fairy",
  night: "Night",
  divine: "Divine",
  fallen: "Fallen",
  snake: "Snake",
  beast: "Beast",
  jirae: "Jirae",
  brute: "Brute",
  femme: "Femme",
  vile: "Vile",
  tyrant: "Tyrant",
  wilder: "Wilder",
  haunt: "Haunt",
  foul: "Foul",
  seraph: "Seraph",
  wargod: "Wargod",
  genma: "Genma",
  dragon: "Dragon",
  avatar: "Avatar",
  avian: "Avian",
  raptor: "Raptor",
  entity: "Entity",
  mitama: "Mitama",
  element: "Element"
};

SMT.skillTypes = {
  "physical-attack": "SMT.SkillType.PhysicalAttack",
  "magical-attack": "SMT.SkillType.MagicalAttack",
  spell: "SMT.SkillType.Spell",
  recovery: "SMT.SkillType.Recovery",
  support: "SMT.SkillType.Support",
  debuff: "SMT.SkillType.Debuff",
  passive: "SMT.SkillType.Passive",
  "talk-approach": "SMT.SkillType.TalkApproach",
  "talk-support": "SMT.SkillType.TalkSupport"
};

SMT.gearTypes = {
  "weapon-melee": "SMT.GearType.WeaponMelee",
  "weapon-ranged": "SMT.GearType.WeaponRanged",
  armor: "SMT.GearType.Armor",
  accessory: "SMT.GearType.Accessory"
};

SMT.consumableTypes = {
  medicine: "SMT.ConsumableType.Medicine",
  gem: "SMT.ConsumableType.Gem",
  rock: "SMT.ConsumableType.Rock",
  bead: "SMT.ConsumableType.Bead",
  key: "SMT.ConsumableType.Key"
};

// HP/MP = (vitality|magic + level) x multiplier (p.36). Authoritative source:
// SMTBaseActorData.get hpMultiplier()/mpMultiplier() read these keyed by actor type.
SMT.hpMultipliers = {
  fiend: 6,
  demon: 6,
  human: 4,
  npc: 6
};

SMT.mpMultipliers = {
  fiend: 3,
  demon: 3,
  human: 2,
  npc: 3
};

// Passive skill HP/MP multiplier bonuses (Amplify Group, p.109). Highest tier
// only — similar abilities do not stack. Data-model-owned; read via
// SMTBaseActorData._getPassiveMultiplierBonuses().
// TODO: key off skill.system.passiveEffect enum instead of skill name.
SMT.passiveBonuses = {
  hp: {
    "Life Bonus": 1,
    "Life Gain": 2,
    "Life Surge": 3
  },
  mp: {
    "Mana Bonus": 1,
    "Mana Gain": 2,
    "Mana Surge": 3
  }
};

// Passive skill that widens the crit threshold for basic strikes / physical
// attack skills to TN/mightCritDivisor (p.110). Detected by skill name today.
// TODO: move to skill.system.passiveEffect enum.
SMT.mightPassiveName = "Might";

// ═══════════════════════════════════════════════
// Rules constants (config-authoritative source of truth)
// Logic reads CONFIG.SMT.*; values must stay identical to current inline numerics.
// ═══════════════════════════════════════════════

// Percentile check thresholds (actor.rollPercentile / combat._evaluatePercentile)
SMT.check = {
  fumble: 100,        // d100 == 100 is always a fumble
  autoFailMin: 96,    // d100 >= 96 auto-fails
  critDivisor: 10,    // crit if roll <= floor(TN / 10)
  mightCritDivisor: 5 // with Might, crit if roll <= floor(TN / 5)
};

// Fate Point mechanics (combat.mjs resolve* + base-actor.mjs fatePoints.max)
SMT.fate = {
  boostTN: 20,         // Boost TN: +20 to TN, re-evaluate same roll
  halveDivisor: 2,     // Halve Damage: floor(damage / 2)
  cost: 1,             // FP spent per reroll/boost/halve
  maxBase: 5,          // fatePoints.max = floor(luck / maxLuckDivisor) + maxBase
  maxLuckDivisor: 5
};

// Ailment infliction rate clamp (resolveAilment, p.67)
SMT.ailmentRate = {
  min: 5,
  max: 95
};

// Derived stat modifiers (base-actor.mjs prepareDerivedData)
SMT.tnPerStat = 5;     // TN = (stat x tnPerStat) + level
SMT.dodgeBonus = 10;   // dodgeTN = agilityTN + dodgeBonus
SMT.negotiation = {    // negotiationTN = (luck x multiplier) + bonus
  multiplier: 2,
  bonus: 20
};

// Boss trait: double HP and MP (p.123)
SMT.bossHpMpMultiplier = 2;

// Max skills an actor may have (base-actor-sheet.mjs drop/create enforcement)
SMT.skillCap = 8;

// ═══════════════════════════════════════════════
// Buffs / debuffs (p.96)
// ═══════════════════════════════════════════════
// Stat changes are a flat 1d10 per stack (non-exploding; base power is never
// added). Each effect stacks at most 4 times, and effects keyed to the same
// STAT AXIS share that one 4-stack cap — so different skills that move the same
// axis (e.g. Sukukaja and Fog Breath) compete for the same four slots rather
// than each getting their own. Magnitudes accumulate into the per-actor
// system.buffs.<axis> fields (fed by ActiveEffect ADD-mode changes) and are
// folded into the derived combat stats by SMTBaseActorData.prepareDerivedData.
SMT.buffMaxStacks = 4;
SMT.buffDie = "1d10"; // non-exploding

// Buff axes — the schema accumulators a buff/debuff may move and the derived
// stats each one feeds. Keys match the system.buffs.<axis> NumberFields.
// "accuracy" covers the attack-check TNs (Strength/Magic/Agility); "dodge" is
// the dodge TN. Sukukaja/Sukunda move BOTH, so they touch two axes (p.96).
SMT.buffAxes = {
  physicalPower: { label: "SMT.Buff.AxisPhysicalPower" },
  magicalPower: { label: "SMT.Buff.AxisMagicalPower" },
  resist: { label: "SMT.Buff.AxisResist" },
  accuracy: { label: "SMT.Buff.AxisAccuracy" },
  dodge: { label: "SMT.Buff.AxisDodge" }
};

// Each castable buff/debuff: which axis accumulator(s) it moves, the sign of the
// change, the group it belongs to (kaja = buffs cleared by Dekaja, nda = debuffs
// cleared by Dekunda), its localized label, and the token-HUD status id.
// Keyed by the value a skill stores in system.buffEffect. Tarunda is the
// universal attack-power debuff: it lowers BOTH physical and magical power
// (p.96), so it spans the physicalPower and magicalPower axes.
SMT.buffs = {
  tarukaja: { axes: ["physicalPower"], sign: 1, group: "kaja", label: "SMT.Buff.Tarukaja", statusId: "smtBuffPower", icon: "icons/magic/control/buff-strength-muscle-damage-orange.webp" },
  makakaja: { axes: ["magicalPower"], sign: 1, group: "kaja", label: "SMT.Buff.Makakaja", statusId: "smtBuffMagic", icon: "icons/magic/control/buff-flight-wings-blue.webp" },
  rakukaja: { axes: ["resist"], sign: 1, group: "kaja", label: "SMT.Buff.Rakukaja", statusId: "smtBuffResist", icon: "icons/magic/defensive/shield-barrier-glowing-blue.webp" },
  sukukaja: { axes: ["accuracy", "dodge"], sign: 1, group: "kaja", label: "SMT.Buff.Sukukaja", statusId: "smtBuffAgility", icon: "icons/magic/movement/trail-streak-zigzag-yellow.webp" },
  tarunda: { axes: ["physicalPower", "magicalPower"], sign: -1, group: "nda", label: "SMT.Buff.Tarunda", statusId: "smtDebuffPower", icon: "icons/magic/control/debuff-energy-hold-orange.webp" },
  rakunda: { axes: ["resist"], sign: -1, group: "nda", label: "SMT.Buff.Rakunda", statusId: "smtDebuffResist", icon: "icons/magic/defensive/shield-barrier-crack-blue.webp" },
  sukunda: { axes: ["accuracy", "dodge"], sign: -1, group: "nda", label: "SMT.Buff.Sukunda", statusId: "smtDebuffAgility", icon: "icons/magic/movement/trail-streak-impact-blue.webp" }
};

// Dispel skills: which buff group each one strips. Dekaja clears -kaja buffs;
// Dekunda clears -nda debuffs (p.96).
SMT.buffDispels = {
  dekaja: "kaja",
  dekunda: "nda"
};

// Skill-sheet dropdown for system.buffEffect: "none" plus every castable buff
// and dispel, each pointing at its localized label. Assembled from the maps
// above so they remain the single source of truth.
SMT.buffEffectChoices = {
  none: "SMT.None",
  tarukaja: "SMT.Buff.Tarukaja",
  makakaja: "SMT.Buff.Makakaja",
  rakukaja: "SMT.Buff.Rakukaja",
  sukukaja: "SMT.Buff.Sukukaja",
  tarunda: "SMT.Buff.Tarunda",
  rakunda: "SMT.Buff.Rakunda",
  sukunda: "SMT.Buff.Sukunda",
  dekaja: "SMT.Buff.Dekaja",
  dekunda: "SMT.Buff.Dekunda"
};

// ═══════════════════════════════════════════════
// Combat setup actions (p.64)
// ═══════════════════════════════════════════════
// Concentrate: +20% to the next named action's hit check, consumed on use and
// dropped when the holder takes an ailment. Defend: forego the turn's action for
// +20% dodge until the start of the holder's next turn. Both are modelled as
// ActiveEffects feeding system.concentrate.amount / system.defend.amount.
SMT.actionEffects = {
  concentrate: { statusId: "smtConcentrate", label: "SMT.Action.Concentrate", icon: "icons/magic/perception/eye-ringed-glow-angry-red.webp" },
  defend: { statusId: "smtDefend", label: "SMT.Action.Defend", icon: "icons/magic/defensive/shield-barrier-flaming-diamond-blue.webp" }
};

SMT.concentrate = { bonusPct: 20 }; // +20% to the named action's hit check (p.64)
SMT.defend = { dodgeBonus: 20 };    // +20% dodge until the start of next turn (p.64)

// ═══════════════════════════════════════════════
// Ailment combat effects
// ═══════════════════════════════════════════════
// Ailments that turn an incoming Phys attack into an automatic critical hit
// (p.66). The defender's common-ailment slot is checked against this list when
// resolving a physical attack.
SMT.critOnPhysAilments = ["restrain", "freeze", "shock", "stone"];

// Poison: the afflicted actor drains 1d10 HP for each non-reactive action it
// takes (p.66).
SMT.poison = { die: "1d10" };

// Stun: the afflicted actor's attack hit checks are capped at <=25% (p.66).
SMT.stun = { hitCapPct: 25 };

// Mute seals magic: the afflicted actor may not use spells or magical attack
// skills (p.66). Skill types blocked while Muted, checked in SMTItem.use.
SMT.muteBlockedSkillTypes = ["spell", "magical-attack"];

// ═══════════════════════════════════════════════
// Ailment turn interaction (p.66-68)
// ═══════════════════════════════════════════════
// Common-slot ailments that prevent the afflicted combatant from acting on their
// turn at all (p.66, p.68 "Can take no actions"). Stone cannot dodge but is left
// out here because it still acts; the four below forfeit the whole turn. The
// start-of-turn automation posts a "cannot act" notice for these (Charm is GM-run,
// Panic acts randomly, so neither is a flat skip).
SMT.cannotActAilments = ["freeze", "sleep", "shock", "restrain"];

// Ailments that auto-recover at the START of the afflicted combatant's next turn
// (p.66): Freeze and Shock end then even on a failed save. The turn automation
// clears system.ailment for these before the "cannot act" notice, so the icon
// drops the moment the turn it would skip begins.
SMT.autoRecoverAtTurnStart = ["freeze", "shock"];

// Sleep restores HP and MP equal to (Vitality + level) at the start of each of the
// sleeper's turns (p.66). Sourced here so the regen rule stays config-authoritative.
SMT.sleep = { regenStat: "vitality" };

// Common-slot ailments cleared when the afflicted actor takes damage from an attack
// (p.66): Sleep ends the moment a hit lands. Read by SMTActor.applyDamage after a
// real (non-null/drain/repel) hit. Kept as a set so the rule is config-authoritative
// and trivially extensible.
SMT.wakeOnDamageAilments = ["sleep"];

// Panic (p.67): on the afflicted combatant's turn there is a panicChancePct% chance
// they take a random action instead of the one chosen. The 1d10 Panic table maps a
// roll to a localized effect line and (for the sleep result) the secondary ailment
// it inflicts. Ranges are inclusive [min,max] over a 1d10; effects are display-only
// narration except `inflicts`, which the automation applies (p.67 entry 7-8 = Sleep).
SMT.panic = {
  chancePct: 50,
  die: "1d10",
  table: [
    { min: 1, max: 2, label: "SMT.Panic.Macca" },
    { min: 3, max: 4, label: "SMT.Panic.Spacing" },
    { min: 5, max: 6, label: "SMT.Panic.Negotiate" },
    { min: 7, max: 8, label: "SMT.Panic.Sleep", inflicts: "sleep" },
    { min: 9, max: 10, label: "SMT.Panic.Dance" }
  ]
};

// ═══════════════════════════════════════════════
// Initiative (p.63)
// ═══════════════════════════════════════════════
// Initiative is "1d10x10 + Agility" (declared authoritatively in system.json and
// mirrored to CONFIG.Combat.initiative at init). When two or more combatants tie,
// the book breaks the tie with a flat die-off, highest roll first (p.63). SMTCombat
// rolls this die once per combatant and sorts ties by it. A plain d-size so the
// tie-break never explodes (a clean highest-roll-wins, p.63).
SMT.initiativeTieBreakDie = 10;
