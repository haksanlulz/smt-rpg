import { calculateDamage } from "../helpers/damage.mjs";
import { evaluatePercentile } from "../helpers/checks.mjs";
import { expThresholdForLevel } from "../helpers/advancement.mjs";

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

  // Set level, reset EXP to that level's floor via the shared curve (p.48). Heals to full.
  async setLevel(level) {
    if (!(game.user.isGM || this.canUserModify(game.user, "update"))) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return null;
    }
    const target = Math.clamp(Math.floor(Number(level) || 0), 1, CONFIG.SMT.advancement.maxLevel);
    const exp = expThresholdForLevel(target, this.system.expMultiplier ?? 1);
    await this.update({
      "system.level": target,
      "system.exp": exp,
      // Heal to full (p.49); clamps to derived max once level re-derives hp/mp.max.
      "system.hp.value": 9_999_999,
      "system.mp.value": 9_999_999
    });
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
    return this.setLevel(this.system.level + 1);
  }

  // Roll 1d100 vs tn, post the card, return the outcome.
  async rollPercentile(tn, label, { hasMight = false } = {}) {
    const roll = new Roll("1d100");
    await roll.evaluate();
    const result = roll.total;

    const evaluated = evaluatePercentile(result, tn, { hasMight });
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

    return { result, outcome, cssClass, isCritical, isSuccess, messageId: msg.id };
  }

  // Power roll: 1d10x10 + base + skill power, doubled on crit. Posts a card.
  async rollPower(basePower, skillPower = 0, label = "Power Roll", isCritical = false) {
    const roll = new Roll("1d10x10");
    await roll.evaluate();
    let total = basePower + skillPower + roll.total;
    if (isCritical) total *= 2;

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/power-roll.hbs",
      { label, basePower, skillPower, diceTotal: roll.total, total, isCritical }
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
  async applyDamage({ rawPower, element, isPhysical, isCritical, attacker, skillName, dodgeFumble = false }) {
    rawPower = SMTActor.#clampHpDelta(rawPower);

    const affinity = this.system.affinities[element] ?? "normal";
    const resistance = isPhysical ? this.system.physicalResistance : this.system.magicalResistance;
    // Repel uses the attacker's matching resistance (p.65).
    const attackerResistance = attacker
      ? (isPhysical ? attacker.system.physicalResistance : attacker.system.magicalResistance)
      : 0;

    const result = calculateDamage({ rawPower, affinity, resistance, isCritical, dodgeFumble, attackerResistance });

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
      const dmgAmount = SMTActor.#clampHpDelta(result.finalDamage);
      const newHp = Math.max(this.system.hp.value - dmgAmount, 0);
      const update = { "system.hp.value": newHp };
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
        resolved: false
      });
    }

    return result;
  }
}
