// ═══════════════════════════════════════════════
// fusion.mjs — demon fusion engine (p.79-82).
//
// Role: turn two ingredient demons into one fused demon. The hard, rules-exact
// maths lives in the PURE functions at the top (no document or Foundry access, so
// they are unit-testable in plain node — see test/run-tests.mjs):
//   - computeFusionLevel : (L1 + L2) / 2 + 2, floored (p.80).
//   - inheritedSkillCount : the p.80 "Number of Inherited Skills" band table,
//                           keyed by the COMBINED skill total of the ingredients.
//   - elementClanFor      : same-clan fusion -> the Element clan it is born as
//                           (p.81), else null (a cross-clan result the GM names).
//   - selectInheritedSkills : honour inheritanceType + the 8-skill total cap (p.80).
//   - isExceptionDemon    : the p.80 exception-demon guard.
// Every constant is read from CONFIG.SMT.fusion, never hard-coded here.
//
// performFusion() is the orchestration layer: GM-gated, it reads two demon actors,
// derives the new demon's level/EXP/skills via the pure helpers, creates the actor
// (EXP set to the floor for the new level, p.48), and posts a result card. It does
// NOT consume or delete the ingredients — fusion in the book yields a card the PC
// later manifests, so the source demons are left intact for the GM to handle.
// ═══════════════════════════════════════════════

import { SMT } from "../config.mjs";

const FLAG_SCOPE = "smt-rpg";

// ═══════════════════════════════════════════════
// Pure fusion maths (no document access — unit-testable)
// ═══════════════════════════════════════════════

/**
 * Level of the demon produced by a normal fusion (p.80):
 *   floor((L1 + L2) / levelDivisor) + levelBonus
 * The book then rounds this up to the nearest demon that actually exists in the
 * result clan; that data-dependent step is the GM's, so this returns the raw
 * target level the GM rounds from. Floors at 1 so a fusion never yields level 0.
 *
 * @param {number} levelA - first ingredient demon's level.
 * @param {number} levelB - second ingredient demon's level.
 * @returns {number} the target fusion level (>= 1).
 */
export function computeFusionLevel(levelA, levelB) {
  const a = Number(levelA) || 0;
  const b = Number(levelB) || 0;
  const { levelDivisor, levelBonus } = CONFIG.SMT.fusion;
  return Math.max(1, Math.floor((a + b) / levelDivisor) + levelBonus);
}

/**
 * Number of skills the fused demon may inherit, from the p.80 band table, keyed by
 * the COMBINED number of skills the two ingredients had before fusion. Falls to 0
 * for a non-positive total (no skills to inherit).
 *
 * @param {number} combinedSkillTotal - skillsA + skillsB before fusion.
 * @returns {number} how many skills may be inherited.
 */
export function inheritedSkillCount(combinedSkillTotal) {
  const total = Number(combinedSkillTotal) || 0;
  if (total <= 0) return 0;
  for (const band of CONFIG.SMT.fusion.inheritBands) {
    if (total >= band.min && total <= band.max) return band.count;
  }
  return 0;
}

/**
 * The Element clan a same-clan fusion is born as (p.81), or null for a cross-clan
 * fusion (whose result clan comes from the Normal Fusion Chart — a data-dependent
 * lookup the GM resolves, so the engine leaves it to the dialog). Clan keys are
 * compared case-insensitively against CONFIG.SMT.fusion.elementBorn.
 *
 * @param {string} clanA - first ingredient demon's clan.
 * @param {string} clanB - second ingredient demon's clan.
 * @returns {?string} the Element clan key (e.g. "aeros"), or null if not same-clan.
 */
export function elementClanFor(clanA, clanB) {
  const a = String(clanA ?? "").toLowerCase();
  const b = String(clanB ?? "").toLowerCase();
  if (!a || a !== b) return null;
  return CONFIG.SMT.fusion.elementBorn[a] ?? null;
}

/**
 * Whether a demon name is on the p.80 exception list (cannot be created by normal
 * fusion). Case/whitespace-insensitive.
 *
 * @param {string} name - candidate result demon name.
 * @returns {boolean}
 */
export function isExceptionDemon(name) {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return false;
  return CONFIG.SMT.fusion.exceptionDemons.includes(n);
}

/**
 * Choose which ingredient skills the fused demon inherits (p.80). Rules honoured:
 *  - at most `count` skills are inherited (the p.80 band count);
 *  - the fused demon's TOTAL skills may not exceed CONFIG.SMT.fusion.skillCap,
 *    counting the initial skills it already has (`initialCount`);
 *  - a skill carrying an inheritanceType is only inheritable when the result demon
 *    shares that inheritance trait (`resultInheritance`); typeless skills always
 *    qualify;
 *  - duplicates by name (case-insensitive) are dropped, and a skill already among
 *    the initial skills (`initialNames`) is skipped so it is not added twice.
 * Selection is order-preserving over `candidates` so callers (and tests) get a
 * deterministic result; the dialog feeds candidates in the GM's chosen order.
 *
 * @param {Array<{name:string, inheritanceType?:string}>} candidates - ingredient skills.
 * @param {object} [options]
 * @param {number} [options.count=Infinity]        - max inherited (p.80 band count).
 * @param {string} [options.resultInheritance=""]  - the result demon's inheritance trait.
 * @param {number} [options.initialCount=0]         - skills the result already has.
 * @param {string[]} [options.initialNames=[]]      - names of those initial skills.
 * @returns {Array<{name:string, inheritanceType?:string}>} the skills to inherit.
 */
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

    // Inheritance-type gate (p.80): a typed skill needs a matching result trait.
    const skillTrait = String(skill?.inheritanceType ?? "").trim().toLowerCase();
    if (skillTrait && skillTrait !== trait) continue;

    chosen.push(skill);
    taken.add(key);
    slotsLeft--;
  }
  return chosen;
}

// ═══════════════════════════════════════════════
// Orchestration (document access — GM-gated)
// ═══════════════════════════════════════════════

/**
 * Whether the current user may perform a fusion. Fusion creates a world Actor, so
 * it is GM-only (mirrors the GM gate the chat/effect mutators use for writes that
 * are not scoped to an owned actor).
 * @returns {boolean}
 */
export function canFuse() {
  return game.user.isGM;
}

/**
 * Build the system payload for a fused demon from its ingredients (p.79-82). Pure
 * apart from reading CONFIG; returns plain data (no Actor created). Stats are the
 * per-stat average of the two ingredients (a sensible, deterministic starting
 * point the GM then adjusts per the advancement rules), affinities are inherited
 * from the higher-level ingredient, and EXP is set to the floor for the new level
 * for a demon (p.48 EXP-inheritance: a fused demon sits at "just reached" EXP).
 *
 * @param {SMTActor} demonA - first ingredient demon.
 * @param {SMTActor} demonB - second ingredient demon.
 * @param {object}   [opts]
 * @param {number}   [opts.level]       - override the computed fusion level.
 * @param {string}   [opts.expMultiplier=1.3] - EXP multiplier for the result (demon = 1.3).
 * @returns {object} a `system` object for Actor.create.
 */
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

  // Affinities follow the higher-level ingredient (its thesis dominates); ties go
  // to the first. Read from _source so a transient magatama/effect override on a
  // prepared value never bleeds into the new demon's stored affinities.
  const dominant = (Number(b.level) || 0) > (Number(a.level) || 0) ? demonB : demonA;
  const affinities = foundry.utils.deepClone(dominant._source.system.affinities ?? {});
  const ailmentAffinities = foundry.utils.deepClone(dominant._source.system.ailmentAffinities ?? {});

  return {
    ...stats,
    level: newLevel,
    // p.48: a fused demon's EXP is the amount needed to have just reached its level.
    exp: Math.floor(Math.pow(newLevel, 3) * expMultiplier),
    hp: { value: 9_999_999 }, // clamped to the derived max on first prepare
    mp: { value: 9_999_999 },
    affinities,
    ailmentAffinities
  };
}

/**
 * Perform a normal fusion of two demon actors and create the resulting demon (p.79-82).
 * GM-only. The caller supplies the result demon's name and clan (cross-clan results
 * come from the Normal Fusion Chart, a data lookup outside the engine; same-clan
 * results default to the Element clan from elementClanFor). The new demon is created
 * with the computed level, EXP set for that level, the per-stat average of the two
 * ingredients, the dominant ingredient's affinities, and the inherited skills chosen
 * by the GM (capped + inheritance-type filtered). A summary card is posted. The two
 * ingredients are left intact (fusion yields a card to manifest later, p.79).
 *
 * @param {object}   params
 * @param {SMTActor} params.demonA          - first ingredient demon.
 * @param {SMTActor} params.demonB          - second ingredient demon.
 * @param {string}   params.resultName       - name of the fused demon.
 * @param {string}   [params.resultClan]     - clan key for the result (defaults to the Element clan / first ingredient's clan).
 * @param {string}   [params.resultInheritance=""] - inheritance trait of the result (gates typed skills).
 * @param {Item[]}   [params.inheritSkills]  - GM-selected ingredient skill items to inherit (in priority order).
 * @returns {Promise<SMTActor|null>} the created demon actor, or null if blocked.
 */
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

  // Inherited skills: GM selection if provided, else every ingredient skill in
  // ingredient order. selectInheritedSkills applies the p.80 band count + the
  // 8-skill total cap + the inheritance-type gate; a fused demon starts with no
  // initial skills here (it is a fresh card), so initialCount/Names are empty.
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

/**
 * Post a fusion-result chat card summarising the ingredients, the new demon, its
 * level/clan, and the inherited skills. Flags an exception-demon result (p.80) so
 * the GM knows to bump a rank. GM is the speaker.
 *
 * @param {object} params - see fields below.
 * @returns {Promise<void>}
 */
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

/**
 * Open the GM fusion dialog (p.79): pick two demon actors and a result name, see a
 * live preview of the computed level / Element clan / inheritance count, then fuse.
 * Pre-selects the two selected/targeted demon tokens if exactly two are to hand.
 * GM-only; a non-GM gets a warning. Built with DialogV2 + native DOM (v14 form
 * rules) — no <form> markup of our own, escaped option labels for user-named demons.
 *
 * @returns {Promise<SMTActor|null>} the created demon, or null if cancelled/blocked.
 */
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

  // Pre-fill from the controlled/targeted demon tokens when exactly two are at hand.
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

  // Live preview: recompute level / clan / inheritance from the current selections.
  // `root` is the dialog's rendered element (HTMLElement). Guard against a missing
  // root so a render-callback shape change never throws inside the listener.
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
      // DialogV2 render hook: `dialog` is the application; its `.element` is the
      // rendered root. Fall back to the event target if the shape ever differs.
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
