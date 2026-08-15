// The action budget (p.63) and press skills (p.96). Pure: reads CONFIG.SMT, touches no
// document.
//
// Rule as printed in the book; paraphrased here, see the page cite above.

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
