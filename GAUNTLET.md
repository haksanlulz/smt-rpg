# GAUNTLET — SMT: Tokyo Conception (Foundry VTT system)

Constraint state for this system: what DONE means, which channel each artifact is really consumed through, which invariants are executable, and which gates run for which class of change.

§1 and §5 are the bar — they change only by a deliberate ruling, never as a side effect of making a test pass. §2–§4 and §6 describe whatever the code currently is and are updated whenever it moves.

Authored 2026-07-26, after the escape logged in §6.

---

## §1 Oracle — done-definition

> **Status: clauses 1–6 RATIFIED 2026-07-27.** Clauses 1–3 were read back out of the existing project notes and confirmed; clauses 4–6 were drafted here, put as explicit questions, and answered. Clause 5 was **not** kept as written — it was narrowed on the ruling (see below). The **non-goals paragraph is still ⚠ unconfirmed**: it was never put and remains inference.

**What this is.** A Foundry VTT game system for *Shin Megami Tensei: The Roleplaying Game — Tokyo Conception*, a d100 percentile TTRPG. It is **installed and played**, not read — distributed publicly via a manifest URL and run at a live table.

**A feature is DONE when:**

1. **It matches the rulebook.** Formulas, terminology, and tables match the book exactly, cited by page. Guessing at a mechanic is a defect even when the code is clean. *(Clarified 2026-07-27: **a boss stat block is allowed to sit off the curve.** Boss entries are GM fiat — p.123 already derives their stats from their HP and MP rather than from a formula — so a boss value that no formula reproduces is data, not a defect. Specter (3rd Time)'s printed LVL 440 stands. The corpus sweep still checks bosses and names the exceptions, because an unexplained one is worth seeing.)*
2. **It is automated, not left to the GM.** Rolls, damage, cost deduction, affinity application, and effect bookkeeping are performed by the system. "The GM can do that by hand" is not done.
3. **It uses real Foundry v13/v14 APIs.** No hack workarounds; deprecated v12 patterns are defects. The AppV2 rules in the project notes are hard-won and each line was a real bug.
4. **Saying what is unverified — GATE. Actually exercising it in Foundry — aspirational.** The product IS the loaded system, and no node-side assertion observes it. So a session **may never report an artifact-affecting change as working**: it closes the change *and states, specifically, which Foundry-side behavior nobody has observed* — which sheet, which button, which card. "Suites green" is never written as, or allowed to imply, "it works." Loading it and clicking it is encouraged and does not block; play is the real verification channel and bugs get reported from it as they surface. *(Ratified 2026-07-27, then **split 2026-07-27** in the same shape as clause 5. The drafted version made the hands-on check a hard gate; that puts the gate on the one participant a gate cannot compel, and would have parked finished work indefinitely. The enforceable half is the honest report. The 2026-06-07 halve-damage escape is still the argument, and its actual mechanism was the substitution — 315 green assertions **read as** evidence the system worked. Forbidding that sentence is what closes it. What replaces upfront verification is §6: every bug reported from play ships its fix **and** the rung that would have caught it, in the same session, so each report permanently closes its own class.)*
5. **Rules maths is covered by a suite — GATE. Coverage of logic in general — aspirational.** Anything implementing a rulebook formula, table, or threshold needs an assertion before it counts as done, expressed as a test rather than as prose in a commit message. Coverage of everything else (sheet wiring, chat rendering, UI glue) is encouraged and never blocks — most of it cannot be reached from `node` at all. *(Ratified 2026-07-27. Narrowed from the drafted "all pure logic is covered", which would have gated work the rungs structurally cannot see.)*
6. **User-facing strings go through `lang/en.json` — GATE.** A hardcoded English string is a defect that blocks done, even though nothing renders wrong today. *(Ratified 2026-07-27 as blocking. **Enforced since 2026-07-27 by C11**, which found 7 real violations on its first run — a hardcoded `All` in the consumable cure dropdown, and six stat/unit labels — all fixed, all against keys that already existed.)*

**Non-goals.** ⚠ **Unconfirmed — never ruled on, still inference.** Not a general-purpose SMT toolkit — Tokyo Conception only. No rulebook text or licensed art ships in the repo (the PDF is gitignored and stays that way). No v12 back-compat. Performance is irrelevant at table scale.

**Explicitly out of scope for automation:** whether a fight is *balanced*, whether an encounter is *fun*, and whether a house ruling is *right*. These are manual rungs (§5) and go stale loudly.

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
| manifest install | **Foundry installs from the manifest URL** | `system.json` at the raw URL parses and points at a downloadable archive | **partly checked 2026-07-26 (v0.1.12)** — raw manifest 200 with correct id/version/compat, archive 200 `application/zip`. Foundry actually *installing* from it is still unrun. |

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
| C10 | The tracked `.gitignore` excludes `rulebook-text/` and `*.pdf`, and git tracks neither. | The repo is **public** and the rulebook is licensed. An ignore rule nobody asserts is one edited `.gitignore` away from committing the book. C10c uses git as ground truth and **skips loudly** outside a checkout rather than passing. |

**Scan honesty.** Five defects, across three of these scans, reported violations on their first run that were **defects in the scan, not the code**:

| Scan | Reported | Actually |
|---|---|---|
| C3b | 4 missing `templates/item/{fiend,demon,human,npc}-sheet.hbs` | the dynamic path was expanded against Actor subtypes as well as Item ones, inventing paths the branch can never request |
| C8b | `rewardsPaid` has no writer | `rewards.mjs` writes it as `setFlag(FLAG_SCOPE, PAID_KEY, true)` — both args are file-local consts, invisible to a literal-only regex |
| C8b | `initiativeTieBreak` has no writer | `documents/combat.mjs` writes the computed key `` [`flags.${FLAG_SCOPE}.${TIEBREAK_KEY}`] `` — assembled at runtime |
| C9c | dangling spec tag `tag` | the scanner matched `spec: tag` inside its own assertion label |
| C9c | control run red on `a-tag-matching-no-declared-spec` | `mutation-probe.mjs` stores the tags it plants, and it lives under `test/` |

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

> **The SET is RATIFIED 2026-07-27** — all three manual specs were put individually and all three were kept. **The WORDING is still drafted**, not authored: each Given/When/Then below was written from observed behavior. Rewriting them in your own words is still worth more than the drafts are.
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

**Nine entries against roughly twenty-five printed passives.** Nineteen are wired as of 2026-07-28. **Still unwired, deliberately and named here rather than implied fixed:** Counter / Retaliate / Avenge (a reaction system), Drain Attack, Attack All, Lucky Find, Mind's Eye, Good Instincts, Item Pro, Luck Smiles, Once a Snake, and all **forty Affinity Changers** (Anti-X, Null X, X Drain, X Repel), which have no path to modify `system.affinities` at all. The spec's second clause is what keeps that honest: an unimplemented passive must resolve to `null`, never to a neighbour.

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
Check: manual — last verified: 2026-07-28 (v0.1.12)
```

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

---

## §6 Escape log

> **This section is load-bearing as of the 2026-07-27 clause-4 split.** Upfront hands-on verification is aspirational, so **play is the primary discovery channel** and this log is the mechanism that keeps that from being a hole. The obligation is on the session, not on the reporter:
>
> **A bug reported from play is not fixed until the same session has shipped (a) the fix, (b) a rung that fails on the pre-fix behavior, and (c) a row here.** A fix without a rung means the class stays open and the next instance is discovered the same expensive way. Report bugs however is convenient — a sentence is enough; reconstructing the mechanism is the session's job, not the reporter's.
>
> **Residual risk, stated rather than buried:** defects that only fire at a boundary can look like ordinary play and go unreported for a long time. Halve-damage was exactly this — it misbehaved *only* on an overkill hit, which reads as a normal knockout. Nothing about reporting-from-play catches that class, so the §3 static scans and the property sweeps in the suites carry more weight than they otherwise would. Prefer a property sweep over hand-picked examples whenever the input space has edges.

| Date | Escape | Rung that now catches it |
|---|---|---|
| 2026-06-07 | **FP Halve Damage restored more HP than the hit ever dealt.** `applyDamage` stored the *computed* damage on the chat flag, but the HP write floors at 0 — so an overkill hit recorded 40 damage while dealing only 20. `resolveHalveDamage` then restored `oldDamage - newDamage` against the post-hit HP, over-restoring by exactly the overkill. At 20 HP taking a 40, the target ended back at 20: *"undoes the initial damage but doesn't apply the new damage."* It fires **only** when a hit drops the target — the only time the Fate Point is ever spent. Open 7 weeks, filed as awaiting HP numbers from a live session. | `test/fate-damage.test.mjs` — `halveDamageResult` resolves from `hpBefore` (the HP the hit found, now stored on the flag) instead of restoring a difference. 683 assertions incl. a property sweep asserting a halve never leaves HP above the pre-hit value. Mutation-proved: reinstating the old arithmetic turns **82** assertions red, all three ESCAPE cases among them. |

| 2026-07-27 | **Every demon created from the compendium lost all of its skills.** `buildDemonSkills` wrote field names and enum values from memory instead of reading the schema: `magicalAttack` where `CONFIG.SMT.skillTypes` declares `magical-attack`, `target` for `targets`, `description` for `effectDescription`, a `cost.allHp` key that does not exist. `buildDemonSystem` then wrote `drops` as a bare string where the schema declares a SchemaField, and `behavior`, which only npc-data has. Foundry rejected each Item and the actor came up skill-less. Found by creating three demons and reading the console — the first thing a player would do. | `test/demon-skills.test.mjs` — builds skills for all 194 demons and checks every field against names parsed out of `skill-data.mjs` and enums read from `CONFIG.SMT`, plus nested-shape checks for every SchemaField. Reproduced the escape at **4,692 violations**; the nested-shape leg was added after the name-only check passed `drops`-as-a-string happily. |

| 2026-07-27 | **The PDF's purchase watermark was imported as a skill onto 109 demons.** The skill parser took every row below the table header, and page furniture — the printed page number, and the per-buyer watermark carrying a real name and order number — sits below the table in the name column alone. 163 junk rows across 56% of the corpus, and the buyer's identity ended up inside every created Actor and would have travelled in any exported or shared content. Found by reading an exported actor JSON. | `tools/import-rulebook.py` drops rows where nothing but the name is populated (a real skill always fills at least one other cell — Legion's `Anti-Phys`, p.194, is a passive carrying only a learn level), and its verification now **refuses to write** if a page-number or `Order #` name survives. 1575 → 1412 rows, all 163 junk, zero real skills lost. |
| 2026-07-27 | **Boss HP was silently halved or worse.** `hp.max` is derived, so writing a boss's printed HP into `hp.value` clamped it to `(vitality + level) × multiplier`. 21 of 23 bosses print more than the formula yields — Specter got 72 instead of 148, Baal Avatar 630 instead of 13,000. Found by reading an exported actor JSON, not by any assertion. | `helpers/resources.mjs` adds an explicit max override that `prepareDerivedData` consults; `boss-hp.test.mjs` (39 assertions) checks every demon's resolved max against the printed number. The override is driven by comparing derived to printed rather than by the `boss` flag, which is what surfaced **Scáthach** (p.129): a general demon printing 498 HP where the formula gives 486. Her MP and Lakshmi on the same page derive exactly, so it is a slip in the book — carried as printed and reported as a caveat, per §1 clause 1. |

| 2026-07-28 | **Freeze and Shock cost their victim nothing.** `processAilmentTurnStart` cleared both unconditionally at the start of the victim's turn and returned, so the p.68 save never ran, the failure it exists to have never happened, and the `cannotActAilments` entries for freeze and shock were unreachable code. Two of the eleven common ailments were decorative. Nothing reported it — an ailment that ends immediately looks like an ailment that was saved against. | `test/ailment-rules.test.mjs` — `turnStartPlan` is pure and returns `save` on the first turn start, `autoRecover` only once `ailmentSaveFailed` is set. The suite asserts the forfeit branch is reachable, which is the assertion the old behavior could not pass. 124 assertions; 17 were red before the fix. |
| 2026-07-28 | **Stone was given the wrong rule entirely.** It sat in `critOnPhysAilments`, so a Phys hit on a petrified target became an automatic critical. p.66 gives Stone a **30% chance to shatter and die** instead — a different outcome, on a different distribution. Its other two clauses were absent as well: damage from every element but Phys, Force and Almighty is halved, and a Stoned target cannot dodge at all. | `ailment-rules.test.mjs` asserts `critOnPhysAilments` holds exactly three ailments and that Stone is not one; `shatterPctFor` and `incomingDamageMultiplier` are pure and swept across all eleven elements; `canDodge` covers the whole p.68 Dodge column. The shatter roll and the dodge denial are wired in `resolveAttack`. |
| 2026-07-28 | **Curse was inert.** `curseAilment` had a schema field, a sheet indicator and a clear button, and no mechanical effect anywhere: `autoFailMin` was one constant with no cursed branch, the p.67 per-action mishap did not exist, and — the part that made it invisible — *nothing ever set the flag*. p.57 says a fumble on any check inflicts it, so in seven weeks of play no character could have become Cursed by the route the book actually uses. | `evaluatePercentile` now takes `cursed` and swaps in `check.curseAutoFailMin` (86); `ailment-rules.test.mjs` pins both bands and asserts the fumble and critical ends of the ladder are unmoved. `rollPercentile` applies the Curse on a fumble; `rollCurseMishap` rides the same four call sites as the poison drain. |

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
