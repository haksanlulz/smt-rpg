// Demon fusion engine (p.79-82). Pure rules maths up top (unit-testable, no
// document access — see test/run-tests.mjs); performFusion is the GM-gated
// orchestration. Ingredients are left intact — fusion yields a card to manifest.

import { SMT } from "../config.mjs";
import { expThresholdForLevel } from "./advancement.mjs";

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
  const trait = String(resultInheritance ?? "").trim().toLowerCase();
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
    if (skillTrait && skillTrait !== trait) continue;

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
export async function performFusion({ demonA, demonB, resultName, resultClan, resultInheritance = "", inheritSkills = null }) {
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

  const name = String(resultName ?? "").trim() || game.i18n.localize("SMT.Fusion.DefaultName");
  const sameClanElement = elementClanFor(demonA.system.clan, demonB.system.clan);
  const clan = String(resultClan ?? "").trim() || sameClanElement || demonA.system.clan || "fairy";

  const system = buildFusedSystem(demonA, demonB);
  system.clan = clan;

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

  const actor = await Actor.create({
    name,
    type: "demon",
    system,
    flags: { [FLAG_SCOPE]: { fusedFrom: [demonA.name, demonB.name] } }
  });
  if (!actor) return null;

  if (chosen.length) {
    const itemData = chosen.map(c => c.item.toObject());
    await actor.createEmbeddedDocuments("Item", itemData);
  }

  await postFusionCard({
    demonA, demonB, actor,
    clan,
    level: system.level,
    isException: isExceptionDemon(name),
    inheritedNames: chosen.map(c => c.name),
    allowed,
    combinedTotal
  });

  return actor;
}

export async function postFusionCard({ demonA, demonB, actor, clan, level, isException, inheritedNames, allowed, combinedTotal }) {
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
    const chosenClan = root.querySelector("[name=resultClan]").value
      || element || a.system.clan;
    const clanLabel = SMT.demonClans[chosenClan]
      ? game.i18n.localize(SMT.demonClans[chosenClan])
      : (SMT.fusion.elementClans[chosenClan] ? game.i18n.localize(SMT.fusion.elementClans[chosenClan]) : chosenClan);
    const combined = a.items.filter(i => i.type === "skill").length + b.items.filter(i => i.type === "skill").length;
    const allowed = inheritedSkillCount(combined);
    out.innerHTML = `<div class="preview-line">${game.i18n.format("SMT.Fusion.Preview", {
      level, clan: esc(clanLabel), allowed, combined
    })}</div>${element ? `<div class="preview-line element">${game.i18n.localize("SMT.Fusion.SameClanNote")}</div>` : ""}`;
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
            resultClan: form.elements.resultClan.value
          };
        }
      },
      { action: "cancel", label: game.i18n.localize("SMT.Cancel") }
    ],
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target;
      if (!root?.querySelectorAll) return;
      for (const sel of root.querySelectorAll("select")) sel.addEventListener("change", () => refresh(root));
      refresh(root);
    }
  }).catch(() => null);

  if (!result || result === "cancel") return null;

  return performFusion({
    demonA: game.actors.get(result.demonA),
    demonB: game.actors.get(result.demonB),
    resultName: result.resultName,
    resultClan: result.resultClan
  });
}
