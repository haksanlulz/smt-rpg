// Magatama compendium: load the imported p.42 table and build Magatama Items from it.
//
// Same arrangement as helpers/compendium.mjs, which does this for demons: the data file
// is NOT shipped. It comes from a rulebook PDF the user owns via
// `tools/import-rulebook.py`, which writes data-local/magatama-stats.json (gitignored).
// Everything here degrades to "unavailable" when that file is absent, so a fresh clone
// works -- it just cannot create Magatama until the user runs the importer.
//
// Kept separate from helpers/magatama.mjs, which holds the pure p.39 loadout rules and
// says so at the top; this half touches documents and the UI.

import { ATTACK_ELEMENTS } from "./compendium.mjs";

const DATA_PATH = "systems/smt-rpg/data-local/magatama-stats.json";

const KEYWORDS = new Set(["null", "strong", "weak", "drain", "repel"]);
// The p.65 attack CATEGORIES, which are not elements. Three Magatama grant one:
// Kamudo "Ailment Attack Weak", Muspell "Strong Ailment Attack", Kamurogi "Magic Weak".
const CATEGORIES = new Set(["magic", "ailment"]);

let _cache;          // parsed payload, or null once a load has failed
let _loading;        // in-flight promise, so concurrent callers share one fetch

// Parse the affinity clause the book states in prose (p.39-41), as captured by the
// importer: "Null Ice and Elec Weak", "Strong Phys and Fire, Ice Weak", "Null Mind".
//
// This is a DIFFERENT grammar from the stat-block affinity line that `parseAffinityLine`
// reads, which is why it is its own function rather than a flag on that one. Two
// differences carry the whole parse:
//   * clauses are joined by "and", not by "/", and
//   * a clause may be keyword-FIRST ("Null Ice") or keyword-LAST ("Elec Weak"), and the
//     book uses both forms in the same sentence.
// Reading "Null Ice and Elec Weak" with the stat-block parser yields Elec `null`, not
// `weak`, because there a keyword runs forward until the next one replaces it.
//
// A clause whose keyword is neither first nor last, or whose target names nothing the
// schema has, is recorded in `unparsed` rather than guessed at.
export function parseMagatamaGrant(text) {
  const out = { elements: {}, categories: {}, unparsed: [] };
  const raw = String(text ?? "").trim().replace(/\s*\.\s*$/, "");
  if (!raw) return out;

  // Masakados (p.41) is the one grant phrased as an exclusion rather than a list:
  // "a Null affinity to all elements besides Almighty". The excluded element is READ,
  // not assumed -- a different exclusion produces a different set rather than this one.
  const excl = raw.match(
    /^(null|strong|weak|drain|repel)\s+affinity\s+to\s+all\s+elements\s+besides\s+([a-z]+)$/i);
  if (excl) {
    const keyword = excl[1].toLowerCase();
    const except = excl[2].toLowerCase();
    for (const el of ATTACK_ELEMENTS) if (el !== except) out.elements[el] = keyword;
    return out;
  }

  const assign = (target, value) => {
    if (CATEGORIES.has(target)) { out.categories[target] ??= value; return true; }
    if (ATTACK_ELEMENTS.includes(target)) { out.elements[target] ??= value; return true; }
    return false;
  };

  for (const clause of raw.split(/\s+and\s+/i)) {
    const trimmed = clause.trim();
    // "Ailment Attack" and "Ailment Attacks" both name the ailment category.
    const toks = trimmed.toLowerCase().split(/[\s,]+/)
      .filter(t => t && t !== "attack" && t !== "attacks");
    if (!toks.length) continue;

    // A keyword at BOTH ends ("Null Dark Weak") reads two ways and the book prints no
    // such clause. Refuse the whole thing rather than apply the half that happens to be
    // checked first: a clause that cannot be read should land nothing, not something.
    const first = KEYWORDS.has(toks[0]);
    const last = toks.length > 1 && KEYWORDS.has(toks.at(-1));

    let keyword = null;
    let targets = [];
    if (first && !last) { keyword = toks[0]; targets = toks.slice(1); }
    else if (last && !first) { keyword = toks.at(-1); targets = toks.slice(0, -1); }

    if (!keyword || !targets.length) { out.unparsed.push(trimmed); continue; }
    for (const t of targets) if (!assign(t, keyword)) out.unparsed.push(`${t} (${trimmed})`);
  }
  return out;
}

// Build the Item `system` payload for one imported entry. Pure.
export function buildMagatamaSystem(entry) {
  const grant = parseMagatamaGrant(entry?.grant);
  const system = {
    statBonuses: { ...(entry?.statBonuses ?? {}) },
    affinities: { ...grant.elements },
    categoryAffinities: { ...grant.categories },
    skillList: (entry?.skills ?? []).map(s => ({ skillName: s.name, learnLevel: s.learnLv })),
    acquisition: entry?.acquisition ?? "",
    isStarter: !!entry?.isStarter
    // `description` is deliberately left unset: it holds prose, and no prose is
    // imported. The p.39-41 paragraphs are read for their affinity clause alone.
  };
  return { system, grant };
}

// Load the imported Magatama. Returns null (never throws) when the file is absent,
// which is the normal state of a fresh clone.
export async function loadMagatamaStats() {
  if (_cache !== undefined) return _cache;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      const res = await fetch(DATA_PATH);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const list = Array.isArray(payload?.magatama) ? payload.magatama : null;
      if (!list?.length) throw new Error("no magatama in payload");
      _cache = new Map(list.map(m => [m.name.toLowerCase(), m]));
      console.log(`smt-rpg | magatama compendium: ${list.length} entries loaded`);
    } catch (err) {
      _cache = null;
      console.log(`smt-rpg | magatama compendium unavailable (${err.message}). `
        + "Run tools/import-rulebook.py against your own rulebook PDF to enable Magatama creation.");
    }
    return _cache;
  })();

  return _loading;
}

export function magatamaStatsAvailable() {
  return _cache instanceof Map && _cache.size > 0;
}

export function magatamaStatsFor(name) {
  if (!(_cache instanceof Map)) return null;
  return _cache.get(String(name ?? "").trim().toLowerCase()) ?? null;
}

export function allMagatamaStats() {
  return _cache instanceof Map ? [..._cache.values()] : [];
}

// Starters first, then by the level of the earliest skill each one teaches. That is the
// only ordering the table implies: a Magatama has no level of its own, and its first
// skill is what says when it becomes usable.
export function sortMagatama(list) {
  const firstLevel = (m) => Math.min(...(m.skills ?? []).map(s => s.learnLv), Infinity);
  return [...list].sort((a, b) =>
    (b.isStarter ? 1 : 0) - (a.isStarter ? 1 : 0)
    || firstLevel(a) - firstLevel(b)
    || a.name.localeCompare(b.name));
}

// Create a Magatama Item from an imported entry. GM-gated, like demon creation.
export async function createMagatamaItem(name, { folder = null, notify = true } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionGM"));
    return null;
  }
  const entry = magatamaStatsFor(name);
  if (!entry) {
    if (notify) ui.notifications.warn(game.i18n.format("SMT.Magatama.NotFound", { name }));
    return null;
  }

  const { system, grant } = buildMagatamaSystem(entry);
  const item = await Item.create({
    name: entry.name,
    type: "magatama",
    system,
    ...(folder ? { folder } : {})
  });

  // Anything the book stated that this build could not express is said out loud rather
  // than silently dropped.
  if (grant.unparsed.length && notify) {
    ui.notifications.info(game.i18n.format("SMT.Magatama.Caveats",
      { name: entry.name, caveats: grant.unparsed.join("; ") }));
  }
  if (CONFIG.SMT.debug) {
    console.log("smt-rpg | createMagatamaItem", { name: entry.name, system, grant });
  }

  return item;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// GM picker: choose a Magatama from the imported table and create it.
export async function openMagatamaPicker() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionGM"));
    return null;
  }
  await loadMagatamaStats();
  const all = allMagatamaStats();
  if (!all.length) {
    ui.notifications.warn(game.i18n.localize("SMT.Magatama.Unavailable"));
    return null;
  }

  const starter = game.i18n.localize("SMT.Magatama.Starter");
  const options = sortMagatama(all).map(m => {
    const tag = m.isStarter ? ` [${starter}]` : "";
    return `<option value="${esc(m.name)}">${esc(m.name)}${tag} — ${esc(m.acquisition)}</option>`;
  }).join("");

  const content = `
    <section class="smt-demon-picker">
      <div class="form-group"><label>${game.i18n.localize("SMT.Compendium.Filter")}</label>
        <input type="text" name="filter" placeholder="${esc(game.i18n.localize("SMT.Magatama.FilterHint"))}" /></div>
      <div class="form-group picker-list"><label>${game.i18n.localize("SMT.Magatama.Label")}</label>
        <select name="magatama" size="12">${options}</select></div>
    </section>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SMT.Magatama.Title"), resizable: true },
    position: { width: 480, height: 560 },
    // Reuses the demon picker's classes: the stylesheet rule they carry is about making
    // the content chain flex so the list grows with the window, not about demons.
    classes: ["smt-demon-picker-dialog"],
    content,
    buttons: [
      {
        action: "create",
        label: game.i18n.localize("SMT.Compendium.Create"),
        default: true,
        callback: (event, button) => ({ name: button.form.elements.magatama.value })
      },
      { action: "cancel", label: game.i18n.localize("SMT.Cancel") }
    ],
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target;
      const filter = root?.querySelector("[name=filter]");
      const select = root?.querySelector("[name=magatama]");
      if (!filter || !select) return;
      const opts = [...select.options].map(o => ({ el: o, text: o.textContent.toLowerCase() }));
      filter.addEventListener("input", () => {
        const q = filter.value.trim().toLowerCase();
        for (const { el, text } of opts) el.hidden = q ? !text.includes(q) : false;
        const first = opts.find(o => !o.el.hidden);
        if (first) select.value = first.el.value;
      });
    }
  }).catch(() => null);

  if (!result || result === "cancel" || !result.name) return null;
  return createMagatamaItem(result.name);
}
