// SMTCombat: initiative tie-break via a stored die-off (p.63), since core breaks ties by name/id.

const FLAG_SCOPE = "smt-rpg";
const TIEBREAK_KEY = "initiativeTieBreak";

export default class SMTCombat extends Combat {

  // Roll initiative, then stamp each combatant with a flat tie-break die (p.63).
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

  // Sort by initiative (higher first), break ties on the stored die-off, then core name/id.
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
