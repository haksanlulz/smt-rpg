// Contract scans — architecture invariants as executable checks over the source.
// `node test/contract.test.mjs` (exit 0 pass, 1 fail). Zero-dependency.
//
// These cover the class the pure-helper suites structurally cannot: the system is
// loaded by Foundry, not by node, so a bad template path, a renamed export, a missing
// i18n key or an unhandled data-action is invisible to every assertion about maths.
// See GAUNTLET.md §2 (channel map) and §3 (invariants).
//
// NOTE: these scan source text. They are a proxy for "Foundry loads the system",
// never a substitute — that channel is a manual rung (GAUNTLET.md §2, SPEC system-loads-cold).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

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

// --- file collection -------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "node_modules" || entry === "packs") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const ALL = walk(ROOT);
// Source = shipped code only. test/ is excluded on purpose: its comments discuss
// key names and template paths, and scanning them produced a false positive during
// the 2026-07-26 audit (a commented "SMT.Effect.Dispelled" read as a live usage).
const SRC_MJS = ALL.filter(f => f.endsWith(".mjs") && !rel(f).startsWith("test/"));
const HBS = ALL.filter(f => f.endsWith(".hbs"));

ok(SRC_MJS.length >= 20, `source .mjs discovered (${SRC_MJS.length} >= 20) — a collapsed scan set would pass every check below vacuously`);
ok(HBS.length >= 15, `templates discovered (${HBS.length} >= 15)`);

// --- comment stripping -----------------------------------------------------
// Naive regexes break on "//" inside strings. Scan char-by-char so a URL in a
// string literal is not mistaken for a comment (and vice versa).

function stripJsComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let quote = null;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === "\\") { out += c + (next ?? ""); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && next === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && next === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

// Self-check: the stripper must remove comments AND preserve string contents.
{
  const probe = `const a = "http://x//y"; // gone\nconst b = 'k'; /* gone */ const c = \`t\`;`;
  const s = stripJsComments(probe);
  ok(!s.includes("gone"), "comment stripper removes line and block comments");
  ok(s.includes("http://x//y"), "comment stripper preserves // inside string literals");
}

const SRC = new Map(SRC_MJS.map(f => [f, stripJsComments(readFileSync(f, "utf8"))]));
const HBS_SRC = new Map(HBS.map(f => [f, readFileSync(f, "utf8")]));

// --- C1: every shipped module parses --------------------------------------
// `node --check` parses as ESM for .mjs. Catches syntax errors that node-side
// suites never surface, because they only import the Foundry-free helpers.
{
  const bad = [];
  for (const f of SRC_MJS) {
    try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
    catch (e) { bad.push(`${rel(f)}: ${String(e.stderr ?? e).split("\n").find(l => /Error/.test(l)) ?? "parse failed"}`); }
  }
  eq(bad, [], "C1 every shipped .mjs parses");
}

// --- C2: static imports resolve, and named imports are really exported -----
{
  const unresolved = [];
  const notExported = [];
  for (const [f, src] of SRC) {
    for (const m of src.matchAll(/import\s+([^;]*?)\s*from\s*["'](\.[^"']+)["']/g)) {
      const clause = m[1];
      const target = resolve(dirname(f), m[2]);
      if (!existsSync(target)) { unresolved.push(`${rel(f)} -> ${m[2]}`); continue; }
      const targetSrc = SRC.get(target) ?? stripJsComments(readFileSync(target, "utf8"));
      const braced = clause.match(/\{([^}]*)\}/);
      if (!braced) continue;
      for (const raw of braced[1].split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        const exported = new RegExp(`export\\s+(async\\s+)?(function|const|let|var|class)\\s+${name}\\b`).test(targetSrc)
          || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(targetSrc);
        if (!exported) notExported.push(`${rel(f)} imports { ${name} } from ${m[2]} — not exported there`);
      }
    }
  }
  eq(unresolved, [], "C2a every relative import resolves to a file on disk");
  eq(notExported, [], "C2b every named import is actually exported by its target");
}

// --- C3: template paths referenced from code exist -------------------------
// Dynamic segments (`${this.document.type}`) are expanded against the subtypes
// system.json declares, so the scan covers every branch instead of skipping it.
{
  const sys = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));
  // Expand a dynamic segment against the subtypes of the document class that owns
  // that template directory — `templates/item/${type}` is Item subtypes only.
  // Expanding against every subtype reports templates the branch can never request.
  const subtypesFor = (path) => path.includes("/templates/item/")
    ? Object.keys(sys.documentTypes?.Item ?? {})
    : Object.keys(sys.documentTypes?.Actor ?? {});
  const missing = [];
  let refCount = 0;
  for (const [f, src] of SRC) {
    for (const m of src.matchAll(/["'`](systems\/smt-rpg\/[^"'`]*?\.hbs)["'`]/g)) {
      const raw = m[1];
      const candidates = raw.includes("${")
        ? subtypesFor(raw).map(t => raw.replace(/\$\{[^}]*\}/g, t))
        : [raw];
      for (const c of candidates) {
        refCount++;
        if (!existsSync(join(ROOT, c.replace("systems/smt-rpg/", "")))) missing.push(`${rel(f)} -> ${c}`);
      }
    }
  }
  ok(refCount >= 20, `C3a template references found (${refCount} >= 20)`);
  eq(missing, [], "C3b every template path referenced from code exists");
}

// --- C4: hbs partials resolve ---------------------------------------------
{
  const missing = [];
  let n = 0;
  for (const [f, src] of HBS_SRC) {
    for (const m of src.matchAll(/\{\{>\s*["']?(systems\/smt-rpg\/[^\s"'}]+)["']?/g)) {
      n++;
      if (!existsSync(join(ROOT, m[1].replace("systems/smt-rpg/", "")))) missing.push(`${rel(f)} -> ${m[1]}`);
    }
  }
  ok(n >= 5, `C4a partial references found (${n} >= 5)`);
  eq(missing, [], "C4b every {{> partial}} resolves to a template on disk");
}

// --- C5: i18n keys used in shipped code exist in en.json ------------------
// A missing key renders as the raw dotted string in the UI — visible to players,
// invisible to every maths assertion.
{
  const en = JSON.parse(readFileSync(join(ROOT, "lang/en.json"), "utf8"));
  const have = new Set(Object.keys(en));
  const used = new Set();
  for (const [, src] of SRC) {
    for (const m of src.matchAll(/["'`](SMT\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)["'`]/g)) used.add(m[1]);
  }
  for (const [, src] of HBS_SRC) {
    for (const m of src.matchAll(/localize\s+["'](SMT\.[A-Za-z0-9_.]+)["']/g)) used.add(m[1]);
    for (const m of src.matchAll(/\{\{\s*["'](SMT\.[A-Za-z0-9_.]+)["']/g)) used.add(m[1]);
  }
  ok(used.size >= 100, `C5a i18n key literals found (${used.size} >= 100)`);
  eq([...used].filter(k => !have.has(k)).sort(), [], "C5b every SMT.* key used in shipped code exists in en.json");
}

// --- C6: system.json declared paths exist ---------------------------------
{
  const sys = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));
  const declared = [
    ...(sys.esmodules ?? []),
    ...(sys.styles ?? []),
    ...(sys.languages ?? []).map(l => l.path)
  ];
  ok(declared.length >= 3, `C6a system.json declares files (${declared.length} >= 3)`);
  eq(declared.filter(p => !existsSync(join(ROOT, p))), [], "C6b every file system.json declares exists");
  ok(/^\d+\.\d+\.\d+$/.test(sys.version), `C6c version is semver (${sys.version})`);
  ok(sys.id === "smt-rpg", "C6d manifest id matches the install directory name");
}

// --- C7: every data-action in a template has a handler --------------------
// AppV2 silently ignores an unhandled data-action: the button renders and does
// nothing. Handlers come from three places, all scanned.
{
  const used = new Set();
  for (const [, src] of HBS_SRC) {
    for (const m of src.matchAll(/data-action=["']([^"']+)["']/g)) used.add(m[1]);
  }
  const handled = new Set();
  for (const [, src] of SRC) {
    // AppV2 `actions: { name: handler }` maps
    for (const block of src.matchAll(/actions:\s*\{([\s\S]*?)\n\s*\}/g)) {
      for (const m of block[1].matchAll(/^\s*["']?([A-Za-z0-9_-]+)["']?\s*:/gm)) handled.add(m[1]);
    }
    // chat-card bindings: querySelector("[data-action='x']") / dataset.action === "x"
    for (const m of src.matchAll(/data-action=['"]([^'"\]]+)['"]/g)) handled.add(m[1]);
    for (const m of src.matchAll(/dataset\.action\s*(?:===?|=)\s*["']([^"']+)["']/g)) handled.add(m[1]);
    for (const m of src.matchAll(/dataset\.action\s*=\s*["']([^"']+)["']/g)) handled.add(m[1]);
  }
  ok(used.size >= 20, `C7a data-action attributes found (${used.size} >= 20)`);
  ok(handled.size >= 20, `C7b action handlers found (${handled.size} >= 20)`);
  eq([...used].filter(a => !handled.has(a)).sort(), [], "C7c every data-action in a template has a handler");
}

// --- C8: chat flag protocol has a writer for every reader ------------------
// The whole multi-phase combat pipeline is flag-driven. A getFlag with no
// matching setFlag is a button that can never fire.
{
  const reads = new Set();
  const writes = new Set();
  // The flag scope/key are often held in file-local consts
  // (`setFlag(FLAG_SCOPE, PAID_KEY, true)`), so resolve simple string consts first
  // — a literal-only scan reports those writers as absent.
  const resolveConsts = (src) => {
    const consts = new Map();
    for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"']+)["']\s*;/g)) consts.set(m[1], m[2]);
    return (token) => consts.get(token.trim()) ?? token.trim().replace(/^["']|["']$/g, "");
  };
  const ARG = `(["'][^"']+["']|[A-Za-z_$][\\w$]*)`;
  for (const [, src] of SRC) {
    const lookup = resolveConsts(src);
    for (const m of src.matchAll(new RegExp(`getFlag\\(\\s*${ARG}\\s*,\\s*${ARG}`, "g"))) {
      if (lookup(m[1]) === "smt-rpg") reads.add(lookup(m[2]));
    }
    for (const m of src.matchAll(new RegExp(`setFlag\\(\\s*${ARG}\\s*,\\s*${ARG}`, "g"))) {
      if (lookup(m[1]) === "smt-rpg") writes.add(lookup(m[2]));
    }
    // Computed keys are written as interpolated paths (`flags.${SCOPE}.${KEY}`),
    // so substitute known consts before matching the dotted form.
    const normalized = src.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (whole, id) => {
      const v = lookup(id);
      return v === id ? whole : v;
    });
    for (const m of normalized.matchAll(/flags\.smt-rpg\.([A-Za-z0-9_]+)/g)) writes.add(m[1]);
    // flags declared inline on document creation: flags: { "smt-rpg": { key: ... } }
    for (const m of src.matchAll(/["']smt-rpg["']\s*:\s*\{\s*([A-Za-z0-9_]+)\s*:/g)) writes.add(m[1]);
    // ...and the same thing with COMPUTED keys: flags: { [SCOPE]: { [KEY]: ... } }.
    // Added 2026-07-28 after this scan reported `aid` as unwritten: it is written that
    // way and only that way. Concentrate uses the identical form and escaped notice
    // purely because it also has an update path with a dotted string. A create-only
    // flag was therefore unrepresentable to this rung.
    for (const m of src.matchAll(/\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*\{\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:/g)) {
      if (lookup(m[1]) === "smt-rpg") writes.add(lookup(m[2]));
    }
  }
  ok(reads.size >= 3, `C8a flag reads found (${reads.size} >= 3)`);
  eq([...reads].filter(k => !writes.has(k)).sort(), [], "C8b every smt-rpg flag read has a writer somewhere");
}

// --- C9: GAUNTLET.md §5 specs are linked to a test or dated as manual ------
// A spec with no backing check is a claim, not a constraint (GAUNTLET.md §5).
{
  const gauntletPath = join(ROOT, "GAUNTLET.md");
  if (!existsSync(gauntletPath)) {
    failed++; failures.push("C9 GAUNTLET.md is missing — §5 specs cannot be verified");
  } else {
    const g = readFileSync(gauntletPath, "utf8");
    const specs = [...g.matchAll(/^###\s+SPEC\s+([a-z0-9-]+)\s*$/gim)].map(m => m[1]);
    ok(specs.length >= 3, `C9a GAUNTLET.md declares specs (${specs.length} >= 3)`);

    // Only real suites (`*.test.mjs`, what the aggregate runner executes), and not
    // this one. Both exclusions are self-reference guards found the hard way: this
    // scanner names specs in its own assertion labels, and mutation-probe.mjs holds
    // the tag strings it plants. A tag in a file no runner executes is not a link.
    const SELF = rel(fileURLToPath(import.meta.url));
    const testSrc = ALL
      .filter(f => rel(f).startsWith("test/") && f.endsWith(".test.mjs") && rel(f) !== SELF)
      .map(f => readFileSync(f, "utf8")).join("\n");
    // The tag is a comment marker, not any mention of the word.
    const tagged = new Set([...testSrc.matchAll(/\/\/\s*spec:\s*([a-z0-9-]+)/g)].map(m => m[1]));

    // A spec passes linkage if a test carries its tag, or its block declares a
    // manual check with a date (or a loud NEVER).
    const orphans = [];
    for (const id of specs) {
      if (tagged.has(id)) continue;
      const block = g.split(new RegExp(`^###\\s+SPEC\\s+${id}\\s*$`, "im"))[1]?.split(/^###\s/m)[0] ?? "";
      const manual = /Check:\s*manual/i.test(block) && /last verified:\s*(\d{4}-\d{2}-\d{2}|NEVER)/i.test(block);
      if (!manual) orphans.push(id);
    }
    eq(orphans, [], "C9b every §5 spec is linked to a tagged test or is a dated manual rung");

    const dangling = [...tagged].filter(t => !specs.includes(t)).sort();
    eq(dangling, [], "C9c every spec: tag in a test matches a spec declared in GAUNTLET.md");
  }
}

// --- C11: user-facing strings go through en.json (§1 clause 6, a GATE) -----
// Deliberately NARROW. Broad "looks like English" detection over templates is
// exactly the false-positive-prone shape that got three scans wrong on
// 2026-07-26, and a rung that cries wolf gets deleted. Two high-signal surfaces
// only: notification calls, and template text nodes.
{
  // (a) ui.notifications.* must receive a localized string, never a literal.
  const literalNotify = [];
  for (const [f, src] of SRC) {
    for (const m of src.matchAll(/ui\.notifications\.\w+\(\s*(["'`])/g)) {
      const line = src.slice(0, m.index).split("\n").length;
      literalNotify.push(`${rel(f)}:${line}`);
    }
  }
  eq(literalNotify, [], "C11a every ui.notifications call goes through game.i18n, never a bare string");

  let notifyCount = 0;
  for (const [, src] of SRC) notifyCount += [...src.matchAll(/ui\.notifications\.\w+\(/g)].length;
  ok(notifyCount >= 20, `C11b notification calls found (${notifyCount} >= 20) — a collapsed scan set would pass C11a vacuously`);

  // (b) Template text nodes. Strip tags and handlebars, then anything left with
  // two or more consecutive letters is text a player reads. HTML entities
  // (&mdash; &nbsp; &rarr;) are punctuation, not translatable copy, so they are
  // resolved away rather than reported — they made up 7 of the 8 raw hits.
  const hardcoded = [];
  for (const [f, raw] of HBS_SRC) {
    let s = raw.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ");
    s = s.replace(/<[^>]*>/g, " ");
    s = s.replace(/\{\{[\s\S]*?\}\}/g, " ");
    s = s.replace(/&[a-zA-Z]+;|&#\d+;/g, " ");
    for (const line of s.split("\n")) {
      const t = line.trim();
      if (/[A-Za-z]{2,}/.test(t)) hardcoded.push(`${rel(f)}: ${t.slice(0, 60)}`);
    }
  }
  eq(hardcoded, [], "C11c no hardcoded user-facing text in templates — wrap it in {{localize}} and add the key");
}

// --- C12: every system.* write path is a declared schema field -------------
// The 2026-07-27 escape wrote `target`, `description` and `behavior` into a
// document and Foundry rejected every one. Nothing in this suite could see it,
// because no rung here constructs a document.
//
// This is a COARSE net by construction: it unions the fields of every data model,
// so it catches "not a field anywhere in the system" (which `target` and
// `description` were) but NOT "a real field on the wrong document type" (which
// `behavior` was — npc-data has it, demons do not). The per-type check is a
// runtime one and lives in test/demon-skills.test.mjs, which exercises the
// builders directly. Two layers, neither pretending to be the other.
{
  const dataDir = join(ROOT, "module/data");
  const declared = new Set();
  for (const f of readdirSync(dataDir).filter(n => n.endsWith(".mjs"))) {
    const src = readFileSync(join(dataDir, f), "utf8");
    for (const m of src.matchAll(/^\s{4,10}([a-zA-Z]+):\s*(new\s+\w+Field|make\w+Schema)/gm)) {
      declared.add(m[1]);
    }
  }
  ok(declared.size >= 40, `C12a schema fields collected from module/data (${declared.size} >= 40)`);

  const paths = new Set();
  for (const [, src] of SRC) {
    for (const m of src.matchAll(/["'`]system\.([a-zA-Z][a-zA-Z0-9_]*)/g)) paths.add(m[1]);
  }
  ok(paths.size >= 10, `C12b system.* write paths found (${paths.size} >= 10)`);
  eq([...paths].filter(p => !declared.has(p)).sort(), [],
    "C12c every system.* path written by the code is a field some data model declares");
}

// --- C10: licensed rulebook content never becomes committable --------------
// The repo is public. The PDF and any text extracted from it are the same
// licensed content. Values derived from it (stat numbers, table lookups in
// config.mjs) are fine; prose and stat blocks are not. An ignore rule nobody
// asserts is one `git add -f` or one edited .gitignore away from a leak.
{
  const gitignore = existsSync(join(ROOT, ".gitignore"))
    ? readFileSync(join(ROOT, ".gitignore"), "utf8")
    : "";
  const rules = gitignore.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));

  // Tracked .gitignore, not .git/info/exclude: a fresh clone inherits only the former.
  ok(rules.some(r => /^rulebook-text\/?$/.test(r)),
    "C10a tracked .gitignore excludes rulebook-text/ (a fresh clone inherits this; .git/info/exclude does not)");
  ok(rules.some(r => /^data-local\/?$/.test(r)),
    "C10d tracked .gitignore excludes data-local/ (imported stat blocks are the book's content)");
  ok(rules.some(r => /^\*\.pdf$/.test(r)),
    "C10b tracked .gitignore excludes *.pdf");

  // Ground truth, when a repo is reachable. Skips LOUDLY rather than passing —
  // an assertion that silently no-ops outside a checkout is not a guard.
  let tracked = null;
  try {
    tracked = execFileSync("git", ["ls-files", "--", "rulebook-text", "data-local", "*.pdf"], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch { /* no git, or not a checkout */ }

  if (tracked === null) {
    console.log("  C10c SKIPPED: no git checkout reachable — tracked-file check did not run");
  } else {
    eq(tracked ? tracked.split("\n") : [], [], "C10c no rulebook PDF or extracted text is tracked by git");
  }
}

console.log(`\nsmt-rpg contract tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
