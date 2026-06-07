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

  /**
   * Whether this skill is magic that Mute seals (p.66): a spell or magical attack
   * skill. Sourced from CONFIG.SMT.muteBlockedSkillTypes so the blocked set stays
   * config-authoritative. Read by SMTItem.use to bar a Muted actor from casting.
   * @returns {boolean}
   */
  get isMagicSkill() {
    return this.type === "skill" && CONFIG.SMT.muteBlockedSkillTypes.includes(this.system.skillType);
  }

  /**
   * Whether this skill casts a buff/debuff or a dispel (p.96): its
   * system.buffEffect is a CONFIG.SMT.buffs or CONFIG.SMT.buffDispels key.
   * @returns {boolean}
   */
  get isBuffSkill() {
    const e = this.system.buffEffect;
    return this.type === "skill" && !!e && e !== "none";
  }

  /**
   * Whether this skill is a talk skill (p.72): an approach or support talk skill.
   * Approach skills begin a negotiation; support skills interject into one already
   * underway. Sourced from CONFIG.SMT.talk so the talk-skill set stays
   * config-authoritative. Read by SMTItem.use to route into the negotiation flow.
   * @returns {boolean}
   */
  get isTalkSkill() {
    if (this.type !== "skill") return false;
    return this.system.skillType === CONFIG.SMT.talk.approachType
      || this.system.skillType === CONFIG.SMT.talk.supportType;
  }

  /** Whether this is specifically an approach talk skill (begins a negotiation, p.72). */
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

    // Mute seals magic (p.66): a Muted actor cannot use spells or magical attack
    // skills. Checked before the cost is paid so a blocked cast never burns MP.
    if (this.isMagicSkill && actor.system.ailment === "mute") {
      ui.notifications.warn(game.i18n.localize("SMT.Warnings.Muted"));
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

    // Poison drains HP for each non-reactive action taken (p.66). Using a skill —
    // attack, support, or buff — is such an action, so the drain is applied once
    // here after the cost is paid and before the action resolves.
    const { applyPoisonDrain } = await import("../helpers/effects.mjs");
    await applyPoisonDrain(actor);

    // Buff / debuff / dispel skills resolve via ActiveEffects, not the attack
    // pipeline (p.96). They auto-succeed and skip the hit/power rolls entirely.
    if (this.isBuffSkill) {
      await this._castBuff(actor);
      return;
    }

    // Talk skills resolve via the negotiation flow (p.72), not the attack pipeline.
    // An approach skill begins a negotiation with one demon; a support skill is an
    // interjection into a negotiation already underway. Either way the talk does not
    // roll a hit/power check itself (the Negotiation check is rolled inside the
    // negotiation engine, with the +20% talk bonus, p.75).
    if (this.isTalkSkill) {
      await this._talk(actor);
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
    let label = `${this.name} (${game.i18n.localize(`SMT.Stat.${stat.charAt(0).toUpperCase() + stat.slice(1)}`)})`;

    // Concentrate: spend any bonus held for this named action, adding its +% to
    // the hit TN (p.64). The whole bonus is consumed regardless of the result.
    const { consumeConcentrate } = await import("../helpers/effects.mjs");
    const concentrate = await consumeConcentrate(actor, this.name);
    if (concentrate) {
      tn += concentrate;
      label += ` +${concentrate}%`;
    }

    // Stun caps the attacker's hit TN at CONFIG.SMT.stun.hitCapPct (p.66). Cap the
    // single TN value here so it flows into both the roll and buildCheckData,
    // keeping any Fate reroll/boost re-evaluation consistent with what was rolled.
    if (actor.system.ailment === "stun") tn = Math.min(tn, CONFIG.SMT.stun.hitCapPct);

    // Might passive: crit threshold TN/5 instead of TN/10 (getter, physical only)
    const hasMight = this.isPhysicalSkill && actor.system.hasMightPassive;
    const checkResult = await actor.rollPercentile(tn, label, { hasMight });

    // Store for FP reroll/boost buttons (shared checkData builder)
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

  /**
   * Resolve a buff/debuff/dispel skill (p.96). These auto-succeed with no hit or
   * power roll and are AoE by allegiance: -kaja buffs and Dekunda affect all
   * allies (caster included); -nda debuffs and Dekaja affect all foes. Targeting
   * is by disposition (combat.getAutoTargets), not the manual target, so the
   * correct side is always hit. A dispel strips its group from each target; a
   * buff rolls and stacks per target and posts a result card.
   *
   * @param {SMTActor} actor - the casting actor.
   * @returns {Promise<void>}
   */
  async _castBuff(actor) {
    const {
      applyBuff, clearBuffGroup, postBuffCard, postEffectNotice
    } = await import("../helpers/effects.mjs");
    const { getAutoTargets } = await import("../helpers/combat.mjs");

    const key = this.system.buffEffect;
    const dispelGroup = CONFIG.SMT.buffDispels[key];
    const def = CONFIG.SMT.buffs[key];

    // -kaja buffs and Dekunda (clears -nda from allies) affect allies, caster
    // included; -nda debuffs and Dekaja affect foes. getAutoTargets excludes the
    // caster's own token, so self is unioned back in for ally-targeted effects.
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
      await postEffectNotice(actor, game.i18n.format("SMT.Effect.Dispelled", { skill: label, count: cleared }));
      return;
    }

    for (const target of targets) {
      const summary = await applyBuff(target, key, { source: actor });
      await postBuffCard(actor, summary);
    }
  }

  /**
   * Resolve a talk skill (p.72). An approach skill begins a negotiation with one
   * targeted demon: the negotiation engine rolls the rulebook Negotiation check (with
   * the +20% talk bonus and the impress-type crit widening) and posts the card whose
   * GM-driven buttons resolve demands, gifts, and the final Deal/Break (p.73-76). A
   * support skill is an interjection into a negotiation already underway — it has no
   * standalone target, so it posts a short interjection notice granting its +20% and
   * leaves the flowchart move to the GM (the support-skill effects — restart, halve a
   * macca demand, negate a Break — are GM judgement calls on the active negotiation).
   * Targeting one demon uses the manual target (the book's "1 enemy demon").
   *
   * @param {SMTActor} actor - the talking actor.
   * @returns {Promise<void>}
   */
  async _talk(actor) {
    const { startNegotiation } = await import("../helpers/negotiation.mjs");
    const { postEffectNotice } = await import("../helpers/effects.mjs");

    if (this.isApproachSkill) {
      // Approach: negotiate with one demon (the book's "1 enemy demon"). Prefer the
      // manual target; fall back to a single auto-resolved foe so a one-foe encounter
      // needs no manual targeting.
      const { resolveTargets } = await import("../helpers/combat.mjs");
      const target = game.user.targets.first()?.actor
        ?? resolveTargets(actor, "All Foes")[0]?.actor
        ?? null;
      if (!target) {
        ui.notifications.info(game.i18n.localize("SMT.Warnings.NoTargets"));
        return;
      }
      // Impress-type match (p.76) depends on the skill's impress type and the demon's
      // behavioural patterns — a GM/table call, not schema data — so confirm it once
      // here. A yes widens the Negotiation check's crit range to one-fifth of the TN.
      const impressMatch = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("SMT.Talk.ImpressPrompt") },
        content: `<p>${game.i18n.format("SMT.Talk.ImpressQuestion", { name: target.name })}</p>`,
        rejectClose: false,
        modal: false
      }).catch(() => false);
      await startNegotiation({ talker: actor, target, skillName: this.name, impressMatch: !!impressMatch });
      return;
    }

    // Support: interjection notice (p.72). The +20% is the talk-skill bonus the GM
    // applies to the active negotiation's next check; the specific support effect is
    // resolved on that negotiation's card by the GM.
    await postEffectNotice(actor, game.i18n.format("SMT.Talk.Interjection", {
      name: actor.name, skill: this.name
    }));
  }

  /**
   * Post pending-attack cards for this skill's targets; damage is applied later via the
   * Dodge/Apply buttons. Delegates the per-target loop, token-UUID resolution, and the
   * no-target notification to combat.postAttacksToTargets.
   *
   * @param {SMTActor} attacker        - the attacking actor.
   * @param {{total:number,isCritical:boolean}} powerResult - result from actor.rollPower.
   * @param {?string}  [checkMessageId] - id of the originating check card (FP cascade), or undefined.
   * @returns {Promise<void>}
   */
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

  /**
   * Use a consumable: healing, ailment cures, revival, or attack items.
   *
   * quantity is only decremented once an effect is confirmed to take effect,
   * so a pure-revive consumable used on a living target (or any item with no applicable
   * effect) no longer silently burns a charge. healAllAllies now resolves disposition-
   * based ally targets (self + same-disposition tokens, mirroring combat.getAutoTargets)
   * instead of falling back to self-only.
   *
   * @returns {Promise<void>}
   */
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

    // confirm at least one effect will actually apply before spending a charge.
    // Heal/cure/attack are effective whenever configured; revive only applies to a
    // downed target. A pure-revive on a living target therefore must NOT decrement.
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

    // Using an item is a non-reactive action: a poisoned user drains HP (p.66).
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

    // Attack item (Rock) — base magical power + item potency
    if (isAttackItem) {
      const { postAttacksToTargets } = await import("../helpers/combat.mjs");
      const baseMagPower = actor.system.baseMagicalPower;
      const powerResult = await actor.rollPower(
        baseMagPower, sys.attackPower,
        `${this.name} — ${game.i18n.localize("SMT.Power")}`
      );
      // shared per-target poster (also emits the no-target notification).
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

  /**
   * Resolve the "all allies" target set for a party consumable: the user plus
   * every same-disposition token in scope, mirroring combat.getAutoTargets (which excludes
   * the actor's own token, so self is unioned back in). Deduped by actor id.
   *
   * @param {SMTActor} actor - the actor using the consumable.
   * @returns {Promise<SMTActor[]>} the actors to affect (always includes the user).
   */
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

  /**
   * Apply HP/MP healing to a target. Writes HP and MP in a single update so a
   * combined HP+MP restore is one document write rather than two.
   *
   * @param {SMTActor} target - the actor to heal.
   * @param {object}   sys    - this consumable's system data (healFull/healHP/healMP).
   * @returns {Promise<string>} a per-target result line for the chat card.
   */
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
