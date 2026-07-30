import { calculateDamage, applyDamageToHp } from "../helpers/damage.mjs";
import { evaluatePercentile } from "../helpers/checks.mjs";
import { expThresholdForLevel, statGrowthFor } from "../helpers/advancement.mjs";
import { incomingDamageMultiplier } from "../helpers/ailments.mjs";
import { blocksMagatamaSwitch } from "../helpers/magatama.mjs";

// Cap on any single HP delta, guarding against NaN/Infinity or corrupted flag values.
const MAX_HP_DELTA = 1_000_000;

export default class SMTActor extends Actor {

  // Non-finite -> 0; else floor at 0, cap at MAX_HP_DELTA.
  static #clampHpDelta(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.clamp(Math.floor(value), 0, MAX_HP_DELTA);
  }

  // Include derived stat totals for roll formulas (e.g. initiative)
  getRollData() {
    const data = { ...super.getRollData() };
    const sys = this.system;
    data.agilityTotal = sys.agilityTotal ?? sys.agility;
    data.strengthTotal = sys.strengthTotal ?? sys.strength;
    data.magicTotal = sys.magicTotal ?? sys.magic;
    data.vitalityTotal = sys.vitalityTotal ?? sys.vitality;
    data.luckTotal = sys.luckTotal ?? sys.luck;
    return data;
  }

  get skills() {
    return this.items.filter(i => i.type === "skill").sort((a, b) => a.name.localeCompare(b.name));
  }

  get magatamas() {
    return this.items.filter(i => i.type === "magatama");
  }

  get equippedGear() {
    return this.items.filter(i => i.type === "gear" && i.system.equipped);
  }

  get consumables() {
    return this.items.filter(i => i.type === "consumable");
  }

  // THE ONLY _preUpdate on this class. A second definition was added on 2026-07-29 for
  // the Magatama rule below and silently replaced this one — a duplicate class member is
  // legal JS, the later wins, and no rung looked (GAUNTLET.md §6, C14 now does).
  //
  // Two guards live here:
  //
  // 1. Clamp persisted HP/MP into [0, derived max] on every write. The derived
  //    _clampCurrentValues only fixes the displayed value, not the stored _source — so
  //    manual bar edits (typing 9999) and heal-to-full sentinels would otherwise persist
  //    above max. This pins the source value.
  //
  // 2. p.39: a fiend's active Magatama "cannot be switched at all" while in combat.
  //    Enforced on the document rather than in the sheet because the sheet's radio binds
  //    straight to system.activeMagatama and DocumentSheetV2 auto-saves it — there is no
  //    handler to hang it on, and a macro or another client would bypass one anyway. The
  //    offending key is dropped rather than the whole update refused, so an unrelated
  //    edit submitted in the same pass still lands.
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;

    for (const res of ["hp", "mp"]) {
      const v = foundry.utils.getProperty(changed, `system.${res}.value`);
      const max = this.system?.[res]?.max;
      if (v !== undefined && Number.isFinite(max)) {
        foundry.utils.setProperty(changed, `system.${res}.value`, Math.clamp(Math.floor(Number(v) || 0), 0, max));
      }
    }

    if (this.type === "fiend") {
      const inCombat = !!game.combat?.started
        && game.combat.combatants.some(c => c.actor?.id === this.id);
      if (blocksMagatamaSwitch({
        current: this.system.activeMagatama,
        incoming: changed.system?.activeMagatama,
        inCombat
      })) {
        ui.notifications.warn(game.i18n.localize("SMT.Warnings.MagatamaInCombat"));
        delete changed.system.activeMagatama;
      }
    }

    return allowed;
  }

  // Set level, reset EXP to that level's floor via the shared curve (p.48). Heals to full.
  async setLevel(level) {
    if (!(game.user.isGM || this.canUserModify(game.user, "update"))) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return null;
    }
    const target = Math.clamp(Math.floor(Number(level) || 0), 1, CONFIG.SMT.advancement.maxLevel);
    const exp = expThresholdForLevel(target, this.system.expMultiplier ?? 1);
    // Apply level/exp first so hp/mp.max re-derive, then heal to the NEW full (p.49). _preUpdate
    // clamps the heal to the freshly-derived max (no giant sentinel left in the source).
    await this.update({ "system.level": target, "system.exp": exp });
    await this.update({ "system.hp.value": this.system.hp.max, "system.mp.value": this.system.mp.max });
    return this;
  }

  // Advance one level when enough EXP is banked (p.48). Gated; reuses setLevel's
  // EXP-reset + full-heal path. Stat/skill choices stay the player's to apply (p.49).
  async levelUp() {
    if (!(game.user.isGM || this.canUserModify(game.user, "update"))) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return null;
    }
    if (!this.system.canLevelUp) {
      ui.notifications.info(game.i18n.localize("SMT.LevelUp.NotReady"));
      return null;
    }
    const actor = await this.setLevel(this.system.level + 1);
    if (actor) await actor.#applyStatGrowth();
    return actor;
  }

  // The level-up stat point (p.34). Demons "apply the point randomly": roll 1d10 on
  // the Demon Stat Growth Table and apply the result. Fiends and humans "may apply
  // this point to any stat they prefer", so nothing is rolled for them.
  //
  // Faces 9 and 0 hand the point back even for a demon, so those post the same
  // prompt rather than being applied silently.
  async #applyStatGrowth() {
    const isDemon = this.type === "demon";
    let growth = { stat: null, playerChoice: true };
    let roll = null;

    if (isDemon) {
      roll = new Roll(CONFIG.SMT.advancement.statGrowth.die);
      await roll.evaluate();
      growth = statGrowthFor(roll.total, this.system.favoredStat);
    }

    if (growth.stat) {
      await this.update({ [`system.${growth.stat}`]: (this.system[growth.stat] ?? 0) + 1 });
    }

    const statLabel = growth.stat
      ? game.i18n.localize(CONFIG.SMT.stats[growth.stat])
      : "";
    const content = growth.stat
      ? game.i18n.format("SMT.LevelUp.StatRolled", { roll: roll.total, stat: statLabel })
      : game.i18n.localize("SMT.LevelUp.StatChoice");

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="smt-chat"><strong>${this.name}</strong> — ${content}</div>`,
      rolls: roll ? [roll] : []
    });

    if (CONFIG.SMT.debug) console.log("smt-rpg | Stat Growth", {
      actor: this.name, type: this.type, roll: roll?.total ?? null,
      favoredStat: this.system.favoredStat, applied: growth.stat
    });
  }


  // Roll 1d100 vs tn, post the card, return the outcome.
  async rollPercentile(tn, label, { hasMight = false } = {}) {
    const roll = new Roll("1d100");
    await roll.evaluate();
    const result = roll.total;

    // A Curse widens this actor's auto-fail band to 86-99 (p.57, p.67).
    const evaluated = evaluatePercentile(result, tn, { hasMight, cursed: !!this.system.curseAilment });
    const outcome = game.i18n.localize(evaluated.outcomeKey);
    const cssClass = evaluated.cssClass;
    const isCritical = evaluated.isCritical;
    const isSuccess = evaluated.isSuccess;

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/percentile-roll.hbs",
      { label, result, tn, outcome, cssClass }
    );

    const msg = await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    });

    // p.57: "Furthermore, when you fumble, you become Cursed." The rule is stated for
    // checks in general, not just attacks, so it belongs on the shared roll.
    if (evaluated.isFumble && !this.system.curseAilment) {
      await this.update({ "system.curseAilment": true });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="smt-roll effect-notice"><p>${game.i18n.format("SMT.Curse.Inflicted", { name: this.name })}</p></div>`
      });
    }

    return { result, outcome, cssClass, isCritical, isSuccess, isFumble: evaluated.isFumble, messageId: msg.id };
  }

  // Power roll: 1d10x10 + base + skill power (+ extraDice, e.g. Powerful Strikes +1d10), doubled on crit. Posts a card.
  // `boost` is an elemental Boost passive's multiplier (p.110): it multiplies base
  // power + potency BEFORE the power roll is added, which is what the book specifies
  // and is also why it cannot simply scale the total.
  async rollPower(basePower, skillPower = 0, label = "Power Roll", isCritical = false, extraDice = "", boost = 1) {
    const roll = new Roll(extraDice ? `1d10x10 + ${extraDice}` : "1d10x10");
    await roll.evaluate();
    const boosted = Math.floor((basePower + skillPower) * (Number.isFinite(boost) && boost > 0 ? boost : 1));
    let total = boosted + roll.total;
    if (isCritical) total *= 2;

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/power-roll.hbs",
      {
        label, basePower, skillPower, diceTotal: roll.total, total, isCritical,
        // Only shown when a Boost actually moved the number — otherwise the card
        // would print the same figure twice for every attack in the game.
        boosted, boostApplied: boosted !== basePower + skillPower
      }
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    });

    return { total, isCritical };
  }

  // Apply an attack: affinity/resistance -> mutate HP -> post card. Handles null/drain/repel.
  // rawPower may come from a flag, so it's clamped.
  async applyDamage({ rawPower, element, isPhysical, isCritical, attacker, skillName, dodgeFumble = false, damageMultiplier = 1 }) {
    rawPower = SMTActor.#clampHpDelta(rawPower);

    const affinity = this.system.affinities[element] ?? "normal";
    const resistance = isPhysical ? this.system.physicalResistance : this.system.magicalResistance;
    // Repel uses the attacker's matching resistance (p.65).
    const attackerResistance = attacker
      ? (isPhysical ? attacker.system.physicalResistance : attacker.system.magicalResistance)
      : 0;

    // The Magic rating applies to magical attacks and stacks with the element one
    // (p.65). Ailment is passed for completeness but never touches damage.
    const magicAffinity = this.system.categoryAffinities?.magic ?? "normal";
    const ailmentAffinity = this.system.categoryAffinities?.ailment ?? "normal";
    // Stone halves everything but Phys/Force/Almighty; Fly doubles the lot (p.66).
    const incomingMultiplier = incomingDamageMultiplier(this.system.ailment ?? "none", element);

    const result = calculateDamage({
      rawPower, affinity, resistance, isCritical, dodgeFumble, attackerResistance,
      magicAffinity, ailmentAffinity, isPhysicalAttack: isPhysical, incomingMultiplier,
      finalMultiplier: damageMultiplier
    });
    let hpBefore = null;

    if (CONFIG.SMT.debug) console.log("smt-rpg | Damage Calculation", {
      attacker: attacker?.name, target: this.name, skillName,
      element, affinity, isPhysical, isCritical, dodgeFumble,
      rawPower, resistance,
      afterAffinity: result.afterAffinity,
      resistanceApplied: result.resistanceApplied,
      finalDamage: result.finalDamage,
      isNull: result.isNull, isDrain: result.isDrain, isRepel: result.isRepel,
      drainedAmount: result.drainedAmount, reflectedDamage: result.reflectedDamage,
      targetHpBefore: this.system.hp.value, targetHpMax: this.system.hp.max
    });

    const chatData = {
      targetName: this.name,
      skillName,
      element,
      ...result,
      isCritical,
      isPhysical
    };

    if (result.isDrain) {
      const healAmount = SMTActor.#clampHpDelta(result.drainedAmount);
      const newHp = Math.min(this.system.hp.value + healAmount, this.system.hp.max);
      chatData.healedAmount = newHp - this.system.hp.value;
      await this.update({ "system.hp.value": newHp });
    } else if (result.isRepel) {
      if (attacker) {
        const reflectAmount = SMTActor.#clampHpDelta(result.reflectedDamage);
        const attackerHp = Math.max(attacker.system.hp.value - reflectAmount, 0);
        chatData.reflectedAmount = attacker.system.hp.value - attackerHp;
        chatData.attackerName = attacker.name;
        await attacker.update({ "system.hp.value": attackerHp });
      }
    } else if (!result.isNull && result.finalDamage > 0) {
      // HP at the moment the hit lands. Stashed on the flag below so the FP halve
      // resolves from it rather than from the post-hit HP — an overkilled hit floors
      // at 0, so the difference is otherwise unrecoverable (GAUNTLET.md §6).
      hpBefore = this.system.hp.value;
      const dmgAmount = SMTActor.#clampHpDelta(result.finalDamage);
      let { hpAfter: newHp } = applyDamageToHp(hpBefore, this.system.hp.max, dmgAmount);
      const update = {};

      // Endure (p.110): a hit that would reduce you to 0 leaves you at 1 instead,
      // once per combat, and never while Stoned.
      if (newHp <= 0 && hpBefore > 0) {
        const { endureApplies } = await import("../helpers/passives.mjs");
        if (endureApplies(this.system.hasEndurePassive, {
          ailment: this.system.ailment ?? "none",
          alreadyUsed: !!this.system.endureUsed
        })) {
          newHp = CONFIG.SMT.endure.survivesAt;
          update["system.endureUsed"] = true;
          chatData.endured = game.i18n.format("SMT.Endure.Survived", { name: this.name });
        }
      }
      update["system.hp.value"] = newHp;
      // Damage wakes Sleep etc. (p.66); folded into the same write.
      if (CONFIG.SMT.wakeOnDamageAilments.includes(this.system.ailment)) {
        const ailmentLabel = game.i18n.localize(CONFIG.SMT.ailments[this.system.ailment] ?? this.system.ailment);
        chatData.wokeFrom = game.i18n.format("SMT.Ailment.WokeFrom", { ailment: ailmentLabel });
        update["system.ailment"] = "none";
      }
      await this.update(update);
    }

    // Resulting HP for the card; read after the mutation above.
    chatData.targetHp = this.system.hp.value;
    chatData.targetHpMax = this.system.hp.max;
    chatData.targetDefeated = this.system.hp.value <= 0;

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/damage-result.hbs",
      chatData
    );
    const dmgMsg = await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content
    });

    // Stash for the FP "Halve Damage" button.
    if (result.finalDamage > 0 && !result.isNull && !result.isDrain && !result.isRepel) {
      const { getTokenUuid } = await import("../helpers/combat.mjs");
      await dmgMsg.setFlag("smt-rpg", "damageData", {
        targetTokenUuid: getTokenUuid(this) ?? this.id,
        originalDamage: result.finalDamage,
        currentDamage: result.finalDamage,
        hpBefore,
        resolved: false
      });
    }

    return result;
  }
}
