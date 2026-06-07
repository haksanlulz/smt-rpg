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

// Lower number = higher priority (p.68). Only the top common ailment holds the shared slot.
SMT.ailmentPriority = {
  stone: 1, fly: 2, stun: 3, charm: 4,
  poison: 5, mute: 6, restrain: 7, freeze: 8,
  sleep: 9, panic: 10, shock: 11
};

// p.67 — separate flags outside the common slot; stack alongside the common ailment.
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

// HP/MP = (vitality|magic + level) x multiplier (p.36), keyed by actor type.
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

// Passive-skill effect registry (p.109-110). A skill points here via system.passiveEffect;
// resolver falls back to a case-insensitive legacyNames match for older skills.
// Entry: label (i18n) | legacyNames (name fallback) | kind "amplify"|"might"
//   amplify: resource "hp"|"mp" + value added to that multiplier (max per resource, no stack).
//   might: widens phys crit threshold to TN/mightCritDivisor (p.110).
SMT.passiveEffects = {
  none: { label: "SMT.PassiveEffect.None", legacyNames: [], kind: "none" },
  lifeBonus: { label: "SMT.PassiveEffect.LifeBonus", legacyNames: ["Life Bonus"], kind: "amplify", resource: "hp", value: 1 },
  lifeGain: { label: "SMT.PassiveEffect.LifeGain", legacyNames: ["Life Gain"], kind: "amplify", resource: "hp", value: 2 },
  lifeSurge: { label: "SMT.PassiveEffect.LifeSurge", legacyNames: ["Life Surge"], kind: "amplify", resource: "hp", value: 3 },
  manaBonus: { label: "SMT.PassiveEffect.ManaBonus", legacyNames: ["Mana Bonus"], kind: "amplify", resource: "mp", value: 1 },
  manaGain: { label: "SMT.PassiveEffect.ManaGain", legacyNames: ["Mana Gain"], kind: "amplify", resource: "mp", value: 2 },
  manaSurge: { label: "SMT.PassiveEffect.ManaSurge", legacyNames: ["Mana Surge"], kind: "amplify", resource: "mp", value: 3 },
  might: { label: "SMT.PassiveEffect.Might", legacyNames: ["Might"], kind: "might" }
};

// Skill-sheet passive-effect dropdown (key -> label), derived from the registry.
SMT.passiveEffectChoices = Object.fromEntries(
  Object.entries(SMT.passiveEffects).map(([key, entry]) => [key, entry.label])
);

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
SMT.dodgeBonus = 10;   // dodgeTN = agility + dodgeBonus (p.35, not level-based)
SMT.negotiation = {    // negotiationTN = (luck x multiplier) + bonus (p.35)
  multiplier: 2,
  bonus: 20,
  talkBonus: 20,        // any talk skill grants +20% to the check (p.75, p.112)
  impressCritDivisor: 5 // matching impress type widens crit to TN/5 (p.76)
};

// Boss trait: double HP and MP (p.123)
SMT.bossHpMpMultiplier = 2;

// Max skills an actor may have (base-actor-sheet.mjs drop/create enforcement)
SMT.skillCap = 8;

// Character advancement (p.48). EXP to reach a level = level^expCurvePower x expMultiplier
// (fiend ×1, demon ×1.3, human ×0.8); maxLevel is the schema ceiling. helpers/advancement.mjs
// is the one definition; base-actor derives expNext/canLevelUp, setLevel + fusion reuse it.
SMT.advancement = {
  expCurvePower: 3,
  maxLevel: 100
};

// Buffs / debuffs (p.96)
// Flat 1d10 per stack; effects on the same axis share one 4-stack cap.
SMT.buffMaxStacks = 4;
SMT.buffDie = "1d10"; // non-exploding

// Buff axes; keys match system.buffs.<axis>. "accuracy" = attack-check TNs, "dodge" = dodge TN.
SMT.buffAxes = {
  physicalPower: { label: "SMT.Buff.AxisPhysicalPower" },
  magicalPower: { label: "SMT.Buff.AxisMagicalPower" },
  resist: { label: "SMT.Buff.AxisResist" },
  accuracy: { label: "SMT.Buff.AxisAccuracy" },
  dodge: { label: "SMT.Buff.AxisDodge" }
};

// Castable buff/debuff: axes moved, sign, group (kaja/nda for Dekaja/Dekunda), label, status id.
// Keyed by system.buffEffect. Tarunda lowers both power axes (p.96).
SMT.buffs = {
  tarukaja: { axes: ["physicalPower"], sign: 1, group: "kaja", label: "SMT.Buff.Tarukaja", statusId: "smtBuffPower", icon: "icons/magic/control/buff-strength-muscle-damage-orange.webp" },
  makakaja: { axes: ["magicalPower"], sign: 1, group: "kaja", label: "SMT.Buff.Makakaja", statusId: "smtBuffMagic", icon: "icons/magic/control/buff-flight-wings-blue.webp" },
  rakukaja: { axes: ["resist"], sign: 1, group: "kaja", label: "SMT.Buff.Rakukaja", statusId: "smtBuffResist", icon: "icons/magic/defensive/shield-barrier-glowing-blue.webp" },
  sukukaja: { axes: ["accuracy", "dodge"], sign: 1, group: "kaja", label: "SMT.Buff.Sukukaja", statusId: "smtBuffAgility", icon: "icons/magic/movement/trail-streak-zigzag-yellow.webp" },
  tarunda: { axes: ["physicalPower", "magicalPower"], sign: -1, group: "nda", label: "SMT.Buff.Tarunda", statusId: "smtDebuffPower", icon: "icons/magic/control/debuff-energy-hold-orange.webp" },
  rakunda: { axes: ["resist"], sign: -1, group: "nda", label: "SMT.Buff.Rakunda", statusId: "smtDebuffResist", icon: "icons/magic/defensive/shield-barrier-crack-blue.webp" },
  sukunda: { axes: ["accuracy", "dodge"], sign: -1, group: "nda", label: "SMT.Buff.Sukunda", statusId: "smtDebuffAgility", icon: "icons/magic/movement/trail-streak-impact-blue.webp" }
};

// Dispels: which group each strips (p.96).
SMT.buffDispels = {
  dekaja: "kaja",
  dekunda: "nda"
};

// Skill-sheet dropdown for system.buffEffect: "none" plus every buff and dispel.
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

// Combat setup actions (p.64) — ActiveEffects feeding system.concentrate/defend.amount.
SMT.actionEffects = {
  concentrate: { statusId: "smtConcentrate", label: "SMT.Action.Concentrate", icon: "icons/magic/perception/eye-ringed-glow-angry-red.webp" },
  defend: { statusId: "smtDefend", label: "SMT.Action.Defend", icon: "icons/magic/defensive/shield-barrier-flaming-diamond-blue.webp" }
};

SMT.concentrate = { bonusPct: 20 }; // +20% to the named action's hit check (p.64)
SMT.defend = { dodgeBonus: 20 };    // +20% dodge until the start of next turn (p.64)

// Ailment combat effects
// Defender's common ailment makes an incoming Phys attack auto-crit (p.66).
SMT.critOnPhysAilments = ["restrain", "freeze", "shock", "stone"];

// Poison: drain 1d10 HP per non-reactive action (p.66).
SMT.poison = { die: "1d10" };

// Stun: attack hit checks capped at <=25% (p.66).
SMT.stun = { hitCapPct: 25 };

// Mute: blocked skill types while Muted (p.66), checked in SMTItem.use.
SMT.muteBlockedSkillTypes = ["spell", "magical-attack"];

// Ailment turn interaction (p.66-68)
// Common-slot ailments that forfeit the whole turn (p.66, p.68). Stone still acts; Charm/Panic aren't flat skips.
SMT.cannotActAilments = ["freeze", "sleep", "shock", "restrain"];

// Auto-recover at the start of the afflicted combatant's next turn, even on a failed save (p.66).
SMT.autoRecoverAtTurnStart = ["freeze", "shock"];

// Sleep regens HP and MP by (Vitality + level) each of the sleeper's turns (p.66).
SMT.sleep = { regenStat: "vitality" };

// Start-of-turn ailment save (p.69). eligible = the p.68 Save column: Charm/Restrain/Sleep/Panic.
// Stone and Fly are not eligible; Freeze/Shock auto-recover (autoRecoverAtTurnStart) so they're
// omitted. stat selects the save check's stat (Vitality), reusing the derived saveTN.
SMT.ailmentSave = {
  eligible: ["charm", "restrain", "sleep", "panic"],
  stat: "vitality"
};

// Cleared when the afflicted actor takes real attack damage (p.66); read by SMTActor.applyDamage.
SMT.wakeOnDamageAilments = ["sleep"];

// Panic (p.67): chancePct% to take a random action. 1d10 table, inclusive [min,max];
// labels are narration except `inflicts`, which the automation applies.
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

// Initiative (p.63) — "1d10x10 + Agility" lives in system.json. Ties broken by a flat die-off,
// highest first; plain d-size so it never explodes.
SMT.initiativeTieBreakDie = 10;

// Combat-end rewards (p.46, p.48) — read by helpers/rewards.mjs.
// EXP is granted in full to every participant, never divided (p.48).
SMT.rewards = {
  // p.48 "Notice": multiplier is factor ^ floor(gap / step) once gap >= threshold, else 1.
  expBonus: {
    threshold: 10,
    step: 10,
    factor: 2
  },

  // Macca distribution (p.48 leaves it to the table); mirrored by the maccaDistribution world setting.
  // "shared" splits the total evenly (remainder dropped); "per-pc" gives the full total to each PC.
  maccaDistributionDefault: "shared",
  maccaDistributionModes: {
    shared: "SMT.Rewards.MaccaShared",
    "per-pc": "SMT.Rewards.MaccaPerPc"
  },

  // Dispositions excluded from the foe harvest (p.48): a downed friendly is a casualty, not loot.
  // foundry.CONST.TOKEN_DISPOSITIONS values, read via rewards.harvestFoes.
  excludedFoeDispositions: ["FRIENDLY"],

  // Upper clamp on any single EXP/macca value the engine writes.
  maxValue: 1_000_000
};

// Demon fusion (p.79-82) — read by helpers/fusion.mjs.
SMT.fusion = {
  // Result level: (L1 + L2) / 2 + 2, then the new clan's nearest demon no lower (p.80).
  levelDivisor: 2,
  levelBonus: 2,

  // Max skills a fused demon may hold, including initial skills (p.80).
  skillCap: 8,

  // Inherited-skill count by combined ingredient skill total (p.80 table); inclusive [min,max], 24+ caps at 7.
  inheritBands: [
    { min: 1, max: 3, count: 1 },
    { min: 4, max: 7, count: 2 },
    { min: 8, max: 11, count: 3 },
    { min: 12, max: 15, count: 4 },
    { min: 16, max: 19, count: 5 },
    { min: 20, max: 23, count: 6 },
    { min: 24, max: Infinity, count: 7 }
  ],

  // Same-clan fusion yields an Element clan demon regardless of level (p.81); ingredient clan -> Element.
  elementBorn: {
    holy: "flaemis", seraph: "flaemis",
    yoma: "aquans", snake: "aquans", femme: "aquans",
    fairy: "aeros", divine: "aeros", beast: "aeros", wilder: "aeros",
    night: "erthys", fallen: "erthys", jirae: "erthys", brute: "erthys"
  },

  // Labels for the Element clans above. Fusion-only results; deliberately not in SMT.demonClans.
  elementClans: {
    flaemis: "SMT.Fusion.ElementFlaemis",
    aquans: "SMT.Fusion.ElementAquans",
    aeros: "SMT.Fusion.ElementAeros",
    erthys: "SMT.Fusion.ElementErthys"
  },

  // Demons normal fusion cannot produce (p.80); engine flags these. Lower-cased for matching.
  exceptionDemons: [
    "amaterasu", "shiva", "wu kong", "skadi", "parvati", "makami", "senri",
    "ifrit", "karasu tengu", "high pixie", "naga raja", "ongyo-ki", "qing long",
    "genbu", "samael", "girimekhala", "aciel", "lilith", "queen mab", "michael",
    "gabriel", "raphael", "uriel", "ganesha", "valkyrie", "arahabaki",
    "kurama tengu", "hanuman", "cu chulainn", "garuda", "gurulu", "albion"
  ]
};

// Negotiation / demon-talk (p.72-78, p.112) — read by helpers/negotiation.mjs.
// Flowchart navigation, demand-met judgement, and the demon's Reason are GM calls (p.74-75).
SMT.talk = {
  // The two talk-skill types (p.72); same keys as SMT.skillTypes. Approach begins a talk, support interjects.
  approachType: "talk-approach",
  supportType: "talk-support",

  // Conversation stoppers (p.73) the engine can read off actor state; the rest are GM overrides.
  //  - bossBlocks: a Boss demon cannot be talked to (p.73).
  //  - cannotActAilments: a target unable to act by these cannot be talked to (p.73; Death is the deathAilment flag).
  bossBlocks: true,
  cannotActAilments: ["stone", "shock", "freeze", "restrain", "sleep", "panic"],

  // Demon demands (p.75); GM picks which a space shows, engine rolls the amount.
  //  - macca: (maccaPerLevel x level) + (1d10 x maccaDieMultiplier).
  //  - hp: hpPercent% of the demon's own max HP (p.76). - item: roll itemDemandTable.
  demands: ["none", "macca", "hp", "item"],
  demand: {
    maccaPerLevel: 10,       // macca = (10 x level) + (1d10 x 10), p.75
    maccaDie: "1d10",
    maccaDieMultiplier: 10,
    hpPercent: 10            // 10% of the demon's own max HP, p.76
  },

  // Item Demand Table (1d10, p.76); inclusive [min,max], 0 face (10) is GM's choice.
  itemDemandTable: [
    { min: 1, max: 4, label: "SMT.Talk.Item.LifeStone" },
    { min: 5, max: 7, label: "SMT.Talk.Item.ChakraDrop" },
    { min: 8, max: 8, label: "SMT.Talk.Item.RevivalBead" },
    { min: 9, max: 9, label: "SMT.Talk.Item.Bead" },
    { min: 10, max: 10, label: "SMT.Talk.Item.GMChoice" }
  ],

  // Gift Table (1d10, p.73); inclusive [min,max]. `gem` chains into gemTable, `hp` heals the talker.
  giftTable: [
    { min: 1, max: 3, kind: "cheer", label: "SMT.Talk.Gift.Cheer" },
    { min: 4, max: 5, kind: "hp", label: "SMT.Talk.Gift.HP" },
    { min: 6, max: 7, kind: "macca", label: "SMT.Talk.Gift.Macca" },
    { min: 8, max: 9, kind: "item", label: "SMT.Talk.Gift.Item" },
    { min: 10, max: 10, kind: "gem", label: "SMT.Talk.Gift.Gem" }
  ],

  // Random Gem Table (1d10, p.73); 0 face is Aquamarine.
  gemTable: [
    { min: 1, max: 1, label: "SMT.Talk.Gem.Sapphire" },
    { min: 2, max: 2, label: "SMT.Talk.Gem.Ruby" },
    { min: 3, max: 3, label: "SMT.Talk.Gem.Opal" },
    { min: 4, max: 4, label: "SMT.Talk.Gem.Amethyst" },
    { min: 5, max: 5, label: "SMT.Talk.Gem.Agate" },
    { min: 6, max: 6, label: "SMT.Talk.Gem.Turquoise" },
    { min: 7, max: 7, label: "SMT.Talk.Gem.Garnet" },
    { min: 8, max: 8, label: "SMT.Talk.Gem.Onyx" },
    { min: 9, max: 9, label: "SMT.Talk.Gem.Coral" },
    { min: 10, max: 10, label: "SMT.Talk.Gem.Aquamarine" }
  ],

  // Terminal negotiation outcomes (p.75): deal recruits, gift rolls giftTable then leaves,
  // leave/angry end the talk, break drops to the space's Break field.
  outcomes: ["deal", "gift", "leave", "angry", "break"]
};
