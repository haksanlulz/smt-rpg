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

    // Poison drains HP per non-reactive action (p.66).
    const { applyPoisonDrain } = await import("../helpers/effects.mjs");
    await applyPoisonDrain(actor);

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
        const powerResult = await actor.rollPower(basePower, this.system.power, `${this.name} — ${game.i18n.localize("SMT.Power")}`, false, this.isPhysicalSkill ? actor.system.physicalPowerBonusDice : "");
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
    const { consumeConcentrate } = await import("../helpers/effects.mjs");
    const concentrate = await consumeConcentrate(actor, this.name);
    if (concentrate) {
      tn += concentrate;
      label += ` +${concentrate}%`;
    }

    // Stun caps hit TN (p.66); capped here so the roll and buildCheckData agree.
    if (actor.system.ailment === "stun") tn = Math.min(tn, CONFIG.SMT.stun.hitCapPct);

    // Might: crit threshold TN/5 instead of TN/10 (physical only).
    const hasMight = this.isPhysicalSkill && actor.system.hasMightPassive;
    const checkResult = await actor.rollPercentile(tn, label, { hasMight });

    // Stash for FP reroll/boost buttons.
    if (actor.system.fatePoints.value > 0) {
      const { buildCheckData } = await import("../helpers/combat.mjs");
      const msg = game.messages.get(checkResult.messageId);
      if (msg) {
        await msg.setFlag("smt-rpg", "checkData", buildCheckData({
          actor,
          checkResult,
          tn,
          hasPowerRoll: this.hasPowerRoll,
          basePower: this.isPhysicalSkill ? actor.system.basePhysicalPower : actor.system.baseMagicalPower,
          skillPower: this.system.power,
          element: this.system.element,
          isPhysical: this.isPhysicalSkill,
          skillName: this.name,
          targetsString: this.system.targets,
          ailmentType: this.system.ailment?.type ?? "none",
          ailmentRate: this.system.ailment?.rate ?? 0,
          hasMight
        }));
      }
    }

    if (checkResult.isSuccess && this.hasPowerRoll) {
      const basePower = this.isPhysicalSkill ? actor.system.basePhysicalPower : actor.system.baseMagicalPower;
      const powerResult = await actor.rollPower(basePower, this.system.power, `${this.name} — ${game.i18n.localize("SMT.Power")}`, checkResult.isCritical, this.isPhysicalSkill ? actor.system.physicalPowerBonusDice : "");
      await this._postPendingAttacks(actor, powerResult, checkResult.messageId);
    }

    // Ailment-only skills (e.g. Stun Gaze).
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

    const powerResult = await actor.rollPower(
      actor.system.baseMagicalPower, this.system.power,
      `${this.name} — ${game.i18n.localize("SMT.Power")}`
    );
    const heal = Math.max(0, Math.floor(powerResult.total));

    const lines = [];
    for (const token of targets) {
      const t = token.actor;
      if (!t) continue;
      const before = t.system.hp.value;
      const newHp = Math.min(before + heal, t.system.hp.max);
      await t.update({ "system.hp.value": newHp });
      lines.push(game.i18n.format("SMT.Heal.Line", { name: t.name, amount: newHp - before }));
      if (CONFIG.SMT.debug) console.log("smt-rpg | Heal", {
        healer: actor.name, target: t.name, rolled: heal,
        restored: newHp - before, newHp, hpMax: t.system.hp.max
      });
    }
    if (lines.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="smt-roll effect-notice"><p>${lines.join("<br>")}</p></div>`
      });
    }
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
    const { consumeConcentrate } = await import("../helpers/effects.mjs");
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

      // Concentrate applies once to the whole action (p.64); fold it onto the first shot only.
      if (i === 0) {
        const concentrate = await consumeConcentrate(actor, this.name);
        if (concentrate) {
          tn += concentrate;
          label += ` +${concentrate}%`;
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
    const {
      applyBuff, clearBuffGroup, postBuffCard, postEffectNotice
    } = await import("../helpers/effects.mjs");
    const { getAutoTargets } = await import("../helpers/combat.mjs");

    const key = this.system.buffEffect;
    const dispelGroup = CONFIG.SMT.buffDispels[key];
    const def = CONFIG.SMT.buffs[key];

    // Buffs/Dekunda hit allies (caster included); debuffs/Dekaja hit foes. getAutoTargets drops self, so union it back.
    const affectsAllies = dispelGroup === "nda" || def?.sign > 0;
    const tokens = getAutoTargets(actor, affectsAllies ? "All Allies" : "All Foes");
    const targets = tokens.map(t => t.actor).filter(Boolean);
    if (affectsAllies && !targets.includes(actor)) targets.unshift(actor);

    if (!targets.length) {
      ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
      return;
    }

    if (dispelGroup) {
      let cleared = 0;
      for (const target of targets) cleared += await clearBuffGroup(target, dispelGroup);
      const label = game.i18n.localize(CONFIG.SMT.buffEffectChoices[key]);
      await postEffectNotice(actor, game.i18n.format("SMT.EffectMsg.Dispelled", { skill: label, count: cleared }));
      return;
    }

    for (const target of targets) {
      const summary = await applyBuff(target, key, { source: actor });
      await postBuffCard(actor, summary);
    }
  }

  // Provoke (p.105): auto-success; one 1d10 debuffs every foe (−resist, +phys/mag power).
  async _castProvoke(actor) {
    const { getAutoTargets } = await import("../helpers/combat.mjs");
    const { applyProvoke } = await import("../helpers/effects.mjs");
    const targets = getAutoTargets(actor, "All Foes").map(t => t.actor).filter(Boolean);
    if (!targets.length) {
      ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
      return;
    }
    const intro = await foundry.applications.handlebars.renderTemplate(
      "systems/smt-rpg/templates/chat/auto-success.hbs",
      { name: this.name, effectDescription: this.system.effectDescription }
    );
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: intro });

    const lines = [];
    for (const foe of targets) {
      const res = await applyProvoke(foe, { source: actor });
      if (res) lines.push(`${foe.name}: −${res.amount} resist, +${res.amount} power`);
    }
    if (lines.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="smt-roll effect-notice"><p>${lines.join("<br>")}</p></div>`
      });
    }
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
      ailmentRate: this.system.ailment?.rate ?? 0
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

    // Using an item is a non-reactive action: poison drains HP (p.66).
    const { applyPoisonDrain } = await import("../helpers/effects.mjs");
    await applyPoisonDrain(actor);

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
