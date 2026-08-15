// Barrier skills (p.101): Tetraja, Makarakarn, Tetrakarn. Pure: reads CONFIG.SMT,
// touches no document.
//
// The three printed rows:
//   Tetraja    15 MP — "All allies gain Null Light and Null Dark. However, after this
//                       effect nullifies one attack for an ally, they return to their
//                       normal affinity."
//   Makarakarn 45 MP — "Until the end of the next round, all allies Repel Magic."
//   Tetrakarn  45 MP — "Until the end of the next round, all allies Repel Phys."
//
// ─── Two clocks, not one ──────────────────────────────────────────────────────
// The -karn pair expire on ROUNDS whether or not anything hit them. Tetraja expires
// only by being USED, and can sit through a whole fight untouched. Modelling both as
// one "duration" would have to lie about one, so a barrier carries both fields and
// each kind leaves the other inert: `expiresAfterRound: null` means no round clock,
// `charges: 0` means not charge-based.
//
// ─── "Repel Magic" is a category, "Repel Phys" is an element ──────────────────
// The asymmetry is the book's. p.65 makes Magic an attack CATEGORY that stacks with
// the element rating, and the demon stat blocks print "Repel Magic" and "Repel Phys"
// side by side as if they were the same kind of thing. Makarakarn therefore writes to
// `categoryAffinities.magic` and Tetrakarn to `affinities.phys`; reading Makarakarn
// per-element would miss every magical attack whose element it did not happen to name.
//
// ─── Everything composes through p.65's ladder ────────────────────────────────
// Grants are merged with betterAffinity ("Repel > Drain > Null > Strong > Weak"), the
// same resolution the Affinity Changer passives use, so a barrier can only improve a
// rating and never downgrade a printed one. Casting Tetraja on a demon that already
// Repels Light leaves it repelling.

import { betterAffinity } from "./passives.mjs";

export const BARRIER_KINDS = ["tetraja", "makarakarn", "tetrakarn"];

const EMPTY = () => ({ affinities: {}, categories: {} });

// Which barrier a printed effect sentence describes, or null. Matched on the GRANT
// rather than the phrasing: Rakukaja also opens "all allies gain", and the thing that
// makes a barrier a barrier is that it hands out an affinity.
export function parseBarrier(effect) {
  const s = String(effect ?? "");
  if (/\bNull Light\b/i.test(s) && /\bNull Dark\b/i.test(s)) return "tetraja";
  if (/\bRepel Magic\b/i.test(s)) return "makarakarn";
  if (/\bRepel Phys\b/i.test(s)) return "tetrakarn";
  return null;
}

// The ratings a barrier hands out, split by axis.
export function barrierGrants(kind) {
  const def = CONFIG.SMT.barriers[kind];
  if (!def) return EMPTY();
  return {
    affinities: { ...def.affinities },
    categories: { ...def.categories }
  };
}

// The last round this barrier is alive on, or null when it has no round clock.
// "Until the end of the next round" — cast in round R, alive through R+1.
export function barrierExpiry(kind, round) {
  const def = CONFIG.SMT.barriers[kind];
  if (!def || !Number.isFinite(def.rounds)) return null;
  if (!Number.isFinite(round)) return null;
  return Math.floor(round) + def.rounds;
}

// Whether a stored barrier still applies. A charge-based barrier dies at zero charges;
// a round-based one dies once the round passes its expiry. A barrier with neither —
// raised outside combat, so there was no round to count from — stands until something
// clears it, which is combat end.
export function barrierActive(barrier, round) {
  if (!barrier) return false;
  const def = CONFIG.SMT.barriers[barrier.kind];
  if (!def) return false;

  if (def.charges > 0 && !(Number(barrier.charges) > 0)) return false;

  const expiry = barrier.expiresAfterRound;
  if (Number.isFinite(expiry) && Number.isFinite(round) && round > expiry) return false;
  return true;
}

// Fold every live barrier into one rating set.
//
// Same-axis conflicts resolve through betterAffinity — p.65's ladder, shared with the
// Affinity Changer passives rather than restated here, because two copies of one
// printed ordering are one edit away from disagreeing. With the three printed barriers
// no two grants ever touch the same axis, so this reduce is unreachable today; it is a
// three-line call to an already-proven function rather than a bespoke ranker, which is
// the only reason it is worth keeping for a homebrew fourth.
export function barrierRatings(barriers, round) {
  const out = EMPTY();
  const merge = (bucket, key, rating) => {
    bucket[key] = bucket[key] === undefined ? rating : betterAffinity(bucket[key], rating);
  };

  for (const barrier of barriers ?? []) {
    if (!barrierActive(barrier, round)) continue;
    const grants = barrierGrants(barrier.kind);
    for (const [el, rating] of Object.entries(grants.affinities)) merge(out.affinities, el, rating);
    for (const [cat, rating] of Object.entries(grants.categories)) merge(out.categories, cat, rating);
  }
  return out;
}

// Whether a resolved hit spends one of this barrier's charges.
//
// p.101: "after THIS EFFECT nullifies one attack for an ally". Three readings collapse
// into one test — the hit must have ended as Null, and the target's OWN rating must not
// already have been an absolute. A target who prints Null Light was never saved by
// Tetraja; a target who prints Repel Light reflected the hit rather than nullifying it,
// and p.65's ladder means the barrier's Null was not even what applied.
export function barrierConsumed({ kind, baseRating, effectiveRating } = {}) {
  const def = CONFIG.SMT.barriers[kind];
  if (!def || !(def.charges > 0)) return false;
  if (effectiveRating !== "null") return false;
  return !["null", "drain", "repel"].includes(String(baseRating ?? "normal"));
}
