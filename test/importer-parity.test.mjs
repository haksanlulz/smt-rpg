// The in-Foundry demon parse against the reference implementation.
// `node test/importer-parity.test.mjs` (exit 0 pass, 1 fail).
//
// spec: browser-parse-matches-the-cli-parse
//
// tools/import-rulebook.py is the reference: proven against the rendered book and
// carrying every layout quirk in §6. module/importer/demon-parse.mjs is its port, and
// THIS suite is what holds the two equal: both consume the exact same word lists
// (data-local/word-dump.json, PyMuPDF's extraction, rounded once at the source), and
// every field of every demon must be identical to data-local/demon-stats.json.
//
// A geometry slip in the port — a window off by a point, a tolerance drifted, a sort
// that broke ties differently — lands here as a named field diff on a named demon, not
// as a wrong actor discovered in play.
//
// The corpus legs skip loudly when the local data is absent (fresh clones have no
// book). The pure legs always run.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const {
  rows, blocks, buildRuler, parseSkills, parseDemons, verifyDemons,
  titleCase, num, clean,
} = await import("../module/importer/demon-parse.mjs");

let passed = 0;
let failed = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; failures.push(`${label}\n    expected ${e}\n    got      ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// ------------------------------------------------------------------ pure legs

// The primitive ports carry Python semantics, not JS defaults.
eq(num("1,044"), 1044, "num strips thousands commas");
eq(num("245%"), 245, "num strips percent");
eq(num("12abc"), null, "num refuses what Python int() refuses (parseInt would take it)");
eq(num("—"), null, "num refuses the dash");
eq(clean("—"), "", "clean maps the em-dash placeholder to empty");
eq(clean(" - "), "", "clean maps the ascii dash placeholder to empty");
eq(titleCase("BLACK FROST"), "Black Frost", "title case");
eq(titleCase("SPECTER (3RD TIME)"), "Specter (3rd Time)", "ordinals and parens survive title case");
eq(titleCase("CU CHULAINN"), "Cu Chulainn", "plain names");

// Row bucketing: first key within tolerance wins, values sort by x.
eq(rows([[10, 100, "b"], [5, 101, "a"], [7, 200, "c"]]),
  [[100, [[5, "a"], [10, "b"]]], [200, [[7, "c"]]]],
  "rows buckets by y tolerance and sorts by x");

// Block detection needs name + LV/LVL + CLAN on one row.
const HEAD = [[50, 10, "PIXIE"], [120, 10, "LV"], [140, 10, "2"], [180, 10, "CLAN"], [220, 10, "FAIRY"]];
eq(blocks(HEAD).length, 1, "a header row yields a block");
eq(blocks(HEAD)[0][0], { y: 10, name: "PIXIE", level: 2, clan: "FAIRY" }, "header fields parse");
eq(blocks([[50, 10, "PIXIE"], [180, 10, "CLAN"], [220, 10, "FAIRY"]]).length, 0,
  "no LV token, no block");

// The all-dash ruler: exactly one token per column, medianed.
const dashRow = [Array.from({ length: 12 }, (_, i) => [i * 10, "—"])];
eq(buildRuler([[[50, dashRow[0]]]]), Array.from({ length: 12 }, (_, i) => i * 10),
  "a full dash row is an exact ruler");
eq(buildRuler([[[50, dashRow[0].slice(0, 11)]]]), null,
  "an 11-token row is not a ruler");

// parseSkills drops page furniture and non-rows, keeps Legion's learn-level-only shape.
const anchors = Array.from({ length: 12 }, (_, i) => i * 40);
eq(parseSkills([[10, [[0, "137"]]]], anchors), [], "a bare page number is not a skill");
eq(parseSkills([[10, [[0, "Anti-Phys"], [40, "24"]]]], anchors),
  [{ name: "Anti-Phys", learnLv: 24 }],
  "a passive with only a learn level survives (Legion, p.194)");

// ------------------------------------------------------------- corpus parity

const WORDS = join(ROOT, "data-local/word-dump.json");
const DEMONS = join(ROOT, "data-local/demon-stats.json");
if (!existsSync(WORDS) || !existsSync(DEMONS)) {
  console.log("  SKIPPED: data-local/word-dump.json or demon-stats.json not present —");
  console.log("  run tools/import-rulebook.py --dump-words against your own PDF.");
  console.log("  The pure legs above ran; the 194-demon parity diff DID NOT.");
  console.log(`\nsmt-rpg importer-parity tests: ${passed} passed, ${failed} failed (parity leg skipped)`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  process.exit(0);
}

const dump = JSON.parse(readFileSync(WORDS, "utf8"));
const reference = JSON.parse(readFileSync(DEMONS, "utf8")).demons;

const ported = parseDemons(dump.pages);

eq(ported.length, reference.length, `port parses ${reference.length} demons`);

// Field-for-field, demon-for-demon. Key by name+page (unique across the corpus).
const key = (d) => `${d.name}|p${d.page}`;
const byKey = new Map(ported.map(d => [key(d), d]));
let identical = 0;
for (const ref of reference) {
  const got = byKey.get(key(ref));
  if (!got) { failed++; failures.push(`missing from port: ${key(ref)}`); continue; }
  // The reference JSON drops null/empty skill cells; the port does the same. Compare
  // the full serialized record so ANY divergence — a field, an order, a type — lands.
  const a = JSON.stringify(got);
  const e = JSON.stringify(ref);
  if (a === e) { passed++; identical++; }
  else {
    failed++;
    // Name the first differing field, not just the demon.
    const diffs = [];
    const keys = new Set([...Object.keys(got), ...Object.keys(ref)]);
    for (const k of keys) {
      if (JSON.stringify(got[k]) !== JSON.stringify(ref[k])) {
        diffs.push(`${k}: port=${JSON.stringify(got[k])?.slice(0, 80)} ref=${JSON.stringify(ref[k])?.slice(0, 80)}`);
      }
    }
    failures.push(`${key(ref)} diverges:\n      ${diffs.join("\n      ")}`);
  }
}
console.log(`  parity: ${identical}/${reference.length} demons byte-identical to the reference`);

// The ported verifier agrees with the Python one on the real corpus: zero errors,
// and exactly the three as-printed Recarmdra warnings.
const { errs, warns } = verifyDemons(ported);
eq(errs, [], "ported verifier: zero errors on the real corpus");
eq(warns.length, 3, "ported verifier: exactly the three as-printed cost warnings");
ok(warns.every(w => w.includes("Recarmdra")), "…and all three are Recarmdra");

console.log(`\nsmt-rpg importer-parity tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 12)) console.log("  - " + f);
  if (failures.length > 12) console.log(`  ... +${failures.length - 12} more`);
  process.exit(1);
}
process.exit(0);
