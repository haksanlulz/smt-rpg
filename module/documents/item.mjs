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
    if (t === "ranged-attack") return true; // power comes from the firearm, not the skill potency
    return (t === "physical-attack" || t === "magical-attack" || t === "spell") && this.system.power > 0;
  }

  get isPhysicalSkill() {
    return this.system.skillType === "physical-attack";
  }

  // Firearm skill (p.63): uses the equipped ranged weapon's power (Agility + gear, no level) and spends ammo.
  get isRangedSkill() {
    return this.system.skillType === "ranged-attack";
  }

  // Healing skill (p.100): auto-success; restores HP = potency + Magic + Level + power roll.
  get isHealSkill() {
    return this.system.skillType === "recovery";
  }

  // Provoke (p.105): support debuff hitting all foes (resist down, power up). Name-match keeps it
  // working on skills authored before the "provoke" buffEffect key existed.
  get isProvoke() {
    return this.system.buffEffect === "provoke" || (this.name ?? "").trim().toLowerCase() === "provoke";
  }

  // Magic that Mute seals (p.66): spell or magical attack.
  get isMagicSkill() {
    return this.type === "skill" && CONFIG.SMT.muteBlockedSkillTypes.includes(this.system.skillType);
  }

  // Focus (p.105): stores a doubling for the next basic strike or physical attack.
  // Name-matched like Provoke — the effect is a whole mechanic of its own rather than
  // a value on the schema, and the printed skill list names exactly one skill for it.
  get isFocus() {
    return this.type === "skill" && (this.name ?? "").trim().toLowerCase() === "focus";
  }

  // Press skill (p.96): Beast Eye and Dragon Eye, which "increase how many actions one
  // can take per turn". Schema-driven rather than name-matched like Focus and Provoke —
  // the grant is a NUMBER the printed rows state ("Gain two actions this round"), so
  // there is a value to carry, and a homebrew press skill works without a code change.
  get isPressSkill() {
    return this.type === "skill" && (this.system.grantsActions ?? 0) > 0;
  }

  // Casts a buff/debuff or dispel (p.96).
  get isBuffSkill() {
    const e = this.system.buffEffect;
    return this.type === "skill" && !!e && e !== "none";
  }

  // Talk skill (p.72): approach (begins negotiation) or support (interjects).
  get isTalkSkill() {
    if (this.type !== "skill") return false;
    return this.system.skillType === CONFIG.SMT.talk.approachType
      || this.system.skillType === CONFIG.SMT.talk.supportType;
  }

  // Approach talk skill: begins a negotiation (p.72).
  get isApproachSkill() {
    return this.type === "skill" && this.system.skillType === CONFIG.SMT.talk.approachType;
  }

  // Main skill use flow: pay cost -> check -> power roll -> pending attacks
  async use() {
    const actor = this.parent;
    if (!actor) return;

    if (this.isPassive) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.PassiveSkill"));
      return;
    }

    // Mute seals magic (p.66); checked before cost so a blocked cast never burns MP.
    if (this.isMagicSkill && actor.system.ailment === "mute") {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.Muted"));
      return;
    }

    // Firearm skills need an equipped, loaded gun before the action's cost is spent (p.63).
    if (this.isRangedSkill && !this._readyRangedWeapon(actor)) return;

    // The action budget (p.63) is checked FIRST of the three deductions, because it is
    // the only one whose refusal must cost nothing at all: a skill declined for having
    // no action left this turn has not been used, so it must not burn a once-per-combat
    // use, MP, or a Poison tick. Press skills bank their grant (p.96) in the same
    // write, since "they cost one action to apply" — the grant and the charge are one
    // transaction, and splitting them lets a failed update hand out free actions.
    if (!(await actor.spendAction({ grants: this.system.grantsActions ?? 0, label: this.name }))) return;

    // Use limits (p.96) are checked before the cost, like Mute above: a skill with no
    // uses left is not attempted, so it burns no MP and triggers no per-action drain.
    if (!(await actor.spendSkillUse(this))) return;

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

    // Poison drains HP per non-reactive action (p.66); a Curse rolls its mishap on
    // any action at all (p.67).
    const { applyPoisonDrain, rollCurseMishap } = await import("../helpers/effects.mjs");
    await applyPoisonDrain(actor);
    await rollCurseMishap(actor);

    // Focus (p.105): auto-succeeds and stores a doubling rather than attacking.
    if (this.isFocus) {
      await this._castFocus(actor);
      return;
    }

    // Press skills (p.96): auto-succeed, and the whole effect is the grant already
    // banked by spendAction above. Announce what the actor now has left, because the
    // number is the entire point of the skill and lives nowhere a player can see mid-turn.
    if (this.isPressSkill) {
      await this._castPress(actor);
      return;
    }

    // Firearm skills resolve through the ranged-weapon power path (p.63), spending ammo per shot.
    if (this.isRangedSkill) {
      await this._rangedAttack(actor);
      return;
    }

    // Provoke (p.105): debuff all foes (resist down, power up). Checked before the generic buff path.
    if (this.isProvoke) {
      await this._castProvoke(actor);
      return;
    }

    // Buff/debuff/dispel resolve via ActiveEffects (p.96); auto-succeed, no rolls.
    if (this.isBuffSkill) {
      await this._castBuff(actor);
      return;
    }

    // Talk skills resolve via the negotiation flow (p.72), no hit/power roll here.
    if (this.isTalkSkill) {
      await this._talk(actor);
      return;
    }

    // Healing (p.100): auto-success; roll heal power once and restore HP to each target.
    if (this.isHealSkill) {
      await this._heal(actor);
      return;
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
        const powerResult = await actor.rollPower(basePower, this.system.power, `${this.name} — ${game.i18n.localize("SMT.Power")}`, false, this.isPhysicalSkill ? actor.system.physicalPowerBonusDice : actor.system.magicalPowerBonusDice, actor.system.boostFor(this.system.element));
        await this._postPendingAttacks(actor, powerResult);
      }

      // Ailment-only auto-success (e.g. Stun Gaze).
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
    let label = `${this.name} (${game.i18n.localize(`SMT.Stat.${stat.charAt(0).toUpperCase() + stat.slice(1)}`)})`;

    // Concentrate: spend any bonus held for this action, +% to hit TN (p.64).
    const { consumeSetupBonuses } = await import("../helpers/effects.mjs");
    const setup = await consumeSetupBonuses(actor, this.name);
    if (setup.total) {
      tn += setup.total;
      label += ` +${setup.total}%`;
    }

    // Stun caps hit TN (p.66); capped here so the roll and buildCheckData agree.
    if (actor.system.ailment === "stun") tn = Math.min(tn, CONFIG.SMT.stun.hitCapPct);

    // Might: crit threshold TN/5 instead of TN/10 (physical only).
    const hasMight = this.isPhysicalSkill && actor.system.hasMightPassive;

    // Multi-action (p.59-60). The skill and target cannot change between parts, and
    // the cost is paid for each; the first payment already happened above.
    //
    // multiActionPlan and multiActionTn come from checks.mjs, NOT combat.mjs —
    // combat.mjs imports them for its own use and does not re-export. Destructuring
    // all four from combat.mjs left both undefined and threw on every skill use.
    const { multiActionPlan, multiActionTn } = await import("../helpers/checks.mjs");
    const { promptMultiAction, buildCheckData } = await import("../helpers/combat.mjs");
    const parts = await promptMultiAction(
      tn, multiActionPlan(tn, { autoSuccess: this.system.autoSuccess, isNegotiation: this.isTalkSkill }), this.name
    );
    const tnEach = multiActionTn(tn, parts);

    let checkResult = null;
    for (let part = 0; part < parts; part++) {
      // p.60: "If... you are unable to pay the cost... then the remaining parts of the
      // multi-action are lost." Part one was paid before the branch.
      if (part > 0 && !(await this._payCostAgain(actor))) break;

      const partLabel = parts > 1 ? `${label} — ${part + 1}/${parts}` : label;
      checkResult = await actor.rollPercentile(tnEach, partLabel, { hasMight });

      // Stash for FP reroll/boost buttons.
      if (actor.system.fatePoints.value > 0) {
        const msg = game.messages.get(checkResult.messageId);
        if (msg) {
          await msg.setFlag("smt-rpg", "checkData", buildCheckData({
            actor,
            checkResult,
            tn: tnEach,
            hasPowerRoll: this.hasPowerRoll,
            basePower: this.isPhysicalSkill ? actor.system.basePhysicalPower : actor.system.baseMagicalPower,
            skillPower: this.system.power,
            element: this.system.element,
            isPhysical: this.isPhysicalSkill,
            skillName: this.name,
            targetsString: this.system.targets,
            ailmentType: this.system.ailment?.type ?? "none",
            ailmentRate: this.system.ailment?.rate ?? 0,
            hasMight,
            riders: this.attackRiders
          }));
        }
      }

      if (checkResult.isSuccess && this.hasPowerRoll) {
        const basePower = this.isPhysicalSkill ? actor.system.basePhysicalPower : actor.system.baseMagicalPower;
        // Focus (p.105) applies to a physical attack only, and is consumed by it. A
        // spell rolling power in between leaves the stored doubling standing.
        const focus = actor.focusFor(this.isPhysicalSkill);
        const powerResult = await actor.rollPower(basePower, this.system.power, `${this.name} — ${game.i18n.localize("SMT.Power")}`, checkResult.isCritical, this.isPhysicalSkill ? actor.system.physicalPowerBonusDice : actor.system.magicalPowerBonusDice, actor.system.boostFor(this.system.element), focus.multiplier);
        if (focus.consumed) await actor.clearFocus();
        await this._postPendingAttacks(actor, powerResult, checkResult.messageId);
      }

      // Fractional-HP attacks (p.102-103) roll no power — the target's current HP is
      // the whole number — but they are still attacks: the hit posts a pending card
      // and the target may dodge (p.97's "make attacks" rule).
      if (checkResult.isSuccess && !this.hasPowerRoll && this.attackRiders?.fractional) {
        const { postAttacksToTargets, resolveTargets } = await import("../helpers/combat.mjs");
        await postAttacksToTargets({
          attacker: actor,
          targets: resolveTargets(actor, this.system.targets),
          rawPower: 0,
          element: this.system.element,
          isPhysical: this.isPhysicalSkill,
          isCritical: checkResult.isCritical,
          skillName: this.name,
          checkMessageId: checkResult.messageId,
          ailmentType: this.system.ailment?.type ?? "none",
          ailmentRate: this.system.ailment?.rate ?? 0,
          riders: this.attackRiders
        });
      }
    }

    // Ailment-only skills (e.g. Stun Gaze). A fractional skill's ailment rides its
    // pending attack card instead, so it must not also resolve here.
    if (checkResult?.isSuccess && !this.hasPowerRoll && !this.attackRiders?.fractional
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

  // Healing skill (p.100): auto-success. Heal = Skill Potency + Base Magical Power + power roll,
  // rolled ONCE and applied to every target (one card for the whole group, not one per ally).
  async _heal(actor) {
    const { resolveTargets } = await import("../helpers/combat.mjs");
    const targets = resolveTargets(actor, this.system.targets);
    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoTargets"));
      return;
    }

    const intro = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/auto-success.hbs",
      { name: this.name, effectDescription: this.system.effectDescription }
    );
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: intro });

    const { recoveryPlan, curesCurrent } = await import("../helpers/recovery.mjs");
    const plan = recoveryPlan(this.system);

    // The power roll happens once for the whole group, and only when the skill
    // actually heals by power — Patra rolls nothing (p.100).
    let heal = 0;
    if (plan.heals === "power") {
      const powerResult = await actor.rollPower(
        actor.system.baseMagicalPower, this.system.power,
        `${this.name} — ${game.i18n.localize("SMT.Power")}`
      );
      heal = Math.max(0, Math.floor(powerResult.total));
    }

    const lines = [];
    for (const token of targets) {
      const t = token.actor;
      if (!t) continue;
      const update = {};
      const before = t.system.hp.value;

      // Revival first: a dead target has to come back before anything restores it (p.100).
      if (plan.revives && (before <= 0 || t.system.deathAilment)) {
        update["system.deathAilment"] = false;
        update["system.hp.value"] = plan.reviveFull ? t.system.hp.max : 1;
        lines.push(game.i18n.format("SMT.Heal.Revived", {
          name: t.name, hp: update["system.hp.value"]
        }));
      } else if (plan.revives) {
        continue; // Recarm on a living ally does nothing.
      }

      const hpNow = update["system.hp.value"] ?? before;
      if (plan.heals === "full") {
        update["system.hp.value"] = t.system.hp.max;
      } else if (plan.heals === "power" && heal > 0) {
        update["system.hp.value"] = Math.min(hpNow + heal, t.system.hp.max);
      }
      const restored = (update["system.hp.value"] ?? before) - before;
      if (restored > 0 && !plan.revives) {
        lines.push(game.i18n.format("SMT.Heal.Line", { name: t.name, amount: restored }));
      }

      // Cures are named ailments, not "whatever is there" — Patra cannot lift Poison.
      if (curesCurrent(this.system.curesAilment, t.system.ailment)) {
        const label = game.i18n.localize(CONFIG.SMT.ailments[t.system.ailment] ?? t.system.ailment);
        update["system.ailment"] = "none";
        update["system.ailmentSaveFailed"] = false;
        lines.push(game.i18n.format("SMT.Heal.Cured", { name: t.name, ailment: label }));
      }

      if (CONFIG.SMT.debug) console.log("smt-rpg | Recovery", {
        healer: actor.name, target: t.name, plan, rolled: heal, update
      });
      if (Object.keys(update).length) await t.update(update);
    }

    // Recarmdra (p.100): the caster pays for it afterwards.
    if (plan.selfKO) {
      await actor.update({ "system.hp.value": 0, "system.deathAilment": true });
      lines.push(game.i18n.format("SMT.Heal.SelfKO", { name: actor.name }));
    }

    // A recovery skill that applied nothing has to SAY so. Patra on an ally carrying
    // no Restrain/Sleep/Panic, Recarm on someone still standing, Mediarahan on a party
    // already at full — all three legitimately do nothing, and all three previously
    // posted the intro card and then went silent, which is indistinguishable from the
    // skill being broken. That is the exact failure shape this file spent 2026-07-28
    // fixing, so it does not get to come back as an absence of feedback.
    if (!lines.length) lines.push(game.i18n.format("SMT.Heal.NoEffect", { name: this.name }));

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="smt-roll effect-notice"><p>${lines.join("<br>")}</p></div>`
    });
  }

  // Pay this skill's cost again for a later part of a multi-action (p.59: "the cost
  // must be paid for each time it is used"). Returns false when it cannot be paid,
  // which ends the multi-action rather than granting a free repeat (p.60).
  async _payCostAgain(actor) {
    const cost = this.system.cost;
    if (cost.resource === "none" || cost.value <= 0) return true;

    const current = actor.system[cost.resource].value;
    if (current < cost.value) {
      ui.notifications.warn(game.i18n.format("SMT.Warnings.MultiActionCost", {
        resource: cost.resource.toUpperCase(), cost: cost.value
      }));
      return false;
    }
    await actor.update({ [`system.${cost.resource}.value`]: current - cost.value });
    return true;
  }

  // True when a firearm is equipped and has at least one round chambered (p.63).
  _readyRangedWeapon(actor) {
    const rw = actor.system.rangedWeapon;
    const weapon = actor.items.find(i => i.type === "gear" && i.system.gearType === "weapon-ranged" && i.system.equipped);
    if (!rw || !weapon) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoRangedWeapon"));
      return false;
    }
    if (weapon.system.ammo.value <= 0) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoAmmo"));
      return false;
    }
    return true;
  }

  // Firearm skill (p.63): fires the equipped gun `shots` times. Power = gun power (Agility + gear, no level)
  // plus the skill's own potency; hit check vs the gun's Agility TN. One round spent per shot.
  async _rangedAttack(actor) {
    const { postAttacksToTargets, buildCheckData, resolveTargets, applyStunHitCap } = await import("../helpers/combat.mjs");
    const { consumeSetupBonuses } = await import("../helpers/effects.mjs");
    const weapon = actor.items.find(i => i.type === "gear" && i.system.gearType === "weapon-ranged" && i.system.equipped);
    const rw = actor.system.rangedWeapon;
    if (!weapon || !rw) return;

    const shots = Math.max(1, this.system.shots ?? 1);
    const skillPower = this.system.power;
    const statLabel = game.i18n.localize("SMT.Stat.Agility");

    for (let i = 0; i < shots; i++) {
      if (weapon.system.ammo.value <= 0) {
        ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoAmmo"));
        break;
      }
      await weapon.update({ "system.ammo.value": weapon.system.ammo.value - 1 });

      let tn = this.system.customTN ? this.system.tn : rw.tn;
      let label = shots > 1 ? `${this.name} ${i + 1}/${shots} (${statLabel})` : `${this.name} (${statLabel})`;

      // Concentrate and Aid apply once to the whole action (p.64); fold onto shot one only.
      if (i === 0) {
        const setup = await consumeSetupBonuses(actor, this.name);
        if (setup.total) {
          tn += setup.total;
          label += ` +${setup.total}%`;
        }
      }
      tn = applyStunHitCap(actor, tn);

      const checkResult = await actor.rollPercentile(tn, label);

      if (actor.system.fatePoints.value > 0) {
        const msg = game.messages.get(checkResult.messageId);
        if (msg) {
          await msg.setFlag("smt-rpg", "checkData", buildCheckData({
            actor, checkResult, tn,
            hasPowerRoll: true, basePower: rw.power,
            skillPower, element: "phys", isPhysical: true,
            skillName: this.name, targetsString: this.system.targets,
            ailmentType: "none", ailmentRate: 0
          }));
        }
      }

      if (checkResult.isSuccess) {
        const powerResult = await actor.rollPower(
          rw.power, skillPower,
          `${this.name} — ${game.i18n.localize("SMT.Power")}`,
          checkResult.isCritical
        );
        await postAttacksToTargets({
          attacker: actor,
          targets: resolveTargets(actor, this.system.targets),
          rawPower: powerResult.total,
          element: "phys",
          isPhysical: true,
          isCritical: powerResult.isCritical,
          skillName: this.name,
          checkMessageId: checkResult.messageId
        });
      }
    }
  }

  // Buff/debuff/dispel (p.96): auto-succeed, AoE by allegiance. Dispel strips its group; buff stacks per target.
  async _castBuff(actor) {
    const { getAutoTargets, getTokenUuid } = await import("../helpers/combat.mjs");
    const { runRelayed } = await import("../helpers/socket.mjs");

    const key = this.system.buffEffect;
    const dispelGroup = CONFIG.SMT.buffDispels[key];
    const def = CONFIG.SMT.buffs[key];

    // Buffs/Dekunda hit allies (caster included); debuffs/Dekaja hit foes. getAutoTargets drops self, so union it back.
    const affectsAllies = dispelGroup === "nda" || def?.sign > 0;
    const tokens = getAutoTargets(actor, affectsAllies ? "All Allies" : "All Foes");
    const uuids = tokens.map(t => t.document?.uuid).filter(Boolean);
    const selfUuid = getTokenUuid(actor);
    if (affectsAllies && selfUuid && !uuids.includes(selfUuid)) uuids.unshift(selfUuid);

    if (!uuids.length) {
      ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
      return;
    }

    // Cross-ownership: a debuff creates Active Effects on the other side's actors, so
    // the whole application is routed — a GM runs it locally, a player's client hands
    // the id list to the active GM. Ids only; the effect itself derives from CONFIG.
    await runRelayed(dispelGroup ? "buffClear" : "buffCast", {
      casterTokenUuid: selfUuid ?? "",
      targetTokenUuids: uuids,
      key
    });
  }

  // Focus (p.105): "The caster doubles the total power of their next basic strike or
  // physical attack. The check for this auto-succeeds." Stores a flag; the doubling is
  // applied and consumed by whichever physical action comes next.
  async _castFocus(actor) {
    const intro = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/auto-success.hbs",
      { name: this.name, effectDescription: this.system.effectDescription }
    );
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: intro });
    await actor.update({ "system.focusReady": true });

    const { postEffectNotice } = await import("../helpers/effects.mjs");
    await postEffectNotice(actor, game.i18n.format("SMT.Focus.Ready", { name: actor.name }));
  }

  // Press skills (p.96): Beast Eye and Dragon Eye. The grant was banked by spendAction
  // before any cost was paid, so this only reports it — but reporting is not cosmetic
  // here. The budget is otherwise invisible, and a table that cannot see how many
  // actions are left is back to tracking it by hand, which is what clause 2 rules out.
  async _castPress(actor) {
    const intro = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/auto-success.hbs",
      { name: this.name, effectDescription: this.system.effectDescription }
    );
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: intro });

    const { remaining } = actor.actionState();
    const { postEffectNotice } = await import("../helpers/effects.mjs");
    await postEffectNotice(actor, game.i18n.format("SMT.Press.Granted", {
      name: actor.name,
      // Outside a combat turn the budget is untracked and remaining is Infinity; the
      // grant is real either way, so report the printed figure rather than a symbol.
      remaining: Number.isFinite(remaining) ? remaining : this.system.grantsActions
    }));
  }

  // Provoke (p.105): auto-success; one 1d10 debuffs every foe (−resist, +phys/mag power).
  async _castProvoke(actor) {
    const { getAutoTargets, getTokenUuid } = await import("../helpers/combat.mjs");
    const { runRelayed } = await import("../helpers/socket.mjs");
    const uuids = getAutoTargets(actor, "All Foes").map(t => t.document?.uuid).filter(Boolean);
    if (!uuids.length) {
      ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
      return;
    }
    const intro = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/auto-success.hbs",
      { name: this.name, effectDescription: this.system.effectDescription }
    );
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: intro });

    // Cross-ownership: every foe gains an Active Effect, so the application routes
    // through the relay like the other buffs. The intro card above stays local — a
    // player may create chat messages.
    await runRelayed("provoke", {
      casterTokenUuid: getTokenUuid(actor) ?? "",
      targetTokenUuids: uuids
    });
  }

  // Talk skill (p.72): approach begins a negotiation with one demon; support posts an interjection notice.
  async _talk(actor) {
    const { startNegotiation } = await import("../helpers/negotiation.mjs");
    const { postEffectNotice } = await import("../helpers/effects.mjs");

    if (this.isApproachSkill) {
      // Prefer the manual target; fall back to a single auto-resolved foe.
      const { resolveTargets } = await import("../helpers/combat.mjs");
      const target = game.user.targets.first()?.actor
        ?? resolveTargets(actor, "All Foes")[0]?.actor
        ?? null;
      if (!target) {
        ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
        return;
      }
      // Impress-type match (p.76) is a GM call; a yes widens the crit range to TN/5.
      const impressMatch = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("SMT.Talk.ImpressPrompt") },
        content: `<p>${game.i18n.format("SMT.Talk.ImpressQuestion", { name: target.name })}</p>`,
        rejectClose: false,
        modal: false
      }).catch(() => false);
      await startNegotiation({ talker: actor, target, skillName: this.name, impressMatch: !!impressMatch });
      return;
    }

    // Support: interjection notice (p.72); GM applies the +20% and the effect.
    await postEffectNotice(actor, game.i18n.format("SMT.Talk.Interjection", {
      name: actor.name, skill: this.name
    }));
  }

  // The attack riders this skill carries (p.98/p.102-103), in the shape attackData
  // and checkData store them. Null when the skill has none, so plain attacks add
  // nothing to their flags.
  get attackRiders() {
    const s = this.system;
    const riders = {};
    if (s.fractionalHP && s.fractionalHP !== "none") {
      riders.fractional = { kind: s.fractionalHP, pct: s.fractionalPercent ?? 20 };
    }
    if (s.fpImmune) riders.fpImmune = true;
    if (s.drainsHP || s.drainsMP) riders.drains = { hp: !!s.drainsHP, mp: !!s.drainsMP };
    if (s.killCondition?.ailment && s.killCondition.ailment !== "none" && s.killCondition.rate > 0) {
      riders.killCondition = { ailment: s.killCondition.ailment, rate: s.killCondition.rate };
    }
    return Object.keys(riders).length ? riders : null;
  }

  // Post pending-attack cards; damage applied later via Dodge/Apply buttons.
  async _postPendingAttacks(attacker, powerResult, checkMessageId) {
    const { postAttacksToTargets, resolveTargets } = await import("../helpers/combat.mjs");
    await postAttacksToTargets({
      attacker,
      targets: resolveTargets(attacker, this.system.targets),
      rawPower: powerResult.total,
      element: this.system.element,
      isPhysical: this.isPhysicalSkill,
      isCritical: powerResult.isCritical,
      skillName: this.name,
      checkMessageId,
      ailmentType: this.system.ailment?.type ?? "none",
      ailmentRate: this.system.ailment?.rate ?? 0,
      riders: this.attackRiders
    });
  }

  // Use a consumable: heal, cure, revive, or attack. Charge spent only if an effect applies.
  async useConsumable() {
    const actor = this.parent;
    if (!actor) return;
    if (this.type !== "consumable") return;
    const sys = this.system;

    if (sys.quantity <= 0) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoItems"));
      return;
    }

    const isAttackItem = sys.attackPower > 0 || sys.attackElement !== "none";
    const reviveTarget = sys.revive ? (game.user.targets.first()?.actor ?? actor) : null;

    // At least one effect must apply before spending a charge; revive only on a downed target.
    const willHeal = sys.healFull || sys.healHP > 0 || sys.healMP > 0;
    const willCure = sys.curesAilment && sys.curesAilment !== "none";
    const willRevive = sys.revive && reviveTarget && reviveTarget.system.hp.value <= 0;
    if (!willHeal && !willCure && !willRevive && !isAttackItem) {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.NoEffect"));
      return;
    }

    if (!sys.reusable) {
      await this.update({ "system.quantity": sys.quantity - 1 });
    }

    // Using an item is a non-reactive action: poison drains HP (p.66), a Curse rolls
    // its mishap (p.67).
    const { applyPoisonDrain, rollCurseMishap } = await import("../helpers/effects.mjs");
    await applyPoisonDrain(actor);
    await rollCurseMishap(actor);

    const results = [];

    if (willHeal) {
      if (sys.healAllAllies) {
        for (const ally of await this._getAllyTargets(actor)) {
          results.push(await this._applyHealing(ally, sys));
        }
      } else {
        const target = game.user.targets.first()?.actor ?? actor;
        results.push(await this._applyHealing(target, sys));
      }
    }

    if (willCure) {
      if (sys.healAllAllies) {
        for (const ally of await this._getAllyTargets(actor)) {
          await this._applyAilmentCure(ally, sys.curesAilment);
          results.push(`${ally.name}: ${game.i18n.localize("SMT.AilmentCured")}`);
        }
      } else {
        const target = game.user.targets.first()?.actor ?? actor;
        await this._applyAilmentCure(target, sys.curesAilment);
        results.push(`${target.name}: ${game.i18n.localize("SMT.AilmentCured")}`);
      }
    }

    if (willRevive) {
      const newHp = sys.reviveFull ? reviveTarget.system.hp.max : 1;
      await reviveTarget.update({ "system.hp.value": newHp, "system.ailment": "none" });
      results.push(`${reviveTarget.name}: ${game.i18n.localize("SMT.Revived")} (${newHp} HP)`);
    }

    // Attack item (Rock): base magical power + item potency.
    if (isAttackItem) {
      const { postAttacksToTargets } = await import("../helpers/combat.mjs");
      const baseMagPower = actor.system.baseMagicalPower;
      const powerResult = await actor.rollPower(
        baseMagPower, sys.attackPower,
        `${this.name} — ${game.i18n.localize("SMT.Power")}`
      );
      await postAttacksToTargets({
        attacker: actor,
        targets: Array.from(game.user.targets),
        rawPower: powerResult.total,
        element: sys.attackElement,
        isPhysical: false,
        isCritical: false,
        skillName: this.name,
        ailmentType: sys.attackAilment?.type ?? "none",
        ailmentRate: sys.attackAilment?.rate ?? 0
      });
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

  // "All allies" for a party consumable: user + same-disposition tokens, deduped by actor id.
  async _getAllyTargets(actor) {
    const { getAutoTargets } = await import("../helpers/combat.mjs");
    const allyActors = getAutoTargets(actor, "All Allies")
      .map(token => token.actor)
      .filter(Boolean);

    const seen = new Set();
    const out = [];
    for (const a of [actor, ...allyActors]) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    }
    return out;
  }

  // Apply HP/MP healing in a single update. Returns a per-target card line.
  async _applyHealing(target, sys) {
    let hpHealed = 0, mpHealed = 0;
    const update = {};
    if (sys.healFull || sys.healHP > 0) {
      const hpAmount = sys.healFull ? target.system.hp.max : sys.healHP;
      const newHp = Math.min(target.system.hp.value + hpAmount, target.system.hp.max);
      hpHealed = newHp - target.system.hp.value;
      update["system.hp.value"] = newHp;
    }
    if (sys.healFull || sys.healMP > 0) {
      const mpAmount = sys.healFull ? target.system.mp.max : sys.healMP;
      const newMp = Math.min(target.system.mp.value + mpAmount, target.system.mp.max);
      mpHealed = newMp - target.system.mp.value;
      update["system.mp.value"] = newMp;
    }
    if (Object.keys(update).length) await target.update(update);
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
