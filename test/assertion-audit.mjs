// Audit every source-grep wiring assertion across the suites.
// `node test/assertion-audit.mjs` (exit 0 clean, 1 if anything needs a look).
//
// Many suites end in a "wiring" block that greps a source file to prove two parts are
// connected — the maths is pure and testable, the connection between it and the document
// layer is not. Those greps are constraints, and a constraint that cannot fail is not one
// (workspace Audit Rule 22, the same reasoning behind test/mutation-probe.mjs).
//
// THREE ESCAPES ON 2026-08-15 SHARED ONE SIGNATURE: the pattern matched somewhere OTHER
// than the use it meant to pin — a function's own signature, an identical line in the
// block above, an import destructure left behind when the call was deleted. In each case
// removing the real code left the suite green. **A pattern matching 2+ places in its
// target cannot distinguish which one it is asserting**, and that is detectable without
// running anything.
//
// This does not mutate; it counts. For a positive assertion, 1 match is anchored, 0 means
// it asserts nothing, and 2+ is the signature. For a NEGATED assertion the polarity
// flips — 0 is correct — which is why negation is detected rather than assumed; the first
// run of this reported four working ESCAPE assertions as broken.
//
// Not part of the aggregate run. Like the mutation probe, it is a proof about the rungs,
// run when the rungs change. AMBIGUOUS entries are a prompt to look, not automatically
// defects: an existence check backed by an anchored assertion beside it is fine, and so
// is a "cites the page" grep.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST = join(ROOT, "test");

// `const NAME = readFileSync(join(ROOT, "path"), "utf8");`
const READ = /(?:const|let)\s+(\w+)\s*=\s*readFileSync\(\s*join\(ROOT,\s*"([^"]+)"\s*\)\s*,\s*"utf8"\s*\)/g;

// Assertions over one of those variables. Three shapes appear in the suites.
const USES = [
  // /re/.test(VAR)   and   /re/flags.test(VAR)
  { kind: "regex", re: /\/((?:[^/\\\n]|\\.)+)\/([gimsuy]*)\s*\.test\(\s*(\w+)\s*\)/g, pat: 1, flags: 2, varName: 3 },
  // VAR.includes("literal")
  { kind: "includes", re: /(\w+)\s*\.includes\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g, varName: 1, pat: 2 },
  // VAR.indexOf("literal")
  { kind: "indexOf", re: /(\w+)\s*\.indexOf\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g, varName: 1, pat: 2 },
];

const countMatches = (haystack, needle, isRegex, flags) => {
  if (!isRegex) return haystack.split(needle).length - 1;
  try {
    const re = new RegExp(needle, flags.includes("g") ? flags : flags + "g");
    return (haystack.match(re) ?? []).length;
  } catch { return -1; }
};

const rows = [];

for (const file of readdirSync(TEST).filter(f => f.endsWith(".test.mjs"))) {
  const src = readFileSync(join(TEST, file), "utf8");

  const vars = new Map();
  for (const m of src.matchAll(READ)) vars.set(m[1], m[2]);
  if (!vars.size) continue;

  const targets = new Map();
  for (const [v, rel] of vars) {
    try { targets.set(v, readFileSync(join(ROOT, rel), "utf8")); } catch { /* missing */ }
  }

  for (const shape of USES) {
    for (const m of src.matchAll(shape.re)) {
      const varName = m[shape.varName];
      if (!targets.has(varName)) continue;
      const pattern = m[shape.pat];
      const flags = shape.flags ? (m[shape.flags] ?? "") : "";
      const n = countMatches(targets.get(varName), pattern, shape.kind === "regex", flags);
      const line = src.slice(0, m.index).split("\n").length;

      // A NEGATED assertion wants zero matches — `ok(!/re/.test(src), ...)`. Reporting
      // those as broken buried three correct assertions in the first run and would have
      // sent someone to "fix" a working ESCAPE. Look back for a `!` that is not `!==`.
      const before = src.slice(Math.max(0, m.index - 4), m.index);
      const negated = /![^=]?$/.test(before);

      rows.push({
        file, line, target: vars.get(varName), kind: shape.kind,
        pattern: pattern.length > 62 ? pattern.slice(0, 59) + "..." : pattern,
        n, negated
      });
    }
  }
}

// A negated assertion at 0 is doing its job. A negated assertion at 2+ is fine too —
// it only has to prove absence. So negation flips which counts are interesting.
const broken = rows.filter(r => r.n === 0 && !r.negated);
const ambiguous = rows.filter(r => r.n > 1 && !r.negated);
const deadNegative = rows.filter(r => r.n > 0 && r.negated);
const bad = rows.filter(r => r.n === -1);

const show = (title, list) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length})`);
  console.log("-".repeat(112));
  for (const r of list.sort((a, b) => b.n - a.n)) {
    console.log(`${String(r.n).padStart(3)}x  ${`${r.file}:${r.line}`.padEnd(34)} ${r.target.padEnd(32)} ${r.pattern}`);
  }
};

console.log(`Scanned ${rows.length} source-grep assertions across the suites.`);
console.log(`  anchored (positive, exactly 1 match): ${rows.filter(r => r.n === 1 && !r.negated).length}`);
console.log(`  negated, correctly at 0:              ${rows.filter(r => r.n === 0 && r.negated).length}`);
console.log(`  AMBIGUOUS (positive, 2+ matches):     ${ambiguous.length}`);
console.log(`  BROKEN (positive, 0 matches):         ${broken.length}`);
console.log(`  negated but MATCHING (would be red):  ${deadNegative.length}`);
if (bad.length) console.log(`  unparseable regex:                    ${bad.length}`);

show("BROKEN — matches nothing in its target, so it asserts nothing", broken);
show("AMBIGUOUS — matches 2+ places; deleting the intended one may leave it green", ambiguous);
show("NEGATED BUT MATCHING — the suite would be red; if it is not, the read failed", deadNegative);
show("UNPARSEABLE", bad);

// BROKEN and NEGATED-BUT-MATCHING are defects outright: the first asserts nothing, the
// second means a suite that should be red is not. AMBIGUOUS is a prompt to look, so it
// does not fail the run on its own — the known-benign five as of 2026-08-15 are a page
// citation, two indexOf ordering pairs whose first match is the intended one, and two
// existence checks each backed by an anchored assertion beside it.
if (broken.length || deadNegative.length || bad.length) {
  console.log("\nA source grep that cannot fail is not a constraint.");
  process.exit(1);
}
if (ambiguous.length) console.log("\nAmbiguous entries are a prompt to look, not a failure.");
process.exit(0);
