// Affinity-line parsing from the Demon Compendium stat blocks.
// `node test/affinity-parse.test.mjs` (exit 0 pass, 1 fail).
//
// spec: affinity-lines-parse-or-are-flagged
//
// The book writes affinities as prose: "Repel Light, Null Dark, Strong All".
// Grammar observed across all 194 blocks:
//   * keywords  Repel | Null | Strong | Weak | Drain
//   * elements  Phys Fire Ice Elec Force Mind Nerve Ruin Dark Light
//   * groups    All | Magic | Ailment [Attacks]
//   * a keyword applies to every element after it until the next keyword, so
//     "Null Light, Dark, Nerve, and Mind" is four nulls
//   * separators , ; / and the word "and" are interchangeable
//   * the four Zoa bosses use a REVERSED trailing form: "... / Force Weak"
//
// Magic and Ailment are separate axes, not element sets. p.65: a demon "weak to
// Ice, Magic, and Ailments" critically hit by a Mabufu spell that also fumbles its
// dodge takes 32x -- 2(Ice) x 2(Magic) x 2(Ailment) x 2(crit) x 2(fumble). They
// STACK with the element affinity. The engine has no Magic axis yet, so the parser
// reports it separately rather than folding it into an element.

import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const { parseAffinityLine, ATTACK_ELEMENTS } = await import("../module/helpers/compendium.mjs");

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

// Key order is not meaningful here; sort so a comparison cannot fail on ordering alone.
const els = (o) => Object.fromEntries(Object.entries(o)
  .filter(([, v]) => v && v !== "normal").sort(([a], [b]) => a.localeCompare(b)));

// --- the common shapes ----------------------------------------------------
{
  let r = parseAffinityLine("Repel Light, Null Dark, Strong All");
  eq(r.elements.light, "repel", "Vishnu: Repel Light");
  eq(r.elements.dark, "null", "Vishnu: Null Dark");
  eq(r.elements.fire, "strong", "Vishnu: Strong All reaches fire");
  eq(r.elements.phys, "strong", "Vishnu: Strong All reaches phys");
  eq(r.unparsed, [], "Vishnu line fully parsed");

  // A later keyword must not overwrite an element already set by an earlier one.
  eq(r.elements.light, "repel", "Strong All does not overwrite an explicit Repel");
  eq(r.elements.dark, "null", "Strong All does not overwrite an explicit Null");

  r = parseAffinityLine("Null Light/Dark");
  eq(els(r.elements), els({ dark: "null", light: "null" }), "slash joins two elements under one keyword");

  r = parseAffinityLine("Repel Phys, Null Light/Dark, Weak Ice");
  eq(els(r.elements), els({ phys: "repel", ice: "weak", dark: "null", light: "null" }), "Mitra line");

  // A keyword carries across commas until the next keyword.
  r = parseAffinityLine("Null Light, Dark, Nerve, and Mind");
  eq(els(r.elements), els({ mind: "null", nerve: "null", dark: "null", light: "null" }),
    "one keyword carries across a comma list ending in 'and'");
}

// --- Magic and Ailment are their own axes ---------------------------------
{
  let r = parseAffinityLine("Repel Magic, Drain Fire, Weak Ice/Dark");
  eq(r.magic, "repel", "Throne: Magic axis captured");
  eq(els(r.elements), els({ fire: "drain", ice: "weak", dark: "weak" }), "Throne: element axes");
  ok(!("magic" in r.elements), "Magic is never written into the element map");

  r = parseAffinityLine("Null Magic, Weak Ailment");
  eq(r.magic, "null", "Yurlungur: Null Magic");
  eq(r.ailment, "weak", "Yurlungur: Weak Ailment");
  eq(els(r.elements), {}, "no element affinities on that line");

  r = parseAffinityLine("Repel Dark, Null Light and Ailment Attacks, Strong Magic");
  eq(r.ailment, "null", "Mara: 'Ailment Attacks' reads as the ailment axis");
  eq(r.magic, "strong", "Mara: Strong Magic");
  eq(els(r.elements), els({ dark: "repel", light: "null" }), "Mara: elements");
}

// --- the reversed trailing form (the four Zoa bosses) ---------------------
{
  const r = parseAffinityLine("Repel Elec; Null Light, Dark, Ailment Attacks / Force Weak");
  eq(r.elements.elec, "repel", "Urthona: Repel Elec");
  eq(r.elements.light, "null", "Urthona: Null Light");
  eq(r.elements.dark, "null", "Urthona: Null Dark");
  eq(r.ailment, "null", "Urthona: Null Ailment Attacks");
  eq(r.elements.force, "weak", "Urthona: trailing 'Force Weak' is element-then-keyword");
  eq(r.unparsed, [], "reversed trailing form is not treated as unparseable");

  const t = parseAffinityLine("Repel Ice; Null Light, Dark, Ailment Attacks / Fire Weak");
  eq(t.elements.fire, "weak", "Tharmas: trailing Fire Weak");
  eq(t.elements.ice, "repel", "Tharmas: Repel Ice");
}

// --- book typos, normalised but recorded ----------------------------------
{
  let r = parseAffinityLine("Drain Fire, Null Dark, Wak Light/Ruin");
  eq(r.elements.light, "weak", "Chatterskull: 'Wak' reads as Weak (book typo, p.191)");
  eq(r.elements.ruin, "weak", "Chatterskull: 'Wak' applies across the slash");
  ok(r.typos.includes("Wak"), "the typo is recorded, not silently swallowed");

  r = parseAffinityLine("Repel Fire; Null Light, Dark, Ailement Attacks / Ice Weak");
  eq(r.ailment, "null", "Urizen: 'Ailement' reads as Ailment (book typo)");
  ok(r.typos.includes("Ailement"), "Ailement recorded as a typo");
}

// --- genuinely unparseable lines are FLAGGED, never guessed ---------------
{
  const r = parseAffinityLine("Repel All Except Chosen (Strong vs. Almighty)");
  ok(r.unparsed.length > 0, "Noah 1st: special-case wording is flagged");
  eq(els(r.elements), {}, "Noah 1st: nothing is guessed from an unparseable line");

  const s = parseAffinityLine("Repel All Except Valid");
  ok(s.unparsed.length > 0, "Noah 2nd: flagged");
  eq(els(s.elements), {}, "Noah 2nd: nothing guessed");
}

// --- fail-closed ----------------------------------------------------------
{
  eq(els(parseAffinityLine("").elements), {}, "empty line yields no affinities");
  eq(els(parseAffinityLine(null).elements), {}, "null yields no affinities");
  eq(parseAffinityLine("").magic, null, "empty line has no magic axis");
  eq(parseAffinityLine("Strong").elements.fire, undefined, "a bare keyword assigns nothing");
}

// --- every affinity produced is a legal schema value ----------------------
{
  const LEGAL = ["normal", "weak", "strong", "null", "drain", "repel"];
  const lines = [
    "Repel Light, Null Dark, Strong All", "Null Light/Dark, Weak Magic",
    "Repel Magic, Drain Fire, Weak Ice/Dark", "Strong Phys/Magic/Ailment",
    "Null Light, Dark, Nerve, and Mind, Strong Magic",
    "Repel Fire, Ice, Dark; Null Light and Ailment Attacks; Strong Phys"
  ];
  for (const line of lines) {
    const r = parseAffinityLine(line);
    for (const [el, v] of Object.entries(r.elements)) {
      ok(ATTACK_ELEMENTS.includes(el), `${line}: "${el}" is a real element`);
      ok(LEGAL.includes(v), `${line}: "${v}" is a legal affinity value`);
    }
    if (r.magic) ok(LEGAL.includes(r.magic), `${line}: magic value legal`);
    if (r.ailment) ok(LEGAL.includes(r.ailment), `${line}: ailment value legal`);
  }
}

console.log(`\nsmt-rpg affinity-parse tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 20)) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
