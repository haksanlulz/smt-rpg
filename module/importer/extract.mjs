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
//   * transform[5] is the BASELINE y, PyMuPDF's y0 is the glyph-box TOP. The parse
//     only ever compares y values to each other (row bucketing, bands), so a
//     consistent baseline works as well as a consistent top.
//   * The p.42 Magatama table is printed ROTATED; rotated text carries its rotation
//     in transform[1]/[2] and this word shape does not model it. Demons (this slice)
//     are unrotated. The Magatama lane must extend this file before reusing it.

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
  for (const item of content.items) {
    const str = item.str ?? "";
    if (!str.trim()) continue;
    const x = item.transform[4];
    const y = height - item.transform[5];
    const parts = str.split(/\s+/).filter(Boolean);
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
  return { words, splitItems };
}

// Extract every page index in `indices` from a loaded pdf.js document.
// `onProgress(done, total)` fires per page so the caller can keep a bar honest.
export async function extractPages(doc, indices, onProgress = () => {}) {
  const pages = {};
  let splitTotal = 0;
  let done = 0;
  for (const idx of indices) {
    // pdf.js numbers pages from 1; the parse keys by 0-based pdf index.
    const page = await doc.getPage(idx + 1);
    const { words, splitItems } = await pageWords(page);
    pages[idx] = words;
    splitTotal += splitItems;
    done += 1;
    onProgress(done, indices.length);
  }
  return { pages, splitTotal };
}
