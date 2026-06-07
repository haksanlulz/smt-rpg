// ═══════════════════════════════════════════════
// combat.mjs — SMTCombat document: rulebook-accurate initiative tie-break (p.63).
//
// Initiative itself is "1d10x10 + Agility" (declared in system.json, mirrored to
// CONFIG.Combat.initiative). The book adds one wrinkle Foundry's default sort does
// not model: "If two or more combatants have the same initiative, then have those
// combatants roll a die, with tie-breaking going to the one who rolls highest"
// (p.63). Foundry's stock _sortCombatants breaks an initiative tie by name/id,
// which is deterministic but not the rules' flat die-off.
//
// This subclass rolls one CONFIG.SMT.initiativeTieBreakDie per combatant the moment
// its initiative is rolled and stores it in a flag, then sorts equal initiatives by
// that stored value (higher first). Storing it once — rather than re-rolling inside
// the comparator — keeps the order stable across the many times Foundry re-sorts the
// tracker (a comparator that randomized on each call would make the order jitter).
// ═══════════════════════════════════════════════

const FLAG_SCOPE = "smt-rpg";
const TIEBREAK_KEY = "initiativeTieBreak";

export default class SMTCombat extends Combat {

  /**
   * Roll initiative for combatants, then stamp each rolled combatant with a flat
   * tie-break value (p.63). Foundry's rollInitiative persists the initiative total;
   * we follow it with one CONFIG.SMT.initiativeTieBreakDie roll per combatant so a
   * later initiative tie is broken by a stored highest-roll-wins value rather than
   * by name/id. Re-rolling a combatant's initiative re-rolls its tie-break too.
   *
   * @param {string|string[]} ids                 - combatant id(s) to roll for.
   * @param {object} [options]                     - forwarded to Combat#rollInitiative.
   * @returns {Promise<this>}
   */
  async rollInitiative(ids, options = {}) {
    await super.rollInitiative(ids, options);

    const idList = typeof ids === "string" ? [ids] : ids;
    const die = `1d${CONFIG.SMT.initiativeTieBreakDie}`;
    const updates = [];
    for (const id of idList) {
      const combatant = this.combatants.get(id);
      // Only stamp combatants that actually have an initiative to tie on.
      if (!combatant || combatant.initiative === null) continue;
      const roll = await new Roll(die).evaluate();
      updates.push({ _id: id, [`flags.${FLAG_SCOPE}.${TIEBREAK_KEY}`]: roll.total });
    }
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
    return this;
  }

  /**
   * Sort combatants by initiative (higher first), breaking ties with the stored
   * flat tie-break roll (higher first, p.63) before falling back to Foundry's
   * default name/id ordering. A combatant with no rolled tie-break sorts after one
   * that has it, so un-stamped entries never edge out a real die-off result.
   *
   * @param {Combatant} a
   * @param {Combatant} b
   * @returns {number}
   */
  _sortCombatants(a, b) {
    // null/undefined initiative (not yet rolled) sorts last, matching core.
    const ia = Number.isFinite(a.initiative) ? a.initiative : -Infinity;
    const ib = Number.isFinite(b.initiative) ? b.initiative : -Infinity;
    if (ia !== ib) return ib - ia;

    const ta = Number(a.getFlag(FLAG_SCOPE, TIEBREAK_KEY));
    const tb = Number(b.getFlag(FLAG_SCOPE, TIEBREAK_KEY));
    const va = Number.isFinite(ta) ? ta : -Infinity;
    const vb = Number.isFinite(tb) ? tb : -Infinity;
    if (va !== vb) return vb - va;

    return super._sortCombatants(a, b);
  }
}
