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
  deity: "SMT.Clan.Deity",
  megami: "SMT.Clan.Megami",
  fury: "SMT.Clan.Fury",
  lady: "SMT.Clan.Lady",
  kishin: "SMT.Clan.Kishin",
  holy: "SMT.Clan.Holy",
  yoma: "SMT.Clan.Yoma",
  fairy: "SMT.Clan.Fairy",
  night: "SMT.Clan.Night",
  divine: "SMT.Clan.Divine",
  fallen: "SMT.Clan.Fallen",
  snake: "SMT.Clan.Snake",
  beast: "SMT.Clan.Beast",
  jirae: "SMT.Clan.Jirae",
  brute: "SMT.Clan.Brute",
  femme: "SMT.Clan.Femme",
  vile: "SMT.Clan.Vile",
  tyrant: "SMT.Clan.Tyrant",
  wilder: "SMT.Clan.Wilder",
  haunt: "SMT.Clan.Haunt",
  foul: "SMT.Clan.Foul",
  seraph: "SMT.Clan.Seraph",
  wargod: "SMT.Clan.Wargod",
  genma: "SMT.Clan.Genma",
  dragon: "SMT.Clan.Dragon",
  avatar: "SMT.Clan.Avatar",
  avian: "SMT.Clan.Avian",
  raptor: "SMT.Clan.Raptor",
  entity: "SMT.Clan.Entity",
  mitama: "SMT.Clan.Mitama",
  element: "SMT.Clan.Element",
  corpus: "SMT.Clan.Corpus",
  zoa: "SMT.Clan.Zoa",
  hallel: "SMT.Clan.Hallel",
  light: "SMT.Clan.Light"
};

SMT.skillTypes = {
  "physical-attack": "SMT.SkillType.PhysicalAttack",
  "ranged-attack": "SMT.SkillType.RangedAttack",
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
  might: { label: "SMT.PassiveEffect.Might", legacyNames: ["Might"], kind: "might" },
  // shootTn: flat + to the ranged-weapon (Shoot) TN. powerDie: extra die added to physical power rolls.
  sureShot: { label: "SMT.PassiveEffect.SureShot", legacyNames: ["Sure Shot"], kind: "shootTn", value: 10 },
  powerfulStrikes: { label: "SMT.PassiveEffect.PowerfulStrikes", legacyNames: ["Powerful Strikes"], kind: "powerDie", value: "1d10" }
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
SMT.buffDie = "d10"; // per-stack die, rolled as `${stacks}d10`, non-exploding. MUST be "d10" not "1d10" (string-concat -> "11d10")

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
  tarunda: { axes: ["physicalPower", "magicalPower"], sign: -1, group: "nda", label: "SMT.Buff.Tarunda", statusId: "smtDebuffPower", icon: "icons/svg/downgrade.svg" },
  rakunda: { axes: ["resist"], sign: -1, group: "nda", label: "SMT.Buff.Rakunda", statusId: "smtDebuffResist", icon: "icons/svg/downgrade.svg" },
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
  provoke: "SMT.Buff.Provoke",
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
  ],

  // Cross-clan Normal Fusion Chart (p.82) — the config-authoritative SSoT for what two
  // DIFFERENT clans normally fuse into. Read by helpers/fusion.mjs#crossClanFusion, which
  // is fail-closed: any key not in clanOrder, any same-clan/unknown input, or any absent
  // cell yields null and never throws. Same-clan results are elementBorn's job (the chart
  // diagonal is blank); a "-" cell in the book has no normal result and is omitted here.
  normalChart: {
    // p.82 axis order (left-edge rows top->bottom, top columns left->right). This is the
    // chart's own clan order and differs from SMT.demonClans; the lookup trusts THIS list.
    clanOrder: [
      "deity", "megami", "fury", "lady", "kishin", "holy", "yoma", "fairy", "divine", "fallen", "snake", "beast", "jirae", "brute", "femme", "vile", "tyrant", "night", "wilder", "haunt", "foul", "seraph", "wargod", "genma", "dragon", "avatar", "avian", "raptor", "entity"
    ],

    // Cross-clan Normal Fusion result KEYS (p.82), stored as the upper triangle only:
    // chart[rowClan][colClan] where colClan comes AFTER rowClan in clanOrder. The lookup
    // canonicalises (a,b) to that order and mirrors, so it is commutative. Same-clan (the
    // blank diagonal) and "-" cells from the book are simply absent here -> null on lookup.
    chart: {
      deity: { kishin: "fury", holy: "megami", yoma: "megami", fairy: "night", divine: "megami", fallen: "fury", snake: "kishin", beast: "avatar", jirae: "brute", brute: "kishin", femme: "lady", night: "vile", wargod: "kishin", genma: "megami", avatar: "megami", avian: "megami", raptor: "tyrant", entity: "megami" },
      megami: { fury: "deity", lady: "fury", kishin: "lady", holy: "divine", yoma: "kishin", fairy: "fallen", divine: "holy", fallen: "divine", snake: "fairy", beast: "holy", jirae: "lady", brute: "femme", femme: "fairy", vile: "fury", night: "fallen", wilder: "vile", seraph: "deity", wargod: "deity", genma: "divine", dragon: "avatar", avatar: "deity", avian: "deity", raptor: "tyrant", entity: "deity" },
      fury: { lady: "vile", kishin: "lady", holy: "kishin", yoma: "holy", fairy: "brute", divine: "deity", fallen: "vile", snake: "kishin", beast: "avatar", jirae: "femme", brute: "lady", femme: "lady", vile: "tyrant", tyrant: "deity", night: "lady", seraph: "vile", wargod: "deity", genma: "lady", avatar: "holy", avian: "kishin", raptor: "tyrant", entity: "lady" },
      lady: { kishin: "fury", holy: "avatar", yoma: "night", fairy: "yoma", divine: "megami", fallen: "fury", snake: "femme", beast: "snake", jirae: "beast", brute: "fury", femme: "kishin", night: "kishin", wilder: "haunt", haunt: "vile", foul: "vile", seraph: "deity", wargod: "kishin", genma: "femme", avatar: "fury", raptor: "kishin", entity: "fury" },
      kishin: { holy: "lady", yoma: "femme", fairy: "brute", divine: "vile", fallen: "night", snake: "femme", beast: "holy", jirae: "snake", brute: "snake", femme: "lady", night: "femme", seraph: "divine", wargod: "fury", genma: "megami", dragon: "fury", avatar: "holy", avian: "lady", raptor: "tyrant", entity: "fury" },
      holy: { yoma: "divine", fairy: "megami", divine: "fairy", fallen: "beast", snake: "kishin", beast: "avatar", jirae: "beast", brute: "femme", femme: "lady", night: "fairy", seraph: "divine", wargod: "kishin", genma: "yoma", dragon: "snake", avatar: "megami", avian: "lady", raptor: "wilder", entity: "kishin" },
      yoma: { fairy: "holy", divine: "snake", fallen: "jirae", snake: "night", beast: "fallen", jirae: "beast", brute: "femme", femme: "brute", vile: "jirae", tyrant: "night", night: "divine", wilder: "beast", haunt: "jirae", foul: "snake", seraph: "megami", dragon: "avatar", avatar: "divine", avian: "night", raptor: "haunt", entity: "megami" },
      fairy: { divine: "megami", fallen: "yoma", snake: "yoma", beast: "divine", jirae: "yoma", brute: "night", femme: "haunt", vile: "night", tyrant: "night", night: "snake", wilder: "yoma", haunt: "night", foul: "haunt", seraph: "holy", dragon: "snake", avatar: "divine", avian: "night", raptor: "haunt", entity: "megami" },
      divine: { fallen: "vile", snake: "fairy", beast: "holy", jirae: "night", brute: "yoma", femme: "beast", vile: "fallen", tyrant: "vile", night: "snake", wilder: "fallen", haunt: "jirae", foul: "fairy", seraph: "megami", wargod: "holy", genma: "megami", dragon: "megami", avatar: "megami", avian: "snake", raptor: "foul", entity: "megami" },
      fallen: { snake: "beast", beast: "night", jirae: "brute", brute: "jirae", femme: "wilder", vile: "brute", tyrant: "fury", night: "haunt", wilder: "night", haunt: "night", foul: "vile", seraph: "lady", wargod: "lady", genma: "lady", dragon: "snake", avatar: "divine", avian: "snake", raptor: "foul", entity: "kishin" },
      snake: { beast: "brute", jirae: "fallen", brute: "beast", femme: "kishin", vile: "kishin", tyrant: "brute", night: "fallen", wilder: "night", haunt: "brute", foul: "fallen", wargod: "kishin", genma: "femme", dragon: "lady", avatar: "lady", avian: "kishin", raptor: "foul", entity: "fury" },
      beast: { jirae: "yoma", brute: "femme", femme: "foul", vile: "foul", tyrant: "night", night: "fairy", wilder: "jirae", haunt: "wilder", foul: "wilder", wargod: "holy", genma: "fairy", dragon: "snake", avatar: "snake", avian: "femme", raptor: "wilder", entity: "holy" },
      jirae: { brute: "fairy", femme: "wilder", vile: "haunt", tyrant: "wilder", night: "foul", wilder: "brute", haunt: "vile", foul: "femme", wargod: "kishin", genma: "lady", dragon: "kishin", avatar: "kishin", avian: "kishin", raptor: "foul", entity: "fury" },
      brute: { femme: "beast", vile: "haunt", tyrant: "haunt", night: "kishin", wilder: "fairy", haunt: "foul", foul: "wilder", genma: "divine", dragon: "night", avatar: "kishin", avian: "kishin", raptor: "fury", entity: "fury" },
      femme: { vile: "brute", tyrant: "lady", night: "jirae", wilder: "fallen", haunt: "foul", foul: "wilder", genma: "night", dragon: "night", avatar: "kishin", avian: "brute", raptor: "foul", entity: "lady" },
      vile: { tyrant: "fury", night: "lady", wilder: "foul", haunt: "foul", foul: "haunt", seraph: "divine", wargod: "kishin", genma: "yoma", dragon: "snake", avatar: "deity", raptor: "fury" },
      tyrant: { night: "lady", wilder: "night", haunt: "foul", foul: "haunt", seraph: "fallen", genma: "yoma", raptor: "fury" },
      night: { wilder: "beast", haunt: "yoma", foul: "brute", seraph: "fallen", genma: "holy", dragon: "femme", avatar: "holy", avian: "femme", raptor: "vile", entity: "brute" },
      wilder: { haunt: "jirae", foul: "beast", genma: "yoma", raptor: "vile", entity: "brute" },
      haunt: { foul: "brute", seraph: "fallen", raptor: "vile", entity: "brute" },
      foul: { seraph: "fallen", dragon: "snake", raptor: "vile", entity: "brute" },
      seraph: { wargod: "kishin", genma: "megami", dragon: "holy", avatar: "deity", avian: "megami", entity: "deity" },
      wargod: { genma: "holy", dragon: "lady", avatar: "deity", avian: "kishin", entity: "fury" },
      genma: { dragon: "holy", avatar: "kishin", avian: "megami", raptor: "lady", entity: "fury" },
      dragon: { avatar: "kishin", avian: "fury", entity: "lady" },
      avatar: { avian: "holy", raptor: "wilder", entity: "fury" },
      avian: { raptor: "megami", entity: "deity" },
      raptor: { entity: "vile" }
    }
  },

  // Rank Up/Down Table (p.81): fusing an Element demon with a non-Element demon yields a
  // demon of the NON-Element clan, one rank higher ("up") or lower ("down"). Direction
  // depends on the Element and the non-Element clan, per this table. Keyed
  // rankShift[nonElementClan][elementClan] -> "up" | "down". Read by helpers/fusion.mjs
  // rankShiftFusion. Cells transcribed from p.81 and independently re-verified by positional
  // PDF extraction (84/84 cells, 0 mismatches). A Cursed fusion reverses the direction
  // (p.81) — that flip is the GM's call. The actual rank-resolved demon (the level lookup
  // within the clan one step up/down) needs the demon roster and is NOT resolved here.
  rankShift: {
    deity: { flaemis: "down", aquans: "down", aeros: "down", erthys: "down" },
    megami: { flaemis: "down", aquans: "down", aeros: "down", erthys: "down" },
    fury: { flaemis: "down", aquans: "down", aeros: "down", erthys: "down" },
    lady: { flaemis: "down", aquans: "down", aeros: "down", erthys: "up" },
    kishin: { flaemis: "down", aquans: "down", aeros: "down", erthys: "up" },
    holy: { flaemis: "up", aquans: "down", aeros: "down", erthys: "down" },
    yoma: { flaemis: "down", aquans: "up", aeros: "up", erthys: "down" },
    fairy: { flaemis: "down", aquans: "up", aeros: "down", erthys: "up" },
    night: { flaemis: "down", aquans: "down", aeros: "up", erthys: "down" },
    divine: { flaemis: "up", aquans: "up", aeros: "down", erthys: "down" },
    fallen: { flaemis: "up", aquans: "down", aeros: "up", erthys: "down" },
    snake: { flaemis: "up", aquans: "up", aeros: "down", erthys: "down" },
    beast: { flaemis: "up", aquans: "down", aeros: "up", erthys: "down" },
    jirae: { flaemis: "down", aquans: "down", aeros: "up", erthys: "up" },
    brute: { flaemis: "up", aquans: "up", aeros: "down", erthys: "up" },
    femme: { flaemis: "up", aquans: "up", aeros: "down", erthys: "up" },
    vile: { flaemis: "down", aquans: "down", aeros: "down", erthys: "down" },
    tyrant: { flaemis: "down", aquans: "down", aeros: "down", erthys: "down" },
    wilder: { flaemis: "up", aquans: "up", aeros: "down", erthys: "down" },
    haunt: { flaemis: "down", aquans: "down", aeros: "up", erthys: "down" },
    foul: { flaemis: "down", aquans: "up", aeros: "down", erthys: "down" }
  }
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

// Demon roster (Ch.5 Demon Compendium, p.126-235). Name / clan / level only -- the
// fusion result lookup (p.80) needs nothing else. Extracted from the book's stat-block
// headers; every clan is checked against normalChart.clanOrder by the test suite.
//
//  marks the p.213-235 boss-only list, which is NOT part of the fusion pool
// (p.123: bosses that later join the general pool are already listed among the general
// demons). Two entries carry the book's own errata, recorded rather than corrected:
// Baal Avatar's clan prints as "DIETY" (p.223) and Specter (3rd Time) prints LVL 440
// (p.218). See GAUNTLET.md S1 clause 1 -- match the book, flag what looks wrong.
SMT.demons = [
  { name: "Vishnu", clan: "deity", level: 93 },  // p.126
  { name: "Mitra", clan: "deity", level: 78 },  // p.126
  { name: "Odin", clan: "deity", level: 65 },  // p.127
  { name: "Amaterasu", clan: "deity", level: 56 },  // p.127
  { name: "Atavaka", clan: "deity", level: 47 },  // p.128
  { name: "Horus", clan: "deity", level: 38 },  // p.128
  { name: "Scáthach", clan: "megami", level: 64 },  // p.129
  { name: "Lakshmi", clan: "megami", level: 54 },  // p.129
  { name: "Sati", clan: "megami", level: 48 },  // p.130
  { name: "Sarasvati", clan: "megami", level: 30 },  // p.130
  { name: "Ame-No-Uzume", clan: "megami", level: 18 },  // p.131
  { name: "Shiva", clan: "fury", level: 95 },  // p.131
  { name: "Beidou Xingjun", clan: "fury", level: 61 },  // p.132
  { name: "Qitian Dasheng", clan: "fury", level: 54 },  // p.132
  { name: "Dionysus", clan: "fury", level: 44 },  // p.133
  { name: "Skadi", clan: "lady", level: 74 },  // p.133
  { name: "Kali", clan: "lady", level: 67 },  // p.134
  { name: "Parvati", clan: "lady", level: 57 },  // p.134
  { name: "Kushinada", clan: "lady", level: 41 },  // p.135
  { name: "Kikuri-Hime", clan: "lady", level: 24 },  // p.135
  { name: "Thor", clan: "kishin", level: 76 },  // p.136
  { name: "Bishamonten", clan: "kishin", level: 72 },  // p.136
  { name: "Jikokuten", clan: "kishin", level: 52 },  // p.137
  { name: "Take-Mikazuchi", clan: "kishin", level: 45 },  // p.137
  { name: "Okuninushi", clan: "kishin", level: 39 },  // p.138
  { name: "Koumokuten", clan: "kishin", level: 33 },  // p.138
  { name: "Zouchouten", clan: "kishin", level: 27 },  // p.139
  { name: "Take-Minakata", clan: "kishin", level: 17 },  // p.139
  { name: "Chimera", clan: "holy", level: 55 },  // p.140
  { name: "Baihu", clan: "holy", level: 43 },  // p.140
  { name: "Zhuque", clan: "holy", level: 36 },  // p.141
  { name: "Senri", clan: "holy", level: 27 },  // p.141
  { name: "Unicorn", clan: "holy", level: 21 },  // p.142
  { name: "Shiisaa", clan: "holy", level: 13 },  // p.142
  { name: "Flaemis", clan: "element", level: 20 },  // p.143
  { name: "Aquans", clan: "element", level: 15 },  // p.143
  { name: "Aeros", clan: "element", level: 11 },  // p.144
  { name: "Erthys", clan: "element", level: 7 },  // p.144
  { name: "Saki Mitama", clan: "mitama", level: 35 },  // p.145
  { name: "Kushi Mitama", clan: "mitama", level: 32 },  // p.145
  { name: "Nigi Mitama", clan: "mitama", level: 29 },  // p.146
  { name: "Ara Mitama", clan: "mitama", level: 25 },  // p.146
  { name: "Efreet", clan: "yoma", level: 52 },  // p.147
  { name: "Pulukishi", clan: "yoma", level: 48 },  // p.147
  { name: "Jinn", clan: "yoma", level: 44 },  // p.148
  { name: "Ongkhot", clan: "yoma", level: 37 },  // p.148
  { name: "Karasu Tengu", clan: "yoma", level: 28 },  // p.149
  { name: "Dís", clan: "yoma", level: 23 },  // p.149
  { name: "Koppa Tengu", clan: "yoma", level: 19 },  // p.150
  { name: "Isora", clan: "yoma", level: 14 },  // p.150
  { name: "Apsaras", clan: "yoma", level: 8 },  // p.151
  { name: "Titania", clan: "fairy", level: 57 },  // p.151
  { name: "Oberon", clan: "fairy", level: 46 },  // p.152
  { name: "Setanta", clan: "fairy", level: 43 },  // p.152
  { name: "Troll", clan: "fairy", level: 38 },  // p.153
  { name: "Kelpie", clan: "fairy", level: 26 },  // p.153
  { name: "Jack-o'-Lantern", clan: "fairy", level: 19 },  // p.154
  { name: "High Pixie", clan: "fairy", level: 10 },  // p.154
  { name: "Jack Frost", clan: "fairy", level: 7 },  // p.155
  { name: "Pixie", clan: "fairy", level: 2 },  // p.155
  { name: "Throne", clan: "divine", level: 64 },  // p.156
  { name: "Dominion", clan: "divine", level: 50 },  // p.156
  { name: "Virtue", clan: "divine", level: 41 },  // p.157
  { name: "Power", clan: "divine", level: 33 },  // p.157
  { name: "Principality", clan: "divine", level: 28 },  // p.158
  { name: "Archangel", clan: "divine", level: 18 },  // p.158
  { name: "Angel", clan: "divine", level: 11 },  // p.159
  { name: "Flauros", clan: "fallen", level: 68 },  // p.159
  { name: "Decarabia", clan: "fallen", level: 58 },  // p.160
  { name: "Ose", clan: "fallen", level: 45 },  // p.160
  { name: "Berith", clan: "fallen", level: 37 },  // p.161
  { name: "Eligor", clan: "fallen", level: 29 },  // p.161
  { name: "Forneus", clan: "fallen", level: 20 },  // p.162
  { name: "Yurlungur", clan: "snake", level: 66 },  // p.162
  { name: "Quetzalcoatl", clan: "snake", level: 55 },  // p.163
  { name: "Naga Raja", clan: "snake", level: 37 },  // p.163
  { name: "Mizuchi", clan: "snake", level: 34 },  // p.164
  { name: "Naga", clan: "snake", level: 28 },  // p.164
  { name: "Nozuchi", clan: "snake", level: 14 },  // p.165
  { name: "Cerberus", clan: "beast", level: 61 },  // p.165
  { name: "Suparna", clan: "beast", level: 54 },  // p.166
  { name: "Orthrus", clan: "beast", level: 34 },  // p.166
  { name: "Badb Catha", clan: "beast", level: 23 },  // p.167
  { name: "Nekomata", clan: "beast", level: 18 },  // p.167
  { name: "Inugami", clan: "beast", level: 13 },  // p.168
  { name: "Gogmagog", clan: "jirae", level: 55 },  // p.168
  { name: "Titan", clan: "jirae", level: 49 },  // p.169
  { name: "Sarutahiko", clan: "jirae", level: 35 },  // p.169
  { name: "Sudama", clan: "jirae", level: 13 },  // p.170
  { name: "Hua Po", clan: "jirae", level: 5 },  // p.170
  { name: "Kodama", clan: "jirae", level: 3 },  // p.171
  { name: "Ongyo-Ki", clan: "brute", level: 81 },  // p.171
  { name: "Fuu-Ki", clan: "brute", level: 66 },  // p.172
  { name: "Sui-Ki", clan: "brute", level: 62 },  // p.172
  { name: "Kin-Ki", clan: "brute", level: 59 },  // p.173
  { name: "Shiki-Ouji", clan: "brute", level: 54 },  // p.173
  { name: "Yomotsu-Ikusa", clan: "brute", level: 44 },  // p.174
  { name: "Oni", clan: "brute", level: 25 },  // p.174
  { name: "Momunofu", clan: "brute", level: 20 },  // p.175
  { name: "Shikigami", clan: "brute", level: 4 },  // p.175
  { name: "Rangda", clan: "femme", level: 72 },  // p.176
  { name: "Atropos", clan: "femme", level: 67 },  // p.176
  { name: "Lachesis", clan: "femme", level: 63 },  // p.177
  { name: "Clotho", clan: "femme", level: 58 },  // p.177
  { name: "Dakini", clan: "femme", level: 52 },  // p.178
  { name: "Yaksini", clan: "femme", level: 43 },  // p.178
  { name: "Yomotsu-Shikome", clan: "femme", level: 32 },  // p.179
  { name: "Taraka", clan: "femme", level: 20 },  // p.179
  { name: "Datsue-Ba", clan: "femme", level: 7 },  // p.180
  { name: "Mada", clan: "vile", level: 83 },  // p.180
  { name: "Samael", clan: "vile", level: 73 },  // p.181
  { name: "Taotie", clan: "vile", level: 65 },  // p.181
  { name: "Girimekhala", clan: "vile", level: 58 },  // p.182
  { name: "Pazuzu", clan: "vile", level: 45 },  // p.182
  { name: "Baphomet", clan: "vile", level: 33 },  // p.183
  { name: "Arahabaki", clan: "vile", level: 30 },  // p.183
  { name: "Mot", clan: "tyrant", level: 91 },  // p.184
  { name: "Aciel", clan: "tyrant", level: 77 },  // p.184
  { name: "Surt", clan: "tyrant", level: 74 },  // p.185
  { name: "Abaddon", clan: "tyrant", level: 69 },  // p.185
  { name: "Loki", clan: "tyrant", level: 52 },  // p.186
  { name: "Lilith", clan: "night", level: 80 },  // p.186
  { name: "Nyx", clan: "night", level: 70 },  // p.187
  { name: "Queen Mab", clan: "night", level: 56 },  // p.187
  { name: "Loa", clan: "night", level: 53 },  // p.188
  { name: "Kaiwan", clan: "night", level: 47 },  // p.188
  { name: "Succubus", clan: "night", level: 37 },  // p.189
  { name: "Incubus", clan: "night", level: 25 },  // p.189
  { name: "Fomorian", clan: "night", level: 18 },  // p.190
  { name: "Lilim", clan: "night", level: 8 },  // p.190
  { name: "Hresvelgr", clan: "wilder", level: 75 },  // p.191
  { name: "Mothman", clan: "wilder", level: 43 },  // p.191
  { name: "Nue", clan: "wilder", level: 31 },  // p.192
  { name: "Raiju", clan: "wilder", level: 25 },  // p.192
  { name: "Bicorn", clan: "wilder", level: 15 },  // p.193
  { name: "Zhen", clan: "wilder", level: 6 },  // p.193
  { name: "Vetala", clan: "haunt", level: 63 },  // p.194
  { name: "Legion", clan: "haunt", level: 49 },  // p.194
  { name: "Pisaca", clan: "haunt", level: 28 },  // p.195
  { name: "Chatterskull", clan: "haunt", level: 20 },  // p.195
  { name: "Yaka", clan: "haunt", level: 17 },  // p.196
  { name: "Choronzon", clan: "haunt", level: 11 },  // p.196
  { name: "Preta", clan: "haunt", level: 4 },  // p.197
  { name: "Shadow", clan: "foul", level: 52 },  // p.197
  { name: "Phantom", clan: "foul", level: 42 },  // p.198
  { name: "Black Ooze", clan: "foul", level: 28 },  // p.198
  { name: "Blob", clan: "foul", level: 16 },  // p.199
  { name: "Mou-Ryo", clan: "foul", level: 7 },  // p.199
  { name: "Slime", clan: "foul", level: 6 },  // p.200
  { name: "Will o' Wisp", clan: "foul", level: 1 },  // p.200
  { name: "Michael", clan: "seraph", level: 90 },  // p.201
  { name: "Gabriel", clan: "seraph", level: 87 },  // p.201
  { name: "Raphael", clan: "seraph", level: 84 },  // p.202
  { name: "Uriel", clan: "seraph", level: 73 },  // p.202
  { name: "Ganesha", clan: "wargod", level: 58 },  // p.203
  { name: "Valkyrie", clan: "wargod", level: 33 },  // p.203
  { name: "Cu Chulainn", clan: "genma", level: 52 },  // p.204
  { name: "Hanuman", clan: "genma", level: 46 },  // p.204
  { name: "Kurama Tengu", clan: "genma", level: 38 },  // p.205
  { name: "Qing Long", clan: "dragon", level: 44 },  // p.205
  { name: "Xuanwu", clan: "dragon", level: 24 },  // p.206
  { name: "Barong", clan: "avatar", level: 60 },  // p.206
  { name: "Yatagarasu", clan: "avatar", level: 46 },  // p.207
  { name: "Xiezhai", clan: "avatar", level: 26 },  // p.207
  { name: "Makami", clan: "avatar", level: 22 },  // p.208
  { name: "Gurulu", clan: "raptor", level: 63 },  // p.208
  { name: "Garuda", clan: "avian", level: 63 },  // p.209
  { name: "Albion", clan: "entity", level: 64 },  // p.209
  { name: "Manikin 1", clan: "corpus", level: 13 },  // p.210
  { name: "Manikin 2", clan: "corpus", level: 13 },  // p.210
  { name: "Manikin 3", clan: "corpus", level: 13 },  // p.211
  { name: "Forneus", clan: "fallen", level: 20, boss: true },  // p.213
  { name: "Specter", clan: "foul", level: 9, boss: true },  // p.214
  { name: "Specter (After Merging, Normal)", clan: "foul", level: 15, boss: true },  // p.215
  { name: "Specter (After Merging, Powerful)", clan: "fallen", level: 20, boss: true },  // p.216
  { name: "Specter (2nd Time)", clan: "foul", level: 40, boss: true },  // p.217
  { name: "Specter (3rd Time)", clan: "foul", level: 440, boss: true, bookLevel: true },  // p.218
  { name: "Mara", clan: "tyrant", level: 85, boss: true },  // p.219
  { name: "Futomimi", clan: "corpus", level: 57, boss: true },  // p.220
  { name: "Sakahagi", clan: "corpus", level: 69, boss: true },  // p.221
  { name: "Black Frost", clan: "night", level: 70, boss: true },  // p.222
  { name: "Baal Avatar", clan: "deity", level: 85, boss: true, bookClan: "DIETY" },  // p.223
  { name: "Ose Hallel", clan: "hallel", level: 70, boss: true },  // p.224
  { name: "Flauros Hallel", clan: "hallel", level: 70, boss: true },  // p.225
  { name: "Urthona", clan: "zoa", level: 30, boss: true },  // p.226
  { name: "Urizen", clan: "zoa", level: 30, boss: true },  // p.227
  { name: "Luvah", clan: "zoa", level: 30, boss: true },  // p.228
  { name: "Tharmas", clan: "zoa", level: 30, boss: true },  // p.229
  { name: "Ahriman (1st Form)", clan: "tyrant", level: 80, boss: true },  // p.230
  { name: "Ahriman (2nd Form)", clan: "tyrant", level: 99, boss: true },  // p.231
  { name: "Noah (1st Form)", clan: "vile", level: 80, boss: true },  // p.232
  { name: "Noah (2nd Form)", clan: "vile", level: 80, boss: true },  // p.233
  { name: "Kagutsuchi (1st Form)", clan: "light", level: 85, boss: true },  // p.234
  { name: "Kagutsuchi (2nd Form)", clan: "light", level: 90, boss: true },  // p.235
];
