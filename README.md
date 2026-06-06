# Shin Megami Tensei: Tokyo Conception

A [Foundry Virtual Tabletop](https://foundryvtt.com/) game system for **Shin Megami Tensei: The Roleplaying Game — Tokyo Conception**, the d100 percentile tabletop RPG set in the post-apocalyptic Vortex World. Play Fiends, Demons, and Humans; the system handles the percentile skill checks, power rolls, elemental affinities, ailments, dodge, and Fate Points so the table can focus on the game.


## What it does

- **Actor types:** Fiend, Demon, Human (full player sheets) and NPC (streamlined sheet).
- **Item types:** Skill, Magatama, Gear, Consumable.
- **d100 percentile combat:** skill checks roll under a target number derived from stats; criticals and fumbles fall out of the roll. Initiative is `1d10x10 + agility`.
- **Power & damage:** attack skills roll power, then resolve per target through elemental affinities (Weak / Strong / Null / Drain / Repel) before applying HP loss.
- **Ailments:** the common ailments occupy a single priority slot (p.68), while Death and Curse stack alongside it as their own conditions (p.67).
- **Dodge and Fate Points:** targets may dodge incoming attacks; Fate Points fuel rerolls, target-number boosts, and damage halving, all driven from interactive chat-card buttons.
- **Consumables:** medicines and revival items, including party-wide heal-all and cure-all behaviour, plus throwable attack items (Rocks).

Grid unit is 2 m per square. HP is the primary token bar, MP the secondary.

## Requirements

| | |
|---|---|
| Foundry VTT | **minimum v13**, **verified on v14** |
| System version | 0.1.0 |

The system targets the v14 API surface and remains compatible back to v13.

## Installation

Not yet published to a manifest URL, so install manually.

**Symlink (recommended for development)** — keeps the repo elsewhere and links it into Foundry's data directory:

```powershell
# Windows (PowerShell, run as admin or with Developer Mode enabled)
New-Item -ItemType SymbolicLink `
  -Path "$env:LOCALAPPDATA\FoundryVTT\Data\systems\smt-rpg" `
  -Target "C:\path\to\smt-rpg"
```

```bash
# macOS / Linux
ln -s /path/to/smt-rpg "$HOME/.local/share/FoundryVTT/Data/systems/smt-rpg"
```

**Copy** — drop the repo contents into a `systems/smt-rpg/` folder inside your Foundry **Data** directory.

**Manifest URL** — once the system is published, install it from Foundry's *Add-on Modules → Install System* screen using the manifest URL. (Not available yet.)

After installing, restart Foundry, then create or open a world and select **Shin Megami Tensei: Tokyo Conception** as the game system.

### Rulebook PDF

The system references the Tokyo Conception rulebook. **Place the rulebook PDF at the repository root.** It is intentionally `.gitignore`d (all `*.pdf` are excluded) and must never be committed or distributed — it is a copyrighted commercial product. Source comments cite rulebook page numbers (e.g. "p.68") that line up with this PDF.

## Running & debugging

Launch Foundry normally and open a world that uses this system. There is **no build step and no test suite** — the source is plain ES modules loaded directly by Foundry, so changes on disk take effect on reload.

To see verbose combat diagnostics (damage calculation, dodge resolution, ailment checks, Fate Point cascades), enable the debug flag from the browser console:

```js
CONFIG.SMT.debug = true;
```

It defaults to `false`. When on, the combat pipeline logs each step under the `smt-rpg |` prefix.

## Status

**Version 0.1.0 — early, actively developed.** The core actor/item sheets, percentile checks, power rolls, affinity-based damage, ailments, dodge, Fate Points, and consumables are implemented and wired through the chat-card flow.

### Known stubs and rough edges

- **Heal-all / cure-all consumables are functional:** `healAllAllies` resolves the user plus same-disposition allies in scope, and a `curesAilment` of `all` clears any active ailment. Targeting derives allies from token disposition rather than a formal party roster, so verify the affected set in-app on scenes with mixed dispositions.
- **Active Effects** are not yet wired as a feature (scaffolding deferred to a later stage).
- Sheets still use the classic tab markup rather than Foundry's native tab API.
- Some flavour/config data (e.g. demon clans, favored-stat handling) is partially stubbed pending later passes.

Because Foundry cannot run headlessly here, behavioural changes are validated by construction; anything touching live document updates, targeting, or chat interaction should be sanity-checked inside a running world.

## Contributing


## License

Code is the work of Abishai James. The *Shin Megami Tensei: Tokyo Conception* rulebook, its text, and its trademarks belong to their respective rights holders; no rulebook content is included in this repository.
