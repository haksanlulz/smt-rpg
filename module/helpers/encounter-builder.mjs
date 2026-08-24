// Random-encounter group composition (p.291). Pure: reads CONFIG.SMT, touches no document.
//
// ─── What p.291 actually is, stated up front ─────────────────────────────────
// There is NO random-encounter table in this book. p.291 is GM design advice, and the
// two other places that touch the subject modify a rate the book never prints — Full
// makes encounters "far more likely" (p.55) and one 150-macca item doubles "the random
// encounter rate" (p.108). Neither states a base. So nothing here rolls for whether an
// encounter happens; `helpers/kagutsuchi.mjs` reports the p.301 trigger and leaves the
// consequence to the GM, and this module is only about WHAT shows up once they decide.
//
// What the page does specify, and all of it is here:
//   two enemy groups, split by threat level (p.291)
//   Group 1: identical weak demons, sized to last about three rounds
//   Group 2 — "a mixture of demons that are made to be fun to fight. Give them a mixture
//              of weaknesses and attack methods ... be sure not to include any healing or
//              debuffing demons and allow for only ONE buff-type demon ... aim for this
//              group lasting around 4-5 rounds"
//   Both     — a demon count matching the PCs
//
// ─── Rules vs advice, kept apart on purpose ──────────────────────────────────
// Three of those are checkable and are enforced: group size equals party size, the mixed
// group admits no healer and no debuffer, and it admits at most one buffer. The rest —
// "fun to fight", "roughly 3 rounds", "4-5 rounds", "just strong enough not to be
// obliterated" — are round-count intentions with no formula behind them, and inventing a
// level band to hit them would be fabricating a rule. The caller supplies the candidate
// list; this decides composition, not power level.
//
// "A mixture of weaknesses and attack methods" sits between the two: it is real guidance
// with no threshold, so it is a PREFERENCE that reorders picks and never blocks filling
// the group. A hard distinctness filter would fail to produce a group at all on a
// candidate list that happens to be uniform. [inferred — the book gives no minimum]

import { skillKey } from "./skill-compendium.mjs";

// Which of the printed buff/debuff skills a demon carries, by name. `SMT.buffs` is
// already the complete registry — it holds Fog Breath, War Cry and Debilitate alongside
// the -kaja/-nda families precisely because p.96 treats differently-named skills that
// share an axis as the same effect. Matching names against it rather than re-listing
// them here is what keeps this from drifting out of step with the buff system.
function buffSignsFor(demon) {
  const index = new Map(Object.keys(CONFIG.SMT.buffs).map(k => [skillKey(k), k]));
  const signs = new Set();
  for (const row of demon?.skills ?? []) {
    const key = index.get(skillKey(row?.name));
    if (key) signs.add(CONFIG.SMT.buffs[key].sign);
  }
  return signs;
}

// p.291's three named roles. A demon can hold more than one.
export function demonRoles(demon) {
  const signs = buffSignsFor(demon);
  // "healing demons" — the stat blocks mark a healing skill by its ELEMENT column,
  // which is the same signal skillTypeFrom reads to call a skill `recovery`.
  const healer = (demon?.skills ?? []).some(
    r => String(r?.element ?? "").trim().toLowerCase() === "healing"
  );
  return { healer, buffer: signs.has(1), debuffer: signs.has(-1) };
}

// Healing and debuffing demons are excluded outright. The
// buffer cap is NOT here, because one buffer is allowed and eligibility is per-demon
// while the cap is a property of the group.
export function eligibleForMixed(demon) {
  const roles = demonRoles(demon);
  return !roles.healer && !roles.debuffer;
}

// a demon count matching the PCs — for BOTH groups.
export function groupSize(partySize) {
  const n = Number.isFinite(partySize) ? Math.floor(partySize) : 0;
  return Math.max(1, n);
}

// Group 1: a group of identical weak demons. Identical is the whole point — one
// demon, repeated. `pick` indexes the candidate list; the caller rolls it.
export function buildWeakGroup(candidates, { partySize = 1, pick = 0 } = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return [];
  const size = groupSize(partySize);
  const chosen = list[((Math.floor(pick) % list.length) + list.length) % list.length];
  return Array.from({ length: size }, () => chosen);
}

// How distinct a demon's weaknesses are, as a comparable signature. Used only by the
// mixture preference below.
function weaknessSignature(demon) {
  const affinities = demon?.affinities ?? {};
  return Object.entries(affinities)
    .filter(([, rating]) => String(rating).toLowerCase() === "weak")
    .map(([element]) => element)
    .sort()
    .join(",");
}

// Group 2: the mixed group. Walks `order` (indices into candidates, caller-rolled),
// admitting demons that pass the hard constraints until the group is full.
//
// TWO PASSES, and the second is why the group can always be filled: the first prefers
// unseen weakness signatures ("a mixture of weaknesses"), the second takes whatever is
// left. A single pass with the preference as a filter returns a short group whenever the
// candidate pool is uniform, which is a worse failure than a slightly samey encounter.
export function buildMixedGroup(candidates, { partySize = 1, order = null } = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const eligible = list.filter(eligibleForMixed);
  if (!eligible.length) return [];

  const size = groupSize(partySize);
  const seq = Array.isArray(order) && order.length
    ? order.map(i => eligible[((Math.floor(i) % eligible.length) + eligible.length) % eligible.length])
    : eligible;

  const group = [];
  const seenWeakness = new Set();
  let buffers = 0;

  const admit = (demon, requireNewWeakness) => {
    if (group.length >= size) return;
    const isBuffer = demonRoles(demon).buffer;
    // at most one buff-type demon — the cap is on the GROUP.
    if (isBuffer && buffers >= CONFIG.SMT.encounterBuilder.maxBuffers) return;
    const sig = weaknessSignature(demon);
    if (requireNewWeakness && seenWeakness.has(sig)) return;
    seenWeakness.add(sig);
    if (isBuffer) buffers++;
    group.push(demon);
  };

  for (const demon of seq) admit(demon, true);
  for (const demon of seq) admit(demon, false);
  return group;
}
