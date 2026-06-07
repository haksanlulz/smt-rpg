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
