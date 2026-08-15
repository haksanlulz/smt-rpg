// passives.mjs — passive-skill effect resolution (p.109-110)

// Map a skill to its passiveEffects entry: by passiveEffect key, else by legacyNames.
export function resolvePassiveEffect(skill, registry) {
  if (!skill || !registry) return null;

  const key = skill.system?.passiveEffect;
  if (key && key !== "none" && key in registry) {
    return { id: key, entry: registry[key] };
  }

  const name = (skill.name ?? "").trim().toLowerCase();
  if (!name) return null;
  for (const [id, entry] of Object.entries(registry)) {
    const names = entry?.legacyNames ?? [];
    if (names.some(n => n.toLowerCase() === name)) return { id, entry };
  }
  return null;
}

// Highest HP/MP amplify bonus per resource (p.109); these don't stack, so max wins.
export function passiveMultiplierBonuses(skills, registry) {
  let hpBonus = 0;
  let mpBonus = 0;
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind !== "amplify") continue;
    const value = resolved.entry.value ?? 0;
    if (resolved.entry.resource === "hp") hpBonus = Math.max(hpBonus, value);
    else if (resolved.entry.resource === "mp") mpBonus = Math.max(mpBonus, value);
  }
  return { hpBonus, mpBonus };
}

// Whether any skill grants Might (p.110), which widens the crit threshold.
export function hasMightEffect(skills, registry) {
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind === "might") return true;
  }
  return false;
}

// Total flat bonus to the ranged-weapon (Shoot) TN from "shootTn" passives (e.g. Sure Shot, p.109).
export function shootTnBonus(skills, registry) {
  let bonus = 0;
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind === "shootTn") bonus += Number(resolved.entry.value) || 0;
  }
  return bonus;
}

// Total flat bonus to the dodge TN from "dodgeTn" passives (Expert Dodge +5%, p.110).
export function dodgeTnBonus(skills, registry) {
  let bonus = 0;
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind === "dodgeTn") bonus += Number(resolved.entry.value) || 0;
  }
  return bonus;
}

// Extra power-roll dice fragments from "powerDie" passives, for one scope:
// Powerful Strikes is "physical", Powerful Spells is "magical" (p.110). An entry
// with no scope counts as physical, which is what the only pre-scope entry was.
export function powerDiceFor(skills, registry, scope = "physical") {
  const dice = [];
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    const entry = resolved?.entry;
    if (entry?.kind !== "powerDie" || !entry.value) continue;
    if ((entry.scope ?? "physical") === scope) dice.push(String(entry.value));
  }
  return dice;
}

// Per-element power multipliers from "elementBoost" passives (p.110: "Multiply the
// power of Fire attacks by 1.5x (before power roll)"). Returns { fire: 1.5, ... }
// holding only the elements that are actually boosted.
//
// Duplicates do NOT compound: the Amplify group's "Similar abilities do not stack"
// is the house rule for repeated passives, and two Fire Boosts on one demon would
// otherwise silently become 2.25x. Highest wins.
export function elementBoosts(skills, registry) {
  const boosts = {};
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    const entry = resolved?.entry;
    if (entry?.kind !== "elementBoost" || !entry.element) continue;
    const value = Number(entry.value) || 1;
    boosts[entry.element] = Math.max(boosts[entry.element] ?? 1, value);
  }
  return boosts;
}

// Whether any skill grants Endure (p.110): a hit that would reduce you to 0 HP
// leaves you at 1 instead, once per combat.
export function hasEndureEffect(skills, registry) {
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind === "endure") return true;
  }
  return false;
}

// Percentages of max HP/MP restored when combat ends (p.110): Life Aid 20% HP,
// Mana Aid 20% MP, Victory Cry both in full. Highest of each wins rather than
// summing, so Victory Cry alongside Life Aid is still 100%, not 120%.
export function combatEndRecovery(skills, registry) {
  let hpPct = 0;
  let mpPct = 0;
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    const entry = resolved?.entry;
    if (entry?.kind !== "combatEndRecovery") continue;
    hpPct = Math.max(hpPct, Number(entry.hpPct) || 0);
    mpPct = Math.max(mpPct, Number(entry.mpPct) || 0);
  }
  return { hpPct, mpPct };
}

// Which of two affinity ratings wins, by p.65's ladder: "Repel > Drain > Null >
// Strong > Weak". `normal` sits below all of them, so a granted rating always beats
// an unmodified one and a printed Repel is never downgraded by an Anti- skill.
export function betterAffinity(a, b) {
  const order = CONFIG.SMT.affinityPriority;
  const rank = r => {
    const i = order.indexOf(r);
    return i === -1 ? order.length : i;
  };
  return rank(b) < rank(a) ? b : (a ?? "normal");
}

// Affinity ratings granted by the forty Affinity Changer skills (p.109), as
// { element: rating }. Conflicts within the set resolve by the same p.65 ladder,
// so Fire Repel alongside Anti-Fire is Repel.
export function affinityOverrides(skills, registry) {
  const out = {};
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    const entry = resolved?.entry;
    if (entry?.kind !== "affinityChange" || !entry.element) continue;
    out[entry.element] = betterAffinity(out[entry.element] ?? "normal", entry.rating);
  }
  return out;
}

// The best counterattack passive a character holds (p.110). Counter, Retaliate and
// Avenge are one power-up chain, so they do not stack — the highest multiplier wins.
// Returns { id, multiplier } or null.
export function counterEffect(skills, registry) {
  let best = null;
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind !== "counter") continue;
    const multiplier = Number(resolved.entry.value) || 1;
    if (!best || multiplier > best.multiplier) best = { id: resolved.id, multiplier };
  }
  return best;
}

// Whether a hit is the kind a counterattack answers (p.96: "upon taking a Phys
// element attack"). `suppressed` covers the one case the book carves out: the free
// strikes a fumbled flee attempt hands the enemy "cannot trigger the Counter skill" (p.70).
export function counterTriggers({ element, dodged = false, suppressed = false } = {}) {
  if (dodged || suppressed) return false;
  return element === CONFIG.SMT.counter.element;
}

// Drain Attack (p.110): "When making a basic strike, recover HP equal to 25% of the
// damage dealt to the target."
//
// Two words in that sentence do the work. "basic strike" — not a physical attack skill,
// not a weapon attack, the basic strike specifically, so this is deliberately narrower
// than the Might/Powerful Strikes scope one line above it. And "damage dealt", which is
// the HP the target actually LOST, not the number the calculation produced: an overkill
// on a 5 HP target deals 5, so it drains 1, not a quarter of the raw hit. That is the
// same distinction the 2026-06-07 halve-damage escape turned on, and it is why this
// takes `hpDealt` rather than `finalDamage`.
//
// Rounding is the book's silence, resolved DOWN — the drain is a bonus, and rounding a
// bonus up is how a 1-damage poke starts healing a full point. [inferred]
export function drainOnStrike(skills, registry, { hpDealt = 0, isBasicStrike = false } = {}) {
  if (!isBasicStrike) return 0;
  const dealt = Number.isFinite(hpDealt) && hpDealt > 0 ? Math.floor(hpDealt) : 0;
  if (!dealt) return 0;

  // Duplicates do not compound, per the Amplify group's "similar abilities do not
  // stack" — the best fraction wins, exactly like counterEffect's chain.
  let best = 0;
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind !== "drainOnStrike") continue;
    best = Math.max(best, Number(resolved.entry.value) || 0);
  }
  return Math.floor(dealt * best);
}

// Attack All (p.110): "Basic strikes always target all enemies. This effect does not
// apply to Counter, Retaliate, or Avenge." The exclusion is p.96's too, stated there as
// "Even if you have the Attack All skill, it may not be applied to this counterattack."
export function attackAllApplies(skills, registry, { isBasicStrike = false, isCounter = false } = {}) {
  if (!isBasicStrike || isCounter) return false;
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind === "attackAll") return true;
  }
  return false;
}

// Item Pro (p.110): "When using items, add 1d10 to the power roll." Returns the dice to
// append, as strings, mirroring powerDiceFor.
//
// A SEPARATE kind from powerDie on purpose: powerDie carries a physical/magical scope
// and an item is neither, so reusing it would have handed Item Pro's die to every spell
// the character casts.
export function itemPowerDice(skills, registry) {
  const dice = [];
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    const entry = resolved?.entry;
    if (entry?.kind === "itemPowerDie" && entry.value) dice.push(String(entry.value));
  }
  return dice;
}

// Luck Smiles (p.110): "Completely nullify the effects of an attack on you, 1/scenario
// only. May be learned multiple times, allowing you to use it an additional time per
// scenario each."
//
// Returns `{ id, period, count, copies }` or null. The budget is the ordinary p.96 use
// ledger — `copies` is literally what the second sentence describes, and useBudget
// already multiplies by it, so this needs no counter of its own.
//
// "Completely nullify the EFFECTS" is broader than damage: the ailment and any rider
// go with it, which is why the caller treats it as a null affinity outcome rather than
// as damage set to zero.
export function nullifyAttackEffect(skills, registry) {
  const holders = (skills ?? []).filter(s => resolvePassiveEffect(s, registry)?.entry?.kind === "nullifyAttack");
  if (!holders.length) return null;
  const { entry, id } = resolvePassiveEffect(holders[0], registry);
  return {
    id,
    period: entry.period ?? "scenario",
    count: Number(entry.count) || 1,
    copies: holders.length
  };
}

// Endure's own guard (p.110): "No effect when Stoned."
export function endureApplies(hasEndure, { ailment = "none", alreadyUsed = false } = {}) {
  if (!hasEndure || alreadyUsed) return false;
  return !CONFIG.SMT.endure.blockedByAilments.includes(ailment);
}
