// Magatama loadout rules (p.39). Pure: reads CONFIG.SMT, touches no documents.
//
// Rule, in brief (p.39): a Fiend may hold up to three Magatama at once but draws
// bonuses from only one. The active one may be switched freely out of combat, and
// not at all during it.
//
// Same rule as advancement.mjs and ailments.mjs: never import data/fields.mjs here.

// Whether an incoming update is a genuine switch of the active Magatama that combat
// forbids. Re-submitting the same id is not a switch — the sheet auto-saves on every
// change, so an unrelated edit must not be read as one.
export function blocksMagatamaSwitch({ current, incoming, inCombat = false } = {}) {
  if (!inCombat) return false;
  if (incoming === undefined || incoming === null) return false;
  return String(incoming) !== String(current ?? "");
}

// How many Magatama may be ingested at once (p.39). The ingested-vs-merely-carried
// distinction the same paragraph draws is NOT modelled — there is no `ingested` flag,
// only `activeMagatama` and the items held. Recorded in GAUNTLET.md §6.
export function maxIngestedMagatama() {
  return CONFIG.SMT.magatama.maxIngested;
}

// Which of the active Magatama's skills a fiend should know at this level (p.42).
//
// Stated as a STATE, not as a diff against the previous level: everything at or below
// the current level that is not already owned. That matters because level is not only
// reached by levelling — `setLevel` writes it directly, and p.39 lets a fiend swap
// Magatama out of combat, after which the new one's whole earned progression is owed at
// once. A previous-vs-current diff would silently skip both cases.
//
// The 8-skill cap (p.80) is applied in learn-level order, so the earliest unlearned
// skill is the one that fits. Anything the cap turns away is RETURNED rather than
// dropped, because a fiend quietly not learning its Magatama's skill is precisely the
// failure this whole path exists to end.
export function magatamaLearnPlan({ skillList = [], level = 0, ownedNames = [], cap = null } = {}) {
  const limit = Number.isFinite(cap) ? cap : CONFIG.SMT.skillCap;
  const owned = new Set(ownedNames.map(n => String(n ?? "").trim().toLowerCase()));

  const earned = (skillList ?? [])
    .filter(s => s?.skillName && Number(s.learnLevel) <= Number(level))
    .sort((a, b) => (a.learnLevel - b.learnLevel) || a.skillName.localeCompare(b.skillName));

  const learn = [];
  const blocked = [];
  let room = limit - owned.size;
  for (const s of earned) {
    if (owned.has(s.skillName.trim().toLowerCase())) continue;
    if (room > 0) { learn.push(s); room -= 1; }
    else blocked.push(s);
  }
  return { learn, blocked, cap: limit };
}
