// Mutation probe: proves the contract scans can fail. `node test/mutation-probe.mjs`.
//
// A scan that returns an empty violation list proves nothing until it has been shown
// to return a non-empty one (workspace Audit Rule 22 — an instrument that cannot
// return a positive is not evidence). Every C-rung in test/contract.test.mjs reported
// zero violations on its first run; three of those zeroes were scan bugs, not clean
// code. This plants one defect per rung into a scratch copy of the project and asserts
// the suite goes red, with a CONTROL run on an unmutated copy proving it goes green.
//
// Not part of the aggregate run — it is a proof about the rungs, run when they change.

import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = join(tmpdir(), "smt-rpg-mutation-probe");

// Only what the contract suite reads. Copying the whole tree would drag the rulebook PDF.
// `styles` is required even though no scan reads its contents: C6b asserts every
// file system.json declares exists, and omitting it made the control run red.
const COPY = ["module", "templates", "lang", "styles", "test", "system.json", "smt-rpg.mjs", "GAUNTLET.md", ".gitignore"];

function copyInto(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const rec = (src, dst) => {
    if (statSync(src).isDirectory()) {
      mkdirSync(dst, { recursive: true });
      for (const e of readdirSync(src)) rec(join(src, e), join(dst, e));
    } else copyFileSync(src, dst);
  };
  for (const item of COPY) {
    const src = join(ROOT, item);
    if (existsSync(src)) rec(src, join(dest, item));
  }
}

const edit = (dir, relPath, fn) => {
  const p = join(dir, relPath);
  writeFileSync(p, fn(readFileSync(p, "utf8")), "utf8");
};

// Each mutation names the rung it must trip. `expect` is matched against the failure output.
const MUTATIONS = [
  {
    rung: "C1 parse", expect: "C1",
    apply: (d) => edit(d, "module/helpers/damage.mjs", s => s + "\nexport function broken( {\n")
  },
  {
    rung: "C2b named export", expect: "C2b",
    apply: (d) => edit(d, "module/helpers/damage.mjs", s => s.replace("export function calculateDamage", "export function calculateDamageRenamed"))
  },
  {
    rung: "C3b template path", expect: "C3b",
    apply: (d) => rmSync(join(d, "templates/chat/damage-result.hbs"))
  },
  {
    rung: "C4b partial", expect: "C4b",
    apply: (d) => edit(d, "templates/actor/actor-sheet.hbs", s =>
      s + '\n{{> systems/smt-rpg/templates/actor/partials/does-not-exist.hbs}}\n')
  },
  {
    rung: "C5b i18n key", expect: "C5b",
    apply: (d) => edit(d, "module/helpers/damage.mjs", s =>
      s + '\nexport const BOGUS = "SMT.NoSuch.Key";\n')
  },
  {
    rung: "C6b manifest path", expect: "C6b",
    apply: (d) => edit(d, "system.json", s => s.replace('"styles/smt-rpg.css"', '"styles/gone.css"'))
  },
  {
    rung: "C7c unhandled action", expect: "C7c",
    apply: (d) => edit(d, "templates/actor/actor-sheet.hbs", s =>
      s + '\n<button data-action="thisActionHasNoHandler">x</button>\n')
  },
  {
    rung: "C8b dead flag read", expect: "C8b",
    apply: (d) => edit(d, "module/helpers/combat.mjs", s =>
      s + '\nexport function ghost(m) { return m.getFlag("smt-rpg", "flagWithNoWriter"); }\n')
  },
  {
    rung: "C9b orphan spec", expect: "C9b",
    apply: (d) => edit(d, "GAUNTLET.md", s =>
      s + "\n### SPEC an-orphan-spec-with-no-check\n```\nGiven nothing\nWhen nothing\nThen nothing\n```\n")
  },
  {
    rung: "C9c dangling tag", expect: "C9c",
    apply: (d) => edit(d, "test/fate-damage.test.mjs", s =>
      s + "\n// spec: a-tag-matching-no-declared-spec\n")
  },
  {
    rung: "C11a literal notification", expect: "C11a",
    apply: (d) => edit(d, "module/helpers/fusion.mjs", s =>
      s + '\nexport function nag() { ui.notifications.warn("Not localized."); }\n')
  },
  {
    rung: "C11c hardcoded template text", expect: "C11c",
    apply: (d) => edit(d, "templates/actor/actor-sheet.hbs", s =>
      s + "\n<div><span>Hardcoded English label</span></div>\n")
  },
  {
    // The 2026-08-01 probe-run report in one line: one option loop among ten
    // dropping its {{localize}}, shipping raw "SMT.Clan.Night" into the dropdown.
    rung: "C11d unlocalized option label", expect: "C11d",
    apply: (d) => edit(d, "templates/actor/actor-sheet.hbs", s =>
      s.replace(">{{localize label}}</option>", ">{{label}}</option>"))
  },
  {
    // The 2026-08-01 play report in one line: a control the system renders with no
    // rule anywhere, invisible in one of its two states.
    rung: "C15b unstyled input type", expect: "C15b",
    apply: (d) => edit(d, "styles/smt-rpg.css", s =>
      s.replace(/input\[type="radio"\]/g, 'input[type="unstyled-on-purpose"]'))
  },
  {
    // The 2026-07-29 escape in one line: a second definition of a method that already
    // exists, which JS accepts and silently lets win.
    rung: "C14b duplicate class member", expect: "C14b",
    apply: (d) => edit(d, "module/documents/actor.mjs", s =>
      s.replace(/^\}\s*$/m, "  async levelUp() { return null; }\n}\n"))
  },
  {
    // The 2026-07-28 play report in one line: a class applied by the system with no
    // rule anywhere. Planted on a template so the probe exercises the .hbs collector.
    rung: "C13c unstyled smt- class", expect: "C13c",
    apply: (d) => edit(d, "templates/actor/actor-sheet.hbs", s =>
      s + '\n<div class="smt-a-class-with-no-rule"></div>\n')
  },
  {
    rung: "C12c undeclared system path", expect: "C12c",
    apply: (d) => edit(d, "module/helpers/combat.mjs", s =>
      `${s}\nexport function bad(a) { return a.update({ "system.notAField": 1 }); }\n`)
  },
  {
    rung: "C10a rulebook ignore dropped", expect: "C10a",
    apply: (d) => edit(d, ".gitignore", s => s.replace(/^rulebook-text\/?$/m, ""))
  },
  {
    rung: "C10d data-local ignore dropped", expect: "C10d",
    apply: (d) => edit(d, ".gitignore", s => s.replace(/^data-local\/?$/m, ""))
  },
  {
    rung: "C10b pdf ignore dropped", expect: "C10b",
    apply: (d) => edit(d, ".gitignore", s => s.replace(/^\*\.pdf$/m, ""))
  }
];

const run = (dir) => {
  const r = spawnSync(process.execPath, [join(dir, "test/contract.test.mjs")], { cwd: dir, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

let failed = 0;
const rows = [];

// CONTROL — an unmutated copy must pass. Without this, every "red" below could be
// an artifact of the copy itself rather than of the planted defect.
copyInto(SCRATCH);
const control = run(SCRATCH);
const controlOk = control.status === 0;
if (!controlOk) failed++;
rows.push({ rung: "CONTROL (no mutation)", want: "GREEN", got: controlOk ? "GREEN" : "RED", ok: controlOk });
if (!controlOk) {
  console.log("CONTROL FAILED — the scratch copy does not pass clean, so no mutation result below is meaningful.\n");
  console.log(control.out);
}

for (const m of MUTATIONS) {
  copyInto(SCRATCH);
  m.apply(SCRATCH);
  const r = run(SCRATCH);
  const wentRed = r.status !== 0;
  // Red is not enough: it must be red for the RIGHT reason.
  const rightReason = wentRed && r.out.includes(m.expect);
  if (!rightReason) failed++;
  rows.push({
    rung: m.rung,
    want: "RED",
    got: wentRed ? (rightReason ? "RED" : "RED (wrong rung)") : "GREEN",
    ok: rightReason
  });
}

rmSync(SCRATCH, { recursive: true, force: true });

console.log("\nMutation                     Want   Got");
console.log("---------------------------- ------ ---------------");
for (const r of rows) console.log(`${r.rung.padEnd(28)} ${r.want.padEnd(6)} ${r.got}${r.ok ? "" : "   <-- PROBE FAILED"}`);

console.log(`\nsmt-rpg mutation probe: ${rows.length - failed} of ${rows.length} proved`);
if (failed) {
  console.log("\nA rung that does not go red for its own planted defect is not a constraint.");
  process.exit(1);
}
process.exit(0);
