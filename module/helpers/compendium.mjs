// Demon compendium: load imported stat blocks and build Actors from them.
//
// The data file is NOT shipped. It is produced from a rulebook PDF the user owns by
// `tools/import-rulebook.py`, which writes data-local/demon-stats.json (gitignored).
// Everything here degrades to "unavailable" when that file is absent, so a fresh
// clone works -- it just cannot create demons until the user runs the importer.

const DATA_PATH = "systems/smt-rpg/data-local/demon-stats.json";

// Affinity keywords and the elements they can apply to. `almighty`, `recovery`,
// `support` and `none` exist in the schema but are never named on a stat block.
export const ATTACK_ELEMENTS = ["phys", "fire", "ice", "elec", "force", "mind", "nerve", "ruin", "dark", "light"];
const KEYWORDS = { repel: "repel", null: "null", strong: "strong", weak: "weak", drain: "drain" };
// Book typos, normalised but reported so they never look like clean data.
const TYPOS = { wak: "weak", ailement: "ailment" };
// Wording that cannot be resolved mechanically (two Noah boss forms).
const UNPARSEABLE = /except|chosen|valid|vs\.?\s*almighty/i;

let _cache;          // parsed payload, or null once a load has failed
let _loading;        // in-flight promise, so concurrent callers share one fetch

// Parse a stat-block affinity line (p.126-235). Returns element affinities plus the
// separate Magic and Ailment axes, the normalised typos, and anything it refused to
// guess at. A keyword applies to every element after it until the next keyword; the
// four Zoa bosses instead put the keyword last ("... / Force Weak"), handled below.
//
// Magic and Ailment are NOT element sets -- p.65 stacks them with the element
// affinity (2x Ice * 2x Magic * 2x Ailment * 2x crit * 2x fumble = 32x). The damage
// engine has no Magic axis yet, so they are returned separately rather than folded in.
export function parseAffinityLine(line) {
  const out = { elements: {}, magic: null, ailment: null, typos: [], unparsed: [] };
  const raw = String(line ?? "").trim();
  if (!raw) return out;

  if (UNPARSEABLE.test(raw)) {
    out.unparsed.push(raw);
    return out;
  }

  // Reversed trailing form, used by the four Zoa bosses:
  //   "Repel Elec; Null Light, Dark, Ailment Attacks / Force Weak"
  // The final "/" segment is element-then-keyword and binds ONLY to that segment.
  // The slash is the boundary, so it has to be read before separators are flattened
  // -- without it the preceding "Null" claims Force first and the trailing keyword,
  // which never overwrites, is lost.
  let head = raw;
  let trailing = null;
  const rev = head.match(/\/\s*([A-Za-z][A-Za-z\s]*?)\s+(repel|null|strong|weak|drain|wak)\s*$/i);
  if (rev) {
    head = head.slice(0, rev.index);
    const kw = rev[2].toLowerCase();
    if (TYPOS[kw]) out.typos.push(rev[2]);
    trailing = { value: KEYWORDS[TYPOS[kw] ?? kw], targets: rev[1].trim().toLowerCase().split(/\s+/) };
  }

  const tokens = head
    .replace(/[,;/]/g, " ")
    .replace(/\band\b/gi, " ")
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const assign = (target, value) => {
    // First keyword wins: "Repel Light, ... Strong All" leaves Light on repel.
    if (target === "magic") { out.magic ??= value; return; }
    if (target === "ailment") { out.ailment ??= value; return; }
    if (target === "all") {
      for (const el of ATTACK_ELEMENTS) out.elements[el] ??= value;
      return;
    }
    if (ATTACK_ELEMENTS.includes(target)) out.elements[target] ??= value;
  };

  let current = null;
  for (let tok of tokens) {
    const lower = tok.toLowerCase();
    if (TYPOS[lower]) {
      out.typos.push(tok);
      tok = TYPOS[lower];
    }
    const key = tok.toLowerCase();

    if (KEYWORDS[key]) { current = KEYWORDS[key]; continue; }
    if (key === "attacks") continue;              // "Ailment Attacks"
    const target = key === "all" ? "all" : key;
    const known = target === "all" || target === "magic" || target === "ailment"
      || ATTACK_ELEMENTS.includes(target);
    if (!known) continue;

    if (current) assign(target, current);
  }

  // Applied last, but `assign` is first-wins, so the trailing segment's own elements
  // were never touched by the head -- they only appear after the slash.
  if (trailing) for (const t of trailing.targets) assign(t, trailing.value);
  return out;
}

// Load the imported stat blocks. Returns null (never throws) when the file is absent,
// which is the normal state of a fresh clone.
export async function loadDemonStats() {
  if (_cache !== undefined) return _cache;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      const res = await fetch(DATA_PATH);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const demons = Array.isArray(payload?.demons) ? payload.demons : null;
      if (!demons?.length) throw new Error("no demons in payload");
      _cache = new Map(demons.map(d => [d.name.toLowerCase(), d]));
      console.log(`smt-rpg | demon compendium: ${demons.length} stat blocks loaded`);
    } catch (err) {
      _cache = null;
      console.log(`smt-rpg | demon compendium unavailable (${err.message}). `
        + "Run tools/import-rulebook.py against your own rulebook PDF to enable demon creation.");
    }
    return _cache;
  })();

  return _loading;
}

export function demonStatsAvailable() {
  return _cache instanceof Map && _cache.size > 0;
}

export function demonStatsFor(name) {
  if (!(_cache instanceof Map)) return null;
  const exact = _cache.get(String(name ?? "").trim().toLowerCase());
  if (exact) return exact;
  // Fall back to an accent-folded match, because the book spells the same demon
  // both ways: "Cú Chulainn" in Setanta's evolve chain, "Cu Chulainn" on its own page.
  const key = foldKey(name);
  for (const [k, v] of _cache) {
    if (foldKey(k) === key) return v;
  }
  return null;
}

export function allDemonStats() {
  return _cache instanceof Map ? [..._cache.values()] : [];
}

// Build the actor `system` payload for a stat block. Pure apart from CONFIG reads.
//
// The derived formula ((stat + level) * multiplier) reproduces the book's printed
// HP and MP for 170 of the 171 general demons. Where it does not -- every boss, and
// Scáthach -- the printed value is carried as an explicit max override.
export function buildDemonSystem(stats) {
  const affinity = parseAffinityLine(stats.affinities);
  const system = {
    level: stats.level,
    clan: stats.clan,
    strength: stats.stats.strength,
    magic: stats.stats.magic,
    vitality: stats.stats.vitality,
    agility: stats.stats.agility,
    luck: stats.stats.luck,
    affinities: { ...affinity.elements },
    // Magic and Ailment are category ratings, not elements (p.65). Magic stacks with
    // the element rating on magical attacks; Ailment only moves the effect rate.
    categoryAffinities: {
      magic: affinity.magic ?? "normal",
      ailment: affinity.ailment ?? "normal"
    }
  };

  if (stats.favoredStat) system.favoredStat = stats.favoredStat;
  if (stats.boss) system.isBoss = true;

  // Carry the printed maximum whenever the formula does not reproduce it. `max` is
  // derived, so a bare `hp.value` above the derived ceiling is silently clamped down
  // — which halved Specter and cost Baal Avatar 12,370 HP.
  //
  // Driven by the numbers rather than by `boss`, because it is not purely a boss
  // thing: Scáthach (p.129, LV 64 / Vi 17) prints 498 HP where the formula gives 486.
  // Her MP derives exactly and Lakshmi on the same page derives exactly, so that is
  // an arithmetic slip in the book, not a bad read. §1 clause 1 says match the book
  // and flag what looks wrong, so it is carried and reported, not corrected.
  const hpM = CONFIG.SMT.hpMultipliers[stats.boss ? "npc" : "demon"] ?? CONFIG.SMT.hpMultipliers.demon;
  const mpM = CONFIG.SMT.mpMultipliers[stats.boss ? "npc" : "demon"] ?? CONFIG.SMT.mpMultipliers.demon;
  const derivedHp = (stats.stats.vitality + stats.level) * hpM;
  const derivedMp = (stats.stats.magic + stats.level) * mpM;
  const anomalies = [];
  if (Number.isFinite(stats.hp) && stats.hp !== derivedHp) {
    system.hpMaxOverride = stats.hp;
    if (!stats.boss) anomalies.push(`HP ${stats.hp} (formula gives ${derivedHp})`);
  }
  if (Number.isFinite(stats.mp) && stats.mp !== derivedMp) {
    system.mpMaxOverride = stats.mp;
    if (!stats.boss) anomalies.push(`MP ${stats.mp} (formula gives ${derivedMp})`);
  }
  if (Number.isFinite(stats.hp)) system.hp = { value: stats.hp };
  if (Number.isFinite(stats.mp)) system.mp = { value: stats.mp };
  if (Number.isFinite(stats.fatePoints)) system.fatePoints = { value: stats.fatePoints, max: stats.fatePoints };

  // `drops` is a SchemaField, not a string: what this demon GRANTS on defeat.
  // The printed macca/EXP are rewards, not the demon's own totals, so they belong
  // here rather than at the top level (where they are not declared at all).
  const drops = {};
  if (stats.dropItems && stats.dropItems.toLowerCase() !== "none") drops.normalItems = stats.dropItems;
  if (Number.isFinite(stats.macca)) drops.macca = stats.macca;
  if (Number.isFinite(stats.exp)) drops.exp = stats.exp;
  if (Object.keys(drops).length) system.drops = drops;

  // Behavior is printed as "personality/gender/age" ("Elite/Man/Adult"), with an
  // em-dash for a slot the book leaves blank. 171 of the 194 carry one; the 23 that
  // do not are the bosses.
  const behavior = parseBehavior(stats.behavior);
  if (behavior) system.behavior = behavior;

  // Inherit Traits gate which typed skills this demon can receive in fusion (p.80).
  // "None" is the book's way of printing an empty list, not a trait.
  const traits = String(stats.inheritTraits ?? "").trim();
  if (traits && traits.toLowerCase() !== "none") system.inheritTraits = traits;

  const evolvePath = parseEvolvePath(stats.evolve, stats.name);
  if (evolvePath) system.evolvePath = evolvePath;

  return { system, affinity, anomalies };
}

// Accent-insensitive key. The book is not consistent with itself: Setanta's page
// (p.152) prints the chain as "Setanta (48) > Cú Chulainn" while that demon's own
// header (p.204) reads "Cu Chulainn". Folding accents lets either spelling resolve.
function foldKey(name) {
  return String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// "Setanta (48) > Cú Chulainn" -> what THIS demon evolves into and at what level.
// The book prints the whole chain on every member's page, so the demon's own
// position in it decides the answer: the next link, at the level in its own segment.
// A demon at the end of its chain evolves into nothing and yields null — Jack Frost
// reads "Mini-Frost (4) > Jack Frost", where Mini-Frost is where it CAME from.
export function parseEvolvePath(evolve, ownName) {
  const raw = String(evolve ?? "").trim();
  if (!raw || raw === "-") return null;

  const parts = raw.split(">").map(seg => {
    const m = seg.trim().match(/^(.*?)\s*(?:\((\d+)\))?$/);
    return { name: (m?.[1] ?? "").trim(), level: m?.[2] ? Number(m[2]) : 0 };
  }).filter(p => p.name);

  const self = foldKey(ownName);
  const i = parts.findIndex(p => foldKey(p.name) === self);
  if (i < 0 || i + 1 >= parts.length) return null;

  return { demonName: parts[i + 1].name, level: parts[i].level, partyLevel: 0 };
}

// "Elite/Man/Adult" -> { personality, gender, age }. An em-dash means the book left
// that slot blank, so it becomes an empty string rather than a literal dash.
export function parseBehavior(raw) {
  const parts = String(raw ?? "").split("/").map(p => p.trim());
  if (!parts.some(Boolean)) return null;
  const slot = (i) => {
    const v = parts[i] ?? "";
    return v === "—" || v === "-" ? "" : v;
  };
  const out = { personality: slot(0), gender: slot(1), age: slot(2) };
  return Object.values(out).some(Boolean) ? out : null;
}

// Skill Items for a stat block. "Basic Strike" is the innate attack every actor
// already has, so it is not created as an Item.
export function buildDemonSkills(stats) {
  return (stats.skills ?? [])
    .filter(s => s.name && s.name.toLowerCase() !== "basic strike")
    .map(s => {
      const system = {
        skillType: mapSkillType(s.type),
        element: mapElement(s.element),
        cost: parseCost(s.cost),
        power: Number.isFinite(s.potency) ? s.potency : 0,
        // Free-form on the schema and printed as "1" / "All"; passed through as written.
        targets: String(s.target ?? "1").trim() || "1",
        effectDescription: s.effect ?? "",
        // The Traits column IS the skill's inheritance type (p.80) — the thing a
        // result demon must have a matching trait for. It was being dropped.
        inheritanceType: String(s.traits ?? "").trim()
      };
      if (/^auto-success$/i.test(s.effect ?? "")) system.autoSuccess = true;
      const ailment = parseAilment(s.effect);
      if (ailment) system.ailment = ailment;
      return { name: s.name, type: "skill", system };
    });
}

// Every enum below is resolved against CONFIG rather than restated. The 2026-07-27
// escape was invented values (`magicalAttack` for `magical-attack`), and a literal
// list here would be free to drift out of the schema exactly the same way.
export function mapSkillType(t) {
  const keys = Object.keys(CONFIG.SMT.skillTypes);
  const s = String(t ?? "").toLowerCase().replace(/\s+/g, "-");
  return keys.find(k => k === s)
    ?? keys.find(k => s.includes(k))
    ?? (s.includes("talk") ? keys.find(k => k.startsWith("talk")) : null)
    ?? "support";
}

export function mapElement(e) {
  const keys = Object.keys(CONFIG.SMT.elements);
  const s = String(e ?? "").toLowerCase();
  if (s === "healing") return keys.includes("recovery") ? "recovery" : "none";
  if (s === "unique") return "none";                 // boss-only skills with no element
  return keys.includes(s) ? s : "none";
}

function parseCost(cost) {
  const s = String(cost ?? "").trim();
  const m = s.match(/^(\d+)\s*(HP|MP)$/i);
  if (m) return { value: Number(m[1]), resource: m[2].toLowerCase() };
  // "All HP" (Last Resort) has no numeric cost the schema can hold; recorded as hp/0
  // so the resource is right and the effect text carries the rest.
  if (/all\s*hp/i.test(s)) return { value: 0, resource: "hp" };
  if (!s) return { value: 0, resource: "none" };
  return { value: 0, resource: "mp" };
}

// Effect text like "Panic 30%" or "Restrain 20%" carries an ailment and its rate.
// "Instant Kill 70%" is Death; "HP 1/5" and similar are not ailments.
export function parseAilment(effect) {
  const s = String(effect ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*(\d+)\s*%$/);
  if (!m) return null;
  const label = m[1].trim().toLowerCase();
  const rate = Number(m[2]);
  const keys = Object.keys(CONFIG.SMT.ailments);
  const type = /instant\s*kill/.test(label) ? keys.find(k => k === "death") : keys.find(k => k === label);
  if (!type) return null;
  return { type, rate: Math.min(Math.max(rate, 0), 100) };
}

// Create a demon Actor from an imported stat block. GM-gated, like fusion.
export async function createDemonActor(name, { folder = null, notify = true } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionGM"));
    return null;
  }
  const stats = demonStatsFor(name);
  if (!stats) {
    if (notify) ui.notifications.warn(game.i18n.format("SMT.Compendium.NotFound", { name }));
    return null;
  }

  const { system, affinity, anomalies } = buildDemonSystem(stats);
  const actor = await Actor.create({
    name: stats.name,
    type: "demon",
    system,
    items: buildDemonSkills(stats),
    ...(folder ? { folder } : {})
  });

  // Anything the book stated that this build could not express is said out loud
  // rather than silently dropped.
  const caveats = [];
  if (affinity.unparsed.length) caveats.push(`affinities not applied: "${affinity.unparsed[0]}"`);
  for (const a of anomalies) caveats.push(`book prints ${a} — kept as printed`);
  if (caveats.length && notify) {
    ui.notifications.info(game.i18n.format("SMT.Compendium.Caveats",
      { name: stats.name, caveats: caveats.join("; ") }));
  }
  if (CONFIG.SMT.debug) console.log("smt-rpg | createDemonActor", { name: stats.name, system, caveats });

  return actor;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// GM picker: choose a demon from the imported compendium and create it.
export async function openDemonPicker() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("SMT.Warnings.FusionGM"));
    return null;
  }
  await loadDemonStats();
  const all = allDemonStats();
  if (!all.length) {
    ui.notifications.warn(game.i18n.localize("SMT.Compendium.Unavailable"));
    return null;
  }

  const sorted = [...all].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const options = sorted.map(d => {
    const clan = CONFIG.SMT.demonClans[d.clan]
      ? game.i18n.localize(CONFIG.SMT.demonClans[d.clan])
      : d.clan;
    const boss = d.boss ? ` [${game.i18n.localize("SMT.Boss")}]` : "";
    return `<option value="${esc(d.name)}">Lv ${d.level} — ${esc(d.name)} (${esc(clan)})${boss}</option>`;
  }).join("");

  // The list fills whatever height the window is given, so dragging the frame
  // actually shows more demons rather than just padding the dialog.
  const content = `
    <section class="smt-demon-picker">
      <div class="form-group"><label>${game.i18n.localize("SMT.Compendium.Filter")}</label>
        <input type="text" name="filter" placeholder="${esc(game.i18n.localize("SMT.Compendium.FilterHint"))}" /></div>
      <div class="form-group picker-list"><label>${game.i18n.localize("SMT.Compendium.Demon")}</label>
        <select name="demon" size="12">${options}</select></div>
    </section>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SMT.Compendium.Title"), resizable: true },
    position: { width: 480, height: 560 },
    // Lands on the app root so the stylesheet can make the whole content chain
    // flex — a height on the inner section alone does not resolve against a
    // non-flex ancestor, and the list would keep its fixed `size` height.
    classes: ["smt-demon-picker-dialog"],
    content,
    buttons: [
      {
        action: "create",
        label: game.i18n.localize("SMT.Compendium.Create"),
        default: true,
        callback: (event, button) => ({ name: button.form.elements.demon.value })
      },
      { action: "cancel", label: game.i18n.localize("SMT.Cancel") }
    ],
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target;
      const filter = root?.querySelector("[name=filter]");
      const select = root?.querySelector("[name=demon]");
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
  return createDemonActor(result.name);
}
