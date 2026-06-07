# Shin Megami Tensei: Tokyo Conception

A Foundry VTT game system for the Tokyo Conception tabletop RPG, a d100 percentile system. Fiends, Demons, Humans, and NPCs, with the combat math automated.

## Requirements

Foundry VTT v13+ (verified on v14).

## Install

In Foundry, use Install System and paste the manifest URL:

```
https://raw.githubusercontent.com/haksanlulz/smt-rpg/main/system.json
```

Or install manually: put this folder at `Data/systems/smt-rpg/` (copy or symlink), restart Foundry, and pick the system when you make a world.

## What works

- Actors: Fiend, Demon, Human (player sheets), NPC.
- Items: Skill, Magatama, Gear, Consumable.
- Percentile checks with crits and fumbles, power rolls, affinity damage (weak/strong/null/drain/repel), dodge, and Fate Points (reroll, boost TN, halve damage).
- Ailments: infliction rates, start-of-turn recovery/effects, and Vitality saves. Death and Curse stack alongside the normal ailment slot.
- Buffs and debuffs (-kaja/-nda, Dekaja/Dekunda), Concentrate, and Defend, via Active Effects and the token HUD.
- Demon fusion, negotiation and recruitment, combat-end rewards, and level-up.

Initiative is `1d10x10 + agility`, grid is 2m, HP and MP are the token bars.

## Dev notes

No build step; the source is plain ES modules. `node test/run-tests.mjs` runs the unit tests for the pure rules helpers. Set `CONFIG.SMT.debug = true` in the console for verbose combat logging.

The rulebook PDF is not included; page references in the comments line up with it.

## License

Code by Abishai James. Shin Megami Tensei: Tokyo Conception and its content belong to their respective rights holders; no rulebook text is included here.
