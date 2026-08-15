// The Kagutsuchi Chart (p.56, p.301). Pure: reads CONFIG.SMT, touches no document.
//
// p.55: "Starting from New, it takes eight steps to get to Full, then another eight
// steps to get back to New. With 16 phases altogether, we measure phase 0 (New) to
// phase 8 (full), then go to phase 15 before returning to phase 0 (New) again."
//
// p.301 progression, during a Dungeon Attack:
//   "Move 1 step on the Kagutsuchi Chart per scene."
//   "Move 1 step on the Kagutsuchi Chart per combat completed."
//   "Each time you pass 'New'/Phase 0, the PCs make a Luck check. If all PCs fail, or if
//    one PC auto-fails or fumbles, the party encounters enemy demons. If a PC rolls a
//    critical, something beneficial happens instead."
//
// Outside a dungeon the GM sets the phase freely (p.56), which is why nothing here
// advances on its own — the track is state the GM owns, and the automatic +1 is scoped
// to the two events the book names.
//
// ─── The parenthetical numbers on the printed chart are NOT mechanics ─────────
// p.301 prints "Phase 0 (1) / Phase 1 (2) / Phase 3 (3) / Phase 5 (4) / Phase 7 (5) /
// Phase 8 (6) / Phase 9 (7) / Phase 11 (8) / Phase 13 (9) / Phase 15 (0)". Ten labels
// against sixteen phases, and no rule anywhere reads them — they index the moon artwork
// on the chart. They are named here so a later reader does not mistake the gap for
// something this file dropped.

// How many steps the advance crosses phase 0. Starting ON New and moving away is not
// "passing" it; landing on it is, and so is a full 16-step cycle back to it.
export function newPassings(from, steps) {
  const size = CONFIG.SMT.kagutsuchi.phases;
  const start = normalizePhase(from);
  const move = Number.isFinite(steps) && steps > 0 ? Math.floor(steps) : 0;
  return Math.floor((start + move) / size);
}

export function normalizePhase(phase) {
  const size = CONFIG.SMT.kagutsuchi.phases;
  const value = Number.isFinite(phase) ? Math.floor(phase) : 0;
  return ((value % size) + size) % size;
}

export function advancePhase(phase, steps = 1) {
  const move = Number.isFinite(steps) ? Math.floor(steps) : 0;
  return normalizePhase(normalizePhase(phase) + move);
}

export const isNew = (phase) => normalizePhase(phase) === CONFIG.SMT.kagutsuchi.newPhase;
export const isFull = (phase) => normalizePhase(phase) === CONFIG.SMT.kagutsuchi.fullPhase;

// Waxing from New up to Full, waning from Full back round to New. Phase 0 and phase 8
// are the turning points and belong to neither.
export function phaseTrend(phase) {
  const p = normalizePhase(phase);
  const full = CONFIG.SMT.kagutsuchi.fullPhase;
  if (p === CONFIG.SMT.kagutsuchi.newPhase) return "new";
  if (p === full) return "full";
  return p < full ? "waxing" : "waning";
}

// ── What Full changes (p.55, p.301) ──────────────────────────────────────────
// "Demons go wild, and won't engage in negotiations. Random encounter chances are
// higher. Sacrificial fusion is available."

// p.69 lists Full among the situations where "a PC cannot choose the talking action".
// The GM override is theirs and is not modelled: the book hands it to them in the same
// breath, and a rule that can always be waived is a prompt, not a gate.
export const negotiationBlocked = (phase) => isFull(phase);

// p.79: "Sacrificial fusion may be performed when Kagutsuchi is Full."
export const sacrificialFusionAvailable = (phase) => isFull(phase);

// "Random encounter chances are higher" states no number, so none is invented — this
// reports the condition and the GM sets the odds. Returning a multiplier would be
// fabricating a rate the book withholds.
export const encountersHeightened = (phase) => isFull(phase);

// ── Passing New (p.301) ──────────────────────────────────────────────────────
// "If all PCs fail, or if one PC auto-fails or fumbles, the party encounters enemy
// demons. If a PC rolls a critical, something beneficial happens instead."
//
// `results` is the same outcome vocabulary the encounter check uses.
//
// The two triggers are reported INDEPENDENTLY rather than resolved against each other.
// "Instead" reads naturally when one thing happened, and the book does not say which
// wins when one PC fumbles and another crits in the same party — both conditions are
// literally met. Collapsing them here would decide a case the text leaves open, and
// choosing wrongly is invisible at the table. [inferred — reported, not resolved]
export function newPassOutcome(results) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return { encounter: false, boon: false, allFailed: false };

  const succeeded = list.some(r => r === "success" || r === "critical");
  const disaster = list.some(r => r === "autoFail" || r === "fumble");
  const boon = list.some(r => r === "critical");

  return { encounter: !succeeded || disaster, boon, allFailed: !succeeded };
}

// ---------------------------------------------------------------- Foundry side

export const currentPhase = () => normalizePhase(game.settings.get("smt-rpg", "kagutsuchiPhase"));

// Move the track and, for every crossing of New it makes, run the p.301 check. GM only.
//
// The check runs PER PASSING rather than once for the move: a GM skipping the track
// forward two cycles owes two checks, and collapsing them to a boolean would silently
// drop the second. That is why newPassings returns a count.
export async function advanceKagutsuchi(steps = 1, { reason = "scene" } = {}) {
  if (!game.user.isGM) return null;

  const from = currentPhase();
  const to = advancePhase(from, steps);
  const passings = newPassings(from, steps);
  await game.settings.set("smt-rpg", "kagutsuchiPhase", to);

  if (CONFIG.SMT.debug) console.log("smt-rpg | Kagutsuchi", { from, to, steps, passings, reason });

  await ChatMessage.create({
    content: `<div class="smt-roll effect-notice"><p>${game.i18n.format("SMT.Kagutsuchi.Advanced", {
      from, to, trend: game.i18n.localize(`SMT.Kagutsuchi.Trend.${phaseTrend(to)}`)
    })}</p>${isFull(to) ? `<p><em>${game.i18n.localize("SMT.Kagutsuchi.FullNotice")}</em></p>` : ""}</div>`
  });

  for (let i = 0; i < passings; i++) await runNewPassingCheck();
  return { from, to, passings };
}

// p.301's check on passing New. Rolls Luck for every player character, then REPORTS the
// outcome — it does not spawn an encounter or hand out an item, because the book names
// neither ("the party encounters enemy demons", "something beneficial happens") in terms
// any system could resolve. Rolling is the automatable half; what happens is the GM's.
export async function runNewPassingCheck() {
  const { combatantSide, outcomeFromCheck } = await import("./encounter.mjs");

  const pcs = game.actors.filter(a => a.hasPlayerOwner && combatantSide(a) === "pcs");
  if (!pcs.length) return null;

  const results = [];
  const lines = [];
  for (const actor of pcs) {
    const check = await actor.rollPercentile(
      actor.system.luckTN ?? 0, game.i18n.localize("SMT.Kagutsuchi.NewCheckLabel")
    );
    const outcome = outcomeFromCheck(check);
    results.push(outcome);
    lines.push(`${actor.name}: ${game.i18n.localize(`SMT.Encounter.Outcome.${outcome}`)}`);
  }

  const verdict = newPassOutcome(results);
  const notes = [];
  if (verdict.encounter) notes.push(game.i18n.localize("SMT.Kagutsuchi.NewEncounter"));
  if (verdict.boon) notes.push(game.i18n.localize("SMT.Kagutsuchi.NewBoon"));
  if (!notes.length) notes.push(game.i18n.localize("SMT.Kagutsuchi.NewQuiet"));

  await ChatMessage.create({
    content: `<div class="smt-roll effect-notice">`
      + `<p><strong>${game.i18n.localize("SMT.Kagutsuchi.NewCheckLabel")}</strong></p>`
      + `<p>${lines.join("<br>")}</p><p>${notes.join("<br>")}</p></div>`
  });
  return verdict;
}
