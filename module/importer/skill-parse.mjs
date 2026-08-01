// ch4 skill-list parser — the in-Foundry half of tools/import-rulebook.py's
// SkillListImporter, held equal by test/importer-parity.test.mjs. Pure; consumes
// word lists; mirrors the Python line for line including record key order.
//
// Three table shapes and the shape declares the cost resource: spells print an MP
// column, physical skills an HP one, passives neither. The affinity-changer pages
// print TWO tables side by side, so one header row carries the column set twice.
// Records are read from a BAND around each name anchor — a wrapped Effect prints one
// line above the name and one below it, which is what killed the row-at-a-time read.

import { num, clean, titleCase } from "./demon-parse.mjs";

export const SKILL_PAGES = [97, 110];
export const PRINTED_OFFSET = 2;
const DASH = "—";

const SKILL_HEADERS = new Map([
  ["Name|MP|Potency|Element|Effect|Note", "mp"],
  ["Name|HP|Potency|Element|Effect|Note", "hp"],
  ["Name|Effect", null],
]);
const SKILL_COL_TOL = 3.0;
const SKILL_PITCH_GAP = 1.5;

function rowsOf(ws, tol = 3.0) {
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
    .map(([k, v]) => [k, v.sort((a, b) => a[0] - b[0])]);
}

// Column groups on a header row: [[shapeKey, [[x, label], ...]], ...] or [].
function headerGroups(items) {
  const starts = items.map(([, w], i) => (w === "Name" ? i : -1)).filter(i => i >= 0);
  if (!starts.length) return [];
  const groups = [];
  for (let gi = 0; gi < starts.length; gi++) {
    const end = gi + 1 < starts.length ? starts[gi + 1] : items.length;
    const cols = items.slice(starts[gi], end);
    const shape = cols.map(([, w]) => w).join("|");
    if (!SKILL_HEADERS.has(shape)) return [];
    groups.push([shape, cols]);
  }
  return groups;
}

// Split one band's words into this group's columns, by x RANGE. `continue`, not
// `break`, past the limit: words arrive in reading order (y then x), so a word past
// the limit is not the end of the row.
function cellsOf(band, cols, limit) {
  const out = cols.map(() => "");
  const bounds = cols.map(([x]) => x);
  for (const [x, w] of band) {
    if (x >= limit) continue;
    let i = null;
    for (let j = 0; j < bounds.length; j++) {
      if (x >= bounds[j] - SKILL_COL_TOL) i = j;
    }
    if (i === null) i = x >= bounds[0] - 12 ? 0 : null;
    if (i === null) continue;
    out[i] = (out[i] + " " + w).trim();
  }
  return out;
}

// Python str.isupper(): has a cased character and every cased character is upper.
const isUpper = (s) => /[a-zA-Z]/.test(s) && s === s.toUpperCase();

function skillRow(resource, cell, printed) {
  const name = clean(cell[0]);
  if (!name || isUpper(name) || name.endsWith(" Group")) return null;

  if (resource === null) {                    // Name | Effect
    if (name.split(/\s+/).length > 4) return null;
    const effect = clean(cell[1]);
    if (!effect) return null;
    return { name: titleCase(name), kind: "passive", effect, page: printed };
  }

  let cost = clean(cell[1]);
  const element = clean(cell[3]);
  const effect = clean(cell[4]);
  // "All" is a printed cost, not a missing one (Last Resort, Sacrifice, Kamikaze).
  const spendsAll = cost.toLowerCase() === "all";
  if (spendsAll) cost = "0";
  // A dash in the potency column is a real value — the instant-kill and pure-ailment
  // skills deal no damage. Only a truly empty cell means this is not a skill row.
  const rawPotency = (cell[2] ?? "").trim();
  if (num(cost) === null || !rawPotency) return null;
  if (num(rawPotency) === null && rawPotency !== DASH && rawPotency !== "-") return null;
  if (!/^[A-Za-z]+$/.test(element)) return null;

  const row = { name: titleCase(name), kind: "active",
    cost: { value: num(cost), resource },
    potency: num(rawPotency) ?? 0, element, effect, page: printed };
  if (num(rawPotency) === null) row.noDamage = true;
  if (spendsAll) row.spendsAll = true;
  return row;
}

function pageSkills(ws, printed) {
  const rows = rowsOf(ws);
  const headers = [];
  rows.forEach(([y, items], i) => {
    const groups = headerGroups(items);
    if (groups.length) headers.push([i, y, groups]);
  });

  const skills = [];
  const junk = [];
  for (let hi = 0; hi < headers.length; hi++) {
    const [, hy, groups] = headers[hi];
    const stop = hi + 1 < headers.length ? headers[hi + 1][1] : 10_000.0;
    const body = rows.filter(([y]) => hy + 4 < y && y < stop);
    if (!body.length) continue;

    for (let gi = 0; gi < groups.length; gi++) {
      const [shape, cols] = groups[gi];
      const limit = gi + 1 < groups.length ? groups[gi + 1][1][0][0] : 10_000.0;
      const resource = SKILL_HEADERS.get(shape);

      const nameX = cols[0][0];
      const anchors = body
        .filter(([, items]) => items.some(([x]) => Math.abs(x - nameX) <= 12 && x < limit))
        .map(([y]) => y);
      if (!anchors.length) continue;
      const gaps = anchors.slice(1).map((y, i) => y - anchors[i]).sort((a, b) => a - b);
      const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 16.0;

      for (let ai = 0; ai < anchors.length; ai++) {
        const y = anchors[ai];
        const prev = ai > 0 ? anchors[ai - 1] : null;
        const nxt = ai + 1 < anchors.length ? anchors[ai + 1] : null;
        if (prev !== null && y - prev > pitch * SKILL_PITCH_GAP) break;
        const lo = prev !== null ? (prev + y) / 2 : y - pitch * 0.6;
        const hi2 = nxt !== null ? (y + nxt) / 2 : y + pitch * 0.6;
        // Reading order across the band is (y, then x).
        const band = body
          .filter(([by]) => lo <= by && by < hi2)
          .flatMap(([by, items]) => items.map(([x, w]) => [by, x, w]))
          .sort((a, b) => a[0] - b[0] || a[1] - b[1])
          .map(([, x, w]) => [x, w]);
        const cell = cellsOf(band, cols, limit);
        if (!cell[0]) continue;
        const row = skillRow(resource, cell, printed);
        if (row) skills.push(row);
        else junk.push(`p.${printed}: ${cell.filter(Boolean).join(" | ").slice(0, 70)}`);
      }
    }
  }
  return { skills, junk };
}

export function parseSkillList(pages) {
  const skills = [];
  const junk = [];
  for (let printed = SKILL_PAGES[0]; printed <= SKILL_PAGES[1]; printed++) {
    const ws = pages[printed + PRINTED_OFFSET] ?? pages[String(printed + PRINTED_OFFSET)];
    if (!ws) continue;
    const r = pageSkills(ws, printed);
    skills.push(...r.skills);
    junk.push(...r.junk);
  }
  return { skills, junk };
}

// ---------------------------------------------------------------- verification

const TALK_SKILLS_NOT_IMPORTED = new Set(["Jive Talk", "Stone Hunt"]);
const SKILL_NAME_VARIANTS = { agirao: "agilao" };

export function skillKey(name) {
  const k = String(name ?? "").replace(/[\s\-']/g, "").toLowerCase();
  return SKILL_NAME_VARIANTS[k] ?? k;
}

// verify_skills, ported: the ch4 list and the Ch.5 stat blocks are two independent
// printings, and the overlap checks itself. A disagreement is an error only when ch4
// is the odd one out; a lone dissenting stat block is a recorded book slip.
export function verifySkillList(skills, demons, magatama, junk) {
  const errs = [];
  const warns = [];

  const byKey = new Map();
  for (const s of skills) {
    const key = skillKey(s.name);
    if (byKey.has(key)) {
      const prior = byKey.get(key);
      const strip = (o) => JSON.stringify(Object.fromEntries(
        Object.entries(o).filter(([k]) => k !== "page")));
      if (strip(s) !== strip(prior)) {
        errs.push(`${s.name}: key ${JSON.stringify(key)} collides with ${JSON.stringify(prior.name)} `
          + `(p.${prior.page} and p.${s.page}) with different values`);
      }
      continue;
    }
    byKey.set(key, s);
  }

  if (byKey.size < 200) errs.push(`expected at least 200 distinct skills in the ch4 list, got ${byKey.size}`);

  for (const s of skills) {
    if (/^\d+$/.test(s.name) || s.name.includes("Order #")) {
      errs.push(`p.${s.page}: page furniture imported as a skill: ${JSON.stringify(s.name)}`);
    }
    if (s.kind === "active" && !(s.potency >= 0 && s.potency <= 999)) {
      errs.push(`${s.name}: potency ${s.potency} out of range`);
    }
  }

  let checked = 0;
  const votes = new Map();
  const dissent = new Map();
  for (const d of demons) {
    for (const row of d.skills ?? []) {
      const ref = byKey.get(skillKey(row.name));
      if (!ref || ref.kind !== "active") continue;
      const m = /^(\d+)\s*(HP|MP)$/.exec(row.cost ?? "");
      if (!m) continue;
      checked += 1;
      const want = `${m[1]}|${m[2].toLowerCase()}`;
      if (!votes.has(ref.name)) votes.set(ref.name, new Map());
      votes.get(ref.name).set(want, (votes.get(ref.name).get(want) ?? 0) + 1);
      const got = `${ref.cost.value}|${ref.cost.resource}`;
      if (want !== got) {
        if (!dissent.has(ref.name)) dissent.set(ref.name, []);
        dissent.get(ref.name).push([d.name, d.page, row.cost]);
      }
    }
  }

  for (const name of [...dissent.keys()].sort()) {
    const ref = byKey.get(skillKey(name));
    const agree = votes.get(name).get(`${ref.cost.value}|${ref.cost.resource}`) ?? 0;
    const printed = `${ref.cost.value} ${ref.cost.resource.toUpperCase()}`;
    const where = dissent.get(name).slice(0, 3)
      .map(([n, p, c]) => `${n} (p.${p}) prints ${c}`).join(", ");
    if (agree) {
      warns.push(`${name}: ch4 prints ${printed} and ${agree} stat block(s) agree; ${where} - kept as printed`);
    } else {
      errs.push(`${name}: ch4 prints ${printed} and NO stat block agrees; ${where}`);
    }
  }

  if (checked < 500) {
    errs.push(`only ${checked} skill costs could be cross-checked against the `
      + `stat blocks; expected 500+ (the overlap did not resolve)`);
  }

  const wanted = new Set(magatama.flatMap(m => m.skills.map(s => s.name)));
  const inCorpus = new Set(demons.flatMap(d => (d.skills ?? []).map(r => skillKey(r.name))));
  const unknown = [...wanted].filter(n => !byKey.has(skillKey(n)) && !TALK_SKILLS_NOT_IMPORTED.has(n));
  const omitted = unknown.filter(n => inCorpus.has(skillKey(n))).sort();
  const missing = unknown.filter(n => !inCorpus.has(skillKey(n))).sort();
  if (missing.length) {
    errs.push(`${missing.length} Magatama skill(s) found in NO printing: ` + missing.slice(0, 12).join(", "));
  }
  if (omitted.length) {
    warns.push(`${omitted.length} Magatama skill(s) the ch4 list omits but the stat `
      + `blocks print (resolved from the corpus): ` + omitted.join(", "));
  }
  const skippedTalk = [...wanted].filter(n => TALK_SKILLS_NOT_IMPORTED.has(n)).sort();
  if (skippedTalk.length) {
    const recovered = skippedTalk.filter(n => inCorpus.has(skillKey(n)));
    const absent = skippedTalk.filter(n => !inCorpus.has(skillKey(n)));
    warns.push("talk skills are a different table and are NOT imported from ch4: "
      + skippedTalk.join(", ")
      + (recovered.length ? ` (${recovered.join(", ")} still resolves from a stat block)` : "")
      + (absent.length ? ` - NO definition anywhere for ${absent.join(", ")}` : ""));
  }

  for (const j of junk.slice(0, 8)) warns.push(`row skipped as not-a-skill: ${j}`);
  return { errs, warns, distinct: byKey.size, crossChecked: checked };
}
