// Skill compendium: the ch4 skill list (p.97-110), so a skill can be built by NAME
// rather than only as a copy of some demon's row.
//
// Same arrangement as the demon and Magatama compendiums: the data file is not shipped
// and comes from the user's own rulebook PDF via `tools/import-rulebook.py`. Absent, it
// degrades to "unavailable".
//
// TWO SOURCES, deliberately. The ch4 list is the authoritative printing of what a skill
// costs and how hard it hits, but it prints no type, target or TN column. The Ch.5 stat
// blocks print all three, for every skill some demon happens to know. So a skill is
// built from ch4 where ch4 has it and filled in from the corpus where it does not --
// and a name the ch4 list omits entirely (Makajamaon) still resolves, because six demons
// print it.

import { mapSkillType, mapElement, parseAilment } from "./compendium.mjs";
import { allDemonStats } from "./compendium.mjs";

const DATA_PATH = "systems/smt-rpg/data-local/skill-stats.json";

let _cache;
let _loading;
let _corpus;         // name key -> a stat-block skill row, built on first use

// Match key for a skill name. Folds case and spacing, which is the whole of the
// Warcry / "War Cry" difference between the p.42 table and the ch4 list. `agirao` is a
// recorded spelling variant: the book prints Agirao on p.42 and Agilao on p.97.
const NAME_VARIANTS = { agirao: "agilao" };
export function skillKey(name) {
  const k = String(name ?? "").replace(/[\s\-']/g, "").toLowerCase();
  return NAME_VARIANTS[k] ?? k;
}

export async function loadSkillStats() {
  if (_cache !== undefined) return _cache;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      const res = await fetch(DATA_PATH);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const list = Array.isArray(payload?.skills) ? payload.skills : null;
      if (!list?.length) throw new Error("no skills in payload");
      _cache = new Map(list.map(s => [skillKey(s.name), s]));
      console.log(`smt-rpg | skill compendium: ${list.length} skills loaded`);
    } catch (err) {
      _cache = null;
      console.log(`smt-rpg | skill compendium unavailable (${err.message}). `
        + "Run tools/import-rulebook.py against your own rulebook PDF to enable skill creation.");
    }
    return _cache;
  })();

  return _loading;
}

export function skillStatsAvailable() {
  return _cache instanceof Map && _cache.size > 0;
}

// The richest stat-block row printing this skill. Indexed lazily because the demon
// compendium may load after this one.
function corpusRowFor(name) {
  if (!_corpus) {
    _corpus = new Map();
    for (const d of allDemonStats()) {
      for (const row of d.skills ?? []) {
        const key = skillKey(row.name);
        // Prefer a row that fills the columns ch4 lacks.
        const prior = _corpus.get(key);
        if (!prior || (!prior.type && row.type)) _corpus.set(key, row);
      }
    }
  }
  return _corpus.get(skillKey(name)) ?? null;
}

export function resetSkillCorpusIndex() {
  _corpus = null;
}

export function skillStatsFor(name) {
  const key = skillKey(name);
  const listed = _cache instanceof Map ? _cache.get(key) ?? null : null;
  const corpus = corpusRowFor(name);
  return listed || corpus ? { name, listed, corpus } : null;
}

// "Deal Fire damage to all targets." -> "all". The book states the target count only in
// the effect sentence; the stat blocks have a real column, so that wins when present.
export function targetsFrom(effect, corpusTarget) {
  const fromColumn = String(corpusTarget ?? "").trim();
  if (fromColumn) return fromColumn;
  return /\ball (?:targets|enemies|allies)\b/i.test(String(effect ?? "")) ? "All" : "1";
}

// p.96 states the rule this reads off: "Spell Skills ... They cost MP, and use Magic for
// checks", against physical skills which cost HP and check Strength. So where the stat
// blocks print no type, the COST RESOURCE decides it -- that is the book's own division,
// not an inference of ours. Element still overrides for the two non-attacking columns.
export function skillTypeFrom({ listed, corpus }) {
  if (corpus?.type) return mapSkillType(corpus.type);
  if (!listed) return "support";
  if (listed.kind === "passive") return "passive";
  const element = String(listed.element ?? "").toLowerCase();
  if (element === "healing") return "recovery";
  if (element === "support") return listed.effect?.match(/\breduce\b/i) ? "debuff" : "support";
  return listed.cost?.resource === "hp" ? "physical-attack" : "spell";
}

// The ch4 list states an ailment inside a SENTENCE -- "20% chance to inflict Freeze" --
// where the stat-block effect column states it as a bare "Panic 30%". `parseAilment`
// reads the terse column form and cannot see the sentence at all, so a skill built from
// ch4 alone silently lost its ailment. Both forms are tried, terse first.
export function parseAilmentSentence(effect) {
  const m = String(effect ?? "").match(/(\d+)\s*%\s*chance\s+to\s+(?:inflict\s+)?([A-Za-z][A-Za-z ]*)/i);
  if (!m) return null;
  const label = m[2].trim().toLowerCase().replace(/\s+(on|to)\b.*$/, "").trim();
  const keys = Object.keys(CONFIG.SMT.ailments);
  const type = /instant\s*kill/.test(label) ? keys.find(k => k === "death") : keys.find(k => k === label);
  if (!type) return null;
  return { type, rate: Math.min(Math.max(Number(m[1]), 0), 100) };
}

// Build the Item payload for a skill. Pure apart from CONFIG reads.
export function buildSkillSystem(entry) {
  const { listed, corpus } = entry ?? {};
  const effect = listed?.effect || corpus?.effect || "";
  const system = {
    skillType: skillTypeFrom({ listed, corpus }),
    element: listed ? mapElement(listed.element) : mapElement(corpus?.element),
    cost: listed?.kind === "active"
      ? { value: listed.cost.value, resource: listed.cost.resource }
      : listed?.kind === "passive"
        ? { value: 0, resource: "none" }
        : costFromCorpus(corpus),
    power: listed?.kind === "active" ? listed.potency : (corpus?.potency ?? 0),
    targets: targetsFrom(effect, corpus?.target),
    effectDescription: effect,
    inheritanceType: String(corpus?.traits ?? "").trim()
  };
  if (Number.isFinite(corpus?.tn)) {
    system.customTN = true;
    system.tn = corpus.tn;
  }
  if (/^auto-success$/i.test(effect)) system.autoSuccess = true;
  const ailment = parseAilment(corpus?.effect) ?? parseAilmentSentence(effect);
  if (ailment) system.ailment = ailment;
  return system;
}

function costFromCorpus(corpus) {
  const m = String(corpus?.cost ?? "").match(/^(\d+)\s*(HP|MP)$/i);
  if (m) return { value: Number(m[1]), resource: m[2].toLowerCase() };
  return { value: 0, resource: "none" };
}

// Item payloads for a list of skill names. Names with no definition in either printing
// are returned separately rather than created as blanks -- the two talk skills two
// Magatama teach are exactly this, and a blank Item is worse than a stated gap.
export function buildSkillItems(names) {
  const items = [];
  const unknown = [];
  for (const name of names) {
    const entry = skillStatsFor(name);
    if (!entry) { unknown.push(name); continue; }
    items.push({ name, type: "skill", system: buildSkillSystem(entry) });
  }
  return { items, unknown };
}
