// Random-encounter group composition (p.291).
// `node test/encounter-builder.test.mjs` (exit 0 pass, 1 fail).
//
// spec: encounter-groups-honour-the-printed-composition-rules
//
// FIRST, WHAT THIS UNIT IS NOT. There is no random-encounter table in this book. p.291
// is GM design advice, and the two other places touching the subject modify a rate that
// is never printed — Full makes encounters "far more likely" (p.55) and a 150-macca item
// doubles "the random encounter rate" (p.108), against no stated base. So nothing rolls
// for WHETHER an encounter happens; kagutsuchi.mjs reports the p.301 trigger and leaves
// the consequence to the GM. This is only about what shows up once they decide.
//
// What p.291 does specify:
//   Group 1 — "a group of IDENTICAL, weak demons"
//   Group 2 — "a mixture of demons ... be sure not to include any healing or debuffing
//              demons and allow for only ONE buff-type demon"
//   Both    — "use a number of demons equal to the PCs"
//
// THE LINE THIS SUITE DEFENDS is between the clauses that are rules and the ones that
// are intentions. Size, the healer/debuffer exclusion and the buffer cap are checkable
// and enforced. "Fun to fight", "roughly 3 rounds", "4-5 rounds" and "just strong enough
// not to be obliterated" are round-count intentions with no formula, and a level band
// invented to hit them would read exactly as authoritative as a printed one — the same
// withheld-number trap as Full's encounter rate. The suite asserts the absence.
//
// "A mixture of weaknesses" sits between: real guidance, no threshold. It is a
// PREFERENCE that reorders picks and never blocks filling the group, because a hard
// distinctness filter returns a short group on a uniform candidate pool — a worse
// failure than a samey encounter, and one the GM cannot see.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { demonRoles, eligibleForMixed, groupSize, buildWeakGroup, buildMixedGroup } =
  await import("../module/helpers/encounter-builder.mjs");

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

const demon = (name, skills = [], weak = []) => ({
  name,
  skills: skills.map(s => (typeof s === "string" ? { name: s } : s)),
  affinities: Object.fromEntries(weak.map(e => [e, "weak"]))
});

const plain = demon("Slime", ["Basic Strike"], ["fire"]);
const healer = demon("Angel", [{ name: "Media", element: "Healing" }], ["dark"]);
const buffer = demon("Pixie", ["Tarukaja"], ["ice"]);
const debuffer = demon("Mou-Ryo", ["Tarunda"], ["light"]);
const fogger = demon("Fog Thing", ["Fog Breath"], ["elec"]);
const crier = demon("Crier", ["War Cry"], ["force"]);

// ---------------------------------------------------------------- role reading

eq(demonRoles(plain), { healer: false, buffer: false, debuffer: false }, "a plain demon has no role");
eq(demonRoles(healer).healer, true, "a Healing-element skill marks a healer");
eq(demonRoles(buffer), { healer: false, buffer: true, debuffer: false }, "Tarukaja is a buffer");
eq(demonRoles(debuffer), { healer: false, buffer: false, debuffer: true }, "Tarunda is a debuffer");
eq(demonRoles(fogger).debuffer, true,
  "ESCAPE: Fog Breath is a DEBUFFER despite not being named -nda — p.96 treats "
  + "differently-named skills sharing an axis as the same effect, and SMT.buffs already "
  + "encodes that, so this must read the registry rather than the suffix");
eq(demonRoles(crier).debuffer, true, "…and so is War Cry");
eq(demonRoles({}), { healer: false, buffer: false, debuffer: false }, "an empty demon has no role");
eq(demonRoles(null), { healer: false, buffer: false, debuffer: false }, "…and neither does none");

// Every sign in the registry is reachable, so neither half of the split is dead.
{
  const signs = new Set(Object.values(SMT.buffs).map(b => b.sign));
  eq([...signs].sort(), [-1, 1], "the buff registry carries both signs");
}

// ------------------------------------------------------------ group size

eq(groupSize(4), 4, "'a number of demons equal to the PCs'");
eq(groupSize(1), 1, "a solo party gets one");
eq(groupSize(0), 1, "a zero party still yields a group rather than nothing");
eq(groupSize(-3), 1, "…and so does nonsense");

// ------------------------------------------------- group 1: identical demons

{
  const g = buildWeakGroup([plain, buffer, healer], { partySize: 4, pick: 0 });
  eq(g.length, 4, "the weak group is party-sized");
  ok(g.every(d => d === g[0]),
    "ESCAPE: 'a group of IDENTICAL, weak demons' — every member is the SAME demon, "
    + "which is the clause a generic 'pick N' would quietly drop");
  eq(g[0].name, "Slime", "pick 0 takes the first candidate");
  eq(buildWeakGroup([plain, buffer], { partySize: 2, pick: 1 })[0].name, "Pixie", "pick 1 the second");
  eq(buildWeakGroup([plain, buffer], { partySize: 2, pick: 5 })[0].name, "Pixie", "the pick wraps");
  eq(buildWeakGroup([plain, buffer], { partySize: 2, pick: -1 })[0].name, "Pixie",
    "a negative pick wraps forward rather than indexing off the list");
  eq(buildWeakGroup([], { partySize: 4 }), [], "no candidates, no group");
  // The weak group is deliberately NOT role-filtered: p.291 puts the healer/debuffer
  // exclusion on the second group only.
  eq(buildWeakGroup([healer], { partySize: 2 }).length, 2,
    "ESCAPE: the weak group may be healers — the exclusion is printed for group TWO "
    + "only, and applying it to both would silently narrow the page");
}

// --------------------------------------------------- group 2: the mixed group

{
  const pool = [plain, healer, buffer, debuffer, fogger, demon("Ogre", ["Basic Strike"], ["ice"])];

  ok(eligibleForMixed(plain), "a plain demon is eligible");
  ok(eligibleForMixed(buffer), "so is a buffer — one is allowed, so eligibility is not the cap");
  ok(!eligibleForMixed(healer), "a healer is not");
  ok(!eligibleForMixed(debuffer), "nor a debuffer");
  ok(!eligibleForMixed(fogger), "…including one named nothing like a debuff");

  const g = buildMixedGroup(pool, { partySize: 4 });
  eq(g.length, 4, "the mixed group is party-sized too");
  ok(!g.some(d => demonRoles(d).healer),
    "ESCAPE: 'be sure not to include any healing ... demons'");
  ok(!g.some(d => demonRoles(d).debuffer),
    "ESCAPE: '... or debuffing demons'");
  eq(g.filter(d => demonRoles(d).buffer).length, 1,
    "ESCAPE: 'allow for only ONE buff-type demon' — the cap is on the GROUP, not on "
    + "eligibility, which is why a second buffer must be refused after the first is in");
}

// The buffer cap has to hold when the pool is nothing BUT buffers.
{
  const buffers = [demon("B1", ["Tarukaja"], ["fire"]), demon("B2", ["Rakukaja"], ["ice"]),
    demon("B3", ["Sukukaja"], ["elec"]), demon("B4", ["Makakaja"], ["force"])];
  const g = buildMixedGroup(buffers, { partySize: 4 });
  eq(g.length, 1,
    "ESCAPE: an all-buffer pool yields ONE demon, not four — the cap wins over the size "
    + "target, because the size clause is 'use a number equal to the PCs' and the buffer "
    + "clause is a prohibition");
  eq(g.filter(d => demonRoles(d).buffer).length, 1, "…and that one is the single buffer");
}

// The mixture preference must never cost the group its size.
{
  const uniform = Array.from({ length: 6 }, (_, i) => demon(`Same${i}`, ["Basic Strike"], ["fire"]));
  const g = buildMixedGroup(uniform, { partySize: 4 });
  eq(g.length, 4,
    "ESCAPE: identical weaknesses across the whole pool still fills the group — the "
    + "'mixture of weaknesses' clause is a PREFERENCE, and a hard filter would return a "
    + "short group the GM cannot see is short");
}

// …but it must actually prefer, when it can.
{
  const varied = [demon("A", [], ["fire"]), demon("B", [], ["fire"]),
    demon("C", [], ["ice"]), demon("D", [], ["elec"])];
  const g = buildMixedGroup(varied, { partySize: 3 });
  const sigs = new Set(g.map(d => Object.keys(d.affinities).join(",")));
  eq(sigs.size, 3, "given the choice, three distinct weaknesses are taken over a duplicate");
}

eq(buildMixedGroup([healer, debuffer], { partySize: 3 }), [],
  "a pool of nothing but excluded demons yields no group rather than a bad one");
eq(buildMixedGroup([], { partySize: 3 }), [], "no candidates, no group");
eq(buildMixedGroup(null, { partySize: 3 }), [], "no pool at all, no group");

// Caller-supplied order is honoured, so the GM's roll drives the pick.
{
  const pool = [demon("X", [], ["fire"]), demon("Y", [], ["ice"]), demon("Z", [], ["elec"])];
  eq(buildMixedGroup(pool, { partySize: 2, order: [2, 1] }).map(d => d.name), ["Z", "Y"],
    "the rolled order decides who shows up");
  eq(buildMixedGroup(pool, { partySize: 2, order: [5, 4] }).map(d => d.name), ["Z", "Y"],
    "…and it wraps rather than indexing off the list");
}

// ------------------------------------- the numbers the book withholds stay withheld

{
  const src = readFileSync(join(ROOT, "module/helpers/encounter-builder.mjs"), "utf8");
  // Bans the WORD, not the phrase. The first version tested for `3 rounds` and stayed
  // green against a planted `TARGET_ROUNDS = 3` — a constant is exactly how a round
  // target would actually arrive, and the phrasing never would. Found by the probe.
  const code = src.replace(/\/\/.*$/gm, "");
  ok(!/round/i.test(code),
    "ESCAPE: no round-count target is encoded anywhere in the source — 'roughly 3 "
    + "rounds' and '4-5 rounds' are intentions with no formula, and a constant built to "
    + "hit them would read exactly as authoritative as a printed rule");
  ok(!/level/i.test(code),
    "…and no level band either: the caller supplies candidates, this decides composition");
  eq(Object.keys(SMT.encounterBuilder), ["maxBuffers"],
    "CONFIG carries ONLY the checkable clause");
}

const cfg = readFileSync(join(ROOT, "module/config.mjs"), "utf8");
ok(/SMT\.encounterBuilder\s*=/.test(cfg), "the buffer cap lives in CONFIG");

console.log(`\nsmt-rpg encounter-builder tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
