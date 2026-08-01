// Gear and item-price-list parser — the in-Foundry half of tools/import-rulebook.py's
// GearItemImporter, held equal by test/importer-parity.test.mjs. Pure; consumes word
// lists; mirrors the Python line for line including record key order.
//
// Two shapes. The ITEM PRICE LIST (p.116-117) is an ordinary horizontal table. The
// GEAR PRICE LIST (p.118) is ROTATED like the p.42 Magatama table with one addition:
// MULTI-LINE cells, whose lines stack RIGHT-TO-LEFT — a cell reads its lines in
// descending x, words within a line in ascending y. Entry windows come from the name
// row's anchor x's, clustered so a wrapped name ("Katana" / "(Masterwork)") is one
// entry, not two. Scalar bands print their values on the label's own row, which also
// keeps the page number and watermark, far below, out of the last band.

import { num, clean } from "./demon-parse.mjs";

export const ITEM_PAGES = [116, 117];
export const GEAR_PAGE = 118;
export const PRINTED_OFFSET = 2;

const GEAR_LABELS = ["Name", "Type", "Buy", "Sell", "Effect", "Gear Power", "Phys Resist"];
const GEAR_SCALAR = new Set(["Buy", "Sell", "Gear Power", "Phys Resist"]);
const GEAR_LABEL_X = 450.0;
const GEAR_KEY = { Name: "name", Type: "type", Buy: "buy", Sell: "sell",
  Effect: "effect", "Gear Power": "gearPower", "Phys Resist": "physResist" };

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

function itemPage(ws, printed) {
  const rows = rowsOf(ws);
  let header = null;
  for (const [y, items] of rows) {
    const toks = items.map(([, w]) => w);
    if (toks[0] === "Name" && toks[1] === "Buy" && toks[2] === "Sell" && toks[3] === "Effect") {
      header = [y, items.slice(0, 4).map(([x]) => x)];
      break;
    }
  }
  if (!header) return [];
  const [hy, xs] = header;
  const bounds = [...xs, 10_000.0];

  const body = rows.filter(([y]) => y > hy + 4);
  const nameX = xs[0];
  const anchors = body
    .filter(([, items]) => items.some(([x]) => Math.abs(x - nameX) <= 12 && x < xs[1]))
    .map(([y]) => y);
  if (!anchors.length) return [];
  const gaps = anchors.slice(1).map((y, i) => y - anchors[i]).sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 16.0;

  // No gap-break, deliberately — a two-line effect makes a legitimate gap near twice
  // the pitch, and nothing below these tables anchors except the watermark, which is
  // refused by content below.
  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const y = anchors[i];
    const prev = i > 0 ? anchors[i - 1] : null;
    const nxt = i + 1 < anchors.length ? anchors[i + 1] : null;
    const lo = prev !== null ? (prev + y) / 2 : y - pitch * 0.6;
    const hi = nxt !== null ? (y + nxt) / 2 : y + pitch * 0.6;
    const band = body
      .filter(([by]) => lo <= by && by < hi)
      .flatMap(([by, items]) => items.map(([x, w]) => [by, x, w]))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cells = ["", "", "", ""];
    for (const [, x, w] of band) {
      let ci = 0;
      for (let j = 0; j < 4; j++) {
        if (x >= bounds[j] - 3.0) ci = j;
      }
      cells[ci] = (cells[ci] + " " + w).trim();
    }
    const name = clean(cells[0]);
    if (!name || (/[a-zA-Z]/.test(name) && name === name.toUpperCase())) continue;
    if (/^\d+$/.test(name) || name.includes("Order #") || name.includes("(Order")) continue;
    out.push({ name, buy: num(cells[1]), sell: num(cells[2]),
      effect: clean(cells[3]), page: printed });
  }
  return out;
}

function gearPage(ws, printed) {
  const labelWs = ws.filter(([x]) => x >= GEAR_LABEL_X);
  const entryWs = ws.filter(([x]) => x < GEAR_LABEL_X);

  const labels = [];
  for (const [y, items] of rowsOf(labelWs)) {
    const text = [...items].sort((a, b) => b[0] - a[0]).map(([, w]) => w).join(" ");
    if (GEAR_LABELS.includes(text)) labels.push([y, text]);
  }
  if (JSON.stringify(labels.map(([, t]) => t)) !== JSON.stringify(GEAR_LABELS)) {
    return [[], [`p.${printed}: gear labels read as ${JSON.stringify(labels.map(([, t]) => t))}`]];
  }

  const nameY = labels[0][0];
  const anchorXs = entryWs.filter(([, y]) => Math.abs(y - nameY) <= 3.0)
    .map(([x]) => x).sort((a, b) => a - b);
  const clusters = [];
  for (const x of anchorXs) {
    if (clusters.length && x - clusters[clusters.length - 1][clusters[clusters.length - 1].length - 1] < 12.0) {
      clusters[clusters.length - 1].push(x);
    } else {
      clusters.push([x]);
    }
  }
  const windows = clusters.map((cl, i) => {
    const lo = i > 0 ? (Math.max(...clusters[i - 1]) + Math.min(...cl)) / 2
      : Math.min(...cl) - (Math.min(...clusters[1]) - Math.max(...cl)) / 2;
    const hi = i + 1 < clusters.length ? (Math.max(...cl) + Math.min(...clusters[i + 1])) / 2
      : Math.max(...cl) + (Math.min(...cl) - Math.max(...clusters[i - 1])) / 2;
    return [lo, hi];
  });

  const cell = (loX, hiX, loY, hiY) => {
    const got = entryWs.filter(([x, y]) => loX <= x && x < hiX && loY <= y && y < hiY);
    const lines = new Map();
    for (const [x, y, w] of got) {
      let key;
      for (const k of lines.keys()) {
        if (Math.abs(k - x) <= 3.0) { key = k; break; }
      }
      if (key === undefined) key = x;
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push([y, w]);
    }
    const out = [];
    for (const k of [...lines.keys()].sort((a, b) => b - a)) {
      out.push(...lines.get(k).sort((a, b) => a[0] - b[0]).map(([, w]) => w));
    }
    return clean(out.join(" "));
  };

  const out = [];
  const errs = [];
  // Printed order: a rotated table reads right-to-left, Knife first.
  for (const [loX, hiX] of [...windows].reverse()) {
    const d = {};
    for (let li = 0; li < labels.length; li++) {
      const [ly, label] = labels[li];
      let value;
      if (GEAR_SCALAR.has(label)) {
        value = cell(loX, hiX, ly - 3.0, ly + 3.0);
      } else {
        const hiY = li + 1 < labels.length ? labels[li + 1][0] - 3.0 : 10_000.0;
        value = cell(loX, hiX, li === 0 ? 0.0 : ly - 3.0, hiY);
      }
      d[GEAR_KEY[label]] = GEAR_SCALAR.has(label) ? num(value) : value;
    }
    d.page = printed;
    out.push(d);
  }
  return [out, errs];
}

export function parseGearItems(pages) {
  const page = (p) => pages[p + PRINTED_OFFSET] ?? pages[String(p + PRINTED_OFFSET)];
  const consumables = [];
  for (let p = ITEM_PAGES[0]; p <= ITEM_PAGES[1]; p++) {
    const ws = page(p);
    if (ws) consumables.push(...itemPage(ws, p));
  }
  const ws = page(GEAR_PAGE);
  const [gear, errs] = ws ? gearPage(ws, GEAR_PAGE) : [[], ["p.118 words missing from the extraction"]];
  return { consumables, gear, errs };
}

// verify_gear_items, ported — the refuse-before-write gate for this corpus.
export function verifyGearItems(consumables, gear, tableErrs) {
  const errs = [...tableErrs];
  const warns = [];

  if (consumables.length !== 48) {
    errs.push(`expected 48 items in the ITEM PRICE LIST, got ${consumables.length}`);
  }
  if (gear.length !== 20) {
    errs.push(`expected 20 entries in the GEAR PRICE LIST, got ${gear.length}`);
  }

  for (const c of consumables) {
    const where = `${c.name} (p.${c.page})`;
    if (!c.effect) errs.push(`${where}: no effect text`);
    if (/^\d+$/.test(c.name) || c.name.includes("Order #")) {
      errs.push(`${where}: page furniture imported as an item`);
    }
    if (c.buy === null && c.sell === null) errs.push(`${where}: neither price parsed`);
  }
  for (const g of gear) {
    const where = `${g.name} (p.${g.page})`;
    if (!g.effect) errs.push(`${where}: no effect text`);
    if (!g.type) errs.push(`${where}: no type`);
  }

  const anchorsC = {
    "Medicine": { buy: 100, sell: 50, effect: "One ally recovers 50 HP." },
    "Spyglass": { sell: 50000 },
    "Bead of Life": { buy: null, sell: 10000 },
  };
  const byC = new Map(consumables.map(c => [c.name, c]));
  for (const [name, want] of Object.entries(anchorsC)) {
    const got = byC.get(name);
    if (!got) { errs.push(`anchor missing: ${name}`); continue; }
    for (const [k, v] of Object.entries(want)) {
      if (JSON.stringify(got[k]) !== JSON.stringify(v)) {
        errs.push(`anchor ${name}.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got[k])}`);
      }
    }
  }
  const anchorsG = {
    "Knife": { type: "Weapon", buy: 20, sell: 10, gearPower: 5, physResist: null },
    "Plate Mail": { type: "Head/Body/Leg Armor", physResist: 12, sell: 5000 },
    "MP5": { type: "Weapon (Firearm)", gearPower: 12 },
    "Katana (Masterwork)": { gearPower: 35, sell: 6000 },
  };
  const byG = new Map(gear.map(g => [g.name, g]));
  for (const [name, want] of Object.entries(anchorsG)) {
    const got = byG.get(name);
    if (!got) { errs.push(`anchor missing: ${name}`); continue; }
    for (const [k, v] of Object.entries(want)) {
      if (JSON.stringify(got[k]) !== JSON.stringify(v)) {
        errs.push(`anchor ${name}.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got[k])}`);
      }
    }
  }
  return { errs, warns };
}
