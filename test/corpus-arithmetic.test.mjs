// Imported stat blocks checked against the book's OWN arithmetic.
// `node test/corpus-arithmetic.test.mjs` (exit 0 pass, 1 fail).
//
// spec: imported-stat-blocks-are-internally-consistent
//
// Every extraction bug so far was found one at a time, by exporting a single actor
// and reading it: the watermark imported as a skill, boss HP clamped, columns
// shifted one place right. That does not scale to 194 blocks x ~40 fields.
//
// The book prints redundant values, so the corpus can check itself. A skill's TOTAL
// is its potency plus its base power; a stat's TN is (stat x 5) + level; the
// substats and resistances all derive from stats and level. A column landing one
// place right breaks these identities immediately — `total != potency + basePower`
// is exactly what the p.161 misalignment produced — so this reads every row at once
// rather than waiting for the next export to surface the next bug.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMT } from "../module/config.mjs";

if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}
globalThis.CONFIG = { SMT };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

const DATA = join(ROOT, "data-local/demon-stats.json");
if (!existsSync(DATA)) {
  console.log("  SKIPPED: data-local/demon-stats.json not present — run tools/import-rulebook.py.");
  console.log("  Nothing was checked. This is not a pass.");
  console.log("\nsmt-rpg corpus-arithmetic tests: 0 passed, 0 failed (skipped)");
  process.exit(0);
}

const demons = JSON.parse(readFileSync(DATA, "utf8")).demons;
ok(demons.length >= 190, `corpus loaded (${demons.length} demons)`);

const TN_PER_STAT = SMT.tnPerStat;
const NEG = SMT.negotiation;

// Book anomalies. Each was checked against the RENDERED page, not the text layer,
// and is left exactly as printed per §1 clause 1 — match the book, flag what looks
// wrong. Recording them here is what lets the identities above stay strict: a new
// mismatch is a new finding rather than noise in a long-tolerated list.
const KNOWN_FIELDS = new Map([
  ["Vishnu:saveTN", "prints Save TN 219% where the Vitality TN is 218%"],
  ["Scáthach:physicalResist", "prints 41; both this and its 498 HP are consistent with Vitality 19, while its printed Vitality, TN and Save TN are all consistent with 17"],
  ["Dís:physicalResist", "physical and magic resist are printed swapped — 18/16 where the stats give 16/18"],
  ["Dís:magicResist", "the other half of the same swap"],
  ["Orthrus:Hell Fang", "total 86 where potency + base power is 88"],
  ["Yaka:Venom Claw", "total 48 where potency + base power is 46"],
  ["Albion:Hades Blast", "total 138 where potency + base power is 139"],
  ["Amaterasu:Basic Strike", "base power 50 where the demon's Physical Power is 75"],
  ["Suparna:Venom Claw", "base power 73 where the demon's Physical Power is 67"],
  ["Yomotsu-Ikusa:Mudoon", "base power 61 where the demon's Magical Power is 59"],
  // Boss resistances: p.123 says boss stat blocks derive their stats FROM their HP
  // and MP, so the formula need not hold. It does for 20 of the 23 anyway, so the
  // check is kept and these three are named rather than exempting every boss.
  ["Futomimi:physicalResist", "boss: prints 50 where the stats give 38"],
  ["Futomimi:magicResist", "boss: prints 55 where the stats give 30"],
  ["Ahriman (2nd Form):magicResist", "boss: prints 59 where the stats give 69"]
]);

// One block is anomalous throughout rather than in a single field.
const KNOWN_BLOCKS = new Map([
  ["Specter (3rd Time)", "prints LVL 440 (p.218). Every derived value on the block — all five stat TNs, Physical Power, Magical Power, Save TN and both resistances — is consistent with level 40, so 440 is a typo with a missing decimal. Kept as printed; the evidence is recorded rather than the correction applied."]
]);

const report = { statTN: [], substat: [], resist: [], skillTotal: [], basePower: [], anomalies: [], blockAnomalies: [] };

for (const d of demons) {
  const lvl = d.level;
  const s = d.stats;
  const where = `${d.name} (p.${d.page})`;

  if (KNOWN_BLOCKS.has(d.name)) {
    report.blockAnomalies.push(`${where}: ${KNOWN_BLOCKS.get(d.name)}`);
    continue;
  }
  const known = (field) => {
    const tag = `${d.name}:${field}`;
    if (!KNOWN_FIELDS.has(tag)) return false;
    report.anomalies.push(`${where}: ${KNOWN_FIELDS.get(tag)}`);
    return true;
  };

  // Stat TNs: (stat x 5) + level (p.35).
  for (const [key, val] of Object.entries(s)) {
    const want = val * TN_PER_STAT + lvl;
    const got = d.statTNs[key];
    if (got !== want) report.statTN.push(`${where}: ${key} TN ${got} != ${want} (${val}x${TN_PER_STAT}+${lvl})`);
  }

  // Substats (p.36): base power is stat + level; Save TN mirrors the Vitality TN;
  // Dodge is agility + 10; Negotiation is luck x 2 + 20.
  const sub = d.substats;
  const expect = {
    physicalPower: s.strength + lvl,
    magicalPower: s.magic + lvl,
    saveTN: s.vitality * TN_PER_STAT + lvl,
    dodgeTN: s.agility + 10,
    negotiationTN: s.luck * NEG.multiplier + NEG.bonus
  };
  for (const [key, want] of Object.entries(expect)) {
    if (sub[key] === want || known(key)) continue;
    report.substat.push(`${where}: ${key} ${sub[key]} != ${want}`);
  }

  // Resistances: (vitality|magic + level) / 2, floored (p.36).
  const wantPhys = Math.floor((s.vitality + lvl) / 2);
  const wantMag = Math.floor((s.magic + lvl) / 2);
  if (d.physicalResist !== wantPhys && !known("physicalResist")) {
    report.resist.push(`${where}: physicalResist ${d.physicalResist} != ${wantPhys}`);
  }
  if (d.magicResist !== wantMag && !known("magicResist")) {
    report.resist.push(`${where}: magicResist ${d.magicResist} != ${wantMag}`);
  }

  // A skill's TOTAL is potency + base power. Only checked where the book prints
  // all three; many rows legitimately print none of them.
  for (const sk of d.skills) {
    const { potency: p, basePower: b } = sk;
    // A Boost passive makes the book print "115 (77)": the boosted total, then the
    // unboosted one. It is the unboosted value that equals potency + base power.
    const t = Number.isFinite(sk.totalUnboosted) ? sk.totalUnboosted : sk.total;
    if ([p, b, t].some(v => !Number.isFinite(v))) continue;
    if (p + b !== t && !known(sk.name)) report.skillTotal.push(`${where}: ${sk.name} total ${t} != ${p}+${b}`);
  }

  // A skill's BASE POWER is the demon's own Physical or Magical Power (p.36); the
  // potency on top is the skill's own contribution. This caught three slips the
  // total identity did not, so the two are independent checks, not one restated.
  for (const sk of d.skills) {
    if (!Number.isFinite(sk.basePower)) continue;
    const t = sk.type ?? "";
    const want = /Physical/.test(t) ? sub.physicalPower
      : (/Magical|Spell/.test(t) ? sub.magicalPower : null);
    if (want === null || sk.basePower === want) continue;
    if (known(sk.name)) continue;
    report.basePower.push(`${where}: ${sk.name} base power ${sk.basePower} != ${want}`);
  }
}

// Each identity is asserted separately so a failure names which one broke.
eq(report.statTN.slice(0, 5), [], `stat TNs are (stat x ${TN_PER_STAT}) + level (${report.statTN.length} off)`);
eq(report.substat.slice(0, 5), [], `substats derive from stats and level (${report.substat.length} off)`);
eq(report.resist.slice(0, 5), [], `resistances are (stat + level) / 2 (${report.resist.length} off)`);
eq(report.skillTotal.slice(0, 5), [], `skill total == potency + base power (${report.skillTotal.length} off)`);
eq(report.basePower.slice(0, 5), [], `skill base power == the demon's matching power substat (${report.basePower.length} off)`);

// The identities have to actually be exercised: a corpus that printed none of these
// would pass every assertion above while checking nothing.
let tnChecked = 0, totalChecked = 0;
for (const d of demons) {
  tnChecked += Object.keys(d.statTNs).length;
  for (const sk of d.skills) {
    if ([sk.potency, sk.basePower, sk.total].every(v => Number.isFinite(v))) totalChecked++;
  }
}
ok(tnChecked >= 900, `stat TNs actually compared (${tnChecked} >= 900)`);
ok(totalChecked >= 300, `skill totals actually compared (${totalChecked} >= 300)`);

// Known anomalies must still BE anomalies. If the book is ever re-read or the
// importer changes, a "known" entry that no longer fires is stale and misleading.
// A "known" entry that stops firing is stale and quietly widens what passes.
eq(report.anomalies.length, KNOWN_FIELDS.size,
  `every recorded field anomaly still occurs (${report.anomalies.length} of ${KNOWN_FIELDS.size})`);
eq(report.blockAnomalies.length, KNOWN_BLOCKS.size,
  `every recorded block anomaly still occurs (${report.blockAnomalies.length} of ${KNOWN_BLOCKS.size})`);
for (const a of [...report.blockAnomalies, ...report.anomalies]) {
  console.log(`  book anomaly, kept as printed: ${a}`);
}

console.log(`\nsmt-rpg corpus-arithmetic tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
