import { calculateDamage } from "../helpers/damage.mjs";
import { evaluatePercentile } from "../helpers/checks.mjs";

// Upper bound on any single HP delta we will write, guarding against NaN/Infinity or
// corrupted flag-sourced values reaching the data model.
const MAX_HP_DELTA = 1_000_000;

export default class SMTActor extends Actor {

  // Sanitize an HP delta before it mutates the data model. Non-finite values (NaN/Infinity from
  // a corrupted flag or bad arithmetic) collapse to 0; otherwise floor at 0 and cap at MAX_HP_DELTA.
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

  /**
   * Set this actor's level and reset its EXP to the floor for that level (p.48):
   * "the demon is set to having an amount of EXP as though they'd just then reached
   * that level". The threshold to reach level L is L^3 scaled by the actor's type
   * EXP multiplier (demon ×1.3, human ×0.8, fiend ×1) — the same curve
   * prepareDerivedData uses for expNext, so a set level and a natural level-up agree.
   * Levelling immediately heals to full HP/MP (p.48 "HP/MP Recovery"); the data
   * model clamps the inflated current values down to the freshly derived maxima.
   * GM/owner-gated like every other actor mutation. Clamped to the schema's 1..100.
   *
   * @param {number} level - the target level.
   * @returns {Promise<this|null>} the updated actor, or null if not permitted / no-op.
   */
  async setLevel(level) {
    if (!(game.user.isGM || this.canUserModify(game.user, "update"))) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoPermission"));
      return null;
    }
    const target = Math.clamp(Math.floor(Number(level) || 0), 1, 100);
    const mult = this.system.expMultiplier ?? 1;
    const exp = Math.floor(Math.pow(target, 3) * mult);
    await this.update({
      "system.level": target,
      "system.exp": exp,
      // Heal to full on level change (p.48). Oversized values clamp to the derived
      // max in _clampCurrentValues once the new level re-derives hp/mp.max.
      "system.hp.value": 9_999_999,
      "system.mp.value": 9_999_999
    });
    return this;
  }

  /**
   * Roll a d100 check against a target number, post the result card, and return the outcome.
   * Crit/fumble/auto-fail thresholds come from CONFIG.SMT.check via evaluatePercentile.
   *
   * @param {number} tn                        - target number to beat (roll <= tn succeeds).
   * @param {string} label                     - display label for the chat card.
   * @param {object} [options]
   * @param {boolean} [options.hasMight=false] - Might passive widens the crit threshold to TN/mightCritDivisor.
   * @returns {Promise<{result:number, outcome:string, cssClass:string, isCritical:boolean, isSuccess:boolean, messageId:string}>}
   */
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

  /**
   * Roll attack power: exploding 1d10 + base power + skill power, doubled on a crit. Posts a card.
   *
   * @param {number} basePower            - actor's base physical or magical power.
   * @param {number} [skillPower=0]       - the skill's own power contribution.
   * @param {string} [label="Power Roll"] - display label for the chat card.
   * @param {boolean} [isCritical=false]  - true to double the total (crit).
   * @returns {Promise<{total:number, isCritical:boolean}>}
   */
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

  /**
   * Apply an attack to this actor: resolve affinity/resistance, mutate HP, post the damage card,
   * and (on a real hit) stash damageData for the FP "Halve Damage" button. Handles null, drain,
   * and repel. Incoming rawPower is validated/clamped (it may originate from a ChatMessage flag).
   *
   * @param {object} params
   * @param {number}  params.rawPower            - rolled power total (clamped to [0, MAX_HP_DELTA]).
   * @param {string}  params.element             - damage/affinity element key.
   * @param {boolean} params.isPhysical          - true selects physical resistance, else magical.
   * @param {boolean} params.isCritical          - crit skips resistance (p.65).
   * @param {SMTActor} [params.attacker]         - the attacker (needed to reflect repel damage).
   * @param {string}  params.skillName           - skill display name for the card.
   * @param {boolean} [params.dodgeFumble=false] - dodge fumble: double damage, skip resistance (p.65).
   * @returns {Promise<import("../helpers/checks.mjs").DamageResult>}
   */
  async applyDamage({ rawPower, element, isPhysical, isCritical, attacker, skillName, dodgeFumble = false }) {
    rawPower = SMTActor.#clampHpDelta(rawPower);

    const affinity = this.system.affinities[element] ?? "normal";
    const resistance = isPhysical ? this.system.physicalResistance : this.system.magicalResistance;
    // Repel bounces the hit back at the attacker, so the attacker's matching resistance applies (p.65).
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
      // Heal the post-resistance drained amount, not the raw power (p.65).
      const healAmount = SMTActor.#clampHpDelta(result.drainedAmount);
      const newHp = Math.min(this.system.hp.value + healAmount, this.system.hp.max);
      chatData.healedAmount = newHp - this.system.hp.value;
      await this.update({ "system.hp.value": newHp });
    } else if (result.isRepel) {
      if (attacker) {
        // Reflect the post-(attacker)-resistance amount, not the raw power (p.65).
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
      // Wake on damage (p.66): a hit that deals real damage clears Sleep (and any
      // other CONFIG.SMT.wakeOnDamageAilments). Folded into the same update so the
      // HP loss and the ailment clear are one document write. Surfaced on the card.
      if (CONFIG.SMT.wakeOnDamageAilments.includes(this.system.ailment)) {
        const ailmentLabel = game.i18n.localize(CONFIG.SMT.ailments[this.system.ailment] ?? this.system.ailment);
        chatData.wokeFrom = game.i18n.format("SMT.Ailment.WokeFrom", { ailment: ailmentLabel });
        update["system.ailment"] = "none";
      }
      await this.update(update);
    }

    // Surface the target's resulting HP on the card so the outcome is readable at a
    // glance (no need to open the sheet). Read AFTER the HP mutation above. The
    // template suppresses this footer for null/repel, where the target takes no HP
    // loss; for drain the target healed, so the readout is still meaningful.
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
