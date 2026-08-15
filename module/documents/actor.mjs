import { calculateDamage, applyDamageToHp, fractionalEnd, drainAmounts } from "../helpers/damage.mjs";
import { evaluatePercentile } from "../helpers/checks.mjs";
import { expThresholdForLevel, statGrowthFor } from "../helpers/advancement.mjs";
import { incomingDamageMultiplier } from "../helpers/ailments.mjs";
import { blocksMagatamaSwitch, magatamaLearnPlan } from "../helpers/magatama.mjs";
import {
  focusMultiplier, focusConsumed, spendUse, clearedByBoundary, ledgerKey
} from "../helpers/uses.mjs";
import { actionState, spendActions, turnKey } from "../helpers/actions.mjs";

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

  // The Focus multiplier for an action, and whether that action consumes it (p.105).
  // Reads the stored flag; the caller applies the number and clears the flag, so a
  // spell that rolls power in between leaves the Focus standing.
  focusFor(isPhysical) {
    const active = !!this.system.focusReady;
    return {
      multiplier: focusMultiplier({ active, isPhysical }),
      consumed: focusConsumed({ active, isPhysical })
    };
  }

  async clearFocus() {
    if (this.system.focusReady) await this.update({ "system.focusReady": false });
  }

  // Spend one use of a limited skill (p.96), or refuse. The ledger counts uses per
  // period per skill name; `copies` is how many of that skill the actor holds, because
  // p.110 says Luck Smiles and Once a Snake grant an extra use per copy learned.
  async spendSkillUse(skill) {
    const limit = skill?.system?.useLimit;
    if (!limit || limit.period === "none") return true;

    const key = ledgerKey(limit.period, skill.name);
    const ledger = foundry.utils.deepClone(this.system.useLedger ?? {});
    const copies = this.items.filter(i => i.type === "skill" && i.name === skill.name).length;
    const result = spendUse({
      period: limit.period, count: limit.count, copies, spent: ledger[key] ?? 0
    });

    if (!result.allowed) {
      ui.notifications.warn(game.i18n.format("SMT.Warnings.UseLimit", {
        skill: skill.name,
        period: game.i18n.localize(`SMT.UsePeriod.${limit.period}`)
      }));
      return false;
    }
    ledger[key] = result.spent;
    await this.update({ "system.useLedger": ledger });
    if (CONFIG.SMT.debug) console.log("smt-rpg | Use limit", { skill: skill.name, ...result, copies });
    return true;
  }

  // ------------------------------------------------- action budget (p.63, p.96)

  // Which turn this actor's budget is keyed to, or null when it is not this actor's
  // turn in an active combat. Null is the UNTRACKED case, not an error: p.63's action
  // economy exists inside a combat turn and nowhere else, so a skill used out of
  // combat — or on somebody else's turn, which is the GM resolving a reaction — is
  // never refused for lack of an action.
  get #turnKey() {
    const combat = game.combat;
    if (!combat?.started) return null;
    if (combat.combatant?.actor?.id !== this.id) return null;
    return turnKey(combat.round, combat.turn);
  }

  // Actions left this turn: `{ total, spent, granted, remaining, tracked }`.
  actionState() {
    return actionState(this.system.actionLedger, {
      key: this.#turnKey,
      isBoss: !!this.system.isBoss
    });
  }

  // Spend one action, optionally banking a press skill's grant (p.96). Refuses and
  // warns when the turn's budget is out. Returns true when the action was taken.
  async spendAction({ grants = 0, label = "" } = {}) {
    const result = spendActions(this.system.actionLedger, {
      key: this.#turnKey,
      isBoss: !!this.system.isBoss,
      grants
    });

    if (!result.allowed) {
      ui.notifications.warn(game.i18n.format("SMT.Warnings.NoActionsLeft", {
        name: this.name,
        action: label || game.i18n.localize("SMT.Action.Generic")
      }));
      return false;
    }
    if (result.ledger) await this.update({ "system.actionLedger": result.ledger });
    if (CONFIG.SMT.debug) console.log("smt-rpg | Action budget", { actor: this.name, label, grants, ...result });
    return true;
  }

  // Drop the stored budget. Fires on combat end; the turn key already makes a stale
  // ledger harmless mid-fight, so this is housekeeping rather than the reset itself.
  async clearActionBudget() {
    if (foundry.utils.isEmpty(this.system.actionLedger ?? {})) return;
    await this.update({ "system.actionLedger": {} });
  }

  // Clear the ledger entries a boundary retires. "round" and "combat" fire from the
  // combat hooks; "scenario" has no automatic boundary and is the GM's call.
  async clearUseLimits(boundary) {
    const ledger = this.system.useLedger ?? {};
    const drop = clearedByBoundary(ledger, boundary);
    if (!drop.length) return 0;
    const next = foundry.utils.deepClone(ledger);
    for (const key of drop) delete next[key];
    await this.update({ "system.useLedger": next });
    return drop.length;
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
    if (actor) {
      await actor.#applyStatGrowth();
      await actor.learnMagatamaSkills();
    }
    return actor;
  }

  // Skills a fiend's active Magatama teaches at its level (p.42). Until 2026-07-31 the
  // p.42 progression existed nowhere: a fiend equipped Marogareh and simply never got
  // Hell Thrust at 4, because nothing consumed the Magatama's skill list.
  //
  // Safe to call at any time, not only on level-up: the plan is computed from the
  // CURRENT level against what is already owned, so switching Magatama out of combat
  // (p.39) grants the new one's earned skills rather than only its future ones.
  async learnMagatamaSkills({ notify = true } = {}) {
    if (this.type !== "fiend") return [];
    const magatama = this.items.get(this.system.activeMagatama);
    if (!magatama) return [];

    const plan = magatamaLearnPlan({
      skillList: magatama.system.skillList,
      level: this.system.level,
      ownedNames: this.items.filter(i => i.type === "skill").map(i => i.name)
    });
    if (!plan.learn.length && !plan.blocked.length) return [];

    const { loadSkillStats, buildSkillItems } = await import("../helpers/skill-compendium.mjs");
    await loadSkillStats();
    const { items, unknown } = buildSkillItems(plan.learn.map(s => s.skillName));
    const created = items.length
      ? await this.createEmbeddedDocuments("Item", items)
      : [];

    // Everything the plan could not deliver is said out loud. A skill silently missing
    // from a level-up reads exactly like a Magatama that grants nothing at that level.
    const caveats = [];
    if (plan.blocked.length) {
      caveats.push(game.i18n.format("SMT.Magatama.LearnBlocked", {
        cap: plan.cap, skills: plan.blocked.map(s => s.skillName).join(", ")
      }));
    }
    if (unknown.length) {
      caveats.push(game.i18n.format("SMT.Magatama.LearnUnknown", { skills: unknown.join(", ") }));
    }

    if (notify && (created.length || caveats.length)) {
      const learned = created.length
        ? game.i18n.format("SMT.Magatama.Learned",
          { name: magatama.name, skills: created.map(i => i.name).join(", ") })
        : "";
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="smt-chat"><strong>${this.name}</strong>`
          + (learned ? ` — ${learned}` : "")
          + caveats.map(c => `<div class="smt-caveat">${c}</div>`).join("")
          + "</div>"
      });
    }

    if (CONFIG.SMT.debug) console.log("smt-rpg | Magatama skills", {
      actor: this.name, magatama: magatama.name, level: this.system.level,
      learned: created.map(i => i.name), blocked: plan.blocked, unknown
    });

    return created;
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
  async rollPower(basePower, skillPower = 0, label = "Power Roll", isCritical = false, extraDice = "", boost = 1, focus = 1) {
    const roll = new Roll(extraDice ? `1d10x10 + ${extraDice}` : "1d10x10");
    await roll.evaluate();
    const boosted = Math.floor((basePower + skillPower) * (Number.isFinite(boost) && boost > 0 ? boost : 1));
    let total = boosted + roll.total;
    if (isCritical) total *= 2;
    // Focus (p.105) doubles the TOTAL power, so it lands after the dice and after the
    // critical — a Boost multiplies the base before the roll instead, which is why the
    // two are separate arguments rather than one multiplier.
    const focusMult = Number.isFinite(focus) && focus > 0 ? focus : 1;
    const focusApplied = focusMult !== 1;
    if (focusApplied) total = Math.floor(total * focusMult);

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/power-roll.hbs",
      {
        label, basePower, skillPower, diceTotal: roll.total, total, isCritical,
        // Only shown when a Boost actually moved the number — otherwise the card
        // would print the same figure twice for every attack in the game.
        boosted, boostApplied: boosted !== basePower + skillPower,
        focusApplied
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
  async applyDamage({ rawPower, element, isPhysical, isCritical, attacker, skillName, dodgeFumble = false, damageMultiplier = 1, fractional = null, fpImmune = false, drains = null }) {
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

    // Fractional-HP attacks (p.102-103): the target's current HP decides the number.
    // The affinity ABSOLUTES still gate — Null Light stops Thunderclap outright, and
    // a Repel reflects nothing because there is no power to reflect — but weak/strong
    // multipliers and resistance do not apply to a fraction. [inferred — the book
    // states the fraction and says nothing about scaling it]
    if (fractional && !result.isNull && !result.isDrain && !result.isRepel) {
      const end = fractionalEnd(this.system.hp.value, fractional.kind, fractional.pct);
      result.finalDamage = Math.max(this.system.hp.value - end, 0);
      result.afterAffinity = result.finalDamage;
      result.resistanceApplied = 0;
    }
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

    // Tetraja (p.101) is spent by nullifying, and this is the only place that can tell
    // whether it was the barrier that did it — the merged rating alone cannot, because
    // a target who prints Null Light looks identical to one wearing the barrier.
    // `baseAffinities` is the pre-barrier snapshot derived data keeps for exactly this.
    if (result.isNull) {
      const { consumeBarrierCharge } = await import("../helpers/effects.mjs");
      await consumeBarrierCharge(this, {
        baseRating: this.system.baseAffinities?.[element] ?? "normal",
        effectiveRating: "null"
      });
    }

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

    // Drain skills (p.103): the caster recovers what the target actually lost — the
    // p.98 worked example measures recovery after resistance, so `dealt`, not the
    // computed damage. MP loss mirrors the final damage, floored at the pool.
    if (drains && attacker && result.finalDamage > 0
        && !result.isNull && !result.isDrain && !result.isRepel) {
      const hpDealt = hpBefore !== null ? hpBefore - this.system.hp.value : 0;
      const { hpDrained, mpDrained } = drainAmounts({
        hpDealt, mpBefore: this.system.mp.value, finalDamage: result.finalDamage,
        drainsHP: !!drains.hp, drainsMP: !!drains.mp
      });
      const attackerUpdate = {};
      if (hpDrained > 0) {
        const newHp = Math.min(attacker.system.hp.value + hpDrained, attacker.system.hp.max);
        chatData.drainedHP = newHp - attacker.system.hp.value;
        attackerUpdate["system.hp.value"] = newHp;
      }
      if (mpDrained > 0) {
        await this.update({ "system.mp.value": this.system.mp.value - mpDrained });
        const newMp = Math.min(attacker.system.mp.value + mpDrained, attacker.system.mp.max);
        chatData.drainedMP = newMp - attacker.system.mp.value;
        attackerUpdate["system.mp.value"] = newMp;
      }
      if (Object.keys(attackerUpdate).length) {
        chatData.attackerName = attacker.name;
        await attacker.update(attackerUpdate);
      }
    }

    // Resulting HP for the card; read after the mutation above.
    chatData.targetHp = this.system.hp.value;
    chatData.targetHpMax = this.system.hp.max;
    chatData.targetDefeated = this.system.hp.value <= 0;
    if (fpImmune) chatData.fpImmune = true;

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/damage-result.hbs",
      chatData
    );
    const dmgMsg = await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content
    });

    // Stash for the FP "Halve Damage" button. `fpImmune` rides the flag so both the
    // button gate and the resolver refuse it — "Fate points cannot reduce this
    // amount" (p.102-103) is a property of the card.
    if (result.finalDamage > 0 && !result.isNull && !result.isDrain && !result.isRepel) {
      const { getTokenUuid } = await import("../helpers/combat.mjs");
      await dmgMsg.setFlag("smt-rpg", "damageData", {
        targetTokenUuid: getTokenUuid(this) ?? this.id,
        originalDamage: result.finalDamage,
        currentDamage: result.finalDamage,
        hpBefore,
        fpImmune: !!fpImmune,
        resolved: false
      });
    }

    return result;
  }
}
