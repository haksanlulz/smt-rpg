// Magatama loadout rules (p.39). Pure: reads CONFIG.SMT, touches no documents.
//
// Rule as printed in the book; paraphrased here, see the page cite above.
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
