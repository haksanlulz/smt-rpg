// Demon stat-block parser — the in-Foundry half of tools/import-rulebook.py.
//
// A LINE-FOR-LINE PORT of that script's Importer class, deliberately: the Python
// importer is the reference implementation, proven against the rendered book (4 page
// anchors, per-demon completeness, the §6 escape history), and this port is held equal
// to it by test/importer-parity.test.mjs, which runs BOTH over the same extracted word
// lists and diffs every field of every demon. Change the Python and this file together
// or the parity rung goes red.
//
// Pure: consumes word lists ([x, y, word] triples), touches no document, no DOM, no
// Foundry global. The browser supplies words via importer/extract.mjs (pdf.js); the
// parity suite supplies them from data-local/word-dump.json (PyMuPDF).
//
// Every constant and every quirk comment below mirrors the Python. The quirks are the
// hard-won part — the rotated layouts, the wrapped labels, the ruler precedence — and
// they were each paid for with a real defect.

export const GENERAL_PAGES = [126, 211];
export const BOSS_PAGES = [213, 235];
export const PRINTED_OFFSET = 2;            // pdf index = printed page + 2
const DASH = "—";

const STATS = [["St", "strength"], ["Ma", "magic"], ["Vi", "vitality"],
  ["Ag", "agility"], ["Lu", "luck"]];
const SUBSTATS = [[["Physical", "Power"], "physicalPower"],
  [["Magical", "Power"], "magicalPower"],
  [["Save", "TN"], "saveTN"],
  [["Dodge", "TN"], "dodgeTN"],
  [["Negotiation", "TN"], "negotiationTN"]];
const SKILL_COLS = ["name", "learnLv", "traits", "type", "target", "cost", "tn",
  "potency", "basePower", "total", "element", "effect"];

// Stats/substats sit LEFT for general demons, RIGHT for bosses. Windowed so a stray
// "St" in the flavour column cannot be read as the Strength row.
const STAT_WINDOW = { false: [130.0, 270.0], true: [355.0, 560.0] };

// The book prints Baal Avatar's clan as "DIETY" (p.223). Normalised so lookups
// resolve, with the printed spelling preserved on the entry.
const CLAN_TYPOS = { diety: "deity" };

const ORDINAL = /^(\d+)(ST|ND|RD|TH)$/i;
// The TYPE column has a closed vocabulary; anything else is a misread row.
const TYPE_PREFIX = /^(Physical|Magical|Ranged|Spell|Passive|Talk)(\s|$)/i;

export function titleCase(name) {
  const cap = (w) => {
    const m = ORDINAL.exec(w);
    if (m) return m[1] + m[2].toLowerCase();
    if (/^\d+$/.test(w)) return w;
    if (w.includes("-")) return w.split("-").map(cap).join("-");
    if (w === "O'") return "o'";
    if (w.startsWith("(") || w.endsWith(")") || w.endsWith(",")) {
      const lead = w.startsWith("(") ? "(" : "";
      const trail = [...w.slice(-1)].filter(c => "),".includes(c)).join("");
      return lead + cap(stripPy(w, "(),")) + trail;
    }
    return w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase();
  };
  return name.split(/\s+/).filter(Boolean).map(cap).join(" ");
}

// Python str.strip(chars): remove any of `chars` from both ends.
function stripPy(s, chars) {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

export function num(tok) {
  if (typeof tok !== "string") return null;
  const cleaned = tok.replace(/,/g, "").replace(/%/g, "");
  // Python int(): optional sign, digits only. parseInt is laxer, so guard.
  if (!/^[+-]?\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

export function clean(v) {
  // A dash placeholder means "no value", not the literal character.
  const s = (v ?? "").trim();
  return s === DASH || s === "-" || s === "" ? "" : s;
}

// Re-join two-token values that a column boundary cut in half. See the Python for the
// full story; the joins are unambiguous because "Physical Attack" is one vocabulary
// item and a cost is always "<number> HP|MP".
function repairSplitCells(row) {
  if (row.target.startsWith("Attack") && TYPE_PREFIX.test(row.type + " ")) {
    row.type = `${row.type} Attack`.trim();
    row.target = row.target.slice("Attack".length).trim();
  }
  const unit = /^(HP|MP)\b\s*(.*)$/i.exec(row.tn);
  if (/^\d+$/.test(row.cost) && unit) {
    row.cost = `${row.cost} ${unit[1].toUpperCase()}`;
    row.tn = unit[2].trim();
  }
  // Boost passives print "115 (77)"; the parenthetical spills into the element cell.
  const paren = /^\((\d+)\)\s*(.*)$/.exec(row.element);
  if (paren && /^\d+$/.test(row.total)) {
    row.total = `${row.total} (${paren[1]})`;
    row.element = paren[2].trim();
  }
}

// Row-bucket a word list by y, tolerance 3. Mirrors Importer.rows: first bucket key
// within tolerance wins (insertion order), values sorted by x.
export function rows(ws, tol = 3.0) {
  const buckets = new Map();
  for (const [x, y, w] of ws) {
    let key;
    for (const k of buckets.keys()) {
      if (Math.abs(k - y) <= tol) { key = k; break; }
    }
    if (key === undefined) key = y;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push([x, w]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => [k, v.sort((a, b) => a[0] - b[0] || cmpStr(a[1], b[1]))]);
}

// Python tuple sort compares (x, word) — replicate the string leg for equal x.
function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

// Stat blocks on one page, found by their header row (name + LV/LVL + CLAN).
export function blocks(ws) {
  const heads = [];
  for (const [, y, w] of ws) {
    if (w !== "CLAN") continue;
    const row = ws.filter(([, yy]) => Math.abs(yy - y) <= 8)
      .map(([xx, , ww]) => [xx, ww])
      .sort((a, b) => a[0] - b[0] || cmpStr(a[1], b[1]));
    const toks = row.map(([, t]) => t);
    if (!toks.some(t => t === "LV" || t === "LVL")) continue;
    const li = toks.findIndex(t => t === "LV" || t === "LVL");
    const ci = toks.indexOf("CLAN");
    let lvl = null;
    for (const t of toks.slice(li + 1, ci)) {
      if (/^\d+$/.test(t)) { lvl = parseInt(t, 10); break; }
    }
    if (lvl === null) continue;
    heads.push({ y, name: toks.slice(0, li).join(" ").trim(), level: lvl,
      clan: toks.slice(ci + 1).join(" ").trim() });
  }
  heads.sort((a, b) => a.y - b.y);
  return heads.map((h, i) => {
    const lo = h.y - 4;
    const hi = i + 1 < heads.length ? heads[i + 1].y - 4 : 10_000;
    return [h, ws.filter(([, y]) => lo <= y && y < hi)];
  });
}

// A label's value, gathered within a vertical band to its right. Mirrors
// Importer.label_value including the ALL-CAPS stop condition.
export function labelValue(blockWs, label, { stopX = null, maxTokens = 12, band = 8.0 } = {}) {
  const n = label.length;
  for (const [, items] of rows(blockWs)) {
    const toks = items.map(([, w]) => w);
    for (let i = 0; i + n <= toks.length; i++) {
      let match = true;
      for (let j = 0; j < n; j++) if (toks[i + j] !== label[j]) { match = false; break; }
      if (!match) continue;
      const labelX = items[i + n - 1][0];
      const anchor = blockWs.find(([x, , w]) => x === items[i][0] && w === toks[i]);
      const ly = anchor[1];
      const near = blockWs
        .filter(([x, y]) => Math.abs(y - ly) <= band && x > labelX)
        .map(([x, y, w]) => [y, x, w])
        .sort((a, b) => Math.round(a[0]) - Math.round(b[0]) || a[1] - b[1]);
      const out = [];
      for (const [, x, w] of near) {
        if (stopX !== null && x >= stopX) continue;
        if (/^[A-Z][A-Z?]+$/.test(w) && !["MP", "HP", "TN", "EXP"].includes(w)) break;
        out.push(w);
        if (out.length >= maxTokens) break;
      }
      return out.join(" ").trim();
    }
  }
  return "";
}

export function scalar(blockWs, label) {
  return num(labelValue(blockWs, label, { maxTokens: 1 }));
}

export function skillBody(blockWs) {
  const rws = rows(blockWs);
  let hy = null;
  for (const [y, items] of rws) {
    const set = new Set(items.map(([, w]) => w));
    if (set.has("SKILL") && set.has("NAME")) { hy = y; break; }
  }
  if (hy === null) return null;
  return rws.filter(([y]) => y > hy + 6);
}

// Skill-table column ruler from all-dash placeholder rows: exactly one token per
// column, medianed across the bodies supplied.
export function buildRuler(bodies) {
  const cols = SKILL_COLS.map(() => []);
  for (const body of bodies) {
    if (!body) continue;
    for (const [, items] of body) {
      const xs = items.filter(([, w]) => w === DASH).map(([x]) => x).sort((a, b) => a - b);
      if (xs.length !== SKILL_COLS.length) continue;
      xs.forEach((x, i) => cols[i].push(x));
    }
  }
  if (cols.some(c => c.length === 0)) return null;
  return cols.map(c => c.sort((a, b) => a - b)[Math.floor(c.length / 2)]);
}

export function parseSkills(body, anchors) {
  if (!body || !anchors) return [];
  const skills = [];
  for (const [, items] of body) {
    const cells = Object.fromEntries(SKILL_COLS.map(c => [c, []]));
    for (const [x, w] of items) {
      if (/^\d+\.$/.test(w)) continue;              // the "1." row index
      let ci = 0;
      let best = Infinity;
      anchors.forEach((a, i) => {
        const d = Math.abs(a - x);
        if (d < best) { best = d; ci = i; }
      });
      cells[SKILL_COLS[ci]].push(w);
    }
    const row = Object.fromEntries(SKILL_COLS.map(c => [c, clean(cells[c].join(" "))]));
    if (!row.name) continue;
    // Page furniture sits below the table in the name column alone; a real skill
    // always populates at least one other cell.
    if (!SKILL_COLS.some(k => k !== "name" && row[k])) continue;
    // Wrapped footnotes land across the columns as prose; a real row either names a
    // closed-vocabulary type or carries a NUMERIC learn level.
    if (num(row.learnLv) === null && !TYPE_PREFIX.test(row.type)) continue;
    repairSplitCells(row);
    const boosted = /^(\d+)\s*\((\d+)\)$/.exec(row.total);
    if (boosted) {
      row.total = boosted[1];
      row.totalUnboosted = boosted[2];
    }
    for (const k of ["learnLv", "potency", "basePower", "total", "totalUnboosted"]) {
      if (k in row) row[k] = num(row[k]);
    }
    row.tn = num(row.tn);
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (v !== "" && v !== null) out[k] = v;
    }
    skills.push(out);
  }
  return skills;
}

// "Setanta (48) > Cú Chulainn" -> what THIS demon evolves into, from its own segment.
function ownBlockRuler(blockWs) {
  const body = skillBody(blockWs);
  return buildRuler(body ? [body] : []);
}

export function parseBlock(head, blockWs, isBoss, printed, fallbackAnchors) {
  const anchors = ownBlockRuler(blockWs) ?? fallbackAnchors;
  const [loX, hiX] = STAT_WINDOW[isBoss];
  const rawClan = head.clan.toLowerCase();
  const clan = CLAN_TYPOS[rawClan] ?? rawClan;

  const d = { name: titleCase(head.name), clan, level: head.level };
  if (clan !== rawClan) d.bookClan = head.clan;
  if (!(head.level >= 1 && head.level <= 99)) d.bookLevel = true;
  if (isBoss) d.boss = true;

  d.hp = scalar(blockWs, ["HP"]);
  d.mp = scalar(blockWs, ["MP"]);
  d.physicalResist = scalar(blockWs, ["PHYSICAL", "RESIST"]);
  d.magicResist = scalar(blockWs, ["MAGIC", "RESIST"]);
  d.fatePoints = scalar(blockWs, ["FATE", "POINTS"]);
  d.macca = scalar(blockWs, ["MACCA"]);
  d.exp = scalar(blockWs, ["EXP"]);

  const stats = {};
  const tns = {};
  let favored = null;
  for (const [abbr, key] of STATS) {
    for (const [, items] of rows(blockWs)) {
      const toks = items.map(([, w]) => w);
      const xs = items.map(([x]) => x);
      const i = toks.indexOf(abbr);
      if (i < 0) continue;
      if (!(loX <= xs[i] && xs[i] <= hiX)) continue;
      let rest = items.slice(i + 1);
      if (rest.length && rest[0][1] === "(*)") {
        favored = key;
        rest = rest.slice(1);
      }
      const vals = rest.map(([, w]) => w).filter(w => num(w) !== null);
      if (vals.length >= 2) {
        stats[key] = num(vals[0]);
        tns[key] = num(vals[1]);
      }
      break;
    }
  }
  d.stats = stats;
  d.statTNs = tns;
  if (favored) d.favoredStat = favored;

  d.substats = Object.fromEntries(SUBSTATS.map(([toks, key]) =>
    [key, num(labelValue(blockWs, toks, { stopX: hiX, maxTokens: 1 }))]));

  d.affinities = clean(labelValue(blockWs, ["AFFINITIES"], { maxTokens: 20 }));
  d.inheritTraits = clean(labelValue(blockWs, ["INHERIT", "TRAITS"], { maxTokens: 10 }));
  d.evolve = clean(labelValue(blockWs, ["EVOLVE?"], { stopX: hiX }));
  d.behavior = clean(labelValue(blockWs, ["BEHAVIOR"], { stopX: 425, maxTokens: 6 }));
  d.dropItems = clean(labelValue(blockWs, ["DROP", "ITEMS"], { stopX: 425, maxTokens: 8 }));
  d.skills = parseSkills(skillBody(blockWs), anchors);
  d.page = printed;
  return d;
}

// Run the whole corpus. `pages` maps pdf index (number or numeric string) to a word
// list. Mirrors Importer.run: ruler precedence block -> page -> nearest page -> corpus.
export function parseDemons(pages) {
  const pageWords = new Map();
  for (const [k, v] of Object.entries(pages)) pageWords.set(Number(k), v);

  const collect = (lo, hi) => {
    const out = [];
    for (let p = lo; p <= hi; p++) {
      const ws = pageWords.get(p + PRINTED_OFFSET);
      if (!ws) continue;
      for (const [h, bws] of blocks(ws)) out.push([h, bws, p]);
    }
    return out;
  };

  const gen = collect(GENERAL_PAGES[0], GENERAL_PAGES[1]);
  const boss = collect(BOSS_PAGES[0], BOSS_PAGES[1]);

  const corpusRuler = {
    false: buildRuler(gen.map(([, ws]) => skillBody(ws)).filter(Boolean)),
    true: buildRuler(boss.map(([, ws]) => skillBody(ws)).filter(Boolean)),
  };
  const pageRulers = { false: new Map(), true: new Map() };
  for (const [isBoss, set] of [[false, gen], [true, boss]]) {
    const byPage = new Map();
    for (const [, ws, printed] of set) {
      const body = skillBody(ws);
      if (!body) continue;
      if (!byPage.has(printed)) byPage.set(printed, []);
      byPage.get(printed).push(body);
    }
    for (const [printed, bodies] of byPage) {
      pageRulers[isBoss].set(printed, buildRuler(bodies));
    }
  }
  const rulerFor = (isBoss, printed) => {
    const byPage = pageRulers[isBoss];
    if (byPage.get(printed)) return byPage.get(printed);
    let bestP = null;
    let bestD = Infinity;
    for (const [p, r] of byPage) {
      if (!r) continue;
      const dd = Math.abs(p - printed);
      if (dd < bestD || (dd === bestD && p < bestP)) { bestD = dd; bestP = p; }
    }
    if (bestP !== null) return byPage.get(bestP);
    return corpusRuler[isBoss];
  };

  return [
    ...gen.map(([h, ws, p]) => parseBlock(h, ws, false, p, rulerFor(false, p))),
    ...boss.map(([h, ws, p]) => parseBlock(h, ws, true, p, rulerFor(true, p))),
  ];
}

// Structural verification — the port of verify(). The browser importer refuses to
// write packs unless this returns zero errors, which is the "a failed import writes
// nothing" invariant.
export function verifyDemons(demons) {
  const errs = [];
  const warns = [];
  const gen = demons.filter(d => !d.boss);
  const boss = demons.filter(d => d.boss);

  if (gen.length !== 171) errs.push(`expected 171 general demons, got ${gen.length}`);
  if (boss.length !== 23) errs.push(`expected 23 boss demons, got ${boss.length}`);

  for (const d of demons) {
    const where = `${d.name} (p.${d.page})`;
    if (Object.keys(d.stats).length !== 5) {
      errs.push(`${where}: ${Object.keys(d.stats).length}/5 stats`);
    }
    for (const k of ["hp", "mp", "physicalResist", "magicResist", "fatePoints", "macca", "exp"]) {
      if (d[k] === null || d[k] === undefined) errs.push(`${where}: missing ${k}`);
    }
    if (Object.values(d.substats).some(v => v === null)) {
      errs.push(`${where}: incomplete substats`);
    }
    if (!d.affinities) errs.push(`${where}: no affinities`);
    if (!d.skills.length) errs.push(`${where}: no skills`);
    for (const s of d.skills) {
      const n = s.name ?? "";
      if (/^\d+$/.test(n) || n.includes("Order #") || n.includes("(Order")) {
        errs.push(`${where}: page furniture imported as a skill: ${JSON.stringify(n)}`);
      }
      const t = s.type ?? "";
      if (t && !TYPE_PREFIX.test(t)) {
        errs.push(`${where}: skill ${JSON.stringify(n)} has type ${JSON.stringify(t)}, not a printed type`);
      }
      const c = s.cost ?? "";
      if (c === "HP" || c === "MP") {
        warns.push(`${where}: skill ${JSON.stringify(n)} cost is a bare ${JSON.stringify(c)} (as printed)`);
      } else if (c && !/^(\d+ (HP|MP)|All HP)$/.test(c)) {
        errs.push(`${where}: skill ${JSON.stringify(n)} has cost ${JSON.stringify(c)}, expected '<n> HP|MP'`);
      }
    }
    if (!d.bookLevel && !(d.level >= 1 && d.level <= 99)) {
      errs.push(`${where}: level ${d.level} out of range`);
    }
  }

  // Anchors read off the RENDERED pages, so a systematic extraction error cannot pass.
  const anchors = {
    "Vishnu": { level: 93, clan: "deity", hp: 708, mp: 384, exp: 1044 },
    "Manikin 1": { level: 13, clan: "corpus", hp: 84, mp: 54, exp: 5 },
    "Baal Avatar": { level: 85, clan: "deity", hp: 13000, mp: 5000, exp: 10000 },
    "Specter (3rd Time)": { level: 440, clan: "foul", hp: 700, mp: 500, exp: 1500 },
  };
  const byName = new Map(demons.map(d => [d.name, d]));
  for (const [name, want] of Object.entries(anchors)) {
    const got = byName.get(name);
    if (!got) { errs.push(`anchor missing: ${name}`); continue; }
    for (const [k, v] of Object.entries(want)) {
      if (got[k] !== v) errs.push(`anchor ${name}.${k}: expected ${v}, got ${got[k]}`);
    }
  }
  return { errs, warns };
}
