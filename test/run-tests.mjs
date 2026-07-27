// Aggregate runner: `node test/run-tests.mjs` (exit 0 pass, 1 fail).
//
// Discovery is glob-only over `test/*.test.mjs`. There is deliberately no list of
// suites to maintain: this project shipped `fusion-chart.test.mjs` as a separate
// entry point that no command ran alongside the others, which is a fail-open —
// a suite a runner never loads cannot go red (GAUNTLET.md §6).
//
// Each suite owns its own harness and calls process.exit, so they run as child
// processes and are judged by exit code.

import { readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, "..");

// Floor: if discovery breaks or a suite is deleted, the aggregate must fail loudly
// rather than report a cheerful green over a collapsed set. Raise when suites are added.
const MIN_SUITES = 13;

const suites = readdirSync(TEST_DIR).filter(f => f.endsWith(".test.mjs")).sort();

console.log(`smt-rpg test suites discovered: ${suites.length}`);
for (const s of suites) console.log(`  - test/${s}`);

if (suites.length < MIN_SUITES) {
  console.log(`\nFAIL: discovered ${suites.length} suite(s), floor is ${MIN_SUITES}.`);
  console.log("Discovery is broken or a suite was removed. This is a fail-open, not a pass.");
  process.exit(1);
}

let failedSuites = 0;
const results = [];

for (const s of suites) {
  const r = spawnSync(process.execPath, [join(TEST_DIR, s)], { cwd: ROOT, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const summary = out.split("\n").find(l => /\d+ passed, \d+ failed/.test(l))?.trim() ?? "(no summary line)";
  const ok = r.status === 0;
  if (!ok) failedSuites++;
  results.push({ suite: `test/${s}`, ok, summary, out });
}

console.log("\nRung                              Result");
console.log("--------------------------------- ------");
for (const r of results) {
  console.log(`${r.suite.padEnd(33)} ${r.ok ? "PASS" : "FAIL"}   ${r.summary}`);
}

if (failedSuites) {
  for (const r of results.filter(x => !x.ok)) {
    console.log(`\n--- ${r.suite} ---\n${r.out}`);
  }
  console.log(`\n${failedSuites} of ${suites.length} suite(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${suites.length} suites passed.`);
console.log("NOTE: these are node-side rungs. Nothing here loads Foundry — see GAUNTLET.md §2 and the §5 manual specs.");
process.exit(0);
