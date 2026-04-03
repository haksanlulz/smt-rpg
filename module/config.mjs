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

// Lower number = higher priority (p.68)
SMT.ailmentPriority = {
  death: 0, stone: 1, fly: 2, stun: 3, charm: 4,
  poison: 5, mute: 6, restrain: 7, freeze: 8,
  sleep: 9, panic: 10, shock: 11, curse: -1
};

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

SMT.hpMultipliers = {
  fiend: 6,
  demon: 6,
  human: 4
};

SMT.mpMultipliers = {
  fiend: 3,
  demon: 3,
  human: 2
};
