import { calculateDamage } from "../helpers/damage.mjs";

export default class SMTActor extends Actor {

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

  // d100 check vs TN. hasMight widens crit threshold to TN/5.
  async rollPercentile(tn, label, { hasMight = false } = {}) {
    const roll = new Roll("1d100");
    await roll.evaluate();
    const result = roll.total;

    let outcome;
    let cssClass;
    let isCritical = false;
    let isSuccess = false;
    if (result === 100) {
      outcome = game.i18n.localize("SMT.Roll.Fumble");
      cssClass = "fumble";
    } else if (result >= 96) {
      outcome = game.i18n.localize("SMT.Roll.AutoFail");
      cssClass = "auto-fail";
    } else if (result === 1) {
      outcome = game.i18n.localize("SMT.Roll.Critical");
      cssClass = "critical";
      isCritical = true;
      isSuccess = true;
    } else if (result <= Math.floor(tn / (hasMight ? 5 : 10))) {
      outcome = game.i18n.localize("SMT.Roll.Critical");
      cssClass = "critical";
      isCritical = true;
      isSuccess = true;
    } else if (result <= tn) {
      outcome = game.i18n.localize("SMT.Roll.Success");
      cssClass = "success";
      isSuccess = true;
    } else {
      outcome = game.i18n.localize("SMT.Roll.Failure");
      cssClass = "failure";
    }

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

  // Power roll: 1d10 exploding + base + skill power. Crits double total.
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

  // Apply damage accounting for affinity/resistance. Handles drain, repel, null.
  async applyDamage({ rawPower, element, isPhysical, isCritical, attacker, skillName, dodgeFumble = false }) {
    const affinity = this.system.affinities[element] ?? "normal";
    const resistance = isPhysical ? this.system.physicalResistance : this.system.magicalResistance;

    const result = calculateDamage({ rawPower, affinity, resistance, isCritical, dodgeFumble });

    if (CONFIG.SMT.debug) console.log("smt-rpg | Damage Calculation", {
      attacker: attacker?.name, target: this.name, skillName,
      element, affinity, isPhysical, isCritical, dodgeFumble,
      rawPower, resistance,
      afterAffinity: result.afterAffinity,
      resistanceApplied: result.resistanceApplied,
      finalDamage: result.finalDamage,
      isNull: result.isNull, isDrain: result.isDrain, isRepel: result.isRepel,
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
      const newHp = Math.min(this.system.hp.value + rawPower, this.system.hp.max);
      chatData.healedAmount = newHp - this.system.hp.value;
      await this.update({ "system.hp.value": newHp });
    } else if (result.isRepel) {
      if (attacker) {
        const attackerHp = Math.max(attacker.system.hp.value - rawPower, 0);
        chatData.reflectedAmount = attacker.system.hp.value - attackerHp;
        chatData.attackerName = attacker.name;
        await attacker.update({ "system.hp.value": attackerHp });
      }
    } else if (!result.isNull && result.finalDamage > 0) {
      const newHp = Math.max(this.system.hp.value - result.finalDamage, 0);
      await this.update({ "system.hp.value": newHp });
    }

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/damage-result.hbs",
      chatData
    );
    const dmgMsg = await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content
    });

    // Store for FP "Halve Damage" button
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
