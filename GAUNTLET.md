# GAUNTLET — SMT: Tokyo Conception (Foundry VTT system)

Constraint state for this system: what DONE means, which channel each artifact is really consumed through, which invariants are executable, and which gates run for which class of change.

§1 and §5 are the bar — they change only by a deliberate ruling, never as a side effect of making a test pass. §2–§4 and §6 describe whatever the code currently is and are updated whenever it moves.

Authored 2026-07-26, after the escape logged in §6.

---

## §1 Oracle — done-definition

> ⚠️ **Status: DERIVED, NOT YET CONFIRMED.** Every clause below was read back out of the existing project notes, the README, and the rules already in force — none of it was written down as the bar first. Clauses marked ⚠ are inference and are the ones most likely to be wrong. Confirm or overwrite them; until then this section is a proposal.

**What this is.** A Foundry VTT game system for *Shin Megami Tensei: The Roleplaying Game — Tokyo Conception*, a d100 percentile TTRPG. It is **installed and played**, not read — distributed publicly via a manifest URL and run at a live table.

**A feature is DONE when:**

1. **It matches the rulebook.** Formulas, terminology, and tables match the book exactly, cited by page. Guessing at a mechanic is a defect even when the code is clean.
2. **It is automated, not left to the GM.** Rolls, damage, cost deduction, affinity application, and effect bookkeeping are performed by the system. "The GM can do that by hand" is not done.
3. **It uses real Foundry v13/v14 APIs.** No hack workarounds; deprecated v12 patterns are defects. The AppV2 rules in the project notes are hard-won and each line was a real bug.
4. ⚠ **It survives being loaded.** The system boots in Foundry, the affected sheet opens, and the affected button does the thing — because the product IS the loaded system, and no node-side assertion observes that.
5. ⚠ **Its pure logic is covered by a suite**, and any *rule* it implements is expressed as an assertion rather than as prose in a commit message.
6. ⚠ **User-facing strings go through `lang/en.json`.** A hardcoded English string is a defect even though nothing renders wrong today.

**Non-goals.** ⚠ Not a general-purpose SMT toolkit — Tokyo Conception only. No rulebook text or licensed art ships in the repo (the PDF is gitignored and stays that way). No v12 back-compat. Performance is irrelevant at table scale.

**Explicitly out of scope for automation:** whether a fight is *balanced*, whether an encounter is *fun*, and whether a house ruling is *right*. These are manual rungs (§5) and go stale loudly.

---

## §2 Channel map

**A test suite is one channel; it is never the artifact's channel.**

The founding gap: every rung that existed before 2026-07-26 ran in `node`, and **`node` never loads Foundry**. 315 assertions were green while the halve-damage defect in §6 sat live for seven weeks, because the code it lived in cannot even be imported without Foundry globals.

| Artifact | Real channel | Pass condition | Rung |
|---|---|---|---|
| pure rules helpers | a suite importing them directly | every assertion green | `test/pure-helpers.test.mjs`, `test/fusion-chart.test.mjs`, `test/fate-damage.test.mjs`, `test/demon-roster.test.mjs` |
| rulebook data tables (fusion chart, demon roster) | the rules that read them | every value cross-checked against another table the book prints, plus anchors read off the rendered page | `fusion-chart.test.mjs`, `demon-roster.test.mjs` |
| shipped `.mjs` modules | **Foundry evaluates them at world load** | every module parses; every relative import resolves to a real export | `test/contract.test.mjs` C1–C2 |
| `.hbs` templates | **Foundry's template loader renders them** | every referenced path exists; every `{{> partial}}` resolves | `test/contract.test.mjs` C3–C4 |
| `lang/en.json` | Foundry's i18n loader at init | no leaf/branch collision; every `SMT.*` key used in code exists | `pure-helpers` collision guard + `contract` C5 |
| `system.json` | **Foundry parses it before anything else runs** | declared files exist; semver version; id matches the install dir | `test/contract.test.mjs` C6 |
| sheet + chat buttons | **a user clicks them** | every `data-action` has a handler; every flag read has a writer | `test/contract.test.mjs` C7–C8 (proxy) |
| **the installed system** | **load the world and play** | boots · a sheet opens · an attack resolves end-to-end · HP persists | **manual** — §5 `system-loads-cold`, `every-chat-button-fires` |
| manifest install | **Foundry installs from the manifest URL** | `system.json` at the raw URL parses and points at a downloadable archive | **partly checked 2026-07-26 (v0.1.12)** — raw manifest 200 with correct id/version/compat, archive 200 `application/zip`. Foundry actually *installing* from it is still unrun. |

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

**Scan honesty.** Five defects, across three of these scans, reported violations on their first run that were **defects in the scan, not the code**:

| Scan | Reported | Actually |
|---|---|---|
| C3b | 4 missing `templates/item/{fiend,demon,human,npc}-sheet.hbs` | the dynamic path was expanded against Actor subtypes as well as Item ones, inventing paths the branch can never request |
| C8b | `rewardsPaid` has no writer | `rewards.mjs` writes it as `setFlag(FLAG_SCOPE, PAID_KEY, true)` — both args are file-local consts, invisible to a literal-only regex |
| C8b | `initiativeTieBreak` has no writer | `documents/combat.mjs` writes the computed key `` [`flags.${FLAG_SCOPE}.${TIEBREAK_KEY}`] `` — assembled at runtime |
| C9c | dangling spec tag `tag` | the scanner matched `spec: tag` inside its own assertion label |
| C9c | control run red on `a-tag-matching-no-declared-spec` | `mutation-probe.mjs` stores the tags it plants, and it lives under `test/` |

All fixed and re-proved. Two lessons worth keeping: a scan that cannot see a legitimate idiom manufactures false positives until someone deletes the rung — which is how a project ends up with no rung at all; and a scanner that reads its own source will find whatever it is looking for.

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
| behavior-change (rules maths, combat pipeline) | + a RED-first test naming the behavior + a planted-mutation run proving it red |
| artifact-affecting (anything a player clicks) | + **load the system in Foundry and click it** — §5 manual rungs re-dated |
| release (version bump / push) | + full channel map + all §5 specs + manual rungs re-dated + `system.json` version bumped |
| rung-touch (editing `contract.test.mjs`) | + `node test/mutation-probe.mjs` — 11/11, control green |

**Hard gate:** work is not "done" until its class's rungs ran, reported as a rung→result table. A skipped rung means **BLOCKED**, not done. An override is per-instance and never carried forward.

**The manual rungs are load-bearing here.** This project cannot run its real channel headless — Foundry is a browser application. Every artifact-affecting change therefore ends in a hands-on step, and a session that cannot reach one reports BLOCKED rather than done.

---

## §5 Acceptance specs

> ⚠️ **All five are drafted from observed behavior and existing notes, not written first.** Rewriting them in your own words is worth more than the drafts are.

### SPEC halve-damage-never-restores-more-than-was-dealt
```
Given a character who takes a hit that would drop them below 0 HP
When they spend a Fate Point to halve that damage
Then their HP is exactly (HP when the hit landed) - (half the damage)
And it is never higher than it was before the hit
Check: test/fate-damage.test.mjs  (tagged  // spec: halve-damage-never-restores-more-than-was-dealt)
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

### SPEC system-loads-cold
```
Given a Foundry world with this system installed
When it is launched from cold
Then the world loads, an actor sheet opens, and no error appears in the console
Check: manual — last verified: 2026-06-07 (v0.1.11)
```

**⚠ This date is stale and the staleness is the point.** HEAD is **8 commits past** the last version actually loaded — the cross-clan fusion chart, the localization rename, the Effects tab work, and the halve-damage fix have never been in front of Foundry. Every `node` suite being green says nothing about this row.

### SPEC every-chat-button-fires
```
Given an attack resolved against a target
When Dodge, then Apply Damage, then Halve Damage are clicked
Then each button performs its action and does not silently do nothing
Check: manual — last verified: NEVER
```

**Two different checks live here, and the second is the real one.** C7–C8 assert the *proxy* — every action has a handler, every flag read has a writer. The channel this spec names is a person clicking a button in a live game. **A green suite does not make this row pass.**

### SPEC damage-card-reads-true
```
Given any damage or halve-damage chat card
When a player reads it
Then the numbers on the card match what actually happened to the target's HP
Check: manual — last verified: NEVER
```

**Why this is its own row.** The 2026-06-07 escape was reported *from the card* — the symptom was HP moving wrongly, not a stack trace. The card is the only surface most defects in this system ever present on, and nothing checks that it agrees with the sheet.

---

## §6 Escape log

| Date | Escape | Rung that now catches it |
|---|---|---|
| 2026-06-07 | **FP Halve Damage restored more HP than the hit ever dealt.** `applyDamage` stored the *computed* damage on the chat flag, but the HP write floors at 0 — so an overkill hit recorded 40 damage while dealing only 20. `resolveHalveDamage` then restored `oldDamage - newDamage` against the post-hit HP, over-restoring by exactly the overkill. At 20 HP taking a 40, the target ended back at 20: *"undoes the initial damage but doesn't apply the new damage."* It fires **only** when a hit drops the target — the only time the Fate Point is ever spent. Open 7 weeks, filed as awaiting HP numbers from a live session. | `test/fate-damage.test.mjs` — `halveDamageResult` resolves from `hpBefore` (the HP the hit found, now stored on the flag) instead of restoring a difference. 683 assertions incl. a property sweep asserting a halve never leaves HP above the pre-hit value. Mutation-proved: reinstating the old arithmetic turns **82** assertions red, all three ESCAPE cases among them. |

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
| **A rung that cannot fail** | `test/mutation-probe.mjs` | Plants one defect per scan into a scratch copy and asserts the suite goes red **for that rung specifically**, with a control run on an unmutated copy proving it goes green. Currently 11/11. An empty result from an unproved instrument is not evidence. |

### Transcribed rulebook data — the standing verification bar

Two large tables are now transcribed out of the book: the p.82 Normal Fusion Chart (339 cells) and the Ch.5 demon roster (194 entries). Neither can be checked by "does the code work" — a wrong cell produces a perfectly functional wrong answer. The bar that has been applied, and that any future table should meet:

- **Two independent reads that must agree**, or a cross-check against a different table the book prints. The fusion chart used two independent transcriptions agreeing on all 339 cells. The roster instead cross-checks every clan against `clanOrder`, which the chart already established — an unknown clan is a bad read.
- **Anchors read off the rendered page**, not off the text layer, so a systematic extraction error cannot pass. Roster anchors: Vishnu 93 Deity, Mitra 78 Deity (p.126), Forneus 20 Fallen (p.213).
- **Structural expectations asserted**: two demons per page across p.126–211 (bar the last), 171 general + 23 boss, four Element and four Mitama demons.
- **Book errata recorded, never silently corrected.** Baal Avatar prints clan `DIETY` (p.223) — normalised so lookups resolve, with `bookClan` preserving the printed spelling. Specter (3rd Time) prints `LVL 440` (p.218) — kept as printed and flagged, because 44 would be a guess. §1 clause 1 says match the book; it does not say quietly improve it.

**Still uncaught, and named so it stays visible:** every row of §2 below the static scans. Nothing here observes Foundry actually loading, a sheet actually rendering, or a number on a chat card actually matching the sheet. Those are the §5 manual rungs and they are the honest gap.
