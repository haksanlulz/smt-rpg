export default class SMTItem extends Item {

  get isPassive() {
    return this.type === "skill" && this.system.skillType === "passive";
  }

  get costDisplay() {
    if (this.type !== "skill") return "";
    const cost = this.system.cost;
    if (cost.resource === "none" || cost.value === 0) return "\u2014";
    return `${cost.value} ${cost.resource.toUpperCase()}`;
  }

  get tnDisplay() {
    if (this.type !== "skill") return "";
    if (this.system.autoSuccess) return game.i18n.localize("SMT.Auto");
    if (this.system.customTN) return `${this.system.tn}%`;
    const stat = this.system.checkStat;
    const key = stat.charAt(0).toUpperCase() + stat.slice(1);
    return game.i18n.localize(`SMT.Stat.${key}`);
  }

  get hasPowerRoll() {
    if (this.type !== "skill") return false;
    const t = this.system.skillType;
    return (t === "physical-attack" || t === "magical-attack" || t === "spell") && this.system.power > 0;
  }

  get isPhysicalSkill() {
    return this.system.skillType === "physical-attack";
  }

  // Main skill use flow: pay cost -> check -> power roll -> pending attacks
  async use() {
    const actor = this.parent;
    if (!actor) return;

    if (this.isPassive) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.PassiveSkill"));
      return;
    }

    const cost = this.system.cost;
    if (cost.resource !== "none" && cost.value > 0) {
      const resource = cost.resource;
      const current = actor.system[resource].value;
      if (current < cost.value) {
        ui.notifications.warn(game.i18n.format("SMT.Warnings.InsufficientResource", {
          resource: resource.toUpperCase(),
          cost: cost.value
        }));
        return;
      }
      await actor.update({ [`system.${resource}.value`]: current - cost.value });
    }

    if (this.system.autoSuccess) {
      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/smt-rpg/templates/chat/auto-success.hbs",
        { name: this.name, effectDescription: this.system.effectDescription }
      );
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content
      });

      if (this.hasPowerRoll) {
        const basePower = this.isPhysicalSkill ? actor.system.basePhysicalPower : actor.system.baseMagicalPower;
        const powerResult = await actor.rollPower(basePower, this.system.power, `${this.name} — ${game.i18n.localize("SMT.Power")}`);
        await this._postPendingAttacks(actor, powerResult);
      }

      // Ailment-only auto-success (e.g. Stun Gaze with autoSuccess)
      if (!this.hasPowerRoll && this.system.ailment?.type && this.system.ailment.type !== "none" && this.system.ailment.rate > 0) {
        const { resolveAilment, resolveTargets } = await import("../helpers/combat.mjs");
        const targets = resolveTargets(actor, this.system.targets);
        for (const token of targets) {
          if (!token.actor) continue;
          await resolveAilment({
            target: token.actor, attacker: actor,
            ailmentType: this.system.ailment.type,
            baseRate: this.system.ailment.rate,
            element: this.system.element,
            isCritical: false, dodgeFumble: false,
            targetTokenUuid: token.document.uuid
          });
        }
      }
      return;
    }

    let tn;
    if (this.system.customTN) {
      tn = this.system.tn;
    } else {
      const stat = this.system.checkStat;
      tn = actor.system[`${stat}TN`] || 0;
    }

    const stat = this.system.checkStat;
    const label = `${this.name} (${game.i18n.localize(`SMT.Stat.${stat.charAt(0).toUpperCase() + stat.slice(1)}`)})`;

    // Might passive: crit threshold TN/5 instead of TN/10
    const hasMight = this.isPhysicalSkill && actor.items.some(i => i.type === "skill" && i.name === "Might");
    const checkResult = await actor.rollPercentile(tn, label, { hasMight });

    // Store for FP reroll/boost buttons
    if (actor.system.fatePoints.value > 0) {
      const { getTokenUuid } = await import("../helpers/combat.mjs");
      const msg = game.messages.get(checkResult.messageId);
      if (msg) {
        await msg.setFlag("smt-rpg", "checkData", {
          actorTokenUuid: getTokenUuid(actor) ?? actor.id,
          rollResult: checkResult.result,
          isSuccess: checkResult.isSuccess,
          isCritical: checkResult.isCritical,
          currentTN: tn,
          originalTN: tn,
          hasPowerRoll: this.hasPowerRoll,
          basePower: this.isPhysicalSkill ? actor.system.basePhysicalPower : actor.system.baseMagicalPower,
          skillPower: this.system.power,
          element: this.system.element,
          isPhysical: this.isPhysicalSkill,
          skillName: this.name,
          targetTokenUuids: Array.from(game.user.targets).map(t => t.document?.uuid).filter(Boolean),
          targetsString: this.system.targets,
          ailmentType: this.system.ailment?.type ?? "none",
          ailmentRate: this.system.ailment?.rate ?? 0,
          hasMight,
          resolved: false
        });
      }
    }

    if (checkResult.isSuccess && this.hasPowerRoll) {
      const basePower = this.isPhysicalSkill ? actor.system.basePhysicalPower : actor.system.baseMagicalPower;
      const powerResult = await actor.rollPower(basePower, this.system.power, `${this.name} — ${game.i18n.localize("SMT.Power")}`, checkResult.isCritical);
      await this._postPendingAttacks(actor, powerResult, checkResult.messageId);
    }

    // Ailment-only skills (e.g. Stun Gaze)
    if (checkResult.isSuccess && !this.hasPowerRoll
        && this.system.ailment?.type && this.system.ailment.type !== "none" && this.system.ailment.rate > 0) {
      const { resolveAilment, resolveTargets } = await import("../helpers/combat.mjs");
      const targets = resolveTargets(actor, this.system.targets);
      for (const token of targets) {
        if (!token.actor) continue;
        await resolveAilment({
          target: token.actor,
          attacker: actor,
          ailmentType: this.system.ailment.type,
          baseRate: this.system.ailment.rate,
          element: this.system.element,
          isCritical: checkResult.isCritical,
          dodgeFumble: false,
          targetTokenUuid: token.document.uuid
        });
      }
    }
  }

  // Post pending attack cards per target. Damage applied later via Dodge/Apply buttons.
  async _postPendingAttacks(attacker, powerResult, checkMessageId) {
    const { postPendingAttack, getTokenUuid, resolveTargets } = await import("../helpers/combat.mjs");
    const targets = resolveTargets(attacker, this.system.targets);
    if (!targets.length) {
      ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
      return;
    }

    const attackerTokenUuid = getTokenUuid(attacker) ?? attacker.id;
    for (const token of targets) {
      if (!token.actor) continue;
      await postPendingAttack({
        attacker,
        target: token.actor,
        attackerTokenUuid,
        targetTokenUuid: token.document.uuid,
        rawPower: powerResult.total,
        element: this.system.element,
        isPhysical: this.isPhysicalSkill,
        isCritical: powerResult.isCritical,
        skillName: this.name,
        checkMessageId,
        ailmentType: this.system.ailment?.type ?? "none",
        ailmentRate: this.system.ailment?.rate ?? 0
      });
    }
  }

  // Use a consumable: healing, cures, revival, attack items
  async useConsumable() {
    const actor = this.parent;
    if (!actor) return;
    if (this.type !== "consumable") return;
    const sys = this.system;

    if (sys.quantity <= 0) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoItems"));
      return;
    }

    if (!sys.reusable) {
      await this.update({ "system.quantity": sys.quantity - 1 });
    }

    const results = [];

    if (sys.healFull || sys.healHP > 0 || sys.healMP > 0) {
      if (sys.healAllAllies) {
        // TODO: heal all allies (needs party tracking) — heal self for now
        results.push(await this._applyHealing(actor, sys));
      } else {
        const target = game.user.targets.first()?.actor ?? actor;
        results.push(await this._applyHealing(target, sys));
      }
    }

    if (sys.curesAilment && sys.curesAilment !== "none") {
      const target = game.user.targets.first()?.actor ?? actor;
      if (sys.healAllAllies) {
        // TODO: cure all allies — self only for now
        await this._applyAilmentCure(actor, sys.curesAilment);
        results.push(`${actor.name}: ${game.i18n.localize("SMT.AilmentCured")}`);
      } else {
        await this._applyAilmentCure(target, sys.curesAilment);
        results.push(`${target.name}: ${game.i18n.localize("SMT.AilmentCured")}`);
      }
    }

    if (sys.revive) {
      const target = game.user.targets.first()?.actor ?? actor;
      if (target.system.hp.value <= 0) {
        const newHp = sys.reviveFull ? target.system.hp.max : 1;
        await target.update({ "system.hp.value": newHp, "system.ailment": "none" });
        results.push(`${target.name}: ${game.i18n.localize("SMT.Revived")} (${newHp} HP)`);
      }
    }

    // Attack item (Rock) — base magical power + item potency
    if (sys.attackPower > 0 || sys.attackElement !== "none") {
      const { postPendingAttack, getTokenUuid } = await import("../helpers/combat.mjs");
      const baseMagPower = actor.system.baseMagicalPower;
      const powerResult = await actor.rollPower(
        baseMagPower, sys.attackPower,
        `${this.name} — ${game.i18n.localize("SMT.Power")}`
      );
      const targets = game.user.targets;
      if (targets.size) {
        const attackerTokenUuid = getTokenUuid(actor) ?? actor.id;
        for (const token of targets) {
          if (!token.actor) continue;
          await postPendingAttack({
            attacker: actor, target: token.actor,
            attackerTokenUuid, targetTokenUuid: token.document.uuid,
            rawPower: powerResult.total,
            element: sys.attackElement,
            isPhysical: false, isCritical: false,
            skillName: this.name,
            ailmentType: sys.attackAilment?.type ?? "none",
            ailmentRate: sys.attackAilment?.rate ?? 0
          });
        }
      } else {
        ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
      }
      return;
    }

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/item-use.hbs",
      { itemName: this.name, userName: actor.name, results, effect: sys.effect }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });
  }

  // Apply HP/MP healing
  async _applyHealing(target, sys) {
    let hpHealed = 0, mpHealed = 0;
    if (sys.healFull || sys.healHP > 0) {
      const hpAmount = sys.healFull ? target.system.hp.max : sys.healHP;
      const newHp = Math.min(target.system.hp.value + hpAmount, target.system.hp.max);
      hpHealed = newHp - target.system.hp.value;
      await target.update({ "system.hp.value": newHp });
    }
    if (sys.healFull || sys.healMP > 0) {
      const mpAmount = sys.healFull ? target.system.mp.max : sys.healMP;
      const newMp = Math.min(target.system.mp.value + mpAmount, target.system.mp.max);
      mpHealed = newMp - target.system.mp.value;
      await target.update({ "system.mp.value": newMp });
    }
    const parts = [];
    if (hpHealed > 0) parts.push(`+${hpHealed} HP`);
    if (mpHealed > 0) parts.push(`+${mpHealed} MP`);
    return `${target.name}: ${parts.join(", ") || game.i18n.localize("SMT.FullHP")}`;
  }

  async _applyAilmentCure(target, curesAilment) {
    const current = target.system.ailment;
    if (current !== "none" && (curesAilment === "all" || current === curesAilment)) {
      await target.update({ "system.ailment": "none" });
    }
  }
}
