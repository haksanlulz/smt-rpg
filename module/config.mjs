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
