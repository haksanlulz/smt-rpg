# Smoke checklist — the 2026-08-15 subsystems

*Sections 1–5 are the lane 3 work; section 6 is lane 4's first wired unit.*

Every rung behind these changes is node-side. **Nothing below has been observed in Foundry**,
and `GAUNTLET.md` §1 clause 4 is explicit that suites passing is not the same claim as the
thing working. This file is the list of what to look at, with the expected result written
down beforehand so a wrong-but-plausible outcome is not read as a pass.

Work top to bottom; later sections reuse the setup from earlier ones. Each numbered step
states **what to do** and **what should happen**. A ✗ is worth more than a ✓ — record it,
and the rung that missed it goes in `GAUNTLET.md` §6.

## Setup

- One scene, combat tracker started, initiative rolled.
- **A** — a player-owned fiend or human, at least one ally token on the same side.
- **B** — an ordinary demon NPC, `isBoss` off.
- **C** — a second NPC with `isBoss` **on**.
- Skills needed on A, built from the compendium so the parsed fields are the ones under test:
  Beast Eye, Dragon Eye, Tetraja, Makarakarn, Tetrakarn, Deadly Fury, Pinhole, Analyze,
  God's Curse, and the passives Drain Attack, Attack All, Item Pro, Luck Smiles.
- `CONFIG.SMT.debug = true` in the console. The budget, the barrier payload and the fumble
  victim list all log, and reading the log is faster than inferring from the card.

---

## 1. Action budget and press skills (p.63, p.96)

| # | Do | Expect |
|---|---|---|
| 1.1 | On A's turn, use any skill, then use a second skill | The second is **refused** with a warning naming A and the skill. No MP is spent on the refusal, and no use-limit is burned — check the MP figure before and after |
| 1.2 | End the round, come back to A's turn, use a skill | Allowed again. The budget resets on the turn, not on a button |
| 1.3 | Use **Beast Eye** as A's first action | Auto-succeeds, posts a card, then a notice reading **2 actions left**. Not 1, not 3 |
| 1.4 | Use two more skills | Both allowed; the second leaves 0 and a third is refused |
| 1.5 | Use **Beast Eye** again in the same round | **Refused on the use limit**, not the budget — the warning should name the period as *round*. This is the p.96 stamp neither printed row carries |
| 1.6 | Fresh round. Use **Dragon Eye** first | Notice reads **4 actions left** |
| 1.7 | On **C** (boss), use Dragon Eye | Notice reads **5** — the boss's unspent second action rides on top of the grant |
| 1.8 | Out of combat entirely, use several skills back to back | **Never refused.** There is no action economy outside a turn |
| 1.9 | With a TN at 100%+, take a multi-action | The multi-action's 2–3 checks cost **one** action, not two or three. This is the axis most likely to have been conflated |

## 2. Barriers (p.101)

| # | Do | Expect |
|---|---|---|
| 2.1 | A casts **Tetrakarn** | Chat notice naming the barrier and every ally. A token effect icon appears on **each ally**, not just A |
| 2.2 | B hits A with a physical attack | **Repelled** — B takes the reflected damage. The damage card says repel, not null |
| 2.3 | Advance one round, hit A again with Phys | Still repelled — "until the end of the **next** round" |
| 2.4 | Advance a second round, hit again | **Not** repelled, and the icon is gone |
| 2.5 | Cast **Makarakarn**, hit A with a magical attack of an element A has no rating for | Repelled. This is the category-axis leg — if it lands as normal damage, Makarakarn was read per-element |
| 2.6 | Cast **Tetraja**, hit A with a Light attack | **Nullified**, then a notice that the barrier fades, and the icon disappears |
| 2.7 | Hit A with Light again | Ordinary damage. The charge was spent |
| 2.8 | Give an ally **Null Light** on their sheet, cast Tetraja, hit them with Light | Nullified, and the barrier **stays** — theirs nullified it, not the spell |
| 2.9 | Give an ally **Repel Light**, cast Tetraja, hit with Light | **Repelled**, barrier stays. A printed Repel is not downgraded to Null |
| 2.10 | Cast a barrier, then end the encounter | Icons cleared. Then flip **Barriers Survive Combat** on in settings and repeat — they persist |

## 3. Fumble Effect Chart (p.58, p.64)

The most-reachable rule in the system, and until today it did nothing. To force a fumble,
set A's TN low and roll until a 100 comes up, or edit the roll in the console.

| # | Do | Expect |
|---|---|---|
| 3.1 | A fumbles a single-target attack, with allies present | Power is still rolled. A notice names who got hit — A themselves or **one** ally, chosen at random |
| 3.2 | Look at the card for that victim | If it is an **ally**: Dodge and Apply Damage. If it is **A**: Apply Damage only, **no Dodge button** |
| 3.3 | A fumbles an attack whose targets are "all" | **Two** cards: one for every ally (dodgeable) and one for A (not). A is in the blast |
| 3.4 | A fumbles with no allies on the scene at all | A hits themselves. It must not fizzle |
| 3.5 | Give an ally Counter, let them be the fumble victim | **No counterattack is offered.** A fumble is A's mistake, not an opening |
| 3.6 | Check A's status after any fumble | Cursed — that part already worked, and should still |

## 4. The four passives (p.110)

| # | Do | Expect |
|---|---|---|
| 4.1 | A has **Drain Attack**. Basic-strike B for a clean hit | A recovers **a quarter of the damage dealt**, rounded down, with a notice |
| 4.2 | Basic-strike B when B has 3 HP left and the hit would deal 40 | A recovers **0** — a quarter of the 3 actually lost, not of the 40. Round down |
| 4.3 | Use a **physical attack skill** rather than a basic strike | **No drain.** "Basic strike" is narrower than "physical attack" |
| 4.4 | A has **Attack All**. Basic-strike with one enemy selected | Hits **every** enemy, not just the selected one |
| 4.5 | A has Attack All and Counter. Trigger the counterattack | The counter hits **only** the original attacker |
| 4.6 | A has **Item Pro**. Use an attack item | The power roll shows an extra `1d10`. Then cast a spell — it should **not** |
| 4.7 | A has **Luck Smiles**. B attacks A | A third button, **Luck Smiles**, on A's row |
| 4.8 | Click it | Row closes, no dodge, no damage, no ailment. A notice fires |
| 4.9 | B attacks A again | The button is **gone** — the scenario budget is spent |
| 4.10 | Attack a target without the passive | No button at all |

## 5. The four named skills (p.102, p.103, p.106, p.108)

| # | Do | Expect |
|---|---|---|
| 5.1 | Use **Deadly Fury** | Hits all enemies. Criticals should come up noticeably more often — the band is a fifth of the TN, not a tenth. Roll it a dozen times |
| 5.2 | Give A **Might** as well, use Deadly Fury | Still a fifth. Not a twenty-fifth — if criticals nearly stop, the two compounded |
| 5.3 | Use **Pinhole** on B | B's dodge TN on the card is **half** its sheet value |
| 5.4 | Let the hit land | The damage card's resistance figure is **half** B's sheet resistance. Both halves must move; one moving alone is the half-fix |
| 5.5 | Use **Analyze** on B, whose level is below A's roll + level | Success notice, and **B's sheet opens for the GM** |
| 5.6 | Use Analyze on a much higher-level demon | Failure notice naming the total and the level. No sheet |
| 5.7 | Use **Analyze** on **C** (boss) | Refused before any roll. **No power roll card at all** — if a roll happens, the refusal became a threshold |
| 5.8 | Use **God's Curse** | One d10 card naming the rolled face and the ailment. Then the ordinary 60% ailment rolls per target |
| 5.9 | Use it against several enemies | **One** d10 for the whole cast — every target that fails gets the **same** ailment, not five different ones |
| 5.10 | Cast it a dozen times | All five ailments should appear across the samples: Charm, Panic, Sleep, Restrain, Stun |

## 6. Encounter check, ambush and back attack (p.70-71)

The control sits in the combat tracker next to **Pay Out Rewards**, GM only. It needs at
least one player-owned combatant. To force a band, roll normally a few times or set Luck
TNs high or low first — the interesting cases are the two extremes, not the middle.

| # | Do | Expect |
|---|---|---|
| 6.1 | Look at the tracker as GM | An **Encounter Check** button on the same row as Pay Out Rewards |
| 6.2 | Start a combat with no player-owned combatants, press it | Warning that there is nobody to roll it. No chat card |
| 6.3 | Press it with the party present | One Luck check card **per PC**, then a summary naming each result, the party total, and the effect |
| 6.4 | Add up the values by hand from the summary | The total matches. Critical +2, Success +1, Failure −1, Auto-Fail −2, Fumble −3 |
| 6.5 | Include a **friendly NPC demon** on the party's side | It does **not** roll and does **not** count. Only player-owned actors are PCs |
| 6.6 | Get a result of +3 or +4 (PCs ambush) | PC initiatives are re-rolled **with a +1d10**; enemy initiatives are re-rolled normally |
| 6.7 | Same result — look at the enemy tokens | Each carries a **Defenseless** icon |
| 6.8 | Attack a defenseless enemy before its first turn | **No Dodge button** on its row — it is denied, not merely likely to fail |
| 6.9 | Let that enemy's turn arrive | The Defenseless icon **clears**. Attack it again — Dodge is back |
| 6.10 | Get −4 or less (PCs back attacked) | Every PC's initiative is set from **Agility alone** — no d10 in it. Compare against the Agility on the sheet |
| 6.11 | Same result — look at the PC tokens | **Shock**, not Defenseless. The two must not both be present |
| 6.12 | Give a PC **Null Nerve** first, then force a back attack | Shock lands **anyway** — p.71 says it ignores affinity, and this is the case the sentence exists for |
| 6.13 | Shift-click the button | The Luck TN on each card is **20 higher** than the sheet value |
| 6.14 | Alt-click it | 20 **lower** |
| 6.15 | Get a 0 to +2 result | Nothing applied — no icons, and initiatives re-rolled with no bonus on either side |

---

## Recording the result

For each ✗, `GAUNTLET.md` §6 wants three things in the same sitting: the fix, a rung that
fails on the pre-fix behaviour, and a row in the log. A ✗ with no rung leaves the class open
and the next instance gets found the same expensive way.

Sections that pass clean can date their `§5` manual rung. Sections not run stay **NEVER** —
an unrun row is not a passing row.
