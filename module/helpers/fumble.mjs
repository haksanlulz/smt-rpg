// The Fumble Effect Chart (p.58) and the hit-check row's elaboration (p.64). Pure:
// reads CONFIG.SMT, touches no document.
//
// Rule as printed in the book; paraphrased here, see the page cite above.
// Two of the five were already engine behaviour before this file existed: the dodge
// row is `dodgeFumble` in helpers/damage.mjs, and the save row is
// `fumbledSaveResources` in helpers/ailments.mjs. This module owns the chart as a
// chart — one place that answers "what does a fumble on THIS check do" — so a future
// check type cannot be added without meeting the question, and so the two rows the GM
// owns resolve to a stated prompt rather than to silence.
//
// ─── The hit-check row is the one that was doing nothing ──────────────────────
// p.64 elaborates it and every clause matters: "the attacker becomes Cursed, and the
// attack then randomly hits either themselves or an ally (and in the case of the
// attack being 'all' then it hits all allies, themselves included). When hitting an
// ally, that ally may avoid the attack with a dodge check as normal, but an attacker
// cannot avoid hitting themselves."
//
// So: a single-target fumble picks ONE victim at random from {self} ∪ allies, an
// "all" fumble hits every ally AND the attacker, and dodge eligibility is per-victim
// rather than per-attack. The Curse is applied by rollPercentile, which sees every
// check and not just attacks — p.57 states it for checks in general.

export const FUMBLE_CHECK_TYPES = ["hit", "dodge", "negotiation", "save", "other"];

// What the chart says, as a routed outcome. `automated` marks the rows the system
// resolves itself; the other two are the book handing the call to the GM, and they
// return a prompt so the table sees the rule rather than nothing.
export function fumbleEffect(checkType) {
  const type = FUMBLE_CHECK_TYPES.includes(checkType) ? checkType : "other";
  return CONFIG.SMT.fumbleChart[type];
}

// Who a fumbled attack lands on (p.64). `allyCount` excludes the attacker; `pick` is a
// 0-based index into the victim list, which the caller rolls.
//
// Returns entries of `{ target: "self" | "ally", index, canDodge }`. Index is into the
// caller's ally list and is -1 for the attacker.
export function fumbleVictims({ targetsAll = false, allyCount = 0, pick = 0 } = {}) {
  const allies = Number.isInteger(allyCount) && allyCount > 0 ? allyCount : 0;

  // "in the case of the attack being 'all' then it hits all allies, themselves
  // included" — no roll, no choice, and the attacker is in the blast.
  if (targetsAll) {
    const out = [{ target: "self", index: -1, canDodge: false }];
    for (let i = 0; i < allies; i++) out.push({ target: "ally", index: i, canDodge: true });
    return out;
  }

  // "randomly hits either themselves or an ally" — the attacker is one entry in the
  // pool, not a fallback. A lone attacker with no allies always hits themselves,
  // which is the same sentence with a pool of one.
  const pool = 1 + allies;
  const roll = Number.isInteger(pick) && pick >= 0 ? pick % pool : 0;
  if (roll === 0) return [{ target: "self", index: -1, canDodge: false }];
  return [{ target: "ally", index: roll - 1, canDodge: true }];
}

// The die a caller rolls to pick a single victim: 1dN over the pool, where the pool is
// the attacker plus their allies. Exposed so the roll is the book's uniform choice
// rather than each call site inventing one.
export function fumbleVictimPool(allyCount) {
  const allies = Number.isInteger(allyCount) && allyCount > 0 ? allyCount : 0;
  return 1 + allies;
}
