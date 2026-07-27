// Demon fusion engine (p.79-82). Pure rules maths up top (unit-testable, no
// document access — see test/run-tests.mjs); performFusion is the GM-gated
// orchestration. Ingredients are left intact — fusion yields a card to manifest.

import { SMT } from "../config.mjs";
import { expThresholdForLevel } from "./advancement.mjs";
import { demonStatsFor, buildDemonSystem, buildDemonSkills } from "./compendium.mjs";

const FLAG_SCOPE = "smt-rpg";

// Pure fusion maths

// Target level (p.80): floor((L1+L2)/divisor)+bonus, floored at 1. The book then
// rounds up to the nearest existing demon in the result clan — that's the GM's.
export function computeFusionLevel(levelA, levelB) {
  const a = Number(levelA) || 0;
  const b = Number(levelB) || 0;
  const { levelDivisor, levelBonus } = CONFIG.SMT.fusion;
  return Math.max(1, Math.floor((a + b) / levelDivisor) + levelBonus);
}

// How many skills may be inherited, off the p.80 band table keyed by the combined
// ingredient skill total.
export function inheritedSkillCount(combinedSkillTotal) {
  const total = Number(combinedSkillTotal) || 0;
  if (total <= 0) return 0;
  for (const band of CONFIG.SMT.fusion.inheritBands) {
    if (total >= band.min && total <= band.max) return band.count;
  }
  return 0;
}

// The Element clan a same-clan fusion is born as (p.81), else null (cross-clan
// results come from the Normal Fusion Chart, resolved by the GM). Case-insensitive.
export function elementClanFor(clanA, clanB) {
  const a = String(clanA ?? "").toLowerCase();
  const b = String(clanB ?? "").toLowerCase();
  if (!a || a !== b) return null;
  return CONFIG.SMT.fusion.elementBorn[a] ?? null;
}

// Cross-clan Normal Fusion result (p.82). Returns the result clan KEY for two DIFFERENT
// clans off CONFIG.SMT.fusion.normalChart, else null. Fail-closed by design: same clan,
// unknown/empty clan, a clan absent from the chart's own clanOrder, or a blank ("-") cell
// all return null and NEVER throw. Commutative (canonicalised to clanOrder) and
// case-insensitive, mirroring elementClanFor. The chart diagonal is same-clan's job
// (elementClanFor), so a===b is null here.
export function crossClanFusion(clanA, clanB) {
  const a = String(clanA ?? "").trim().toLowerCase();
  const b = String(clanB ?? "").trim().toLowerCase();
  if (!a || !b || a === b) return null;

  const normalChart = CONFIG.SMT?.fusion?.normalChart;
  const order = normalChart?.clanOrder;
  const chart = normalChart?.chart;
  if (!Array.isArray(order) || !chart) return null;

  // Both clans must be on the chart's own axis, else there is no defined result.
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia < 0 || ib < 0) return null;

  // Canonicalise to the stored upper triangle (row before col in clanOrder), then mirror.
  const row = ia < ib ? a : b;
  const col = ia < ib ? b : a;
  const result = chart[row]?.[col];
  if (typeof result !== "string" || !result) return null;

  // Guard the stored value itself against a stray key (transcription typo): a result not
  // on the axis is treated as no result rather than silently propagating a bad clan.
  return order.includes(result) ? result : null;
}

// Rank direction ("up"/"down") when an Element demon is fused with a non-Element one
// (p.81): the result is the non-Element clan, one rank higher or lower per the Rank
// Up/Down Table (CONFIG.SMT.fusion.rankShift). Argument order is free — whichever side is
// the Element clan is used. Returns null unless EXACTLY one side is an Element clan and the
// pair is on the table; fail-closed and never throws. Case-insensitive. This returns only the
// direction; rankShiftResult turns it into an actual demon and applies the Cursed reversal.
export function rankShiftFusion(clanA, clanB) {
  const a = String(clanA ?? "").trim().toLowerCase();
  const b = String(clanB ?? "").trim().toLowerCase();
  if (!a || !b) return null;
  const elementClans = CONFIG.SMT?.fusion?.elementClans;
  const rankShift = CONFIG.SMT?.fusion?.rankShift;
  if (!elementClans || !rankShift) return null;
  const aIsElement = a in elementClans;
  const bIsElement = b in elementClans;
  if (aIsElement === bIsElement) return null; // need exactly one Element side
  const element = aIsElement ? a : b;
  const clan = aIsElement ? b : a;
  const dir = rankShift[clan]?.[element];
  return dir === "up" || dir === "down" ? dir : null;
}

// The fusion pool: general demons only. The p.213-235 boss list is not fusable
// (p.123 -- bosses that later join the pool are already among the general demons).
function _fusionPool(clan) {
  const c = String(clan ?? "").trim().toLowerCase();
  if (!c) return [];
  return (CONFIG.SMT?.demons ?? [])
    .filter(d => !d.boss && d.clan === c)
    .sort((a, b) => a.level - b.level);
}

// Pick the demon a fusion actually produces (p.80): "find the level of the demon in
// the new clan closest to that number and no less than". Exception demons cannot be
// created, so they are stepped over -- a rank higher normally, a rank lower on a Rank
// Down. Fail-closed: unknown/blank clan, a boss-only clan, or a bad level returns null.
export function resultDemonFor(clan, level, { rankDown = false } = {}) {
  const target = Number(level);
  if (!Number.isFinite(target)) return null;

  const pool = _fusionPool(clan);
  if (!pool.length) return null;

  const startIndex = pool.findIndex(d => d.level >= target);
  let i = startIndex < 0 ? pool.length - 1 : startIndex;

  // Step past exception demons in the ruled direction, without falling off either end.
  const step = rankDown ? -1 : 1;
  let guard = pool.length;
  while (guard-- > 0 && isExceptionDemon(pool[i].name)) {
    const next = i + step;
    if (next < 0 || next >= pool.length) {
      // No room in the ruled direction; take the nearest non-exception the other way.
      const back = pool.filter(d => !isExceptionDemon(d.name));
      return back.length ? (rankDown ? back[0] : back[back.length - 1]) : null;
    }
    i = next;
  }

  return isExceptionDemon(pool[i].name) ? null : pool[i];
}

// The demon a Rank Up / Rank Down fusion produces (p.81): "take the non-Element
// demon fused and find the demon that is closest to it in level within the same
// clan but higher" -- Rank Down is the same, one lower. `level` is the non-Element
// ingredient's own level, NOT a computed fusion level. Cursed fusion reverses the
// direction (p.81). Exception demons are stepped over. Fail-closed at both ends of
// the clan: nothing above the ceiling or below the floor returns null rather than
// silently clamping back onto the ingredient's own rank.
export function rankShiftResult(clan, level, direction, { cursed = false } = {}) {
  const target = Number(level);
  if (!Number.isFinite(target)) return null;

  let dir = direction === "up" || direction === "down" ? direction : null;
  if (!dir) return null;
  if (cursed) dir = dir === "up" ? "down" : "up";

  // Element clans are an ingredient side, never a result clan (p.81).
  if (String(clan ?? "").trim().toLowerCase() in (CONFIG.SMT?.fusion?.elementClans ?? {})) return null;

  const pool = _fusionPool(clan).filter(d => !isExceptionDemon(d.name));
  if (!pool.length) return null;

  if (dir === "up") return pool.find(d => d.level > target) ?? null;
  const below = pool.filter(d => d.level < target);
  return below.length ? below[below.length - 1] : null;
}

// Whether a demon name is on the p.80 exception list (cannot be normally fused).
export function isExceptionDemon(name) {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return false;
  return CONFIG.SMT.fusion.exceptionDemons.includes(n);
}

// Pick inherited skills (p.80): at most `count`, total capped at skillCap counting
// initialCount, typed skills gated on a matching resultInheritance, dupes/initials
// dropped. Order-preserving over candidates for deterministic output.
export function selectInheritedSkills(candidates, { count = Infinity, resultInheritance = "", initialCount = 0, initialNames = [] } = {}) {
  const cap = CONFIG.SMT.fusion.skillCap;
  // A demon prints SEVERAL inherit traits ("Mouth Eye Lunge Weapon"), so this is a
  // set, not one value. Comparing the whole string meant a multi-trait demon
  // matched nothing typed at all — invisible until the traits were actually
  // supplied, which nothing did until the compendium started writing them.
  const traits = new Set(
    String(resultInheritance ?? "").toLowerCase().split(/[\s,/]+/).filter(t => t && t !== "none")
  );
  const taken = new Set(initialNames.map(n => String(n ?? "").toLowerCase()));
  const chosen = [];
  let slotsLeft = Math.max(0, cap - Math.max(0, initialCount));

  for (const skill of candidates ?? []) {
    if (chosen.length >= count || slotsLeft <= 0) break;
    const name = String(skill?.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (taken.has(key)) continue;

    // Typed skill needs a matching result trait (p.80).
    const skillTrait = String(skill?.inheritanceType ?? "").trim().toLowerCase();
    if (skillTrait && !traits.has(skillTrait)) continue;

    chosen.push(skill);
    taken.add(key);
    slotsLeft--;
  }
  return chosen;
}

// Orchestration (document access — GM-gated)

// Fusion creates a world Actor, so GM-only.
export function canFuse() {
  return game.user.isGM;
}

// Build the `system` payload for a fused demon (p.79-82). Stats are the per-stat
// average, affinities follow the higher-level ingredient, EXP is the floor for the
// new level (p.48). Returns plain data — no Actor created.
export function buildFusedSystem(demonA, demonB, { level, expMultiplier = 1.3 } = {}) {
  const a = demonA.system;
  const b = demonB.system;
  const newLevel = level ?? computeFusionLevel(a.level, b.level);

  const stats = {};
  for (const stat of ["strength", "magic", "vitality", "agility", "luck"]) {
    const av = Number(a[stat]) || 0;
    const bv = Number(b[stat]) || 0;
    stats[stat] = Math.clamp(Math.round((av + bv) / 2), 0, 40);
  }

  // Higher-level ingredient wins (ties → first). Read _source so a transient
  // override on a prepared value doesn't bleed into stored affinities.
  const dominant = (Number(b.level) || 0) > (Number(a.level) || 0) ? demonB : demonA;
  const affinities = foundry.utils.deepClone(dominant._source.system.affinities ?? {});
  const ailmentAffinities = foundry.utils.deepClone(dominant._source.system.ailmentAffinities ?? {});

  return {
    ...stats,
    level: newLevel,
    exp: expThresholdForLevel(newLevel, expMultiplier), // floor for the level (p.48)
    hp: { value: 9_999_999 }, // clamped to derived max on first prepare
    mp: { value: 9_999_999 },
    affinities,
    ailmentAffinities
  };
}

// Normally fuse two demon actors into a new one (p.79-82). GM-only. Caller supplies
// name + clan (cross-clan from the Fusion Chart; same-clan defaults to the Element
// clan). Ingredients are left intact.
export async function performFusion({ demonA, demonB, resultName, resultClan, resultInheritance = "", inheritSkills = null, cursed = false }) {
  if (!canFuse()) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionGM"));
    return null;
  }
  if (!demonA || !demonB || demonA === demonB) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionTwoDemons"));
    return null;
  }
  if (demonA.type !== "demon" || demonB.type !== "demon") {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionDemonsOnly"));
    return null;
  }

  // Result clan precedence (p.81-82): a GM-supplied clan always wins; else same-clan yields
  // the Element clan (elementClanFor); else the cross-clan Normal Fusion Chart auto-resolves
  // it. crossClanFusion is fail-closed, so on null we degrade to the prior GM-pick fallback
  // (the first ingredient's clan) rather than crashing.
  const gmClan = String(resultClan ?? "").trim();
  const sameClanElement = elementClanFor(demonA.system.clan, demonB.system.clan);
  // Rank Up/Down (p.81): exactly one Element ingredient. The result clan is the
  // NON-Element demon's clan and the result is picked relative to that demon's own
  // level, so this needs the ingredient, not a computed fusion level. Element clans
  // are absent from the p.82 chart entirely, so this can never collide with it.
  const shiftDir = rankShiftFusion(demonA.system.clan, demonB.system.clan);
  const elementClans = CONFIG.SMT?.fusion?.elementClans ?? {};
  const nonElement = shiftDir
    ? (demonA.system.clan in elementClans ? demonB : demonA)
    : null;
  const crossClan = crossClanFusion(demonA.system.clan, demonB.system.clan);

  const clan = gmClan
    || sameClanElement
    || (nonElement ? nonElement.system.clan : null)
    || crossClan
    || demonA.system.clan
    || "fairy";
  // How the clan was decided, for the card note.
  const clanSource = gmClan ? "gm"
    : sameClanElement ? "element"
    : shiftDir ? "rankshift"
    : crossClan ? "cross"
    : "fallback";

  let system = buildFusedSystem(demonA, demonB);
  system.clan = clan;

  // Name the actual demon. Rank shift resolves off the non-Element ingredient's level
  // (p.81); everything else off the computed fusion level (p.80). Both step over
  // exception demons. A GM-supplied name still wins; on null we keep the generic name
  // and leave the computed level alone.
  const named = String(resultName ?? "").trim();
  const rosterResult = named ? null
    : (shiftDir && !gmClan && !sameClanElement)
      ? rankShiftResult(nonElement.system.clan, nonElement.system.level, shiftDir, { cursed })
      : resultDemonFor(clan, system.level);
  const name = named || rosterResult?.name || game.i18n.localize("SMT.Fusion.DefaultName");
  if (rosterResult) system.level = rosterResult.level;

  // GM selection if provided, else every ingredient skill in order. Fresh card, so
  // initialCount/Names are empty.
  const ingredientSkills = inheritSkills ?? [
    ...demonA.items.filter(i => i.type === "skill"),
    ...demonB.items.filter(i => i.type === "skill")
  ];
  const combinedTotal = demonA.items.filter(i => i.type === "skill").length
    + demonB.items.filter(i => i.type === "skill").length;
  const allowed = inheritedSkillCount(combinedTotal);
  const candidateData = ingredientSkills.map(i => ({ name: i.name, inheritanceType: i.system?.inheritanceType ?? "", item: i }));
  const chosen = selectInheritedSkills(candidateData, {
    count: allowed,
    resultInheritance,
    initialCount: 0,
    initialNames: []
  });

  // If the chart named a demon the compendium knows, the result IS that demon:
  // its printed stats, affinities and own skills, with inheritance filling the
  // slots left under the cap of 8 (p.80). Averaging the ingredients was only ever
  // a stand-in for not knowing which demon the fusion produced.
  const statBlock = rosterResult ? demonStatsFor(rosterResult.name) : null;
  const fromBook = buildFusionResult({
    stats: statBlock,
    ingredientSkills: chosen.map(c => c.item ?? c),
    allowed,
    resultInheritance
  });
  if (fromBook) {
    system = fromBook.system;
    system.clan = clan;
  }

  const actor = await Actor.create({
    name,
    type: "demon",
    system,
    items: fromBook ? fromBook.items : [],
    flags: { [FLAG_SCOPE]: { fusedFrom: [demonA.name, demonB.name] } }
  });
  if (!actor) return null;

  // Only the fallback path adds items here — buildFusionResult already placed the
  // demon's own skills plus the inherited ones, so re-adding would duplicate them
  // and blow past the cap of 8.
  if (!fromBook && chosen.length) {
    const itemData = chosen.map(c => c.item.toObject());
    await actor.createEmbeddedDocuments("Item", itemData);
  }

  await postFusionCard({
    demonA, demonB, actor,
    clan,
    clanSource,
    level: system.level,
    isException: isExceptionDemon(name),
    inheritedNames: chosen.map(c => c.name),
    allowed,
    combinedTotal
  });

  return actor;
}

export async function postFusionCard({ demonA, demonB, actor, clan, clanSource, level, isException, inheritedNames, allowed, combinedTotal }) {
  const clanLabel = SMT.demonClans[clan]
    ? game.i18n.localize(SMT.demonClans[clan])
    : (SMT.fusion.elementClans[clan] ? game.i18n.localize(SMT.fusion.elementClans[clan]) : clan);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/smt-rpg/templates/chat/fusion-result.hbs",
    {
      ingredientA: demonA.name,
      ingredientB: demonB.name,
      resultName: actor.name,
      clanLabel,
      crossClan: clanSource === "cross",
      rankShift: clanSource === "rankshift",
      level,
      inheritedNames,
      inheritedCount: inheritedNames.length,
      allowed,
      combinedTotal,
      isException
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("SMT.Fusion.Title") }),
    content
  });
}

// Build the actor payload for a fusion whose result the chart named and the
// compendium knows. Pure: no document access, no CONFIG beyond the skill cap.
//
// Fusion contributes inherited skills, not stats — the result IS the printed demon.
// p.80 bounds the inheritance exactly: "it may not learn more than eight skills in
// total, including its initial skills. Initial skills cannot be removed in favor of
// adding more inherited skills." So the demon's own skills are placed first and
// inheritance takes only the slots that remain.
//
// Returns null when the stat block is unknown, so the caller can fall back to the
// ingredient-averaging path rather than producing a demon with no stats at all.
export function buildFusionResult({ stats, ingredientSkills = [], allowed = 0, resultInheritance = "" }) {
  if (!stats) return null;

  const { system, affinity, behavior, anomalies } = buildDemonSystem(stats);
  const initial = buildDemonSkills(stats);

  const chosen = selectInheritedSkills(
    (ingredientSkills ?? []).map(s => ({
      name: s?.name,
      inheritanceType: s?.system?.inheritanceType ?? "",
      item: s
    })),
    {
      count: allowed,
      // The result demon's own printed traits are what the gate should use; an
      // explicit override still wins so a GM can force an unusual inheritance.
      resultInheritance: resultInheritance || (stats.inheritTraits ?? ""),
      initialCount: initial.length,
      initialNames: initial.map(s => s.name)
    }
  );

  const inherited = chosen.map(c => {
    const src = c.item ?? c;
    // Foundry Items expose toObject(); plain objects are used as-is by the tests.
    const data = typeof src?.toObject === "function" ? src.toObject() : { ...src };
    delete data._id;
    return data;
  });

  return {
    system,
    items: [...initial, ...inherited],
    inheritedNames: inherited.map(i => i.name),
    affinity,
    behavior,
    anomalies
  };
}

// GM fusion dialog (p.79): pick two demons + a result name with a live level/clan/
// inheritance preview, then fuse. Pre-fills two controlled demon tokens if present.
export async function openFusionDialog() {
  if (!canFuse()) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionGM"));
    return null;
  }

  const demons = game.actors.filter(a => a.type === "demon").sort((a, b) => a.name.localeCompare(b.name));
  if (demons.length < 2) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionNeedDemons"));
    return null;
  }

  // Pre-fill from controlled demon tokens when two are at hand.
  const picked = (canvas?.tokens?.controlled ?? [])
    .map(t => t.actor)
    .filter(a => a?.type === "demon");
  const preA = picked[0]?.id ?? demons[0].id;
  const preB = picked[1]?.id ?? demons[1].id;

  const esc = foundry.utils.escapeHTML;
  const optionsFor = (selId) => demons
    .map(d => `<option value="${d.id}"${d.id === selId ? " selected" : ""}>${esc(d.name)} (LV ${Number(d.system.level) || 0} ${esc(game.i18n.localize(SMT.demonClans[d.system.clan] ?? d.system.clan ?? ""))})</option>`)
    .join("");

  const clanOptions = `<option value="">${esc(game.i18n.localize("SMT.Fusion.AutoClan"))}</option>`
    + Object.entries(SMT.demonClans).map(([k, v]) => `<option value="${k}">${esc(game.i18n.localize(v))}</option>`).join("")
    + Object.entries(SMT.fusion.elementClans).map(([k, v]) => `<option value="${k}">${esc(game.i18n.localize(v))}</option>`).join("");

  const content = `
    <div class="smt-fusion-dialog">
      <p class="hint">${game.i18n.localize("SMT.Fusion.DialogHint")}</p>
      <div class="form-group"><label>${game.i18n.localize("SMT.Fusion.IngredientA")}</label>
        <select name="demonA">${optionsFor(preA)}</select></div>
      <div class="form-group"><label>${game.i18n.localize("SMT.Fusion.IngredientB")}</label>
        <select name="demonB">${optionsFor(preB)}</select></div>
      <div class="form-group"><label>${game.i18n.localize("SMT.Fusion.ResultName")}</label>
        <input type="text" name="resultName" placeholder="${esc(game.i18n.localize("SMT.Fusion.DefaultName"))}" /></div>
      <div class="form-group"><label>${game.i18n.localize("SMT.Fusion.ResultClan")}</label>
        <select name="resultClan">${clanOptions}</select></div>
      <div class="form-group"><label>${game.i18n.localize("SMT.Fusion.Cursed")}</label>
        <input type="checkbox" name="cursed" /></div>
      <div class="fusion-preview" data-preview></div>
    </div>`;

  // Recompute level/clan/inheritance from the current selections.
  const refresh = (root) => {
    if (!root?.querySelector) return;
    const a = game.actors.get(root.querySelector("[name=demonA]").value);
    const b = game.actors.get(root.querySelector("[name=demonB]").value);
    const out = root.querySelector("[data-preview]");
    if (!a || !b) { out.innerHTML = ""; return; }
    if (a === b) { out.innerHTML = `<span class="warn">${game.i18n.localize("SMT.Warnings.FusionTwoDemons")}</span>`; return; }
    const level = computeFusionLevel(a.system.level, b.system.level);
    const element = elementClanFor(a.system.clan, b.system.clan);
    const cross = crossClanFusion(a.system.clan, b.system.clan);
    const cursed = !!root.querySelector("[name=cursed]")?.checked;
    // Same precedence performFusion uses, so the preview cannot name a different
    // demon than the one that gets created.
    const shiftDir = rankShiftFusion(a.system.clan, b.system.clan);
    const nonElement = shiftDir
      ? (a.system.clan in SMT.fusion.elementClans ? b : a)
      : null;
    const chosenClan = root.querySelector("[name=resultClan]").value
      || element || (nonElement ? nonElement.system.clan : null) || cross || a.system.clan;
    const clanLabel = SMT.demonClans[chosenClan]
      ? game.i18n.localize(SMT.demonClans[chosenClan])
      : (SMT.fusion.elementClans[chosenClan] ? game.i18n.localize(SMT.fusion.elementClans[chosenClan]) : chosenClan);
    const combined = a.items.filter(i => i.type === "skill").length + b.items.filter(i => i.type === "skill").length;
    const allowed = inheritedSkillCount(combined);
    // Note which rule set the clan: same-clan Element, or an auto-resolved cross-clan chart
    // result (only when the GM hasn't overridden and there's no Element born).
    const gmOverride = !!root.querySelector("[name=resultClan]").value;
    const note = element
      ? `<div class="preview-line element">${game.i18n.localize("SMT.Fusion.SameClanNote")}</div>`
      : (!gmOverride && shiftDir
        ? `<div class="preview-line rankshift">${game.i18n.localize("SMT.Fusion.RankShiftNote")}</div>`
        : (!gmOverride && cross ? `<div class="preview-line cross">${game.i18n.localize("SMT.Fusion.CrossClanNote")}</div>` : ""));
    // Name the demon the fusion will actually produce, so the result is visible before
    // confirming. Rank shift resolves off the non-Element ingredient's level (p.81),
    // everything else off the computed fusion level (p.80).
    const named = (shiftDir && !gmOverride && !element)
      ? rankShiftResult(nonElement.system.clan, nonElement.system.level, shiftDir, { cursed })
      : resultDemonFor(chosenClan, level);
    const namedLine = named
      ? `<div class="preview-line result">${game.i18n.format("SMT.Fusion.ResultDemon", {
          name: esc(named.name), level: named.level
        })}</div>`
      : "";
    out.innerHTML = `<div class="preview-line">${game.i18n.format("SMT.Fusion.Preview", {
      level, clan: esc(clanLabel), allowed, combined
    })}</div>${namedLine}${note}`;
  };

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SMT.Fusion.Title") },
    content,
    buttons: [
      {
        action: "fuse",
        label: game.i18n.localize("SMT.Fusion.Fuse"),
        default: true,
        callback: (event, button) => {
          const form = button.form;
          return {
            demonA: form.elements.demonA.value,
            demonB: form.elements.demonB.value,
            resultName: form.elements.resultName.value,
            resultClan: form.elements.resultClan.value,
            cursed: form.elements.cursed.checked
          };
        }
      },
      { action: "cancel", label: game.i18n.localize("SMT.Cancel") }
    ],
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target;
      if (!root?.querySelectorAll) return;
      for (const el of root.querySelectorAll("select, input[type=checkbox]")) el.addEventListener("change", () => refresh(root));
      refresh(root);
    }
  }).catch(() => null);

  if (!result || result === "cancel") return null;

  return performFusion({
    demonA: game.actors.get(result.demonA),
    demonB: game.actors.get(result.demonB),
    resultName: result.resultName,
    resultClan: result.resultClan,
    cursed: result.cursed
  });
}
