// Fleeing (p.70). Pure: reads CONFIG.SMT, touches no document.
//
// Verbatim: "PCs may attempt to escape from any non-Boss encounter. This is called
// 'fleeing.' When someone attempts to flee, opposing combatants may decide whether they
// wish to block the attempt or not. If no combatant chooses to block the attempt, then
// fleeing is automatically successful. If all members of one side flee, then combat
// ends."
//
// "BLOCKING ESCAPE — If an enemy combatant wants to block a character from fleeing, then
// the escapee can only flee if they pass a dodge check. When this happens, if there are
// more friendly combatants than enemy combatants, the fleeing character gains +20% to
// their flee attempt. If this check is a critical, then one additional allied combatant
// may flee alongside the first. If, however, the check is a fumble, then every enemy
// combatant gets a chance to make a basic strike against the fumbler. These attacks
// cannot trigger the Counter skill."
//
// ─── The default is SUCCESS, not a roll ──────────────────────────────────────
// Unblocked fleeing is automatic. A check only exists because somebody chose to stop it,
// which makes "was it blocked" the first question and the roll the exception. Prompting
// for a dodge check every time would quietly invent a failure mode the book does not
// have — and it is the shape most likely to be built by reflex, since every other
// escape-shaped rule in the system rolls for it.
//
// ─── The +20% is scoped to the blocked branch ────────────────────────────────
// "When this happens" refers to the dodge check, so the outnumbering bonus exists only
// where there is a roll to apply it to. It cannot make an automatic escape more
// automatic, and reading it as a general flee bonus would leave dead arithmetic sitting
// on the auto path.

// Whether an encounter can be fled at all: "any non-Boss encounter".
export function fleeAllowed({ enemyIsBoss = false } = {}) {
  return !(CONFIG.SMT.flee.bossBlocks && enemyIsBoss);
}

// "if there are more friendly combatants than enemy combatants". The fleeing character
// counts among the friendly ones — they are a combatant on that side, and the sentence
// draws no distinction. [inferred: the book does not say whether the escapee is counted]
export function fleeTnBonus({ allies = 0, enemies = 0 } = {}) {
  const a = Number.isFinite(allies) ? Math.floor(allies) : 0;
  const e = Number.isFinite(enemies) ? Math.floor(enemies) : 0;
  return a > e ? CONFIG.SMT.flee.outnumberedBonus : 0;
}

// What an attempt costs. `automatic` short-circuits everything below it.
export function fleePlan({ blocked = false, allies = 0, enemies = 0, dodgeTn = 0 } = {}) {
  if (!blocked) return { automatic: true, tn: 0, bonus: 0 };
  const bonus = fleeTnBonus({ allies, enemies });
  const base = Number.isFinite(dodgeTn) ? Math.max(0, Math.floor(dodgeTn)) : 0;
  return { automatic: false, tn: base + bonus, bonus };
}

// What a resolved blocked attempt produces.
//
// The fumble clause carries `noCounter` because p.70 says so in as many words, and the
// same flag already exists for it — the counterattack spec cites this exact sentence as
// one of its two carve-outs.
export function fleeResult({ isSuccess = false, isCritical = false, isFumble = false } = {}) {
  if (isFumble) {
    return { escaped: false, extraAllyMayFlee: false, freeStrikes: true, noCounter: true };
  }
  if (isCritical) {
    return { escaped: true, extraAllyMayFlee: true, freeStrikes: false, noCounter: true };
  }
  return { escaped: !!isSuccess, extraAllyMayFlee: false, freeStrikes: false, noCounter: true };
}

// "If all members of one side flee, then combat ends." Counts who is LEFT, not who left.
export function combatEndsOnFlee({ remainingOnSide = 0 } = {}) {
  const left = Number.isFinite(remainingOnSide) ? Math.floor(remainingOnSide) : 0;
  return left <= 0;
}

// ---------------------------------------------------------------- Foundry side

// Attempt to flee (p.70). Asks whether anyone is blocking, because the book gives that
// choice to the opposing combatants and nothing in the system can read their intent —
// "opposing combatants may DECIDE whether they wish to block". Defaulting either way
// would be answering for them.
export async function attemptFlee(actor) {
  if (!actor) return null;
  const combat = game.combat;
  if (!combat?.started) {
    ui.notifications.warn(game.i18n.localize("SMT.Flee.NotInCombat"));
    return null;
  }

  const { combatantSide } = await import("./encounter.mjs");
  const side = combatantSide(actor);
  const mine = combat.combatants.filter(c => c.actor && combatantSide(c.actor) === side);
  const foes = combat.combatants.filter(c => c.actor && combatantSide(c.actor) !== side);

  if (!fleeAllowed({ enemyIsBoss: foes.some(c => c.actor?.system?.isBoss) })) {
    ui.notifications.warn(game.i18n.localize("SMT.Flee.BossEncounter"));
    return null;
  }

  const blocked = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("SMT.Flee.Attempt") },
    content: `<p>${game.i18n.format("SMT.Flee.BlockPrompt", { name: actor.name })}</p>`,
    yes: { label: game.i18n.localize("SMT.Flee.Blocked") },
    no: { label: game.i18n.localize("SMT.Flee.Unblocked") },
    rejectClose: false
  });
  // A dismissed dialog is not an answer, so nothing is attempted.
  if (blocked === null || blocked === undefined) return null;

  const plan = fleePlan({
    blocked, allies: mine.length, enemies: foes.length, dodgeTn: actor.system.dodgeTN
  });

  if (plan.automatic) {
    await postFleeOutcome(actor, { escaped: true, automatic: true });
    return { escaped: true, automatic: true };
  }

  const label = plan.bonus
    ? `${game.i18n.localize("SMT.Flee.Attempt")} +${plan.bonus}%`
    : game.i18n.localize("SMT.Flee.Attempt");
  const check = await actor.rollPercentile(plan.tn, label);
  const result = fleeResult(check);

  if (CONFIG.SMT.debug) console.log("smt-rpg | Flee", { actor: actor.name, plan, check, result });

  await postFleeOutcome(actor, result);

  // The fumble's free strikes go through the ordinary strike path so damage, affinity
  // and riders all behave — with noCounter set, which is p.70's own sentence.
  if (result.freeStrikes) {
    const { performBasicStrike } = await import("./combat.mjs");
    const selfToken = actor.getActiveTokens()[0];
    for (const foe of foes) {
      if (!foe.actor || !selfToken) continue;
      await performBasicStrike(foe.actor, {
        targets: [selfToken],
        isReaction: true,
        label: game.i18n.localize("SMT.Flee.FreeStrike")
      });
    }
  }
  return result;
}

async function postFleeOutcome(actor, result) {
  const key = result.automatic ? "SMT.Flee.Auto"
    : result.freeStrikes ? "SMT.Flee.Fumbled"
      : result.extraAllyMayFlee ? "SMT.Flee.Critical"
        : result.escaped ? "SMT.Flee.Escaped" : "SMT.Flee.Failed";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="smt-roll effect-notice"><p>${game.i18n.format(key, { name: actor.name })}</p></div>`
  });
}
