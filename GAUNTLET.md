# GAUNTLET — SMT: Tokyo Conception (Foundry VTT system)

Constraint state for this system: what DONE means, which channel each artifact is really consumed through, which invariants are executable, and which gates run for which class of change.

§1 and §5 are the bar — they change only by a deliberate ruling, never as a side effect of making a test pass. §2–§4 and §6 describe whatever the code currently is and are updated whenever it moves.

Authored 2026-07-26, after the escape logged in §6.

---

## §1 Oracle — done-definition

> **Status: clauses 1–6 RATIFIED 2026-07-27.** Clauses 1–3 were read back out of the existing project notes and confirmed; clauses 4–6 were drafted here, put as explicit questions, and answered. Clause 5 was **not** kept as written — it was narrowed on the ruling (see below). **Non-goals put and ruled on 2026-08-01** — three ratified (one amended), three added from free recall in the operator's own words, and the performance clause was **struck on the ruling**: performance is a quality bar, not a non-goal.

**What this is.** A Foundry VTT game system for *Shin Megami Tensei: The Roleplaying Game — Tokyo Conception*, a d100 percentile TTRPG. It is **installed and played**, not read — distributed publicly via a manifest URL and run at a live table.

**A feature is DONE when:**

1. **It matches the rulebook.** Formulas, terminology, and tables match the book exactly, cited by page. Guessing at a mechanic is a defect even when the code is clean. *(Clarified 2026-07-27: **a boss stat block is allowed to sit off the curve.** Boss entries are GM fiat — p.123 already derives their stats from their HP and MP rather than from a formula — so a boss value that no formula reproduces is data, not a defect. Specter (3rd Time)'s printed LVL 440 stands. The corpus sweep still checks bosses and names the exceptions, because an unexplained one is worth seeing.)*
2. **It is automated, not left to the GM.** Rolls, damage, cost deduction, affinity application, and effect bookkeeping are performed by the system. "The GM can do that by hand" is not done.
3. **It uses real Foundry v13/v14 APIs.** No hack workarounds; deprecated v12 patterns are defects. The AppV2 rules in the project notes are hard-won and each line was a real bug.
4. **Saying what is unverified — GATE. Actually exercising it in Foundry — aspirational.** The product IS the loaded system, and no node-side assertion observes it. So a session **may never report an artifact-affecting change as working**: it closes the change *and states, specifically, which Foundry-side behavior nobody has observed* — which sheet, which button, which card. "Suites green" is never written as, or allowed to imply, "it works." Loading it and clicking it is encouraged and does not block; play is the real verification channel and bugs get reported from it as they surface. *(Ratified 2026-07-27, then **split 2026-07-27** in the same shape as clause 5. The drafted version made the hands-on check a hard gate; that puts the gate on the one participant a gate cannot compel, and would have parked finished work indefinitely. The enforceable half is the honest report. The 2026-06-07 halve-damage escape is still the argument, and its actual mechanism was the substitution — 315 green assertions **read as** evidence the system worked. Forbidding that sentence is what closes it. What replaces upfront verification is §6: every bug reported from play ships its fix **and** the rung that would have caught it, in the same session, so each report permanently closes its own class.)*
5. **Rules maths is covered by a suite — GATE. Coverage of logic in general — aspirational.** Anything implementing a rulebook formula, table, or threshold needs an assertion before it counts as done, expressed as a test rather than as prose in a commit message. Coverage of everything else (sheet wiring, chat rendering, UI glue) is encouraged and never blocks — most of it cannot be reached from `node` at all. *(Ratified 2026-07-27. Narrowed from the drafted "all pure logic is covered", which would have gated work the rungs structurally cannot see.)*
6. **User-facing strings go through `lang/en.json` — GATE.** A hardcoded English string is a defect that blocks done, even though nothing renders wrong today. *(Ratified 2026-07-27 as blocking. **Enforced since 2026-07-27 by C11**, which found 7 real violations on its first run — a hardcoded `All` in the consumable cure dropdown, and six stat/unit labels — all fixed, all against keys that already existed.)*

**Non-goals.** *(Put and ruled on 2026-08-01. Free-recall items were elicited before the drafted set was shown, so they are un-primed.)*

- **Not a general-purpose SMT toolkit — but not Tokyo-Conception-only forever.** Amended on the ruling: *"technically true but only cause its all thats out right now. if they release more (i hope they do) i want to support it."* Tokyo Conception is the only supported book because it is the only book; nothing should be architected so that a second official release is structurally impossible to add.
- **No rulebook text or licensed art ships in the repo** (the PDF is gitignored and stays that way). Ratified as written — and strengthened by the free-recall form below.
- **The system ships raw rules only — zero data.** *"theres no data only raw rules (unless you provide the data yourself with the pdf)."* Every stat block, skill, Magatama and gear entry arrives via the user's own PDF through the importer. This subsumes the repo clause: the data does not exist anywhere but the user's machine.
- **It is not a game and cannot run itself.** *"it is not a game. it can't run itself."* Automation means mechanical resolution — rolls, damage, costs, affinities, bookkeeping. It never means playing a side of the table.
- **No solo-play oracle.** *"theres no solo play oracle."*
- **No v12 back-compat.** Ratified as written.
- **Performance is NOT a non-goal — clause struck 2026-08-01, and laddered the same day.** The drafted "performance is irrelevant at table scale" was put and rejected; the ruling is **"instant table, patient import"**: every in-session interaction (opening a sheet, rolling, applying damage, dragging from a compendium) reads as instant with no visible hang, while the PDF import may take minutes provided it shows live progress and never freezes the client. Manual rungs, dated when exercised; the importer additionally gets a measured runtime bound once it exists in-Foundry.

**Explicitly out of scope for automation:** whether a fight is *balanced*, whether an encounter is *fun*, and whether a house ruling is *right*. These are manual rungs (§5) and go stale loudly.

### The 1.0 release oracle *(elicited 2026-08-01, ratified verbatim the same day)*

Per-feature done stays governed by clauses 1–6 above; 1.0 adds no shortcut past them. **1.0 is the public release** — "1.0 is public ready" was the ruling — and it is DONE when:

1. **The ten-minute path works.** A user who owns the PDF goes fresh-install → point the in-Foundry importer at their PDF → drag a working demon onto a scene, in ten minutes or less, never leaving Foundry. No CLI, no Python, no README surgery.
2. **The no-PDF path degrades cleanly.** Without a PDF the system is fully functional on raw rules — sheets, rolls, combat all work with hand-made actors — and every empty compendium points at how to fill it.
3. **Import is complete and counted.** The in-Foundry importer builds world packs for Demons (194), Skills (248), Magatama (25), and Gear, counts verified against the same anchors the CLI importer enforces — and the data source is **substitutable**: a future official module shipping packs slots in without code changes. *(The stated aspiration is exactly that: approach the publisher about an official premium data module once 1.0 exists. Nothing may weld a consumer to "world pack built by our importer".)*
4. **Every drag lands.** Compendium demon → scene is a working actor. Skill → sheet is a usable skill. Magatama → fiend equips. Gear → human equips with bonuses applied.
5. **Every printed subsystem resolves by buttons.** Combat completeness, the exploration layer (encounters, ambush, back attack, flee, the Kagutsuchi track), fusion and creation extras, the talk table — plus the party roster, remote play (the socket relay), and the native-tabs migration. Clause 2's bar applies to each: "the GM can do that by hand" is not done.
6. **Instant table, patient import.** Every in-session interaction reads as instant; the import may take minutes with live progress; the client never freezes.
7. **Nothing named above is deferred.** All four subsystem groups and all four residual items were put individually and every one was gated into 1.0. The post-1.0 arc (future books, the official-module approach, deeper automation) starts after this line, not inside it.

---

## §2 Channel map

**A test suite is one channel; it is never the artifact's channel.**

The founding gap: every rung that existed before 2026-07-26 ran in `node`, and **`node` never loads Foundry**. 315 assertions were green while the halve-damage defect in §6 sat live for seven weeks, because the code it lived in cannot even be imported without Foundry globals.

| Artifact | Real channel | Pass condition | Rung |
|---|---|---|---|
| pure rules helpers | a suite importing them directly | every assertion green | `test/pure-helpers.test.mjs`, `test/fusion-chart.test.mjs`, `test/fate-damage.test.mjs`, `test/demon-roster.test.mjs` |
| rulebook data tables (fusion chart, demon roster, stat blocks) | the rules that read them | every value cross-checked against another table the book prints, plus anchors read off the rendered page | `fusion-chart.test.mjs`, `demon-roster.test.mjs`, `boss-hp.test.mjs`, `demon-skills.test.mjs` |
| shipped `.mjs` modules | **Foundry evaluates them at world load** | every module parses; every relative import resolves to a real export | `test/contract.test.mjs` C1–C2 |
| `.hbs` templates | **Foundry's template loader renders them** | every referenced path exists; every `{{> partial}}` resolves | `test/contract.test.mjs` C3–C4 |
| `lang/en.json` | Foundry's i18n loader at init | no leaf/branch collision; every `SMT.*` key used in code exists | `pure-helpers` collision guard + `contract` C5 |
| `system.json` | **Foundry parses it before anything else runs** | declared files exist; semver version; id matches the install dir | `test/contract.test.mjs` C6 |
| sheet + chat buttons | **a user clicks them** | every `data-action` has a handler; every flag read has a writer | `test/contract.test.mjs` C7–C8 (proxy) |
| **documents the system creates** | **Foundry's DataModel validates them on create** | every field written exists on that document's schema, with the right enum value and nested shape | `test/demon-skills.test.mjs` (runtime, per-type) + `contract` C12 (static, coarse) |
| **the installed system** | **load the world and play** | boots · a sheet opens · an attack resolves end-to-end · HP persists | **manual** — §5 `system-loads-cold`, `every-chat-button-fires` |
| manifest install | **Foundry installs from the manifest URL** | `system.json` at the raw URL parses and points at a downloadable archive | **partly checked 2026-07-26 (v0.1.12)** — raw manifest 200 with correct id/version/compat, archive 200 `application/zip`. Foundry actually *installing* from it is still unrun, and **v0.1.13's manifest has not been re-checked at the URL**. |
| **in-Foundry importer** *(all four packs BUILT 2026-08-01 — Demons, Magatama, Skills, Gear & Items; UI never observed)* | **a GM points it at their own PDF in a live client** | four world packs created atomically; entry counts match the CLI importer's verified anchors; live progress; client never freezes; a failed run writes nothing | `test/importer-parity.test.mjs` — all four parsers held byte-identical to the CLI reference over the same words (194/194 demons, 25/25 Magatama incl. prose grants, 248/248 skills, 68/68 gear+items; red-proved four ways). The p.39-41 prose is reconstructed from WORDS with a fixed column split so both sides derive grants identically; p.118 is a second ROTATED table with multi-line cells reading right-to-left. The pdf.js EXTRACTION layer has no node rung; it is gated at runtime by the ported verifiers, which refuse to write on any failure — the two rotated pages are extraction's sharpest untested edge. The dialog itself: **manual** — §5 `the-ten-minute-path`, NEVER. |
| **world compendiums + drag-drop** *(1.0 oracle #4 — packs NOT BUILT)* | **a user drags an entry from the sidebar onto a scene or sheet** | the dragged document is a WORKING actor/item — stats land, skills attach, bonuses apply | document-shape suites cover the payloads (`demon-skills`, `magatama-data`, `skill-learning`); the drag itself is **manual** — §5 `every-drag-lands` |
| **socket relay (remote play)** *(BUILT 2026-08-01; never run with a second client)* | **two connected clients: a player clicks, the active GM's client resolves** | every cross-permission action (dodge/apply, halve, counter, negotiation, buff/dispel/provoke) resolves identically to a solo-GM click; ids-only payloads; refused loudly with no GM connected | `test/socket-relay.test.mjs` — the pure core (routing, registry, payload rule) with the ids-only invariant red-proved both ways. **The recorded blocker was found already closed**: `resolveAttack` reads `rawPower` from the flag and the 07-28 refactor threaded `basePower: rw.power` through both strike paths — the OPEN line had gone stale again. The two-client exchange itself: **manual only**, NEVER run. |

> **Twice now, every node suite has been green while a feature was completely broken** — halve-damage (2026-06-07) and demon creation (2026-07-27). Both times the code was correct as JavaScript and wrong as *Foundry*. That is not bad luck; it is the shape of this project's blind spot, and it is why §1 clause 4 forbids reporting an artifact-affecting change as working.

**The bottom two rows are the ones that matter and neither is automated.** C1–C8 are static scans over source text: they catch a dead reference, never a wrong behavior. Treating a green suite as evidence the system works is exactly the failure this file exists to prevent.

---

## §3 Invariants — executable scans

All in `test/contract.test.mjs`. Each was mutation-proved on 2026-07-26 (see §6).

| # | Invariant | Why it is a total-kill class |
|---|---|---|
| C1 | Every shipped `.mjs` parses. | A syntax error means the system never registers; Foundry shows an empty system list. No node suite imports the Foundry-coupled modules, so nothing else looks. |
| C2 | Every relative import resolves, and every named import is really exported by its target. | A renamed export throws at world load — same blast radius as C1, and the usual cause after a refactor. |
| C3 | Every `systems/smt-rpg/**.hbs` path referenced from code exists. Dynamic segments expand against the subtypes `system.json` declares, keyed by template directory. | A wrong path renders a blank sheet with a console error most users never open. |
| C4 | Every `{{> partial}}` resolves. | Same, one level down. |
| C5 | Every `SMT.*` key used in shipped code exists in `en.json`. | A missing key renders the raw dotted string in the UI. Cosmetic, player-visible, invisible to maths assertions. |
| C6 | `system.json` declared files exist; version is semver; id matches the directory. | Foundry reads this first. A bad path here kills the install, not just a feature. |
| C7 | Every `data-action` in a template has a handler (AppV2 `actions:` map, chat-hook `querySelector`, or `dataset.action` comparison). | **AppV2 silently ignores an unhandled action** — the button renders and does nothing, with no error anywhere. |
| C8 | Every `smt-rpg` flag read has a writer. Scope/key consts and interpolated `flags.${SCOPE}.${KEY}` paths are resolved before matching. | The whole multi-phase combat pipeline is flag-driven; a read with no writer is a permanently dead button. |
| C9 | Every §5 spec is linked to a tagged test or is a dated manual rung, and every `spec:` tag matches a declared spec. | A spec with no backing check is a claim, not a constraint. |
| C11 | User-facing strings go through `en.json`: no `ui.notifications` call takes a bare literal, and no template carries a hardcoded text node. HTML entities are resolved away as punctuation. | **§1 clause 6 is a GATE and this is what makes it one** — before this rung it was a comment. Deliberately narrow: broad "looks like English" detection over templates is the false-positive shape that got three scans wrong on 2026-07-26, and a rung that cries wolf gets deleted. |
| C12 | Every `system.*` path the code writes is a field some data model declares. | Foundry rejects an undeclared field at create time and the document loses that data. **Coarse by construction** — it unions every data model, so it catches "not a field anywhere" (what `target` and `description` were) but not "a real field on the wrong type" (what `behavior` was). The per-type check is runtime, in `demon-skills.test.mjs`. |
| C14 | No class declares the same member twice. | **A duplicate class member is legal JavaScript and the later definition silently wins.** C1's parse check passes, C2 sees one export, and no node suite imports the Foundry-coupled documents at all — so adding a second `_preUpdate` to `SMTActor` on 2026-07-29 deleted the HP/MP source clamp the first one existed to provide, and nothing anywhere looked. Scoped to declarations at class-body indentation; JS has no overloads, so a repeated name is always a bug. |
| C13 | Every `smt-`-prefixed class the system applies — in a template, or via `classList.add` — has a rule in `styles/`, or is used as a `querySelector` hook. | A class that styles nothing inherits whatever its container gives it, which is how a labelled button ended up inside Foundry's icon-only controls bar and off the side of the sidebar. **Narrow by design like C11:** only the project's own namespace is checked, because every other class on those elements belongs to Foundry or Font Awesome and demanding local rules for those would cry wolf until someone deleted the rung. Found two more dead classes on its first run. |
| C10 | The tracked `.gitignore` excludes `rulebook-text/` and `*.pdf`, and git tracks neither. | The repo is **public** and the rulebook is licensed. An ignore rule nobody asserts is one edited `.gitignore` away from committing the book. C10c uses git as ground truth and **skips loudly** outside a checkout rather than passing. |

**Scan honesty.** Five defects, across three of these scans, reported violations on their first run that were **defects in the scan, not the code**:

| Scan | Reported | Actually |
|---|---|---|
| C3b | 4 missing `templates/item/{fiend,demon,human,npc}-sheet.hbs` | the dynamic path was expanded against Actor subtypes as well as Item ones, inventing paths the branch can never request |
| C8b | `rewardsPaid` has no writer | `rewards.mjs` writes it as `setFlag(FLAG_SCOPE, PAID_KEY, true)` — both args are file-local consts, invisible to a literal-only regex |
| C8b | `initiativeTieBreak` has no writer | `documents/combat.mjs` writes the computed key `` [`flags.${FLAG_SCOPE}.${TIEBREAK_KEY}`] `` — assembled at runtime |
| C9c | dangling spec tag `tag` | the scanner matched `spec: tag` inside its own assertion label |
| C9c | control run red on `a-tag-matching-no-declared-spec` | `mutation-probe.mjs` stores the tags it plants, and it lives under `test/` |
| C2 | `'default' is not exported by ../importer/app.mjs` | `const { default: Thing } = await import(…)` destructures the name **`default`**, which `export default` satisfies and `export class default` never could. The module plainly had the export; the scan could not see the idiom. |

All fixed and re-proved. **A third lesson, from 2026-07-27: a check on field NAMES is not a check on values or shapes.** The first version of the demon-skill rung compared key names against the schema and passed `drops`-written-as-a-string without complaint, because `drops` *is* a real field — it just is not a string. Assert the shape the schema declares, not merely that the name exists. Two more lessons worth keeping: a scan that cannot see a legitimate idiom manufactures false positives until someone deletes the rung — which is how a project ends up with no rung at all; and a scanner that reads its own source will find whatever it is looking for.

**Canonical ownership**

| Data | Owner | How others access |
|---|---|---|
| game constants (elements, stats, clans, fusion tables, fate) | `module/config.mjs` → `CONFIG.SMT` | read through `CONFIG.SMT`; never re-declare a literal |
| derived actor values (HP/MP max, TNs, resistances) | `prepareDerivedData()` in the data models | recomputed every prepare, **never stored** |
| damage + HP arithmetic | `module/helpers/damage.mjs` (pure) | `applyDamage` calls it; no caller re-implements the maths |
| multi-phase combat state | `ChatMessage` flags under `smt-rpg` | read via `getFlag`, coerced through the `_sanitize*` helpers — flags are author-forgeable |
| user-facing strings | `lang/en.json` | `game.i18n.localize/format` only |

---

## §4 Ladder

| Class | Rungs |
|---|---|
| docs-only (`*.md`) | none |
| code-touch (pure helpers) | `node test/run-tests.mjs` (aggregate; test-first for non-trivial fixes) |
| code-touch (Foundry-coupled: documents, sheets, entry) | + `contract.test.mjs` C1–C8 |
| template / lang / manifest touch | + `contract.test.mjs` (all) |
| behavior-change (**rules maths**: a formula, table or threshold from the book) | + a RED-first test naming the behavior + a planted-mutation run proving it red — **§1 clause 5 gate** |
| behavior-change (other logic: sheet wiring, chat rendering, UI glue) | + a test where one is reachable from `node`; encouraged, does not block (§1 clause 5) |
| document-shape change (anything writing a `system.*` field, or building an Actor/Item payload) | + `contract` C12 **and** a runtime check that the builder's output matches the schema's names, enums and nested shapes. Resolve enums from `CONFIG` rather than restating them — a literal is free to drift out of the schema, which is exactly how the 2026-07-27 escape happened. |
| artifact-affecting (anything a player clicks) | + **an explicit unverified statement naming the sheet / button / card nobody has observed** — **§1 clause 4 gate**. The change closes; the claim does not. Loading and clicking it is encouraged, not required; re-date the §5 manual rungs whenever it does happen. |
| release (version bump / push) | + full channel map + all §5 specs + manual rungs re-dated + `system.json` version bumped |
| rung-touch (editing `contract.test.mjs`) | + `node test/mutation-probe.mjs` — 11/11, control green |

**Hard gate:** work is not "done" until its class's rungs ran, reported as a rung→result table. A skipped rung means **BLOCKED**, not done. An override is per-instance and never carried forward.

**The manual rungs are load-bearing here.** This project cannot run its real channel headless — Foundry is a browser application. Every artifact-affecting change therefore ends in a hands-on step, and a session that cannot reach one reports BLOCKED rather than done.

---

## §5 Acceptance specs

> **The SET is RATIFIED 2026-07-27** — all three manual specs were put individually and all three were kept — **and EXTENDED 2026-08-01**: four release-level manual specs were added when the 1.0 oracle was ratified (see §1). **The WORDING is still drafted**, not authored: each Given/When/Then below was written from observed behavior or from the ratified oracle. Rewriting them in your own words is still worth more than the drafts are.
>
> **What the manual rows mean after the clause-4 split (2026-07-27):** they are **last-known-verified markers, not obligations**. Nothing is owed on them and no work is parked waiting for them. Their whole job is to make the honesty in clause 4 concrete — when a date here is stale or reads NEVER, that is the specific thing a session is required to name as unobserved. Let them go stale loudly; a stale date is information, not a debt.

### SPEC halve-damage-never-restores-more-than-was-dealt
```
Given a character who takes a hit that would drop them below 0 HP
When they spend a Fate Point to halve that damage
Then their HP is exactly (HP when the hit landed) - (half the damage)
And it is never higher than it was before the hit
Check: test/fate-damage.test.mjs  (tagged  // spec: halve-damage-never-restores-more-than-was-dealt)
Also verified in the live channel 2026-07-28 — see below.
```

### SPEC fusion-chart-matches-the-book
```
Given any two demon clans on the p.82 Normal Fusion Chart
When they are fused
Then the resulting clan is the one printed in the book, in either argument order
Check: test/fusion-chart.test.mjs  (tagged  // spec: fusion-chart-matches-the-book)
```

### SPEC cross-clan-fusion-names-a-demon
```
Given two demons of different clans
When they are fused
Then the result is a named demon from the compendium - the lowest-level member
     of the chart's result clan at or above the fusion level (p.80)
And it is never an exception demon and never a boss-only demon
Check: test/demon-roster.test.mjs  (tagged  // spec: cross-clan-fusion-names-a-demon)
```

### SPEC rank-shift-fusion-names-a-demon
```
Given an Element demon fused with a non-Element demon
When the fusion resolves
Then the result is the demon nearest in level within the non-Element demon's own
     clan - higher on a Rank Up, lower on a Rank Down, per the p.81 table
And a Cursed fusion reverses that direction
Check: test/rank-shift.test.mjs  (tagged  // spec: rank-shift-fusion-names-a-demon)
```

### SPEC affinity-lines-parse-or-are-flagged
```
Given a demon's affinity line as the book prints it ("Repel Light, Null Dark, Strong All")
When a demon is created from its stat block
Then each element gets the affinity the book states, in either the normal
     keyword-first order or the reversed trailing form the Zoa bosses use
And a line that cannot be resolved mechanically is reported, never guessed at
Check: test/affinity-parse.test.mjs  (tagged  // spec: affinity-lines-parse-or-are-flagged)
```

**Magic and Ailment are separate axes and the engine does not have them yet.** p.65 stacks them with the element affinity — a demon weak to Ice *and* Magic *and* Ailments, critically hit by a Mabufu spell that also fumbles its dodge, takes **32×** (2·2·2·2·2). `calculateDamage` applies one multiplier and the schema has no Magic axis, so `createDemonActor` records those two and says so on creation rather than silently dropping them. 20 demons carry a Magic affinity, 30 an Ailment one.

### SPEC created-demons-have-valid-skill-items
```
Given a demon created from an imported stat block
When Foundry validates it
Then every field written matches the schema's own declared names, enum values
     and nested shapes, and the demon keeps all of its skills
Check: test/demon-skills.test.mjs  (tagged  // spec: created-demons-have-valid-skill-items)
```

### SPEC bosses-keep-their-printed-hp
```
Given a demon whose printed HP or MP the level/stat formula does not reproduce
When it is created from its stat block
Then its maximum is the printed number, not the derived one
And no demon the formula does reproduce carries a redundant override
Check: test/boss-hp.test.mjs  (tagged  // spec: bosses-keep-their-printed-hp)
```

### SPEC imported-stat-blocks-are-internally-consistent
```
Given the demon stat blocks imported from the rulebook
When they are checked against the arithmetic the book itself prints
Then every stat TN, substat, resistance, skill total and skill base power
     derives from the values printed beside it
And any block that does not is a recorded book anomaly with the page cited,
     kept exactly as printed rather than corrected
Check: test/corpus-arithmetic.test.mjs  (tagged  // spec: imported-stat-blocks-are-internally-consistent)
```

**Why this exists.** The first four extraction defects were each found by exporting a single actor and reading it — the watermark imported as a skill, boss HP clamped, columns shifted one place right. That does not scale to 194 blocks × ~40 fields. The book prints redundant values, so the corpus can check itself: `total = potency + basePower`, `TN = stat × 5 + level`, `resist = (stat + level) / 2`. A column landing one place right breaks these immediately. The sweep found the boosted-total notation (`115 (77)`) that a fifth read would eventually have caught, and left **12 anomalies out of roughly 7,700 values — 99.85% internally consistent.**

### SPEC a-fiend-learns-its-magatamas-skills
```
Given a fiend with an active Magatama
When its level reaches a level that Magatama teaches a skill at
Then that skill is created on the fiend as a real Item, with the cost,
     power, element, targets and effect the book prints for it
And a skill the 8-skill cap turns away, or that no printing defines,
     is named in chat rather than quietly not appearing
Check: test/skill-learning.test.mjs  (tagged  // spec: a-fiend-learns-its-magatamas-skills)
```

**Why this needed a second import.** A Magatama's skill list is names and levels — it says *when* Hell Thrust arrives, never what Hell Thrust costs or does. The ch4 list (p.97-110) is the only place the book states that for every skill rather than only for the ones some demon happens to know. It is imported as a third data file and merged with the stat blocks, because the two printings are complementary: **ch4 has cost, potency, element and effect but prints no type, target or TN column; the stat blocks print all three.** A name ch4 omits entirely still resolves, because six demons print Makajamaon.

**The plan is a STATE, not a diff.** Everything at or below the current level that is not owned — not "what this level added". `setLevel` writes a level directly, and p.39 lets a fiend swap Magatama out of combat, after which the new one's whole earned progression is owed at once. A previous-vs-current diff silently skips both.

**One skill is defined nowhere and is named rather than papered over:** Jive Talk. Talk skills are a different table with a different schema (a negotiation modifier plus impress and offend types) and are deliberately not imported; Stone Hunt, the other one a Magatama teaches, is recovered from a stat block.

### SPEC magatama-grants-parse-into-the-schema
```
Given the 25 Magatama printed on p.42 and the affinity clause each one is given
     in the p.39-41 prose
When a Magatama Item is built from an imported entry
Then its stat bonuses, acquisition and skill list come through unchanged,
     and every element and category the clause names lands on a field the
     schema declares, under a rating the schema accepts
And a clause the grammar cannot read is reported rather than half-applied
Check: test/magatama-data.test.mjs  (tagged  // spec: magatama-grants-parse-into-the-schema)
```

**Why the grant is parsed at all.** It is the one piece of Magatama data the book states only in prose — the p.42 table carries stats, acquisition and skills, and says nothing about affinities. The parser therefore accepts a **closed vocabulary** and truncates at the first word outside it, which is what keeps Kailash's *"grants not only the Almighty attack spell Megido"* from reading as an affinity grant. Two of the 25 state no grant at all, and the suite pins that count: a third would mean the prose scan lost a paragraph, not that the book gained a plain Magatama.

**It is a second grammar, not a flag on the first.** The stat-block affinity line runs a keyword forward until the next one replaces it; the prose grant puts the keyword first in one clause and **last** in the next (`Null <element> and <element> Weak`), joined by "and" rather than "/". Feeding a grant to `parseAffinityLine` inverts the second clause silently, which is why the suite asserts the two disagree on the same input — the assertion exists so that collapsing them into one function fails loudly.

### SPEC affinity-ratings-stack-across-axes
```
Given a demon with a rating against an element AND against Magic as a category
When it is hit by a magical attack of that element
Then both ratings apply - two Weak ratings quadruple the damage, and the
     highest-priority absolute (Repel > Drain > Null) wins outright
And an Ailment rating changes only the ailment effect rate, never the damage
Check: test/affinity-axes.test.mjs  (tagged  // spec: affinity-ratings-stack-across-axes)
```

**The engine had no Magic axis until 2026-07-27**, so 20 demons fought without their Magic rating and 30 without their Ailment one. p.65 is explicit on both points: the priority order is printed verbatim, and the worked example gives a demon weak to Ice, Magic and Ailments a **32×** effect-rate bonus — 2·2·2 for the ratings, ×2 crit, ×2 dodge fumble. The exception is equally explicit: an Ailment rating *"only ha[s] an effect on the ailment effect rate and do[es] not have any influence on the damage part"*, which the suite asserts directly because folding it into damage is the obvious mistake.

### SPEC fusion-produces-the-real-demon
```
Given a fusion whose result the chart names and the compendium knows
When the fusion resolves
Then the created actor has that demon's printed stats, affinities and own skills
And inherited skills fill only the slots left under the cap of 8, with the
     demon's own skills never displaced (p.80)
Check: test/fusion-statblock.test.mjs  (tagged  // spec: fusion-produces-the-real-demon)
```

**Before this, fusion averaged its ingredients.** A fused Momunofu came out with fabricated stats, no favored stat, and a `9,999,999` HP sentinel — a demon that exists in the book, wearing numbers that are in it nowhere. Averaging was only ever a stand-in for not knowing which demon the fusion produced; once the roster and the compendium both existed, the result could simply *be* the printed demon. `selectInheritedSkills` already took `initialCount`/`initialNames` for exactly this and had never been passed anything but zero.

### SPEC typed-skills-need-a-matching-inherit-trait
```
Given a fusion result demon with printed Inherit Traits
When skills are inherited from the ingredients
Then a skill carrying an inheritance type is only inherited if the result demon
     has that trait, and an untyped skill is never gated (p.80)
Check: test/inherit-traits.test.mjs  (tagged  // spec: typed-skills-need-a-matching-inherit-trait)
```

**Three things had to line up and none of them did.** The importer captured each demon's Inherit Traits and nothing wrote them; a skill's Traits column — which *is* its inheritance type — was dropped on the floor; and `selectInheritedSkills` compared the whole trait string as one value, so a demon printed `"Mouth Eye Lunge Weapon"` matched no typed skill at all. That last one is a defect that could only surface once the other two were fixed, which is why it sat unnoticed: nothing had ever passed the function a real trait list.

### SPEC demon-level-ups-roll-their-stat-growth
```
Given a demon that levels up
When the level-up resolves
Then the system rolls 1d10 on the Demon Stat Growth Table and applies the point
     itself - 1-5 by stat, 6-8 to the favoured stat - because p.34 says a demon
     applies its point randomly rather than choosing
And 9 or 0, or a demon with no favoured stat, hands the point back to the player
Check: test/stat-growth.test.mjs  (tagged  // spec: demon-level-ups-roll-their-stat-growth)
```

**Fiends and humans are deliberately untouched.** The same paragraph says they "may apply this point to any stat they prefer", so nothing is rolled for them — the asymmetry is the rule, not an omission.

### SPEC frozen-combatants-lose-a-turn
```
Given a combatant afflicted with Freeze or Shock
When their turn starts
Then they may attempt a save, and failing it costs them the turn
And only at the start of the turn AFTER that failure do they recover for free (p.66, p.68)
Check: test/ailment-rules.test.mjs  (tagged  // spec: frozen-combatants-lose-a-turn)
```

**The free recovery was firing instead of the save, not after it.** Both ailments were cleared unconditionally at the first turn start, so the save never happened, the failure branch never existed, and their entries in `cannotActAilments` were unreachable code. Freeze and Shock cost their victim nothing.

### SPEC stone-shatters-instead-of-critting
```
Given a petrified combatant
When a Phys element attack strikes them
Then a d100 is rolled and on 30 or under they shatter and die outright
And every element that is not Phys, Force or Almighty deals half damage to them
And they never get a dodge roll (p.66, p.68)
Check: test/ailment-rules.test.mjs  (tagged  // spec: stone-shatters-instead-of-critting)
```

**Stone had been modelled as a forced critical on Phys**, which is the rule Restrain, Freeze and Shock carry — not the one Stone carries. The shatter roll, the halving and the lost dodge were all absent.

### SPEC a-curse-widens-the-auto-fail-band
```
Given a Cursed character
When they make any percentile check
Then their automatic failure range is 86-99 rather than 96-99
And a fumble on any check is what inflicts the Curse in the first place (p.57, p.67)
Check: test/ailment-rules.test.mjs  (tagged  // spec: a-curse-widens-the-auto-fail-band)
```

**Curse was stored, displayed, clearable — and mechanically inert.** Nothing applied it, nothing read it, and `autoFailMin` was a single constant with no cursed branch.

### SPEC the-printed-sample-characters-derive
```
Given each of the eight sample characters printed on p.25-32
When every derived value on its sheet is recomputed from its stats and level
Then stat TNs, HP, MP, both resistances, both base powers, dodge TN, negotiation
     TN, fate points and starting macca all match what the book prints (p.35-36)
And where a sheet disagrees with itself, the figure outvoted by other printed
    figures on the same page is recorded as a slip, never silently adopted
Check: test/sample-characters.test.mjs  (tagged  // spec: the-printed-sample-characters-derive)
```

**Eight independent cross-checks of the arithmetic the whole system rests on, and until 2026-07-29 not one of them had an assertion** — every formula lived inline in `prepareDerivedData`, which no node suite can import. That is the same seam the 2026-06-07 halve-damage escape lived in: covered pure maths on one side, uncovered derived writes on the other. The formulas now live in `helpers/derived.mjs` and `prepareDerivedData` calls them.

### SPEC a-high-tn-buys-repeats-of-the-same-action
```
Given an action whose TN has reached 100% or more
When the actor chooses to multi-action
Then the same action is taken against the same target 2 or 3 times, at the
     original TN divided by the number taken, with the critical value following
     the divided TN (p.59-60)
And the cost is paid for each, an auto-success skill or a negotiation may never
    do it, and failing to pay loses the remaining parts
Check: test/multi-action.test.mjs  (tagged  // spec: a-high-tn-buys-repeats-of-the-same-action)
```

**A TN over 100% is ordinary at this table, not a corner case** — the 2026-07-28 play log shows a save TN of 275 on one demon. This was a rule the system simply never offered. The critical adjustment needs no code of its own: `evaluatePercentile` derives the threshold from whatever TN it is handed, so handing it the divided one *is* the rule. The suite asserts that rather than assuming it, because it is the clause most likely to be quietly lost in a refactor.

**Offered, never taken automatically** — p.59 says "you may choose". Declining is picking one action, and the prompt shows each option's real TN because that is the whole trade.

### SPEC a-counterattack-is-offered-not-taken
```
Given a character holding Counter, Retaliate or Avenge
When a Phys element attack hits them
Then a 50% roll decides whether they are OFFERED one free basic strike back at
     the attacker, which they may decline by ignoring it (p.96)
And that strike deals normal, doubled or tripled DAMAGE by tier, targets only the
    attacker, and cannot itself provoke a counterattack (p.96, p.110)
Check: test/passive-effects.test.mjs  (tagged  // spec: a-counterattack-is-offered-not-taken)
```

**The book is unusually explicit that this is an opportunity, not an obligation** — *"counterattacking is not mandatory... Should your target have Tetrakarn up, for example, you may decline"* — which is why the automation posts a button and stops. Auto-resolving it would be a rules error, not a convenience. Two further clauses are asserted rather than assumed: Attack All never applies to it (p.96), and the free strikes a fumbled flee hands out cannot trigger it (p.70) — the `noCounter` flag carries that and also stops two Counter-holders trading blows forever.

### SPEC printed-passives-have-mechanical-effect
```
Given a passive skill whose name appears in the p.109-110 tables
When it sits on a character sheet
Then it resolves to a registry entry and changes something measurable
And a passive that is NOT implemented resolves to nothing rather than to
    something adjacent, so the gap is visible instead of silently wrong
Check: test/passive-effects.test.mjs  (tagged  // spec: printed-passives-have-mechanical-effect)
```

**Nine entries against roughly twenty-five printed passives.** Nineteen were wired as of 2026-07-28.

🔴 **The paragraph that stood here until 2026-08-15 was STALE IN BOTH DIRECTIONS and had been for weeks.** It named Counter / Retaliate / Avenge and all forty Affinity Changers as unwired. Counter / Retaliate / Avenge landed **2026-07-28** with their own §6 row, and the Affinity Changers are **generated** in `config.mjs` from `SMT.affinityChangeElements` and resolved by `affinityOverrides` — 63 registry keys are live, not 23. The note was written when both were true and nothing re-read it when they stopped being true. *This is the exact failure §1 clause 4 exists to prevent, pointed the other way:* a doc claiming LESS than the code does is still a doc nobody checked, and it is the reason a session picking up "the eight small passives" had to re-derive the list from the registry rather than read it.

**Still genuinely unwired, re-derived from the registry on 2026-08-15 and split by WHY, because "not implemented" was hiding three different situations:**

| Passive | Effect (paraphrased) | Status |
|---|---|---|
| Drain Attack | recovers HP equal to a quarter of damage dealt (p.96) | **WIRED 2026-08-15.** Paid from `hpDealt`, the HP actually lost, so an overkill on a 5 HP target drains 1 — the same distinction the halve-damage escape turned on. Rounds DOWN (`[inferred]`; the book is silent, and rounding a bonus up heals off a 1-damage poke). Scoped to the basic strike, not to physical attacks. |
| Attack All | basic strikes always hit every enemy (p.96) | **WIRED 2026-08-15.** *Always*, so it WIDENS a caller's single target rather than only filling an empty one. p.96's carve-out is checked as `isReaction`: the skill does not extend a counterattack. |
| Item Pro | adds 1d10 to an item power roll (p.96) | **WIRED 2026-08-15.** Its own registry kind, deliberately not `powerDie` — that carries a physical/magical scope and an item is neither, so reusing it would have handed the die to every spell. Asserted from both sides. |
| Luck Smiles | nullifies an attack's effects on the holder, once per scenario (p.96) | **WIRED 2026-08-15.** A button injected onto the pending-attack row, only for holders with budget left. "The EFFECTS" is broader than damage, so it short-circuits the whole row — no dodge, damage, ailment, rider or counter. Budget is the ordinary p.96 ledger; p.110's "may be learned multiple times" is exactly `useBudget`'s `copies`. |
| Mind's Eye | +20% to an awareness check against an ambush (p.96) | **blocked on lane 4** — no ambush or awareness check exists yet |
| Lucky Find | a Luck check for an item off the acquisition table (p.96) | **blocked on lane 4** — the table is not imported |
| Good Instincts | +10% to a check, usually Luck, to notice things (p.96) | **no mechanical surface** — the system has no "notice" action to bonus |
| Once A Snake | learn something useful, once per scenario (p.96) | **no mechanical surface** — pure GM fiat; the use budget is the only automatable part |

The spec's second clause is what keeps the rest honest: an unimplemented passive must resolve to `null`, never to a neighbour. **The four still open are not deferred work items — two are downstream of lane 4 and two have nothing to automate**, and saying so is worth more than a row that reads "todo" forever. Each is asserted `null` by name in `passive-effects.test.mjs`, with Once A Snake carrying an ESCAPE tag: it shares a page and the exact "1/scenario only" wording with Luck Smiles, which makes it the one most likely to be silently absorbed into its neighbour. **Registry as of 2026-08-15: 26 named entries + 40 generated Affinity Changers.**

### SPEC a-cure-skill-cures-instead-of-healing
```
Given a Remedy skill (Patra, Mutudi, Posumudi, Paraladi, Petradi, Prayer)
When it is used on an ally carrying one of the ailments it names
Then that ailment is cleared, and no HP is restored unless the skill also carries potency
And Recarm and Samarecarm revive a downed ally before restoring them,
    while Recarmdra restores every ally in full and then kills the caster (p.100, p.104)
Check: test/recovery-skills.test.mjs  (tagged  // spec: a-cure-skill-cures-instead-of-healing)
```

**`SkillData` had no cure, revive or full-heal field of any kind.** `skillType: "recovery"` meant one thing — roll power, add HP — so ten printed skills did the wrong thing rather than nothing. The machinery existed one file away on `ConsumableData`: a Dis-Poison *item* could cure what the Posumudi *spell* could not.

### SPEC rerolling-into-success-rolls-the-ailment
```
Given a skill whose only effect is an ailment, whose check failed
When a Fate Point rerolls or boosts that check into a success
Then the ailment is rolled against every target, at the doubled rate if the new
     result was a critical (p.59, p.67)
Check: test/ailment-rules.test.mjs  (tagged  // spec: rerolling-into-success-rolls-the-ailment)
```

**Reported from play.** The Fate Point cascade was gated on `hasPowerRoll` — correct for the power roll it was written around, and fatal for every skill whose entire effect is the ailment. Rerolling one into a success did nothing at all.

### SPEC system-loads-cold
```
Given a Foundry world with this system installed
When it is launched from cold
Then the world loads, an actor sheet opens, and no error appears in the console
Check: manual — last verified: 2026-08-02 (v0.1.13)
```

**Re-verified 2026-08-02, twice, from the operator's own console.** Cold load clean on both runs: every template compiled, all three compendiums loaded (`194 stat blocks` / `25 entries` / `248 skills`), zero errors. That load carried the **seven schema fields added on 08-01** — `fractionalHP`, `fractionalPercent`, `fpImmune`, `drainsHP`, `drainsMP`, `killCondition` on skills, and `slot` on gear — plus the new `ammo` consumable type, and existing documents migrated without complaint.

**Re-verified 2026-07-28.** Cold load clean: 194 stat blocks, every template compiled, no errors. That load carried **six schema fields added across 07-27 and 07-28** — `behavior`, `inheritTraits`, `evolvePath`, `categoryAffinities`, `hpMaxOverride`/`mpMaxOverride` — and existing actors migrated without complaint.

**Verified 2026-07-27, and here is exactly what that covers.** The world loads clean on v0.1.12 with the compendium (`194 stat blocks loaded`), actor sheets render, the demon picker opens and creates, and a Thor + Suparna fusion produced a Chimera matching p.140 field for field — stats, favored stat, derived HP/MP, all four affinities, drops, and 7 own skills plus 1 inherited under the cap of 8. That is the importer, compendium, chart, fusion and actor path confirmed end to end in the real channel.

**What it does NOT cover:** no attack has been resolved, so `every-chat-button-fires` and `damage-card-reads-true` below are still NEVER. The halve-damage fix, the Magic/Ailment axes and the combat pipeline they feed remain unobserved — they are asserted, not seen.

### SPEC every-chat-button-fires
```
Given an attack resolved against a target
When Dodge, then Apply Damage, then Halve Damage are clicked
Then each button performs its action and does not silently do nothing
Check: manual — last verified: 2026-07-28 (partial — see below)
```

**Partially verified 2026-07-28, and the partial matters.** Observed firing in a live session: **Dodge** (including a fumble against a critical), **Apply Damage**, **Halve Damage** (spent seven times consecutively on one card), **Fate Reroll**, and **Save** on an ailment. **Still unobserved: Pay Out Rewards**, which is the one that has a standing report against it, and **Boost TN**. Treat this row as green for the combat pipeline and NEVER for the reward tracker.

**Two different checks live here, and the second is the real one.** C7–C8 assert the *proxy* — every action has a handler, every flag read has a writer. The channel this spec names is a person clicking a button in a live game. **A green suite does not make this row pass.**

### SPEC damage-card-reads-true
```
Given any damage or halve-damage chat card
When a player reads it
Then the numbers on the card match what actually happened to the target's HP
Check: manual — last verified: NEVER
```

**Why this is its own row.** The 2026-06-07 escape was reported *from the card* — the symptom was HP moving wrongly, not a stack trace. The card is the only surface most defects in this system ever present on, and nothing checks that it agrees with the sheet.

### SPEC limited-skills-run-out-and-focus-doubles-once

*(Added 2026-08-05.)*
```
Given a skill whose printed text states a use limit, and a stored Focus
When the skill is used more times than its limit allows, and when a
     physical or magical action follows the Focus
Then the over-limit use is refused before any cost is spent, the budget
     returns at its own boundary and at no other, and the Focus doubles a
     physical attack's total power exactly once
And a skill stating no limit is never limited, a scenario budget never
     resets automatically, and a spell neither gains nor consumes the Focus
Check: test/uses-focus.test.mjs  (tagged  // spec: limited-skills-run-out-and-focus-doubles-once)
```

**p.96 hands the tracking to the player** — *"Players with these skills are responsible for keeping track of when to use such skills, and how many uses they have remaining."* Clause 2 says otherwise, so the ledger is kept for them. **The whole rule is the reset boundary:** a new round retires round budgets (p.96's boss skills — Icy Death may not go twice back to back), ending a combat retires round *and* combat because a combat contains rounds, and a scenario budget survives both. Nothing but the GM knows when a scenario ended, so that one is a button and says so.

**Focus's trap is that it resembles Concentrate.** Both are setup actions bought with an action, and both were written on adjacent pages — but Concentrate adds +20% to the hit CHECK and Focus multiplies the POWER after the roll and after the critical. Folding it into `consumeSetupBonuses`, which is where it would naturally have gone, would have made it +20% to hit and no extra damage at all. Two ESCAPE assertions hold the seam: a spell gains nothing from a stored Focus, and — the sharper one — a spell does not *consume* it either, so the doubling waits for the strike it was printed for.

### SPEC encounter-groups-honour-the-printed-composition-rules

*(Added 2026-08-16. Lane 4, fourth unit — and the one that closes the lane.)*
```
Given p.291's two random-encounter groups and a candidate demon list
When a group is built for a party
Then both groups hold a number of demons equal to the PCs; the weak group
     is the SAME demon repeated; and the mixed group admits no healer, no
     debuffer, and at most one buffer
And the clauses the page states as intentions rather than rules — "roughly
    3 rounds", "4-5 rounds", "just strong enough not to be obliterated" —
    encode NO round target and NO level band
Check: test/encounter-builder.test.mjs  (tagged  // spec: encounter-groups-honour-the-printed-composition-rules)
```

**There is no random-encounter table in this book, and finding that out is most of the unit.** The lane item read "random encounter tables", which implies tables to transcribe. p.291 is GM design advice. The two other places that touch the subject both modify a rate the book never prints — Full makes encounters *"far more likely"* (p.55), and a 150-macca item doubles *"the random encounter rate"* (p.108) — against no stated base. **Nothing here rolls for whether an encounter happens**; `kagutsuchi.mjs` reports the p.301 trigger and leaves the consequence to the GM. This module is only about what shows up once they decide, which is the part p.291 actually specifies.

**The line the suite defends is between clauses that are rules and clauses that are intentions.** Group size, the healer/debuffer exclusion and the one-buffer cap are checkable and enforced. *"Fun to fight"*, *"roughly 3 rounds"*, *"4-5 rounds"* and *"just strong enough not to be obliterated"* are round-count intentions with no formula behind them, and a level band invented to hit them would read exactly as authoritative as a printed one — the same withheld-number trap as Full's encounter rate, and the third time this arc has hit it. The suite asserts the **absence**: no round count and no level reference survives in the source outside comments, and `CONFIG.SMT.encounterBuilder` carries exactly one key.

**Three clauses a generic "pick N demons" would silently drop.** *"IDENTICAL, weak demons"* — the weak group is one demon repeated, not N draws. The healer/debuffer exclusion is printed **for group two only**, so applying it to both would quietly narrow the page, and the weak group is asserted to permit healers. And the buffer cap is a property of the GROUP, not of eligibility — a buffer is eligible, a *second* one is refused, which is why an all-buffer pool yields **one** demon rather than four: the size clause is a target and the buffer clause is a prohibition.

**Role detection reads `SMT.buffs` rather than skill-name suffixes,** because p.96 already treats differently-named skills sharing an axis as the same effect and that registry already encodes it. Fog Breath and War Cry are debuffers; a suffix match would miss both. Asserted directly, along with the fact that both signs in the registry are reachable so neither half of the split is dead.

**One `[inferred]`:** *"a mixture of weaknesses and attack methods"* is real guidance with no threshold, so it is a preference that reorders picks across two passes and never blocks filling the group. A hard distinctness filter returns a short group on a uniform candidate pool — a worse failure than a samey encounter, and one the GM cannot see. Both halves are asserted: a uniform pool still fills, and a varied pool still varies.

### SPEC fleeing-succeeds-unless-somebody-stops-it

*(Added 2026-08-15. Lane 4, third unit.)*
```
Given a PC attempting to escape a non-Boss encounter (p.70)
When nobody among the opposing combatants moves to block
Then the escape is AUTOMATIC — no check, no TN, no bonus
And when somebody does block, it costs a dodge check at +20% if the
    fleeing side outnumbers the other; a critical takes one ally out
    alongside; a fumble hands every enemy a free basic strike that
    cannot trigger Counter; and a side emptied by fleeing ends combat
Check: test/flee.test.mjs  (tagged  // spec: fleeing-succeeds-unless-somebody-stops-it)
```

**The default is success, not a roll, and that is the whole shape of the unit.** *"If no combatant chooses to block the attempt, then fleeing is automatically successful."* A check exists only because somebody chose to stop it. Every other escape-shaped rule in this system rolls for it, so "prompt for a dodge check on every flee" is what gets built by reflex — and it invents a failure mode the book does not have. `automatic` is the first thing `fleePlan` answers, and it returns **before** any TN or bonus is computed, so the automatic path cannot acquire a roll by accident; the suite asserts the early return by source as well as by value.

**Whether anyone blocks is asked, never derived.** p.70 hands that decision to the opposing combatants — *"opposing combatants may decide whether they wish to block"* — and nothing in the system can read their intent. Defaulting either way would be answering for them, so the flow opens with a dialog and a dismissed dialog attempts nothing at all.

**Three clauses that a natural implementation gets wrong.** The +20% is scoped to the blocked branch (*"when this happens"* refers to the dodge check), so reading it as a general flee bonus leaves dead arithmetic on the automatic path. **Equal numbers is not "more"** — the off-by-one that hands a bonus to a fair fight. And an ordinary **failure** hands out no free strikes: only a fumble does, and conflating the two punishes every missed escape.

**The fumble's free strikes are the second carve-out `a-counterattack-is-offered-not-taken` names,** and they reuse the same `isReaction` path the counterattack does — which already carries `noCounter`, pays none of the per-action costs, and cannot multi-action. p.70's *"These attacks cannot trigger the Counter skill"* would otherwise let two Counter-holders trade blows off one fumbled escape.

**One `[inferred]`:** the book does not say whether the escapee counts among the "friendly combatants" being compared. They are counted — they are a combatant on that side and the sentence draws no distinction.

### SPEC the-kagutsuchi-track-wraps-and-full-changes-the-rules

*(Added 2026-08-15. Lane 4, second unit.)*
```
Given the 16-phase Kagutsuchi Chart (p.55, p.56, p.301), phase 0 New and
      phase 8 Full
When the track advances — a step per scene, a step per combat completed
Then it wraps through 15 back to 0, and EACH crossing of New owes its own
     p.301 Luck check: all PCs failing, or any one auto-failing or
     fumbling, means an encounter, while a critical is a boon
And at Full the printed consequences hold — demons will not normally
    negotiate, encounters are likelier, sacrificial fusion opens — with
    no invented rate for "likelier" and no hard block on talking
Check: test/kagutsuchi.test.mjs  (tagged  // spec: the-kagutsuchi-track-wraps-and-full-changes-the-rules)
```

**"Passing New" is not "landing on New", and a boolean cannot express it.** Starting *at* phase 0 and stepping off does not pass it; landing on it does; and a 16-step move passes it once while a 32-step move passes it **twice** and owes two checks. `newPassings` therefore returns a count, and the suite sweeps the whole wheel to assert exactly one phase steps onto New. A `phase === 0` test after the advance gets the step-off-New case backwards and silently drops the second passing of a long skip — both invisible at the table, since a check that never ran looks like a check that came up quiet.

**Two places where the book withholds a number and none is invented.** *"Random encounter chances are higher"* states no rate, so `encountersHeightened` returns a **condition** — a fabricated multiplier would read exactly as authoritative as a printed one, and the ESCAPE assertion pins the signature to stop a later session filling the gap. Likewise the passing-New check **reports** rather than resolves: p.301 says *"the party encounters enemy demons"* and *"something beneficial happens"*, neither of which is stated in terms any system could carry out, so the rolls are automated and the consequence is the GM's.

**Full does NOT hard-block negotiation, and that is the correct reading rather than a shortcut.** p.301 says demons *"won't engage in negotiations"*, but p.69 lists Full among the situations where a PC cannot choose to talk **and hands the GM an override in the same sentence**, while p.72 states that a sudden approach *"may even happen when Kagutsuchi is full"*. A hard block would break a case the book explicitly permits, so it stays out of `negotiationBlockReason` — which holds the stoppers the engine can decide — and surfaces as an advisory instead.

**One `[inferred]`, reported rather than resolved:** when one PC crits and another fumbles on the same passing, both printed triggers are literally met. The book's *"instead"* reads naturally for one thing happening and says nothing about the collision, so `newPassOutcome` returns both flags. Collapsing them would decide a case the text leaves open, and deciding it wrongly is invisible.

**Scope, stated rather than implied:** the per-**combat** step is automated (a world setting, on by default); the per-**scene** step is not. p.55 makes a scene *"a unit of measurement all their own"* with no relation to elapsed time, and Foundry's canvas scenes are not that — advancing on a scene change would move the track every time the GM opened a map.

### SPEC the-encounter-check-is-the-partys-roll-not-a-characters

*(Added 2026-08-15. Lane 4, first unit.)*
```
Given a party making the p.70 encounter check, each PC rolling Luck
When their outcomes are totalled and read against the printed table
Then the SUM decides the situation for both sides at once — +5 or more
     the PCs back attack, +3/+4 they ambush, 0 to +2 nothing, -3 to -1
     they are ambushed, -4 or less they are back attacked
And the aggressor gains +1d10 initiative either way; an ambushed side
    is defenseless through round one until it acts; a back-attacked
    side instead sets initiative from Agility alone and takes a Shock
    that ignores any affinity that would nullify it
Check: test/encounter.test.mjs  (tagged  // spec: the-encounter-check-is-the-partys-roll-not-a-characters)
```

**This is the only check in the system whose result belongs to a group, and that is the whole shape of the unit.** One PC critting ambushes nobody — `+2` is "no particular advantage". Five PCs each scraping a bare success reaches `+5` and back attacks. Writing it per-character and combining afterwards is how a single crit gets applied five times, so `encounterSum` is its own function and `encounterEffect` takes a sum rather than a roll. Both cases are asserted directly.

**The band table gets an exhaustive integer sweep, not five hand-picked rows.** A hand-typed range table fails two ways and neither is visible by reading it: a *hole*, where no band matches and the result silently degrades to "no advantage" while looking legitimate, and an *overlap*, where two match and the winner is decided by table order that reads as intentional. The suite walks every integer from −20 to +20 and asserts exactly one band claims each. The two fence-posts the printed table makes easy to get wrong — +4/+5 and −3/−4 — are pinned on top of that.

**Ambush and back attack are one axis with two magnitudes, because p.71 says so:** a back attack is *"an ambush executed with flawless efficiency"*. Both hand the aggressor +1d10 initiative; they differ only in what lands on the victim. Modelling them as four unrelated outcomes is how the shared clause drifts, so the effect carries a `side` and a `severity` instead.

**Two clauses that a natural implementation would get wrong in opposite directions.** The back-attacked side's initiative is *"equal to their Agility alone"* — that removes the effect roll rather than penalising it, so it **replaces** the formula and the suite asserts no die survives in it. And the back-attacked side is **not** also defenseless: p.71 gives the ambushed side that and the back-attacked side Shock, so stacking both would double a penalty the book states once. The Shock itself *"ignores any affinity ratings that would nullify it"*, which is why it returns a shape rather than a boolean — through the ordinary ailment path a Null Nerve demon would shrug off the defining effect of being back attacked.

**One `[inferred]`:** both sides preparing an ambush is not printed. The two modifiers net to zero, which is the only reading that keeps the ±20% a property of the situation rather than of whichever side the GM happened to mention first.

**Wired 2026-08-15, same session.** A GM-only combat-tracker control beside Pay Out Rewards, deliberately not a `combatStart` hook — p.70 gives the GM *"the say on whether or not to make an encounter check"*, so firing it IS the decision, and the suite asserts the absence of an auto-fire. Shift-click declares the PCs lying in wait, alt-click the demon side; modifier keys rather than a dialog, because the common answer is neither and a prompt on every check costs three clicks to say so. `runEncounterCheck` and `applyEncounterEffect` are separate entry points and the roll path calls the applier, so a GM who *"simply declares a result"* reaches identical code — asserted, after the first version of that assertion matched the function's own signature instead of the call.

**Side is decided by OWNERSHIP, not token disposition,** and that is a correctness point rather than a style one: a friendly NPC demon fighting alongside the party shares its disposition, and p.70 says *"all PCs"*. Reading disposition would roll an NPC into the party's total and shift the band. The suite bans the property access outright.

**`defenseless` needed a reading before it could be code.** Taken literally p.71 is circular — you are defenseless *"right up until they act for the first time"*, and *"while defenseless, characters cannot take any actions"*, so it would never end. It is implemented as ending when the character's first turn ARRIVES, cleared in the same turn-start hook as Defend. That is also the only reading where the rule does what it is for: being ambushed means the enemy acts before you can respond, so what it actually costs you is the dodge against everything landing before your turn. Nothing else could have happened in that window anyway.

### SPEC one-off-printed-skills-do-what-their-sentence-says

*(Added 2026-08-15.)*
```
Given Deadly Fury (p.108), Pinhole (p.106), Analyze (p.102) and God's
      Curse (p.103) — four skills whose text names a mechanic nothing
      else in the system has
When each is used
Then Deadly Fury crits at a fifth of the TN and does NOT compound with
     Might; Pinhole halves both the target's resistance AND their dodge
     TN for that attack only; Analyze contests a power roll plus the
     user's level against the target's level and refuses bosses
     outright; and God's Curse rolls one d10 to pick which of five
     ailments the cast inflicts
And none of the four leaks onto a skill that did not print its sentence
Check: test/named-skills.test.mjs  (tagged  // spec: one-off-printed-skills-do-what-their-sentence-says)
```

**Matched on the printed sentence, not the skill name, and not generalised into a shared rider.** Each of these rules is stated for exactly one skill in the book. A rider abstracted from a sample size of one is a rule that eventually fires on a skill that never printed it, so `attackRiders` reads the sentence — a homebrew skill copying the wording gets the mechanic, a rename does not lose it, and the final block of the suite asserts that an ordinary "20% chance to inflict Freeze" picks up none of the four.

**Deadly Fury's non-stacking clause is why the crit rate is a divisor rather than a boolean.** *"Treat critical rate as 20% (1/5th) of the TN. Does not stack with Might."* Might widens the band exactly the same way, so two effects that each say "a fifth" must produce a fifth and not a twenty-fifth — an OR over a shared divisor gets that for free, where multiplying two modifiers would not. The suite also proves the band actually moves an outcome (a 9 against TN 50 is an ordinary success at a tenth and a critical at a fifth), because a divisor nothing reads is decoration.

**Pinhole is two flags, deliberately.** The printed sentence names resistance *and* dodge, and the two are consumed at different points in `resolveAttack` — the dodge TN before the roll, the resistance inside `applyDamage`. One flag would have to be interpreted twice, and halving only one of them is the likely half-fix, which is what the paired assertion pins. Both are per-attack arguments and neither is ever stored: *"for this attack"* is in the text.

**Analyze is not a hit check, and the boss clause is absolute.** p.15's worked example calls it *"an auto-success skill, so no check is needed"*; the contest is the POWER roll plus the user's level against the target's level, with *"equal to or higher"* read inclusively. Treating it as a percentile check would gate the skill on a stat it never names. A boss returns `blocked` rather than a hard threshold — an ESCAPE assertion, because reporting failure-by-roll against a boss would imply a better roll could read a statblock the book withholds. On success the GM is shown the sheet rather than the player being granted ownership: read access is what the skill buys, and an ownership grant would outlive the scene.

**God's Curse is two rolls doing two jobs.** The d10 picks *which* ailment; the printed 60% stays on `ailment.rate` and resolves through `resolveAilment` as normal, so affinity, crit and dodge-fumble modifiers all still apply. Folding the d10 into the rate would make the ailment certain and its identity a coin flip. One roll serves the whole cast, not one per target — the sentence names a single d10, and rolling per target would spray five different ailments off one "all targets" skill. The table is swept across all ten faces in both directions: every face maps to an ailment, and all five printed ailments are reachable with none doubled in by a bad range.

### SPEC a-fumbled-attack-lands-on-your-own-side

*(Added 2026-08-15.)*
```
Given the p.58 Fumble Effect Chart and its p.64 elaboration of the hit row
When an attack's hit check fumbles
Then the attack still rolls power and lands on the attacker's OWN side: one
     victim drawn at random from the attacker and their allies, or — when the
     attack targeted "all" — every ally and the attacker together
And dodge eligibility is per victim, so an ally may dodge as normal and the
    attacker may not; the hit is not a critical; and it can provoke no
    counterattack
Check: test/fumble-chart.test.mjs  (tagged  // spec: a-fumbled-attack-lands-on-your-own-side)
```

**This row was doing nothing, and it is the row that fires most often.** `SMTItem#use` branched on `isSuccess` three separate times and on `isFumble` not once, so every fumbled attack in the game produced a chat card reading "Fumble", applied the Curse, and stopped. Not wrong maths — absent maths, which is the §1 clause-2 case: the GM was left to hand-resolve the single most common bad outcome in the system. The suite's wiring assertion is deliberately blunt about it (`use` reads `isFumble` **at all**), because the defect was a missing branch rather than a wrong one and nothing subtler would have caught it.

**Dodge eligibility is per victim, and that is why one fumbled attack posts two cards.** p.64: *"When hitting an ally, that ally may avoid the attack with a dodge check as normal, but an attacker cannot avoid hitting themselves."* A single `skipDodge` on the attack would have to pick one rule and be wrong for the other half of the victims, so `noDodge` became a property of the CARD — the allies' card renders the Dodge button, the attacker's does not, and `resolveAttack` honours the flag regardless of which button was clicked.

**Three clauses asserted because each is a plausible wrong answer.** An "all" fumble is not rolled for — every pick returns the same victim list, so a stray die cannot turn a party-wide backfire into a single hit. A lone attacker with no allies always hits themselves, because *"themselves or an ally"* with an empty ally list is a pool of one rather than a fumble that fizzles. And power is still rolled — p.58 says so in as many words (*"Even if you fumble, there are times when you may still need to determine power"*) — but without the critical flag and without spending a stored Focus, since a fumble is not a critical and burning the Focus would punish the mistake twice.

**Two of the chart's five rows were already engine behaviour and are pinned here rather than re-implemented:** the dodge row is `dodgeFumble` in the damage helper, the save row is `fumbledSaveResources`. The remaining two — negotiation's *"combat ensues"* and *"the GM is free to determine what"* — resolve to a stated prompt and are marked `automated: false`, which is the chart being honest about which rows belong to a person.

### SPEC barriers-grant-affinity-that-runs-out

*(Added 2026-08-15.)*
```
Given the p.101 barriers — Tetraja, Makarakarn, Tetrakarn — cast on all allies
When an ally is hit while one is up
Then the granted rating applies through p.65's ladder, so it can improve a
     rating and can never downgrade a printed one; Makarakarn lands on the
     MAGIC CATEGORY axis and Tetrakarn on the phys element, as printed
And each expires on its own printed clock: the -karn pair at the end of the
    round after the cast whether or not anything hit them, and Tetraja only
    when THIS effect nullifies an attack — never when the ally's own Null or
    Repel is what stopped it
Check: test/barriers.test.mjs  (tagged  // spec: barriers-grant-affinity-that-runs-out)
```

**Two clocks that a single `duration` field would have to lie about.** Makarakarn and Tetrakarn say *"until the end of the next round"* and run out on time. Tetraja names no duration at all and runs out on use — it can sit through an entire fight untouched, then vanish the instant it works. A barrier therefore carries both fields and each kind leaves the other inert (`expiresAfterRound: null`, or `charges: 0`), which is why the suite asserts the *absence* of a round clock on Tetraja as an ESCAPE: inventing one would expire a barrier the book keeps alive.

**"Repel Magic" and "Repel Phys" are not the same kind of thing, and the stat blocks print them as if they were.** p.65 makes Magic an attack CATEGORY that stacks on top of the element rating, so Makarakarn writes to `categoryAffinities.magic` while Tetrakarn writes to `affinities.phys`. Reading Makarakarn per-element would leave it doing nothing against every magical attack whose element it did not happen to name — a 45 MP spell that silently buys nothing, which is exactly the failure mode the ESCAPE assertion on the category axis pins.

**The consumption rule needed a snapshot the engine did not keep.** p.101 spends Tetraja *"after this effect nullifies one attack"*, and at the damage site a target wearing Tetraja and a target who prints Null Light are indistinguishable — both read `null`. Derived data now keeps `baseAffinities`, the pre-barrier ratings, so the pipeline can ask whether the barrier was load-bearing. Three cases are asserted from both directions: a normal or weak target spends the charge, an already-Null target does not (theirs nullified it), and an already-Repel target does not (p.65's ladder means the hit was reflected, not nullified, so the barrier never applied).

**Whether a barrier outlives its fight is a homebrew toggle, and the reason it is a toggle is that the book is silent rather than clear.** Makarakarn and Tetrakarn have a round clock; Tetraja has none at all, so a Tetraja raised outside a round has no printed way to end and, read literally, carries a free nullify into every later fight forever. Clearing at combat end resolves that silence conservatively — but buffs deliberately persist, so it IS an inconsistency, and one the operator should own rather than inherit. `barriersPersistAfterCombat` defaults **off** (clear), and the suite asserts the default as an ESCAPE: flipping it is a house rule, not a bug fix. *(Operator ruling 2026-08-15: make it an option, default to the clearing behaviour.)*

**One decision recorded against the relay rather than for it.** Raising a barrier on another player's actor is a cross-permission write, so it routes through the GM proxy — but the payload carries no `round`. Carrying the caster's round would be marginally more faithful to "the clock starts at the cast", and it would have meant widening `RELAY_ACTIONS`' key allowlist, which is the constraint that module exists to hold. The window it closes is milliseconds wide; the allowlist is permanent. The GM re-reads the round like it re-reads every other number.

### SPEC press-skills-buy-actions-not-checks

*(Added 2026-08-15.)*
```
Given the p.63 action budget — one action per turn, two with the boss trait —
      and the p.96 press skills Beast Eye and Dragon Eye
When a combatant declares actions during their turn, and when a press skill
     is used
Then each declared action costs exactly one, whatever number of checks a
     multi-action buys with it; the press skill costs its own action and
     grants the printed gross figure, leaving Beast Eye's holder one more
     action than they started with and Dragon Eye's three more
And the budget refuses a further action before any use, cost or Poison tick
    is spent; it resets on the turn it is keyed to rather than on a hook
    firing; and outside a combat turn it refuses nothing at all
Check: test/action-budget.test.mjs  (tagged  // spec: press-skills-buy-actions-not-checks)
```

**The collision this spec exists to keep apart is press skills against multi-action, which occupy the same sentence in a player's head and different axes in the book.** p.59-60 lets a 100%+ TN "perform the same action two or three times consecutively in the same turn" — same skill, same target, TN divided. That is two or three CHECKS bought with ONE action. p.96 lets a press skill buy ACTIONS, each free to be a different skill against a different target and each free to be its own multi-action. Wiring the grant into `multiActionPlan`, or charging a three-part multi-action three actions, would be wrong in both directions simultaneously, and the assertions cross the two deliberately: a 210% TN is three checks *and* one action spent.

**One rule here is stamped from prose that no skill row carries.** Neither Beast Eye's nor Dragon Eye's printed effect says "once per round" — the limit is in p.96's boss-skill paragraph (*"using Dragon Eye in succession to gain unlimited actions just wouldn't be fair"*) and restated as a rule in the GM chapter (*"skills that grant additional actions, like Dragon Eye, should be limited to being used once per turn"*). `attackRiders` stamps a round limit whenever it reads a grant, because nothing downstream reads chapter prose and an unlimited press skill is an infinite turn. A limit the row *does* state still wins; the stamp only fills a gap.

**The budget fails OPEN and that is a decision, not an oversight.** The ledger carries its own `<round>:<turn>` key and anything stamped for an earlier turn reads as a full budget, so a dropped `updateCombat`, a mid-fight reload, or an actor dragged into a combat already running all leave the combatant able to act. The asymmetry is the argument: a GM can see someone acting twice and cannot see someone silently forbidden to act at all. The same reasoning makes the out-of-combat case untracked rather than zero — p.63's economy exists inside a turn, so nothing outside one may be refused for lack of an action.

### SPEC attack-effect-riders-resolve-as-printed

*(Added 2026-08-01.)*

```
Given the printed attack riders of p.98 and p.102-103 — fractional HP,
      fate-point immunity, HP/MP drains, and ailment-conditional kills
When a skill carrying one is imported, its check is made, and its pending
     attack resolves
Then the rider does exactly what its sentence says: the fraction reads the
     target's current HP and rounding never kills; the halve button is
     neither offered nor honored where the book forbids it; the caster
     recovers what the target actually lost; and a conditional kill fires
     only on the pre-hit ailment it names
And a rider is carried as itself — Zan's kill-on-Stoned never degrades
     into an unconditional death ailment, and Sol Niger, which the book
     prints bare, gains no fate immunity nobody wrote
Check: test/attack-effects.test.mjs  (tagged  // spec: attack-effect-riders-resolve-as-printed)
```

**The two dishonesty modes this spec pins.** A rider parsed *almost* right is worse than one not parsed: an unguarded read of "50% chance to Instant Kill a Stoned target" produces a skill that kills anyone half the time, and an over-eager immunity list (the earlier working notes had Sol Niger FP-immune; the book prints it bare) quietly widens a rule the operator never wrote. Both directions are ESCAPE-tagged assertions, and both were planted red: dropping the ailment-suppression guard reds 5, removing the immunity gate reds 1, flipping the survivor rounding to floor — which would let "reduced to half" kill a 1-HP target — reds 3.

**Interactions recorded as inferred, not decided silently:** the affinity absolutes still gate a fractional hit (Null Light stops Thunderclap; nothing reflects off a Repel because there is no power), while weak/strong and resistance do not scale a fraction; and rounding resolves in the target's favor. The book states none of this; each carries an `[inferred]` comment at the code site.

### SPEC relayed-payloads-carry-ids-only

*(Added 2026-08-01 with the remote-play relay.)*

```
Given a player client relaying a combat action to the active GM
When the socket payload is built and when the GM-side handler receives it
Then the payload carries only message ids, token uuids, enum keys and a row
     index — never a damage, power, HP or rate value — and the handler
     re-reads every number from the flags and documents it already trusts
And a payload with a smuggled extra field, a wrong type, or an unknown
     action is rejected before any handler runs
Check: test/socket-relay.test.mjs  (tagged  // spec: relayed-payloads-carry-ids-only)
```

**Why this is the load-bearing rule of the relay.** Chat flags are already treated as author-forgeable — the `_sanitize*` helpers exist because of it. A socket message is MORE forgeable: any client can emit anything on the system channel. The design answer is that the wire carries no numbers at all: a relayed action is "press button N on message M", and the executing GM client derives every value the same way it would have derived it locally. A forged payload can at worst press a button that exists — and the registry/validator reject even that unless the shape is exact. The suite also pins the exactly-one-executor guard (`activeGM?.isSelf`), which is what keeps two connected GMs from double-applying damage.

**What no node rung covers:** the actual two-client exchange. §2's socket-relay row is manual-only; nothing here has ever run with a second connected client.

### SPEC browser-parse-matches-the-cli-parse

*(Added 2026-08-01.)*
```
Given the word lists the CLI importer extracted from the operator's PDF
When the in-Foundry parsers consume those exact words
Then every field of every record is byte-identical to the CLI importer's
     verified output — 194 demons, 25 Magatama with their prose-stated
     affinity grants, 248 ch4 skill rows, and the 48 price-list items plus
     20 gear entries — and the ported verifiers return zero errors and the
     same as-printed warnings
Check: test/importer-parity.test.mjs  (tagged  // spec: browser-parse-matches-the-cli-parse)
```

**What this covers and what it does not.** The in-Foundry importer is a port of `tools/import-rulebook.py`, and this rung holds the two parsers equal over the SAME extracted words — proven red-capable by planting a one-window geometry shift (172 assertions red) and a halved label band (16 red). **It does not cover the extraction layer**: in the browser, words come from pdf.js rather than PyMuPDF, and the engines tokenize differently. That layer is gated at runtime instead — the importer refuses to write anything unless the ported verifier (counts, per-demon completeness, four page anchors) passes over what pdf.js produced.

### SPEC the-ten-minute-path

*(Added 2026-08-01 — 1.0 release spec.)*
```
Given a fresh Foundry install, this system installed from its manifest URL,
      and a user who owns the rulebook PDF
When they point the in-Foundry importer at their PDF
Then within ten minutes of first launch they drag a demon from a compendium
     onto a scene and it is a working actor — without leaving Foundry,
     without a CLI, without reading anything but the screen
Check: manual — last verified: 2026-08-02 (v0.1.13) — PARTIAL, see below
```

**Walked 2026-08-02, and the partial is the honest half.** The operator opened the importer from the Settings menu, pointed it at his own PDF, and it built four world compendiums — SMT Demons (194), SMT Magatama (25), SMT Skills (293), SMT Gear & Items (68) — after which Black Frost dragged onto a scene as a working actor whose exported JSON matched the printed page field for field. Never left Foundry; no CLI; the only reading was the app's own report. **Three honest qualifications.** (1) Not a *fresh install* — an existing dev world with the system already present, so first-launch discoverability is untested. (2) The **first attempt refused** on a real extraction defect (§6, baseline-vs-top) and the second succeeded; ten minutes covers the working path only. (3) The walk that succeeded was the operator's own, on the machine the parser was written against — the PDF-variance rabbit hole in `ATTACK.md` is untouched by it.

### SPEC a-fresh-world-signposts-the-importer

*(Added 2026-08-04.)*
```
Given a world with this system installed and nothing imported
When a GM launches it
Then the four compendiums already exist, named and empty; the GM is told
     once, with a button that opens the importer; and opening an empty
     pack says how to fill it
And nobody is told twice, a player is never told, a world that already
     holds data is never told, and a first import over the empty packs
     does not ask to replace anything
Check: test/onboarding.test.mjs  (tagged  // spec: a-fresh-world-signposts-the-importer)
```

**This is the code behind a promise the spec below had already made.** `the-no-pdf-path-degrades-cleanly` said the first launch points at the importer unprompted; nothing did. A stranger installing v0.1.13 saw an empty sidebar with no way to know the importer existed — premortem #8's bounce, verbatim.

**⚑ One clause of the older spec cannot be satisfied as written, and is recorded rather than quietly dropped:** *"every empty compendium states how to fill it."* Foundry's pack metadata schema has **no description field** — v14's `packs` accepts `name`/`label`/`banner`/`path`/`type`/`system`/`ownership`/`flags` and nothing else — so the guidance cannot live on the pack. It fires on `renderCompendium` instead, which lands it at the moment the confusion actually happens.

**The sharp edge is the interaction with re-import.** Creating the packs empty at launch would otherwise make every first-time import open with a destructive-sounding "replace all four?" dialog about nothing. `packsWithContent` is the one predicate both paths share: empty packs are not content, a populated pack always is, and the suite ESCAPE-tags both directions.

### SPEC the-no-pdf-path-degrades-cleanly

*(Added 2026-08-01 — 1.0 release spec.)*
```
Given this system installed and no PDF supplied
When a user builds actors by hand and plays
Then sheets, rolls, combat and every automated rule work on raw rules alone,
     the first launch points at the importer unprompted, and every empty
     compendium states how to fill it
Check: manual — last verified: NEVER
```

### SPEC every-drag-lands

*(Added 2026-08-01 — 1.0 release spec.)*
```
Given imported world compendiums
When a demon is dragged to a scene, a skill to a sheet, a magatama to a
     fiend, and gear to a human
Then each produces a working document — stats land, the skill is usable,
     the magatama equips, the gear applies its bonuses
Check: manual — last verified: 2026-08-02 (v0.1.13) — PARTIAL, see below
```

**Two of four legs verified 2026-08-02.** **Demon → scene: PASSES**, and hardest — Black Frost's exported JSON was read field by field against the printed page: stats, TNs, the HP/MP max-overrides beating the derived formula, all five affinity ratings plus the Ailment category axis, macca, EXP, the drop line, and four skills with their riders. **Magatama → fiend: the drop lands**, but activating it was blocked until the same day's invisible-control fix (§6) and **the post-fix activation is unconfirmed** — so whether the stat bonuses and affinity grant actually apply is still unobserved. **Skill → sheet and gear → human: NEVER.** This row stays PARTIAL until all four legs are walked.

### SPEC instant-table-patient-import

*(Added 2026-08-01 — 1.0 release spec.)*
```
Given a live session
When any in-session interaction runs (open a sheet, roll, apply damage,
     drag from a compendium)
Then it reads as instant with no visible hang and nothing crashes; and when
     the importer runs, it may take minutes but shows live progress and
     never freezes the client
Check: manual — last verified: 2026-08-02 (v0.1.13) — import half only
```

**The import half holds; the table half is untested.** Three full imports ran on 08-02 — 130 pages extracted, four packs written, ~535 documents created — with a live progress bar, no freeze, and no crash reported across two cold loads. Chrome logged two `[Violation] wheel handler delayed 146ms` warnings during the run, which is a busy main thread rather than a hang, and is recorded here rather than dismissed. **The in-session half of this spec — "any interaction reads as instant" — has never been measured**, because no combat has been resolved since it was written.

*("nothing crashes" added 2026-08-01 from the premortem ruling — "no crashs, no freezing" — which otherwise re-ratified §1 clause 3 verbatim.)*
```

---

## §6 Escape log

> **This section is load-bearing as of the 2026-07-27 clause-4 split.** Upfront hands-on verification is aspirational, so **play is the primary discovery channel** and this log is the mechanism that keeps that from being a hole. The obligation is on the session, not on the reporter:
>
> **A bug reported from play is not fixed until the same session has shipped (a) the fix, (b) a rung that fails on the pre-fix behavior, and (c) a row here.** A fix without a rung means the class stays open and the next instance is discovered the same expensive way. Report bugs however is convenient — a sentence is enough; reconstructing the mechanism is the session's job, not the reporter's.
>
> **Residual risk, stated rather than buried:** defects that only fire at a boundary can look like ordinary play and go unreported for a long time. Halve-damage was exactly this — it misbehaved *only* on an overkill hit, which reads as a normal knockout. Nothing about reporting-from-play catches that class, so the §3 static scans and the property sweeps in the suites carry more weight than they otherwise would. Prefer a property sweep over hand-picked examples whenever the input space has edges.

| Date | Escape | Rung that now catches it |
|---|---|---|
| 2026-08-15 | **Three wiring assertions could not fail, and one class of them had been dead since it was written.** Many suites close with a block that greps a source file to prove two parts are connected — the maths is pure and testable, the connection between it and the document layer is not. All three defects shared one signature: **the pattern matched somewhere other than the use it meant to pin.** `betterAffinity(this.affinities[element], rating)` matched a byte-identical line in the Affinity Changer block above the barrier fold. `applyEncounterEffect(combat, effect)` matched the function's own signature. `consumeBarrierCharge` matched the dynamic-import destructure that survives when the call is deleted. In each case removing the real code left the suite green. **Two were caught only because a mutation probe was run against brand-new code; nothing would have caught the third, or any older one — none of the 57 had ever been probed.** | **New tool `test/assertion-audit.mjs`** — counts, per positive source-grep assertion, how many places its pattern matches in its target. 1 is anchored, 0 asserts nothing, **2+ cannot distinguish which occurrence it is pinning**, which is the whole signature and is detectable without running anything. Negation is detected rather than assumed: polarity flips for `ok(!/re/.test(src))`, and the first run reported four working ESCAPE assertions as broken until it did. First full pass: 57 assertions, **0 broken, 8 ambiguous, 3 of them real** — repaired and mutation-proved 7/7, including re-planting each original deletion. Not in the aggregate run; like the mutation probe it is a proof *about* the rungs, run when the rungs change. Ambiguous entries are a prompt to look, not an automatic defect — the five that remain are a page citation, two `indexOf` ordering pairs whose first match is the intended one, and two existence checks each backed by an anchored assertion beside it. |
| 2026-08-15 | **A fumbled attack did nothing.** The p.58 Fumble Effect Chart's top row — *"Hit yourself and/or your allies"* — had no implementation at all: `SMTItem#use` tested `checkResult.isSuccess` at three separate branch points and `isFumble` at none, so a fumbled hit posted its check card, inflicted the Curse (which `rollPercentile` does for every check, not just attacks), and stopped. **This is the most frequently reachable rule in the system to have been entirely absent** — a fumble is 1% of every attack roll made at the table, and p.64 spends a full paragraph on what should follow. **Nothing would have reported it**, which is the point worth keeping: an attack that fumbles and then does nothing looks exactly like an attack that missed, so the play channel this project now leans on is structurally blind to it. Found by reading `use()` while triaging an unrelated lane-3 item, not by any rung and not from play. | **New rung `test/fumble-chart.test.mjs`** (30 assertions). The chart is now a chart — `CONFIG.SMT.fumbleChart`, all five printed rows, each marked `automated` or not so the two the book hands to the GM resolve to a stated prompt instead of silence. `fumbleVictims` is pure and covers the p.64 clauses: the random draw from {attacker} ∪ allies, the "all" case that takes every ally *and* the attacker with no roll at all, and per-victim dodge eligibility — which is why one fumble now posts two cards, since `noDodge` had to become a property of the card rather than of the click. The wiring assertion is deliberately blunt (`use` reads `isFumble` **at all**), because the defect was a missing branch and nothing subtler would catch its return. Mutation-proved 14/14, including re-planting the original defect. |
| 2026-08-15 | **§5's own passive-effects note had been wrong in both directions for weeks.** It named Counter / Retaliate / Avenge and all forty Affinity Changers as unwired; Counter/Retaliate/Avenge landed **2026-07-28 with their own row in this log**, and the Affinity Changers are generated in `config.mjs` and resolved by `affinityOverrides` — 63 live registry keys against the 23 the note implied. The note was true when written and nothing re-read it. **The cost was not theoretical:** a session picking up the HANDOFF's "eight small passives" had to re-derive the list from the registry, because the doc naming them also named eleven others that were already done. *A doc claiming LESS than the code does is still a doc nobody checked* — the §1 clause-4 discipline pointed the other way. | No new scan; **C9 already requires every §5 spec to carry a linked check, and it cannot see prose drift inside a spec's commentary.** Answered instead by replacing the claim with a table re-derived from the registry that splits the eight remaining passives by *why* they are unwired — four implementable, two blocked on lane 4's ambush/Item-Acquisition dependencies, two with no mechanical surface to automate. Stated so the next reader does not re-derive it a third time. |
| 2026-08-02 | **The Magatama "Active" radio was INVISIBLE while unchecked, and so was every other checkbox in the system.** Reported from play as *"there was no radio… I saw it earlier with the one you put in and the radio button was on, but now I see nothing with it off"* — which is the whole diagnosis: the control rendered only in its checked state. `styles/` had rules for `input[type="text"]` and `input[type="number"]` and **none for radio or checkbox**, so all fifteen such controls — the Magatama toggle, the equip checkboxes, `isBoss`, `negotiable`, and every item-sheet flag — were dark-on-dark empty space until something happened to be ticked. A fiend could therefore never activate a dragged-in Magatama, which reads exactly like "Magatama do nothing", the shape the 07-29 report already wore once. **C13 was structurally blind to it: these controls carry no class at all, so a class↔rule check has nothing to link.** | **New scan C15** — every input TYPE the templates actually render has a rule in `styles/`. Narrow like C11 and C13: the required set is derived from the markup, so it grows with the templates and never demands rules for markup that does not exist (`file` and `hidden` excluded as never visible). Probe-planted: renaming the radio rule's selector goes red; probe now **21/21**. Both states are now drawn explicitly rather than left to the platform — relying on the browser default is what produced an invisible control, since Foundry's own resets strip `appearance` — and the Magatama cell is wrapped in a `<label>` so the hit target is the cell, not a 16px dot. |
| 2026-08-02 | **The first sealed-probe drag caught two defects the whole suite stack could not.** (1) Black Frost's drop read "Magatama" where the operator's page prints **"Magatama (Satan)"**: the x-stop that protects the GENERAL layout's prose fields from its flavour column was applied to BOSSES too, whose labels already sit right of it — so it amputated real values. **Both parsers shared the clip, so the parity rungs held the bug in perfect agreement** — a held-out value from the operator's own page is the only instrument that could see it. The fix also recovered boss Forneus's full "Aquamarine, Bead, Magatama (Wadatsumi)" (the stop had eaten the middle of the list) and Sakahagi's "(Yahiro no Himorogi)". (2) The clan dropdown rendered the raw key "SMT.Clan.Night": ONE option loop among ten printed `{{label}}` where its siblings print `{{localize label}}` — a variable, so C11c's literal-text scan could never see it. | The probe value is now a permanent anchor: **Black Frost's `dropItems: "Magatama (Satan)"` joins the importer anchors on both sides**, so a parenthetical drop is load-bearing (5 anchors now). Both parity rungs re-proved byte-identical after the shared fix. **New scan C11d** — no template option loop renders bare `{{label}}`; probe-planted (stripping one `{{localize}}` goes red; probe now 20/20). |
| 2026-08-02 | **The first live import refused every general demon's HP, MP and resists — reported from the first real run, within the hour.** pdf.js reports BASELINE y where PyMuPDF reports glyph-box TOP, and the difference is the font size, not a constant: a stat-block label row mixes a 6.56pt label with a 7.49pt value on one visual line, so their baselines sit 0.4pt apart where their tops align. `Math.round` in the label walk then ordered the row's CAPS labels before its values, and the ALL-CAPS stop rule broke before reaching a single number. **First blocks passed on rounding luck (204.9 and 205.2 both round to 205); second blocks did not (509.4 vs 509.8)** — which is why the word-level parity rung, running over PyMuPDF words, could never have seen it. The refuse-before-write gate held: nothing was written. A second defect surfaced in the same run: the refusal list was rendered unselectable and never logged, so the diagnostic designed to be shared could not be. | **New rung `test/importer-extraction.test.mjs`** — runs Foundry's own bundled pdf.mjs UNDER NODE against the operator's PDF, through the real `extract.mjs`, and holds the full parse output **byte-identical to the CLI reference across all five corpora** (194+25+248+48+20), plus zero verifier errors. Skips loudly without the PDF, the reference data, or a Foundry install to borrow pdf.mjs from; a found-but-broken pdf.js is a failure, not a skip. Fix: unrotated extraction subtracts the font size (`transform[3]`) so y is the glyph TOP, matching PyMuPDF to ~0.3pt. The report is now selectable, has a Copy button, and every refusal logs its full list to the console. |
| 2026-06-07 | **FP Halve Damage restored more HP than the hit ever dealt.** `applyDamage` stored the *computed* damage on the chat flag, but the HP write floors at 0 — so an overkill hit recorded 40 damage while dealing only 20. `resolveHalveDamage` then restored `oldDamage - newDamage` against the post-hit HP, over-restoring by exactly the overkill. At 20 HP taking a 40, the target ended back at 20: *"undoes the initial damage but doesn't apply the new damage."* It fires **only** when a hit drops the target — the only time the Fate Point is ever spent. Open 7 weeks, filed as awaiting HP numbers from a live session. | `test/fate-damage.test.mjs` — `halveDamageResult` resolves from `hpBefore` (the HP the hit found, now stored on the flag) instead of restoring a difference. 683 assertions incl. a property sweep asserting a halve never leaves HP above the pre-hit value. Mutation-proved: reinstating the old arithmetic turns **82** assertions red, all three ESCAPE cases among them. |

| 2026-07-27 | **Every demon created from the compendium lost all of its skills.** `buildDemonSkills` wrote field names and enum values from memory instead of reading the schema: `magicalAttack` where `CONFIG.SMT.skillTypes` declares `magical-attack`, `target` for `targets`, `description` for `effectDescription`, a `cost.allHp` key that does not exist. `buildDemonSystem` then wrote `drops` as a bare string where the schema declares a SchemaField, and `behavior`, which only npc-data has. Foundry rejected each Item and the actor came up skill-less. Found by creating three demons and reading the console — the first thing a player would do. | `test/demon-skills.test.mjs` — builds skills for all 194 demons and checks every field against names parsed out of `skill-data.mjs` and enums read from `CONFIG.SMT`, plus nested-shape checks for every SchemaField. Reproduced the escape at **4,692 violations**; the nested-shape leg was added after the name-only check passed `drops`-as-a-string happily. |

| 2026-07-27 | **The PDF's purchase watermark was imported as a skill onto 109 demons.** The skill parser took every row below the table header, and page furniture — the printed page number, and the per-buyer watermark carrying a real name and order number — sits below the table in the name column alone. 163 junk rows across 56% of the corpus, and the buyer's identity ended up inside every created Actor and would have travelled in any exported or shared content. Found by reading an exported actor JSON. | `tools/import-rulebook.py` drops rows where nothing but the name is populated (a real skill always fills at least one other cell — Legion's `Anti-Phys`, p.194, is a passive carrying only a learn level), and its verification now **refuses to write** if a page-number or `Order #` name survives. 1575 → 1412 rows, all 163 junk, zero real skills lost. |
| 2026-07-27 | **Boss HP was silently halved or worse.** `hp.max` is derived, so writing a boss's printed HP into `hp.value` clamped it to `(vitality + level) × multiplier`. 21 of 23 bosses print more than the formula yields — Specter got 72 instead of 148, Baal Avatar 630 instead of 13,000. Found by reading an exported actor JSON, not by any assertion. | `helpers/resources.mjs` adds an explicit max override that `prepareDerivedData` consults; `boss-hp.test.mjs` (39 assertions) checks every demon's resolved max against the printed number. The override is driven by comparing derived to printed rather than by the `boss` flag, which is what surfaced **Scáthach** (p.129): a general demon printing 498 HP where the formula gives 486. Her MP and Lakshmi on the same page derive exactly, so it is a slip in the book — carried as printed and reported as a caveat, per §1 clause 1. |

| 2026-07-28 | **Freeze and Shock cost their victim nothing.** `processAilmentTurnStart` cleared both unconditionally at the start of the victim's turn and returned, so the p.68 save never ran, the failure it exists to have never happened, and the `cannotActAilments` entries for freeze and shock were unreachable code. Two of the eleven common ailments were decorative. Nothing reported it — an ailment that ends immediately looks like an ailment that was saved against. | `test/ailment-rules.test.mjs` — `turnStartPlan` is pure and returns `save` on the first turn start, `autoRecover` only once `ailmentSaveFailed` is set. The suite asserts the forfeit branch is reachable, which is the assertion the old behavior could not pass. 124 assertions; 17 were red before the fix. |
| 2026-07-28 | **Stone was given the wrong rule entirely.** It sat in `critOnPhysAilments`, so a Phys hit on a petrified target became an automatic critical. p.66 gives Stone a **30% chance to shatter and die** instead — a different outcome, on a different distribution. Its other two clauses were absent as well: damage from every element but Phys, Force and Almighty is halved, and a Stoned target cannot dodge at all. | `ailment-rules.test.mjs` asserts `critOnPhysAilments` holds exactly three ailments and that Stone is not one; `shatterPctFor` and `incomingDamageMultiplier` are pure and swept across all eleven elements; `canDodge` covers the whole p.68 Dodge column. The shatter roll and the dodge denial are wired in `resolveAttack`. |
| 2026-07-28 | **Curse was inert.** `curseAilment` had a schema field, a sheet indicator and a clear button, and no mechanical effect anywhere: `autoFailMin` was one constant with no cursed branch, the p.67 per-action mishap did not exist, and — the part that made it invisible — *nothing ever set the flag*. p.57 says a fumble on any check inflicts it, so in seven weeks of play no character could have become Cursed by the route the book actually uses. | `evaluatePercentile` now takes `cursed` and swaps in `check.curseAutoFailMin` (86); `ailment-rules.test.mjs` pins both bands and asserts the fumble and critical ends of the ladder are unmoved. `rollPercentile` applies the Curse on a fumble; `rollCurseMishap` rides the same four call sites as the poison drain. |

| 2026-07-29 | **A feature added that morning silently deleted a working guard.** `SMTActor` gained a second `_preUpdate` for the p.39 Magatama-in-combat rule (`65dff08`). A duplicate class member is legal JavaScript and the **later definition wins**, so the pre-existing `_preUpdate` — which clamped persisted HP/MP into `[0, derived max]`, and whose own comment says it exists because `_clampCurrentValues` only fixes the *displayed* value — stopped running. Typing 9999 into an HP bar would persist again, which is precisely the bug it had been written to fix. Shipped and pushed. Found while reading the file for an unrelated reason, not by any rung. | **New scan C14** — no class declares the same member twice. Mutation-proved (probe now 19/19) **and proved red against the real commit**: checking out `65dff08`'s `actor.mjs` turns C14b red, with the backup kept outside the scanned tree this time. The two bodies are now merged into one method whose comment names the hazard. ⚑ The instructive part is how invisible it was: **C1 parses it happily, C2 sees one export, C7/C8 have nothing to say, and no node suite can import `documents/` at all.** Every existing rung was structurally incapable of seeing a whole method disappear. |

| 2026-07-29 | **The p.35-36 character formulas had no assertion at all, and three printed Magatama could not express their printed affinity.** Every derived value — stat TNs, resistances, base powers, dodge, negotiation, fate — was computed inline in `prepareDerivedData`, unreachable from node, so the arithmetic the entire system rests on was covered by nothing. Extracted to `helpers/derived.mjs`. Separately: `MagatamaData` had only an elemental affinity schema, so **Kamudo — a starter Magatama — could not carry its printed "Ailment Attack Weak"**, nor Muspell its "Strong Ailment Attack", nor Kamurogi its "Magic Weak". Those are the p.65 category axes, which `base-actor` has had since 07-27 and `makeCategoryAffinitySchema` already existed to build. Also unified: the stat cap of 40 (p.39) was a bare literal in two files. | `test/sample-characters.test.mjs` — all eight printed sheets (p.25-32) recomputed field by field, 156 assertions. **It found two book slips on its first run**, each outvoted by other figures on its own page: Pixie prints a Magic TN of 39 where Magic 8 at level 9 derives 49 (and its own Zio line prints 49%), and Hellhound prints Magic 5 where its printed TN, Base Magical Power and MP all require 6. Both recorded as slips with their corroboration rather than silently adopted, per §1 clause 1. A third, the Reporter's Save TN of 12% against a Vitality TN of 16%, is carried the same way. |

| 2026-07-31 | **"Magatama aren't complete" — the larger half: none of the 25 printed Magatama existed as data.** The 07-29 session diagnosed the equip path as working and fixed the two fields that could not be filled in (`skillList` had no add/remove control, `categoryAffinities` had no editor), and closed there. What it left open is the part the report was actually about: `system.json` declared **zero packs**, `tools/import-rulebook.py` had **zero Magatama coverage**, and a fiend's entire mechanical identity was ~18 fields per Magatama to be typed by hand from the book. The class stayed open for two days with a fix shipped against it — which is precisely what §6 says is not a fix. Now imported: 25 entries, 125 stat bonuses, 131 skill rows, 23 affinity grants. ⚑ The affinity grant is the interesting half, because the book states it **only in prose** (p.39-41) — the p.42 table has no affinity column at all — so it is the one place this importer reads a sentence. It accepts a **closed vocabulary** and truncates at the first word outside it, which is what stops Kailash's *"grants not only the Almighty attack spell Megido"* being read as a grant. | `test/magatama-data.test.mjs` — 790 assertions in two legs. The grammar leg is pure, always runs, and uses **synthetic** clauses rather than the book's, because what is under test is the grammar. The corpus leg reads the local import and **skips loudly** when it is absent (38 assertions still run; the skip is printed as a skip, never as a pass). Planted-mutation proved: dropping the keyword-LAST branch — i.e. reading a grant with the stat-block grammar, the obvious "simplification" — turns **27** assertions red, exit 1, against a green control. **⚑ Stated plainly: no rung fails on the pre-fix state, because the pre-fix state was ABSENCE and a skip-loudly rung cannot fail on nothing** (a fresh clone legitimately has no data). What now fails is a *wrong* import: `verify_magatama` refuses to write on a bad count, an out-of-range bonus, page furniture in a skill name, or any of three sample-character anchors disagreeing, and the suite refuses a grant clause it cannot fully read rather than half-applying it. |

| 2026-07-31 | **A fiend never learned anything its Magatama taught.** `skillList` had a schema, an editor and — as of that morning — 131 imported rows, and **no code path anywhere read it**. A fiend equipped Marogareh, reached level 4, and simply did not get Hell Thrust; the p.42 progression, which is the fiend's entire advancement, existed as data and as nothing else. It produces no symptom to report: a level-up that grants no skill looks exactly like a level that grants no skill. | `test/skill-learning.test.mjs` — 3,714 assertions. `magatamaLearnPlan` is pure and states the owed set as a STATE rather than a diff, so a directly-written level or a p.39 Magatama swap grants the earned backlog instead of only future levels; the p.80 cap of 8 fills from the earliest unlearned skill and **returns** what it turns away. The ch4 skill list (p.97-110) is imported as a third data file so a skill can be built by NAME, merged with the stat blocks because ch4 prints no type/target/TN column and the blocks do. **863 costs are cross-checked between the two printings**, and a disagreement is only an error when ch4 is the odd one out — the four that dissent are each outvoted by 5 to 12 stat blocks and kept as printed, per §1 clause 1. |

**Three parser defects, and two of them were losing data silently.** The ch4 tables were read one printed ROW at a time, but a wrapped Effect prints one line **above** the name and one below it, so every wrapped skill came through with an **empty effect** and `Endure` — whose effect is the only content on its row — was dropped outright. Both now band around the name anchor, the same way the demon and Magatama importers already do, and the suite fails on any imported skill with no effect text. The second: pitch was measured between *every printed line*, so the ~4pt wrap lines collapsed it and the next real record read as a table-ending gap — **every table stopped after one row**, which showed up only as a suspiciously low count. The third was mine and not the book's: the ch4 list states an ailment inside a sentence (*"20% chance to inflict Freeze"*) where the stat blocks state it as a bare `Panic 30%`, and `parseAilment` reads only the terse column form, so a ch4-built skill silently lost its ailment. **Also stated: "All" is a printed cost, not a missing one** (Last Resort, Sacrifice, Kamikaze spend the whole pool), and a dash in the potency column is a real value — the instant-kill and pure-ailment skills deal no damage — so rejecting either dropped whole tables.

⚑ **The book spells two skills two ways**, and both are Magatama skills: `Agirao` on p.42 against `Agilao` on p.97, and `Warcry` against `War Cry`. Spacing folds out on its own; the vowel is a recorded variant with both printed spellings kept, the same treatment `Cú Chulainn` already gets.

**Two independent reads agreed before anything was written, which is this project's own bar for transcribed data.** The p.42 table is printed **rotated 90°** — each Magatama is a *column* at a fixed x, each field a horizontal band anchored by its label down the right-hand side — so cells join their words by **y**, not x ("Hell" then "Fang"; "Tower" then "of" then "Kagutsuchi"). It was read once from the extracted text layer by hand and once positionally by the importer, and the two agreed on all 25 names, all 125 bonuses, all 131 skill rows and every acquisition. The stray-word guard earned its place immediately: it fired on the first run and named the printed page number, the per-purchaser watermark and the rotated "CHARACTER CREATION" running head. It now distinguishes **where** a stray sits — inside the columns' span it means a Magatama column failed to register and the import refuses; outside it, the words are listed as ignored furniture. A column that silently vanished would otherwise look exactly like a book with 24 Magatama.

⚑ **The one thing worth carrying forward from writing it:** `helpers/magatama.mjs` already existed, holding the pure p.39 loadout rules, and the first attempt to add the compendium half was a whole-file write that would have destroyed it. Same shape as the 07-29 duplicate `_preUpdate` (C14) — a second definition arriving where a first already lived — caught this time only because the editor refused to overwrite an unread file. The new code went into `helpers/magatama-compendium.mjs` instead, which also keeps the older file's stated "pure, touches no documents" contract true.

| 2026-07-28 | **The Pay Out Rewards button was cramped and ran off the sidebar.** Reported from play; the "not rendering right" report had been open for weeks with no mechanism attached. **The mechanism was local CSS fighting core's layout:** the button carried `flex: 0 0 auto` *and* `width: 100%` while sitting inside core's `.combat-controls`, which is `display: flex` with **no wrap** and already holds four or five other buttons. It demanded the whole container width and refused to shrink, so the row was pushed off the sidebar. Fixed by deleting all of that and building the control out of core's own `combat-controls` / `combat-control combat-control-lg` classes (verified against 14.365.0's `templates/sidebar/tabs/combat/footer.hbs`), in a second nav of its own. This system now styles it **not at all**, so it follows the active theme for free. **A second, self-inflicted instance shipped the same day:** `.effect-actions` never declared `flex-wrap`, and the Aid button added that morning made it a three-button nowrap row inside a fixed-width sheet column. Its sibling `.effects-list` had wrapped all along. | **New scan C13** — every `smt-` class the system applies has a style rule or is a `querySelector` hook. Mutation-proved; probe now 18/18. **⚑ Stated plainly: C13 would NOT have caught this defect.** The class *was* styled — it was styled wrongly. C13 answers "does a rule exist", never "is the rule right", which is the same distinction §3 already records for C12 ("a check on field NAMES is not a check on values or shapes"). It earned its place on other findings: two genuinely dead classes on its first run, `smt-chat` and `smt-levelup-effects`, the latter a bare `<ul>` taking the browser's ~40px indent inside a chat card — a third overflow nobody had reported. |

**Two corrections to this row, both mine, both worth keeping visible.** The first version claimed `.smt-grant-rewards` had "zero rules anywhere in the stylesheet". **False** — it had a rule at line 1154, and that rule *was the bug.* The claim came from a grep for `smt-reward`, which does not match `smt-grant-rewards`; a pattern that cannot match the thing it is looking for returns the same empty result as a genuine absence. The second: C13 was then proved "red against the real defect" by renaming every occurrence of the class — which deleted the pre-existing rule too, so the probe measured a state that never existed. **Both errors point the same way: a negative result is only evidence once the instrument has been shown capable of returning a positive.** That is Rung discipline applied to greps, not just to suites.

| 2026-07-28 | **Multi-action (p.59-60) was never offered.** A TN of 100%+ may be spent as two repeats of the same action, 200%+ as three, at the original TN divided between them. This is not a corner case at this table — the same day's play log carries a save TN of **275**. Now offered (never taken automatically; p.59 says "you may choose") on basic strikes and on skills, with the cost paid per part and the remaining parts lost if a later payment fails. ⚑ **Scope stated rather than implied: the two firearm paths do NOT multi-action yet** — the Shoot button and firearm skills both keep their single check. p.63's "Ammo is depleted per check made" is the interaction that needs care, and one odd path out is worse than two consistent ones. | `test/multi-action.test.mjs` — `multiActionPlan` and `multiActionTn` are pure, including both of p.60's worked examples verbatim (120 → 2×60, 210 → 3×70) and the two outright bars: an auto-success skill and a negotiation never multi-action however high the TN. **The critical-value clause is asserted rather than assumed** — p.60 says to adjust it post-division, and that needs no code because `evaluatePercentile` derives the threshold from whatever TN it is given; the suite pins that a 21 crits at 210% and does not at the divided 70%, so a refactor cannot quietly lose it. ⚑ p.60's bands read "100 to 199" and "over 200", which leaves exactly 200 unstated; treated as 3 and flagged in config as inferred. |

| 2026-07-28 | **The Aid action (p.64) did not exist**, while its twin Concentrate did — same +20%, same named-action gating, same loss-on-ailment clause, printed on the same page. Aid differs in two ways the implementation now carries: it comes from an ally rather than yourself, and *"Aiding from multiple sources stacks"*, so each aider leaves its own effect instead of one accumulating stack. ⚑ **Wiring it exposed that the bonus was consumed at four separate call sites** — basic strike, Shoot, skill use, firearm skill — each with its own copy of the same four lines. A fifth setup action would have been wired into three of them. All four now go through `consumeSetupBonuses`. | `test/pure-helpers.test.mjs` pins the printed constants and asserts Aid is its own action effect with its own status id rather than a Concentrate alias. **The ActiveEffect plumbing itself is unreachable from node and is not claimed as verified.** ⚑ **C8 caught its own blind spot here:** it reported the new `aid` flag as unwritten, and it was right that no *recognised* writer existed — a flag written only at document-create time with COMPUTED keys (`flags: { [SCOPE]: { [KEY]: … } }`) matched none of its three idioms. Concentrate escaped notice only because it also has an update path with a dotted string. The scan now resolves the computed form; the probe re-proved C8b still goes red. |

| 2026-07-28 | **The forty Affinity Changer skills could not change an affinity.** Anti-X, Null X, X Drain and X Repel — ten elements × four ratings, every one reading "Gain `<rating>` against `<element>` attacks" — had no registry entry and no path to `system.affinities`. A demon printed with `Anti-Fire` took full Fire damage. Now generated from `SMT.elements` (forty hand-written literals is forty chances to typo an element key) and applied in `prepareDerivedData` **by p.65's priority ladder rather than last-writer-wins**, so `Anti-Fire` cannot downgrade a demon that already Repels Fire. | `test/passive-effects.test.mjs` — 321 assertions; every printed name resolves to the right element and rating, and every entry is checked against `CONFIG` rather than a literal. `damage.mjs`'s absolute short-circuit now derives from the same `SMT.affinityPriority` instead of restating the order. ⚑ **The first mutation run exposed a fail-open in the suite itself**: the per-element loop iterated the config value under test, so emptying that config made **120 assertions silently not run** rather than fail — 5 red, not 125. The loop is now driven by a literal list. A shrunk config must turn assertions red, never make them disappear. |

| 2026-07-28 | **Counter, Retaliate and Avenge had no implementation at all** — three printed passives whose whole content is a reaction the system could not express, because nothing in the damage pipeline ever looked back at the defender's own skills. Now wired as an OFFER: a 50% roll on any Phys hit posts a button, and the defender may ignore it, because p.96 says in as many words that counterattacking is not mandatory. ⚑ Building it surfaced a second thing worth keeping: `#onStrike` was the only basic strike in the codebase and it lived as a private static on a sheet, so the reaction would have had to copy it. It is now `performBasicStrike` in `combat.mjs` and both callers share it. | `test/passive-effects.test.mjs` — `counterEffect` (highest tier wins; they are one power-up chain, not three stacking passives) and `counterTriggers` (Phys only, never on a dodge, never on a suppressed hit) are pure. `calculateDamage` gained `finalMultiplier`, asserted to land **after** resistance — p.110 says "damage dealt is doubled", which is a different number from doubling the power, and tripling a fully-resisted hit still yields 0. |

| 2026-07-28 | **The passive registry held nine entries against roughly twenty-five printed passives.** Everything outside those nine resolved to `"none"`: the skill sat on the sheet, named itself correctly off the corpus, and did nothing at all. Ten more are wired now — **Powerful Spells** (which had no magical counterpart because `powerDie` was hardcoded physical), **Expert Dodge**, the four elemental **Boosts**, **Life Aid / Mana Aid / Victory Cry**, and **Endure**. ⚑ The Boosts are the pointed one: the importer already *knew* about them — the book's `115 (77)` boosted-total notation that the corpus sweep decoded on 07-27 is exactly this multiplier — so the data carried the effect while the engine had no way to apply it. | `test/passive-effects.test.mjs` — every printed name is asserted to resolve, and every unimplemented one is asserted to resolve to **`null` rather than to a neighbour**, which is the clause that keeps the remaining gap visible. Mutation-proved: restoring the nine-entry registry turns **26** assertions red. Boosts do not compound on duplicates; combat-end recovery takes the max of each pool rather than summing. |

| 2026-07-28 | **Ten printed recovery skills did the wrong thing rather than nothing.** `SkillData` declared no cure, revive or full-heal field, so `skillType: "recovery"` resolved to exactly one behavior — roll power, add HP. **Patra, Me Patra, Mutudi, Posumudi, Paraladi and Petradi healed instead of curing; Recarm and Samarecarm healed a corpse and left it dead; Recarmdra never killed its caster; Prayer cleared nothing.** The symptom is the reason it survived: a heal card posting after Patra reads exactly like Patra working. **The machinery already existed one file away** — `ConsumableData` has `curesAilment`, `revive` and `reviveFull`, so a Dis-Poison *item* could cure what the Posumudi *spell* could not. Also missing: `Fog Breath`, `War Cry` and `Debilitate` had no `buffEffect` key, and p.96 names Fog Breath as *the* worked example of a differently-named skill sharing the 4-stack debuff cap — the mechanism (`stacksOnSharedAxes`) was implemented, the example it was written for was not. | `test/recovery-skills.test.mjs` — `recoveryPlan` and `curedAilments` are pure; the cure spec is a SET (Patra is three ailments, which the consumable path's single-key field could never express) and unknown keys are dropped rather than written through. Mutation-proved: restoring "recovery always heals by power" turns **10** assertions red, one per printed skill. `Fog Breath`/`War Cry`/`Debilitate` now share axes with `Sukunda`/`Tarunda`, so the cap the book describes is enforced rather than described. |

| 2026-07-28 | **p.58's Fumble Effect Chart had one row unimplemented: a fumbled SAVE.** The chart reads *"The ailment remains, and your HP and MP are halved."* The ailment did remain — that falls out of the save failing — but nothing was ever halved, so fumbling a save cost exactly the same as missing one. Surfaced from a live log: Shiva rolled 100 on a Freeze save against a save TN of 275, a roll that can only be a fumble, and paid nothing for it. | `test/ailment-rules.test.mjs` — `fumbledSaveResources` is pure and swept over odd, zero, negative and missing pools; `attemptAilmentSave` folds the halving into the same write as the save-failed marker. **The other four rows of that chart are still unimplemented** and are recorded below rather than fixed. |

| 2026-07-28 | **A Fate Point spent on an ailment-only skill did nothing.** Reported from play: *"rerolling into success doesn't proc ailments roll chance like it should."* Apsaras cast Lullaby (Sleep 70%, no power), rolled 85 against a TN of 38, spent a Fate Point and rerolled a **1** — a critical, which should have doubled the rate to 95%. Nothing happened. `_cascadeCheckChange` gated the whole fail→success branch on `hasPowerRoll`; an ailment-only skill never has one, so the branch carrying its entire effect was unreachable from the Fate Point path. `SMTItem#use` had always had that second branch — only the reroll and boost paths were missing it, and they are the two nobody had exercised. | `test/ailment-rules.test.mjs` — the decision is now pure `cascadePlan` in `checks.mjs`, returning `powerRoll` / `ailmentOnly` / `cancel` / `none`. Mutation-proved: restoring the `hasPowerRoll ? "powerRoll" : "none"` guard turns the ESCAPE assertion red and nothing else, so the rung names this defect and not a neighbourhood. |

**A guard written for one branch silently deleted another.** The `hasPowerRoll` test was correct about the power roll and was never asked whether anything else depended on it. The same shape is worth watching for wherever a capability flag gates a block that has grown past the capability it was named for. Note also which path was broken: the *un-rerolled* cast worked, so this only ever surfaced when a Fate Point was spent on a specific class of skill — a two-condition defect that no amount of ordinary play was likely to isolate, and that was reported in one sentence.

**The rest of the 2026-07-28 cluster has a different shape from the 2026-07-27 one, and a worse one: three rules were read once, encoded approximately, and never re-read.** None of them was found by output, a console or a report — all three came from reading Ch.3 straight through against the code. Stone was given a neighbouring ailment's rule; Freeze and Shock were given a simplification that removed their only cost; Curse was given a flag and no mechanism. **A defect that makes a rule do nothing produces no symptom to report.** That is the class the escape log cannot cover by construction, and re-reading the chapter is the only channel that reaches it. Two rungs in `pure-helpers.test.mjs` were actively *defending* the Freeze/Shock defect — they have been corrected in place with the page cite rather than deleted.

**The 2026-07-27 cluster has one shape: everything was checked except the thing that consumes it.** The skill parser was checked against the table and not against what sits below it; the boss HP was checked as a stored value and not against the derived ceiling that overwrites it; the schema fields were checked against memory and not against the schema. All four were found by looking at real output — a rendered page, an exported actor — never by an assertion. **Read the artifact, not just the code that made it.**

**What let the schema one happen at all.** Not a subtle rule — the schema was three files away and states every legal value. It was written from memory because the code *looked* like the kind of mapping that does not need checking. Every enum in `compendium.mjs` now resolves against `CONFIG` at runtime rather than being restated, so a literal cannot drift out of the schema again. The wider lesson is the one this file already carries: the node-side suites all passed while the feature was completely broken, because none of them constructs a Foundry document.

**What let it survive seven weeks.** Not the maths — that was five lines and read correctly in isolation. The defect lived at the seam between `calculateDamage` (pure, 178 assertions on it) and the HP write inside `SMTActor#applyDamage` (Foundry-coupled, zero assertions, unimportable in `node`). **No rung existed that could observe a wrong HP.** It was filed as needing live numbers; it did not — extracting the write into a pure function settled it in one pass with no session at all.

**Structural fix, same session:** the HP mutation is now `applyDamageToHp` in `helpers/damage.mjs`, pure and covered. A future defect in that seam is a suite failure rather than a table report.

### Retrofit, 2026-07-26 — what each escape shape now costs

| Escape shape | Rung | Why it cannot pass silently |
|---|---|---|
| HP arithmetic that only misbehaves at a boundary (0 HP, max HP, repeated spends) | `fate-damage.test.mjs` property sweep | A 13×17 grid of (hpBefore × damage) asserting three invariants each, so a boundary cannot be dodged by choosing friendly examples. |
| A renamed export or moved module killing world load | C1 + C2 | Parses every shipped `.mjs` and resolves every named import against its target's real exports — including the Foundry-coupled files no suite can import. |
| A template path that renders blank | C3 + C4 | Dynamic segments expand against declared subtypes, so the `${document.type}` branch is checked for every type rather than skipped. |
| A button that renders and does nothing | C7 | AppV2 gives no error for an unhandled action. Handlers are collected from all three binding idioms this codebase uses. |
| A chat-flag reader with no writer | C8 | Const-resolving and interpolation-normalizing, so `setFlag(SCOPE, KEY)` and `` `flags.${SCOPE}.${KEY}` `` both count as writers. |
| A suite nobody runs | `test/run-tests.mjs` | Discovery is glob-only over `test/*.test.mjs` plus a floor assertion — no hand-maintained list to fall out of date. This project had exactly that bug: `fusion-chart.test.mjs` was a separate entry point and no command ran both. |
| A spec in §5 with nothing behind it | C9 | Every spec needs a linked tagged test or a dated manual check; orphan `spec:` tags are flagged in the other direction too. |
| A document field written from memory rather than read from the schema | C12 + `demon-skills.test.mjs` | The static scan unions every data model and catches names that exist nowhere; the runtime one builds all 194 demons and checks names, enums and nested shapes against the schema's own declarations. Enums are resolved from `CONFIG` at runtime in the source too, so a literal cannot drift. |
| **A rung that cannot fail** | `test/mutation-probe.mjs` | Plants one defect per scan into a scratch copy and asserts the suite goes red **for that rung specifically**, with a control run on an unmutated copy proving it goes green. Currently 17/17. An empty result from an unproved instrument is not evidence. |

### Transcribed rulebook data — the standing verification bar

Two large tables are now transcribed out of the book: the p.82 Normal Fusion Chart (339 cells) and the Ch.5 demon roster (194 entries). Neither can be checked by "does the code work" — a wrong cell produces a perfectly functional wrong answer. The bar that has been applied, and that any future table should meet:

- **Two independent reads that must agree**, or a cross-check against a different table the book prints. The fusion chart used two independent transcriptions agreeing on all 339 cells. The roster instead cross-checks every clan against `clanOrder`, which the chart already established — an unknown clan is a bad read.
- **Anchors read off the rendered page**, not off the text layer, so a systematic extraction error cannot pass. Roster anchors: Vishnu 93 Deity, Mitra 78 Deity (p.126), Forneus 20 Fallen (p.213).
- **Structural expectations asserted**: two demons per page across p.126–211 (bar the last), 171 general + 23 boss, four Element and four Mitama demons.
- **Book errata recorded, never silently corrected.** Baal Avatar prints clan `DIETY` (p.223) — normalised so lookups resolve, with `bookClan` preserving the printed spelling. Specter (3rd Time) prints `LVL 440` (p.218) — kept as printed and flagged, because 44 would be a guess. §1 clause 1 says match the book; it does not say quietly improve it.

**Still uncaught, and named so it stays visible:** every row of §2 below the static scans. Nothing here observes Foundry actually loading, a sheet actually rendering, or a number on a chat card actually matching the sheet. Those are the §5 manual rungs and they are the honest gap.
