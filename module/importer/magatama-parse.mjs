// Magatama parser — the in-Foundry half of tools/import-rulebook.py's
// MagatamaImporter, held equal to it by test/importer-parity.test.mjs exactly like
// demon-parse.mjs. Same contract: pure, consumes word lists, mirrors the Python
// line for line including key order, so the parity diff is byte-level.
//
// Two layouts live here and neither is a normal table:
//   * p.42 is printed ROTATED 90 degrees — each Magatama is a COLUMN at a fixed x,
//     each field a horizontal band anchored by its label down the right-hand side,
//     and cells join their words by y, not x.
//   * p.39-41 prose is TWO-COLUMN, reconstructed into reading-order lines by
//     splitting at the measured gutter (x 265) — the same reconstruction the Python
//     now uses, which is what makes the affinity grants parity-provable.

import { num, clean } from "./demon-parse.mjs";

export const MAGATAMA_PAGE = 42;
export const MAGATAMA_PROSE = [39, 41];
export const PRINTED_OFFSET = 2;
const PROSE_COLUMN_SPLIT = 265.0;

const MAGATAMA_FIELDS = new Set(["Name", "St", "Ma", "Vi", "Ag", "Lu", "Acquire",
  "Skill", "LV", "Special"]);
const COLUMN_TOL = 4.0;
const MAGATAMA_STATS = { St: "strength", Ma: "magic", Vi: "vitality", Ag: "agility", Lu: "luck" };

const GRANT_TRIGGER = /\bgrants?\s+(?:you\s+)?|\bhaving\s+a\s+/gi;
const GRANT_KEYWORDS = new Set(["null", "strong", "weak", "drain", "repel"]);
const GRANT_VOCAB = new Set([...GRANT_KEYWORDS,
  "phys", "fire", "ice", "elec", "force", "mind", "nerve", "ruin", "dark", "light",
  "almighty", "magic", "ailment", "attack", "attacks", "and",
  "affinity", "to", "all", "elements", "besides"]);
const HEADING = /^[A-Z][A-Z0-9:'\- ]*$/;

// Python str.strip(".,;:") on a token.
const stripPunct = (s, chars) => {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
};

// The affinity clause inside a prose paragraph, or "" if it states none. Truncates at
// the first word outside the closed vocabulary; must OPEN with an affinity keyword;
// the LONGEST candidate wins so a decoy earlier in the paragraph cannot shadow the
// real clause after it.
export function extractGrant(paragraph) {
  let best = "";
  const text = paragraph ?? "";
  for (const m of text.matchAll(GRANT_TRIGGER)) {
    const toks = [];
    for (const raw of text.slice(m.index + m[0].length).split(/\s+/)) {
      if (!raw) continue;
      const word = stripPunct(raw, ".,;:").toLowerCase();
      if (!GRANT_VOCAB.has(word)) break;
      toks.push(raw.includes(",") ? stripPunct(raw, ".;:") : stripPunct(raw, ".,;:"));
    }
    if (!toks.length || !GRANT_KEYWORDS.has(toks[0].toLowerCase())) continue;
    const candidate = toks.join(" ").trim().replace(/,+$/, "");
    if (candidate.length > best.length) best = candidate;
  }
  return best;
}

// Reading-order lines for a two-column prose page — the Python prose_lines mirror.
export function proseLines(ws) {
  const lines = [];
  for (const inColumn of [(x) => x < PROSE_COLUMN_SPLIT, (x) => x >= PROSE_COLUMN_SPLIT]) {
    const col = ws.filter(([x]) => inColumn(x));
    const buckets = new Map();
    for (const [x, y, w] of col) {
      let key;
      for (const k of buckets.keys()) {
        if (Math.abs(k - y) <= 3.0) { key = k; break; }
      }
      if (key === undefined) key = y;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push([x, w]);
    }
    for (const k of [...buckets.keys()].sort((a, b) => a - b)) {
      lines.push(buckets.get(k).sort((a, b) => a[0] - b[0]).map(([, w]) => w).join(" "));
    }
  }
  return lines;
}

function proseSections(pages) {
  const sections = [];
  let head = null;
  let buf = [];
  for (let p = MAGATAMA_PROSE[0]; p <= MAGATAMA_PROSE[1]; p++) {
    const ws = pages[p + PRINTED_OFFSET] ?? pages[String(p + PRINTED_OFFSET)];
    if (!ws) continue;
    for (const line of proseLines(ws)) {
      const s = line.trim();
      if (s && HEADING.test(s)) {
        if (head !== null) sections.push([head, buf.join(" ")]);
        head = s;
        buf = [];
      } else if (head !== null && s) {
        buf.push(s);
      }
    }
  }
  if (head !== null) sections.push([head, buf.join(" ")]);
  return sections;
}

// (field, lo, hi) for each label in the right-hand column, in printed order.
function bands(ws, labelX) {
  const labels = ws
    .filter(([x]) => Math.abs(x - labelX) <= COLUMN_TOL)
    .map(([, y, w]) => [y, w])
    .sort((a, b) => a[0] - b[0]);
  const fields = labels.filter(([, w]) => MAGATAMA_FIELDS.has(w));
  return fields.map(([y, w], i) => {
    const lo = i === 0 ? 0.0 : y;
    const hi = i + 1 < fields.length ? fields[i + 1][0] : 10_000.0;
    return [w, lo, hi];
  });
}

function cell(ws, lo, hi, colX) {
  return clean(ws
    .filter(([x, y]) => lo <= y && y < hi && Math.abs(x - colX) <= COLUMN_TOL)
    .map(([, y, w]) => [y, w])
    .sort((a, b) => a[0] - b[0])
    .map(([, w]) => w)
    .join(" "));
}

function table(ws) {
  const nameLabel = ws.find(([, , w]) => w === "Name");
  if (!nameLabel) {
    return [[], ["p.42: no 'Name' label found -- the Magatama table did not parse"], []];
  }
  const labelX = nameLabel[0];
  const fieldBands = bands(ws, labelX);
  if (!fieldBands.length || fieldBands[0][0] !== "Name") {
    return [[], ["p.42: the first field band is not 'Name'"], []];
  }

  const [, nameLo, nameHi] = fieldBands[0];
  const cols = new Map();
  for (const [x, y, w] of ws) {
    if (nameLo <= y && y < nameHi && Math.abs(x - labelX) > COLUMN_TOL) {
      if (!cols.has(x)) cols.set(x, []);
      cols.get(x).push([y, w]);
    }
  }
  const columns = new Map([...cols.entries()].map(([x, toks]) =>
    [x, toks.sort((a, b) => a[0] - b[0]).map(([, w]) => w).join(" ")]));

  const entries = [];
  const errs = [];
  for (const colX of [...columns.keys()].sort((a, b) => b - a)) {   // printed right-to-left
    const d = { name: columns.get(colX), page: MAGATAMA_PAGE, skills: [] };
    let pending = null;
    for (const [field, blo, bhi] of fieldBands.slice(1)) {
      const value = cell(ws, blo, bhi, colX);
      if (field === "LV") {
        if (pending && value) {
          const lv = num(value);
          if (lv === null) errs.push(`${d.name}: learn level ${JSON.stringify(value)} is not a number`);
          else d.skills.push({ name: pending, learnLv: lv });
        } else if (value) {
          errs.push(`${d.name}: learn level ${JSON.stringify(value)} with no skill above it`);
        }
        pending = null;
      } else if (field === "Skill" || field === "Special") {
        pending = value || null;
      } else if (field === "Acquire") {
        d.acquisition = value;
      } else if (field in MAGATAMA_STATS) {
        d.statBonuses ??= {};
        d.statBonuses[MAGATAMA_STATS[field]] = num(value);
      }
    }
    entries.push(d);
  }

  // Strays: inside the columns' span means a column failed to register (refuse);
  // outside is page furniture (report as ignored).
  const xs = [...columns.keys()].sort((a, b) => a - b);
  let pitch = 0.0;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (pitch === 0.0 || gap < pitch) pitch = gap;
  }
  const loC = xs[0] - pitch;
  const hiC = xs[xs.length - 1] + pitch;
  const inside = new Set();
  const outside = new Set();
  for (const [x, , w] of ws) {
    if (Math.abs(x - labelX) <= COLUMN_TOL) continue;
    if ([...columns.keys()].some(c => Math.abs(x - c) <= COLUMN_TOL)) continue;
    (loC <= x && x <= hiC ? inside : outside).add(w);
  }
  if (inside.size) {
    errs.push(`p.42: ${inside.size} word(s) inside the table but in no column `
      + `(a Magatama column did not register): ` + [...inside].sort().slice(0, 6).join(", "));
  }
  return [entries, errs, [...outside].sort()];
}

// Run the Magatama import over a pages map (pdf index -> word list).
export function parseMagatama(pages) {
  const p42 = pages[MAGATAMA_PAGE + PRINTED_OFFSET] ?? pages[String(MAGATAMA_PAGE + PRINTED_OFFSET)];
  if (!p42) return { entries: [], errs: ["p.42 words missing from the extraction"], ignored: [] };
  const [entries, errs, ignored] = table(p42);

  const sections = proseSections(pages);
  const byHead = new Map(sections);
  for (const d of entries) {
    let body = byHead.get(d.name.toUpperCase());
    if (body === undefined) {
      // Masakados has no heading of its own; it lives under "LEGENDARY MAGATAMA".
      body = sections.find(([, b]) => b.includes(d.name))?.[1] ?? "";
    }
    d.grant = extractGrant(body);
    d.isStarter = (d.acquisition ?? "").toLowerCase() === "starter";
  }
  return { entries, errs, ignored };
}

// verify_magatama, ported. Same counts, same bounds, same three sample-character
// anchors — in the browser this is half of the refuse-before-write gate.
export function verifyMagatama(entries) {
  const errs = [];
  const warns = [];

  if (entries.length !== 25) errs.push(`expected 25 Magatama (24 + Masakados), got ${entries.length}`);
  const starters = entries.filter(d => d.isStarter);
  if (starters.length !== 8) errs.push(`expected 8 starter Magatama (p.39), got ${starters.length}`);

  for (const d of entries) {
    const where = `${d.name} (p.${d.page})`;
    const bonuses = d.statBonuses ?? {};
    const values = Object.values(bonuses);
    if (values.length !== 5 || values.some(v => v === null)) {
      errs.push(`${where}: ${values.filter(v => v !== null).length}/5 stat bonuses`);
    }
    for (const [k, v] of Object.entries(bonuses)) {
      if (v !== null && !(v >= 0 && v <= 10)) errs.push(`${where}: ${k} bonus ${v} outside 0-10`);
    }
    if (!d.acquisition) errs.push(`${where}: no acquisition`);
    if (!d.skills.length) errs.push(`${where}: no skills`);
    for (const s of d.skills) {
      if (/^\d+$/.test(s.name) || s.name.includes("Order #") || s.name.includes("(Order")) {
        errs.push(`${where}: page furniture imported as a skill: ${JSON.stringify(s.name)}`);
      }
      if (!(s.learnLv >= 1 && s.learnLv <= 99)) {
        errs.push(`${where}: skill ${JSON.stringify(s.name)} learn level ${s.learnLv} out of range`);
      }
    }
    if (!d.grant) warns.push(`${where}: no affinity grant stated (as printed)`);
  }

  const anchors = {
    Marogareh: { strength: 4, magic: 1, vitality: 2, agility: 2, luck: 1, grant: "" },
    Shiranui: { strength: 1, magic: 5, vitality: 0, agility: 4, luck: 0,
      grant: "Null Fire and Force Weak" },
    Ankh: { strength: 1, magic: 2, vitality: 5, agility: 0, luck: 2,
      grant: "Null Light and Dark Weak" },
  };
  const byName = new Map(entries.map(d => [d.name, d]));
  for (const [name, want] of Object.entries(anchors)) {
    const got = byName.get(name);
    if (!got) { errs.push(`anchor missing: ${name}`); continue; }
    for (const [k, v] of Object.entries(want)) {
      const actual = k === "grant" ? got.grant : (got.statBonuses ?? {})[k];
      if (JSON.stringify(actual) !== JSON.stringify(v)) {
        errs.push(`anchor ${name}.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`);
      }
    }
  }
  return { errs, warns };
}
