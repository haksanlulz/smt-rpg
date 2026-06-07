// ═══════════════════════════════════════════════
// passives.mjs — pure resolution of passive-skill effects (p.109-110).
//
// CONFIG.SMT.passiveEffects is the single source of truth for every mechanical
// passive. A skill declares its effect via system.passiveEffect (a registry
// key); these helpers map a skill to its registry entry — by that key first,
// then by a case-insensitive match against the entry's legacyNames so skills
// authored before the enum existed (carrying only the rulebook name) still
// resolve. No document or Foundry access: the data model passes plain
// {name, system} shapes in, which keeps the logic unit-testable.
// ═══════════════════════════════════════════════

/**
 * Resolve one skill to its passive-effect registry entry.
 *
 * Resolution order (first match wins):
 *   1. system.passiveEffect — an explicit registry key (skips the sentinel "none").
 *   2. legacy fallback — a case-insensitive match of the skill's name against any
 *      entry's legacyNames, for skills that predate the enum.
 *
 * @param {{name?: string, system?: {passiveEffect?: string}}} skill - skill-like shape.
 * @param {Record<string, {legacyNames?: string[]}>} registry - CONFIG.SMT.passiveEffects.
 * @returns {{id: string, entry: object}|null} the matched entry and its key, or null.
 */
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

/**
 * Highest-tier HP/MP multiplier bonuses across a set of passive skills (Amplify
 * Group, p.109). Similar abilities do not stack, so the max per resource wins —
 * holding both Life Bonus (+1) and Life Surge (+3) yields +3, not +4.
 *
 * @param {Array<{name?: string, system?: object}>} skills - the actor's passive skills.
 * @param {Record<string, object>} registry - CONFIG.SMT.passiveEffects.
 * @returns {{hpBonus: number, mpBonus: number}}
 */
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

/**
 * Whether any skill in the set grants the Might effect (p.110), which widens the
 * crit threshold for basic strikes / physical attack skills to TN/mightCritDivisor.
 *
 * @param {Array<{name?: string, system?: object}>} skills - skills to scan.
 * @param {Record<string, object>} registry - CONFIG.SMT.passiveEffects.
 * @returns {boolean}
 */
export function hasMightEffect(skills, registry) {
  for (const skill of skills ?? []) {
    const resolved = resolvePassiveEffect(skill, registry);
    if (resolved?.entry?.kind === "might") return true;
  }
  return false;
}
