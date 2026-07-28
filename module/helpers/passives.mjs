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

// Endure's own guard (p.110): "No effect when Stoned."
export function endureApplies(hasEndure, { ailment = "none", alreadyUsed = false } = {}) {
  if (!hasEndure || alreadyUsed) return false;
  return !CONFIG.SMT.endure.blockedByAilments.includes(ailment);
}
