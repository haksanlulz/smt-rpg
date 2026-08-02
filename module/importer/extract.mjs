// pdf.js → word lists, in the shape demon-parse.mjs consumes: [x, y, word] triples,
// y growing DOWNWARD, rounded to 0.1 — the same shape PyMuPDF's words() produces.
//
// This is the one layer the parity rung does NOT cover. The rung proves the PARSE
// equals the reference over PyMuPDF's words; this file produces words from a different
// engine, and engines tokenize differently. Two mitigations, both honest rather than
// hopeful: multi-word items are split with width-proportional x estimates (logged per
// page), and the whole import is gated on verifyDemons — counts, per-demon
// completeness, and four page anchors — so a systematically wrong extraction refuses
// to write anything rather than writing something plausible.
//
// Coordinate notes, each load-bearing:
//   * pdf.js y origin is BOTTOM-left; the parse expects top-left. Flip against the
//     page's viewBox height.
//   * transform[5] is the BASELINE y, PyMuPDF's y0 is the glyph-box TOP — and the
//     difference is NOT constant: it is the font size. A stat-block label row mixes a
//     6.56pt label with a 7.49pt value on one visual line, so their baselines sit
//     0.4pt apart where their tops align. That 0.4pt was enough: Math.round in the
//     label walk put the row's CAPS labels before its values, and the ALL-CAPS stop
//     rule broke before reaching a single number — every second-block demon lost its
//     HP/MP/resists, while first blocks passed on rounding luck. Unrotated text
//     therefore subtracts the font size (|transform[3]|) to give the TOP, matching
//     PyMuPDF to ~0.3pt.
//   * The p.42 Magatama table is printed ROTATED; rotated text carries its rotation
//     in transform[1]/[2] and is mapped below by swapping the advance axis. It is the
//     extraction's sharpest untested edge and its items are counted for the report.

const round1 = (v) => Math.round(v * 10) / 10;

// Foundry serves its bundled pdf.js build at scripts/pdfjs/ — the PDF journal page
// sheet iframes scripts/pdfjs/web/viewer.html from the same tree. Import the library
// module and point its worker at the sibling file. `getRoute` respects a configured
// route prefix; a bare absolute path would not.
export async function loadPdfjs() {
  const route = foundry.utils.getRoute("scripts/pdfjs/build/pdf.mjs");
  const lib = await import(route);
  lib.GlobalWorkerOptions.workerSrc = foundry.utils.getRoute("scripts/pdfjs/build/pdf.worker.mjs");
  return lib;
}

// Words for one pdf.js page, PyMuPDF-shaped.
export async function pageWords(page) {
  const content = await page.getTextContent();
  const height = page.view[3] - page.view[1];
  const words = [];
  let splitItems = 0;
  let rotatedItems = 0;
  for (const item of content.items) {
    const str = item.str ?? "";
    if (!str.trim()) continue;
    const [a, b, , , e, f] = item.transform;
    const parts = str.split(/\s+/).filter(Boolean);

    // Rotated text (the p.42 Magatama table): the transform's cosine goes to zero and
    // the sine carries the direction. The reading axis becomes VERTICAL in page
    // space, so the advance that splits a horizontal run across x splits a rotated
    // one across y — and x stays fixed, which is exactly what makes each Magatama a
    // column. b < 0 is clockwise (reads top-to-bottom, the p.42 case); b > 0 is
    // counter-clockwise, top-normalized by the run's own advance. Both are
    // approximations of PyMuPDF's glyph boxes and both are counted, because the
    // downstream parse anchors on labels within the SAME extraction — consistency is
    // what matters, not agreement with PyMuPDF's absolute values.
    const rotated = Math.abs(a) < 0.001 && Math.abs(b) > 0.001;
    if (rotated) {
      rotatedItems += 1;
      const x = e;
      const yTop = b < 0 ? height - f : height - f - item.width;
      if (parts.length === 1) {
        words.push([round1(x), round1(yTop), parts[0]]);
        continue;
      }
      splitItems += 1;
      let cursor = 0;
      for (const part of parts) {
        const idx = str.indexOf(part, cursor);
        words.push([round1(x), round1(yTop + item.width * (idx / str.length)), part]);
        cursor = idx + part.length;
      }
      continue;
    }

    const x = e;
    const y = height - f - Math.abs(item.transform[3]);
    if (parts.length === 1) {
      words.push([round1(x), round1(y), parts[0]]);
      continue;
    }
    // A multi-word item: estimate each word's x by its character offset's share of
    // the item's width. Approximate by construction; counted so the report can say
    // how much of the page leaned on estimates.
    splitItems += 1;
    let cursor = 0;
    for (const part of parts) {
      const idx = str.indexOf(part, cursor);
      words.push([round1(x + item.width * (idx / str.length)), round1(y), part]);
      cursor = idx + part.length;
    }
  }
  return { words, splitItems, rotatedItems };
}

// Extract every page index in `indices` from a loaded pdf.js document.
// `onProgress(done, total)` fires per page so the caller can keep a bar honest.
export async function extractPages(doc, indices, onProgress = () => {}) {
  const pages = {};
  let splitTotal = 0;
  let rotatedTotal = 0;
  let done = 0;
  for (const idx of indices) {
    // pdf.js numbers pages from 1; the parse keys by 0-based pdf index.
    const page = await doc.getPage(idx + 1);
    const { words, splitItems, rotatedItems } = await pageWords(page);
    pages[idx] = words;
    splitTotal += splitItems;
    rotatedTotal += rotatedItems;
    done += 1;
    onProgress(done, indices.length);
  }
  return { pages, splitTotal, rotatedTotal };
}
