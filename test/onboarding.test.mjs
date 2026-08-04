// First-launch signposting for the no-PDF path.
// `node test/onboarding.test.mjs` (exit 0 pass, 1 fail).
//
// spec: a-fresh-world-signposts-the-importer
//
// The system ships raw rules only — a deliberate non-goal, not an omission. But it
// means a stranger who installs this sees an empty sidebar with no way to know the
// importer exists, which is premortem #8's bounce. The decisions under test:
//
//   * the four packs exist from the first launch, so the sidebar is named rather
//     than blank, and the pack set is declared in ONE place;
//   * the prompt fires only for a GM, only once, and only when nothing is imported —
//     a world that already has content is never nagged;
//   * a re-import over EMPTY packs does not ask "replace?", while a re-import over
//     real data always does.
//
// The last one is the sharp edge: creating the packs empty at launch would otherwise
// make every first-time import open with a destructive-sounding dialog about nothing.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { PACK_DEFS, SETTING_ONBOARDED, packId, packsToCreate, packsWithContent, needsOnboarding } =
  await import("../module/helpers/onboarding.mjs");

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

const ALL = PACK_DEFS.map(d => packId(d.name));

// ---------------------------------------------------------------- pack set

eq(PACK_DEFS.length, 4, "four packs are declared");
eq(PACK_DEFS.map(d => d.name),
  ["smt-demons", "smt-magatama", "smt-skills", "smt-gear"], "…in write order");
ok(PACK_DEFS.every(d => d.type === "Actor" || d.type === "Item"),
  "every pack declares a real document type");
ok(PACK_DEFS.every(d => d.labelKey.startsWith("SMT.")),
  "every pack label is an i18n key, never a literal");
eq(new Set(PACK_DEFS.map(d => d.name)).size, 4, "pack names are unique");

eq(packsToCreate([]).map(d => d.name),
  ["smt-demons", "smt-magatama", "smt-skills", "smt-gear"],
  "a fresh world creates all four");
eq(packsToCreate(ALL), [], "a world that has them creates none");
eq(packsToCreate([packId("smt-demons"), packId("smt-skills")]).map(d => d.name),
  ["smt-magatama", "smt-gear"], "a partial world creates only what is missing");
eq(packsToCreate(["world.something-else"]).map(d => d.name).length, 4,
  "an unrelated world pack is not mistaken for ours");

// ------------------------------------------------------------ empty vs real

eq(packsWithContent([]), [], "no packs, no content");
eq(packsWithContent([{ collection: "a", count: 0 }, { collection: "b", count: 0 }]), [],
  "ESCAPE: freshly-created empty packs count as no content — a first import must not "
  + "open with a replace-everything dialog about nothing");
eq(packsWithContent([{ collection: "a", count: 0 }, { collection: "b", count: 194 }]),
  [{ collection: "b", count: 194 }],
  "ESCAPE: a pack holding real data always counts — a re-import over it still asks");
eq(packsWithContent([{ collection: "a" }]), [], "a missing count is not content");

// ------------------------------------------------------------- the prompt

const empty = ALL.map(c => ({ collection: c, count: 0 }));
const full = ALL.map(c => ({ collection: c, count: 194 }));

ok(needsOnboarding({ isGM: true, dismissed: false, packs: empty }),
  "a GM in a fresh world is prompted");
ok(needsOnboarding({ isGM: true, dismissed: false, packs: [] }),
  "…and so is a GM in a world with no packs at all");
ok(!needsOnboarding({ isGM: false, dismissed: false, packs: empty }),
  "ESCAPE: a player is never prompted — they cannot run the importer");
ok(!needsOnboarding({ isGM: true, dismissed: true, packs: empty }),
  "ESCAPE: told once is told — a dismissed prompt never returns");
ok(!needsOnboarding({ isGM: true, dismissed: false, packs: full }),
  "ESCAPE: a world that already has data is never nagged");
ok(!needsOnboarding({ isGM: true, dismissed: false,
  packs: [...empty.slice(1), { collection: ALL[0], count: 1 }] }),
"…and one populated pack among four is enough to count as imported");
ok(!needsOnboarding({}), "no arguments prompts nobody");

// ------------------------------------------- wiring (source-level, always runs)

const entry = readFileSync(join(ROOT, "smt-rpg.mjs"), "utf8");
const importer = readFileSync(join(ROOT, "module/importer/app.mjs"), "utf8");

ok(entry.includes(`game.settings.register("smt-rpg", SETTING_ONBOARDED`),
  "the dismissal flag is registered as a real setting");
ok(/SETTING_ONBOARDED,\s*\{[^}]*config:\s*false/s.test(entry),
  "…and hidden from the settings UI — it is bookkeeping, not a preference");
ok(entry.includes("ensureWorldPacks()"), "the packs are created on ready");
ok(entry.includes("needsOnboarding("), "the prompt is gated by the pure predicate");
ok(entry.includes('Hooks.on("renderCompendium"'), "opening a pack is hooked");

// The pack list must exist in exactly ONE place: the importer consumes it rather than
// declaring its own, or a pack could be created at launch and never written to.
ok(importer.includes('from "../helpers/onboarding.mjs"'),
  "the importer imports the pack declarations");
ok(!/const PACKS\s*=\s*\[/.test(importer),
  "ESCAPE: the importer declares no second pack list");
ok(importer.includes("packsWithContent("),
  "the importer's replace-confirm uses the shared empty-vs-real predicate");

eq(SETTING_ONBOARDED, "onboardingDismissed", "the setting key is stable");

console.log(`\nsmt-rpg onboarding tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
