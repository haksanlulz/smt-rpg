// Limited skills (p.96) and Focus (p.105). Pure: reads CONFIG.SMT, touches no document.
//
// p.96, verbatim: "Some skills, such as the once-per-scenario Fortune, and the
// once-per-combat Endure, have 'use limits' — restrictions on the number of times they
// can be used. Players with these skills are responsible for keeping track."
//
// The book hands tracking to the player; this system's clause-2 bar says otherwise —
// "the GM can do that by hand" is not done — so the ledger is kept for them. Endure
// already had a hand-rolled `endureUsed` boolean; this generalises that shape to any
// skill with any period, and Endure keeps its own field because a passive fires from
// the damage pipeline rather than from a skill use.
//
// THREE PERIODS, and the reset boundary is the whole rule:
//   * round    — boss skills (p.96: "certain boss-only skills should only be used once
//                per round", so Icy Death cannot go twice back to back)
//   * combat   — Endure, Divine Will
//   * scenario — Fortune, Luck Smiles, Once a Snake; cleared only when the GM says the
//                scenario ended, because nothing else knows.
export const USE_PERIODS = ["none", "round", "combat", "scenario"];

// "1/scenario only", "once per combat", "1/ combat only" — the printed phrasings, in
// both the ch4 prose and the stat blocks' terser wording. A skill that states no limit
// gets none; inventing one would forbid a legal action.
const LIMIT_PATTERNS = [
  [/(\d+)\s*\/\s*scenario/i, "scenario"],
  [/(\d+)\s*\/\s*combat/i, "combat"],
  [/(\d+)\s*\/\s*round/i, "round"],
  [/once\s+per\s+scenario/i, "scenario"],
  [/once\s+per\s+combat/i, "combat"],
  [/once\s+per\s+round/i, "round"],
];

// Parse a use limit out of printed effect text. Returns null when none is stated.
export function parseUseLimit(effect) {
  const s = String(effect ?? "");
  for (const [re, period] of LIMIT_PATTERNS) {
    const m = re.exec(s);
    if (!m) continue;
    const count = m[1] ? Number(m[1]) : 1;
    if (!Number.isInteger(count) || count < 1) continue;
    return { period, count };
  }
  return null;
}

// "May be learned multiple times, allowing you to use it an additional time per
// scenario each" (p.110, Luck Smiles and Once a Snake). Two copies of the skill is two
// uses, so the budget multiplies by how many the actor holds.
export function useBudget({ count = 1, copies = 1 } = {}) {
  const per = Number.isInteger(count) && count > 0 ? count : 1;
  const held = Number.isInteger(copies) && copies > 0 ? copies : 1;
  return per * held;
}

// Whether a use is available, and what the ledger becomes after it. `spent` is the
// count already used in the current period. Pure — the caller writes the result.
export function spendUse({ period = "none", count = 1, copies = 1, spent = 0 } = {}) {
  if (!USE_PERIODS.includes(period) || period === "none") {
    return { allowed: true, spent, remaining: Infinity, limited: false };
  }
  const budget = useBudget({ count, copies });
  const used = Number.isInteger(spent) && spent > 0 ? spent : 0;
  if (used >= budget) return { allowed: false, spent: used, remaining: 0, limited: true };
  return { allowed: true, spent: used + 1, remaining: budget - used - 1, limited: true };
}

// Which ledger entries a boundary clears. A round reset clears only round-scoped
// entries; ending a combat clears round AND combat, because a combat contains rounds;
// a scenario clears everything. Returns the keys to drop.
export function clearedByBoundary(ledger, boundary) {
  const drops = { round: ["round"], combat: ["round", "combat"], scenario: USE_PERIODS };
  const periods = new Set(drops[boundary] ?? []);
  return Object.keys(ledger ?? {}).filter(k => periods.has(ledgerPeriod(k)));
}

// Ledger keys are `<period>:<skill name>` — the period rides the key so a boundary
// reset needs no lookup back into the skills, which may have changed since.
export const ledgerKey = (period, name) => `${period}:${String(name ?? "").trim().toLowerCase()}`;
export const ledgerPeriod = (key) => String(key ?? "").split(":")[0];

// ---------------------------------------------------------------- Focus (p.105)

// "The caster doubles the total power of their next basic strike or physical attack.
// The check for this auto-succeeds."
//
// NOT a Concentrate-shaped bonus: Concentrate and Aid add to the hit CHECK's TN, and
// Focus multiplies the POWER after it is rolled. Keeping them apart matters — folding
// Focus into consumeSetupBonuses would have made it +20% to hit and no damage at all.
export function focusMultiplier({ active = false, isPhysical = false } = {}) {
  if (!active) return 1;
  // "basic strike or physical attack" — a spell keeps its Focus for a later strike
  // rather than consuming it, so a magical attack is not eligible.
  return isPhysical ? CONFIG.SMT.focus.multiplier : 1;
}

// Whether this use consumes the stored Focus. Only an eligible action does; anything
// else leaves it standing.
export function focusConsumed({ active = false, isPhysical = false } = {}) {
  return !!active && !!isPhysical;
}
