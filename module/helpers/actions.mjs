// The action budget (p.63) and press skills (p.96). Pure: reads CONFIG.SMT, touches no
// document.
//
// p.63 gives every combatant one turn per round and one action on that turn, where an
// action is a basic strike, a skill, talking, aiding, concentrating, defending, or using
// an item. The only printed change to that number is the boss trait, which grants two
// (p.278).
//
// p.96 press skills raise the count: Beast Eye spends one action to grant two, and
// Dragon Eye spends one to grant four. The grant is GROSS, not net -- the spend is
// charged separately, so the book's "effectively one more / three more" arithmetic falls
// out of the model rather than being hardcoded.
//
// ─── The distinction this module exists to keep ───────────────────────────────
// A MULTI-ACTION (p.59-60) is not an extra action. A 100%+ TN lets one declared action
// The multi-action rule repeats one action two or three times in a turn (p.59). Same
// skill, same target, divided TN. That is two or three CHECKS bought with ONE action.
// A press skill buys ACTIONS, each free to be a different skill against a different
// target, and each free to be its own multi-action. Nothing here touches
// multiActionPlan, and nothing there touches this.
//
// ─── Why the ledger carries its own turn key ──────────────────────────────────
// The budget resets every turn, and the reset is expressed as `key` mismatch rather
// than as a hook that must fire. A ledger stamped for an earlier turn reads as a full
// budget, so a dropped updateCombat, a mid-combat reload, or an actor dragged into a
// fight already in progress all fail OPEN. The failure that matters here is refusing a
// legal action, not permitting an extra one — a GM can see a combatant acting twice and
// cannot see one who was silently forbidden to act at all.

// "Gain two actions this round" / "Gain four actions this round" (p.105 table). The
// printed rows are the only statement of the number; the ch4 prose gives the rule but
// names no figure a parser could read.
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

// How many actions a press skill hands out, gross. 0 = not a press skill.
export function parsePressGrant(effect) {
  const m = /\bgain\s+(\d+|one|two|three|four|five|six)\s+actions?\b/i.exec(String(effect ?? ""));
  if (!m) return 0;
  const raw = m[1].toLowerCase();
  const n = NUMBER_WORDS[raw] ?? Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// The printed base: one action, or two with the boss trait.
export function baseActions({ isBoss = false } = {}) {
  const actions = CONFIG.SMT.actions;
  return isBoss ? actions.boss : actions.base;
}

// Identifies one combatant's turn. Null out of combat, which is the untracked case —
// there is no action economy outside a fight, so nothing may be refused for lack of one.
export function turnKey(round, turn) {
  if (!Number.isFinite(round) || !Number.isFinite(turn)) return null;
  return `${Math.floor(round)}:${Math.floor(turn)}`;
}

// Non-negative integer, or the fallback. Guards a hand-edited or half-written ledger:
// a corrupt entry must read as unspent, never as credit.
const count = (value) => (Number.isInteger(value) && value > 0 ? value : 0);

const UNTRACKED = { total: Infinity, spent: 0, granted: 0, remaining: Infinity, tracked: false };

// What the budget currently stands at. `ledger` is the actor's stored `{ key, spent,
// granted }`; anything whose key does not match the turn being asked about is fresh.
export function actionState(ledger, { key = null, isBoss = false } = {}) {
  if (key === null || key === undefined) return { ...UNTRACKED };

  const current = ledger?.key === key ? ledger : null;
  const granted = count(current?.granted);
  const spent = count(current?.spent);
  const total = baseActions({ isBoss }) + granted;
  return { total, spent, granted, remaining: Math.max(0, total - spent), tracked: true };
}

// Whether an action is available, and what the ledger becomes after it. `grants` is the
// press skill's gross figure, charged its own action like any other use. Pure — the
// caller writes the result.
export function spendActions(ledger, { key = null, isBoss = false, cost = 1, grants = 0 } = {}) {
  const state = actionState(ledger, { key, isBoss });
  if (!state.tracked) return { allowed: true, ...UNTRACKED, ledger: null };

  const price = Number.isInteger(cost) && cost > 0 ? cost : 1;
  const gain = count(grants);

  if (state.remaining < price) {
    return {
      allowed: false, total: state.total, spent: state.spent, granted: state.granted,
      remaining: state.remaining,
      ledger: { key, spent: state.spent, granted: state.granted }
    };
  }

  const spent = state.spent + price;
  const granted = state.granted + gain;
  const total = baseActions({ isBoss }) + granted;
  return {
    allowed: true, total, spent, granted, remaining: Math.max(0, total - spent),
    ledger: { key, spent, granted }
  };
}
