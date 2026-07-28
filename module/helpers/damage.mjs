// Damage calc (p.64-65). Pure: raw power -> affinity -> subtract resistance (skipped on crit) -> floor 0.

const MAX_DAMAGE = 1_000_000;

// Flag/roll values reach here author-forgeable; coerce before arithmetic.
function _sanitize(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.floor(value), 0), MAX_DAMAGE);
}

function _applyResistance(afterAffinity, resistance, skipResistance) {
  const value = skipResistance ? afterAffinity : afterAffinity - resistance;
  return Math.max(0, value);
}

// Affinity ratings that end the calculation outright, highest priority first (p.65):
// "Repel > Drain > Null > Strong > Weak (with Repel having the highest priority)."
//
// Derived from CONFIG.SMT.affinityPriority rather than restated, so this ordering and
// the one the Affinity Changer passives resolve with cannot drift apart.
const ABSOLUTES = new Set(["repel", "drain", "null"]);
const absolutePriority = () => CONFIG.SMT.affinityPriority.filter(r => ABSOLUTES.has(r));

// Combine every affinity rating that applies to one attack.
//
// A target can hold a rating against the attack's ELEMENT and, for magical attacks,
// against MAGIC as a category. Weak and Strong MULTIPLY across axes -- p.65's worked
// example gives a demon weak to Ice, Magic and Ailments a 32x effect-rate bonus,
// which is 2*2*2 for the three ratings times 2 for the crit and 2 for the fumble.
// The absolutes do not multiply; the highest-priority one wins and short-circuits.
export function affinityOutcome(ratings) {
  let multiplier = 1;
  let absolute = null;
  const order = absolutePriority();

  for (const raw of ratings ?? []) {
    const r = typeof raw === "string" ? raw.toLowerCase() : "";
    if (order.includes(r)) {
      if (absolute === null || order.indexOf(r) < order.indexOf(absolute)) {
        absolute = r;
      }
    } else if (r === "weak") multiplier *= 2;
    else if (r === "strong") multiplier /= 2;
  }

  return { absolute, multiplier };
}

// drain/repel deal no direct HP loss but carry the post-resistance magnitude (p.65) for the actor layer.
//
// `magicAffinity` is the target's rating against Magic as a category and applies to
// magical attacks only. `ailmentAffinity` is deliberately NOT read here: p.65 states
// that an Ailment rating "only ha[s] an effect on the ailment effect rate and do[es]
// not have any influence on the damage part". It is accepted and ignored so a caller
// passing the full affinity set cannot silently have it applied to damage.
// `incomingMultiplier` is the scaling the TARGET's own ailment puts on damage it
// receives — Stone's halving of non-Phys/Force/Almighty and Fly's flat doubling
// (p.66), both from helpers/ailments.mjs. It rides with the affinity multiplier so
// the whole product is floored once, per p.53's "do the multiplication first".
export function calculateDamage({
  rawPower, affinity, resistance, isCritical, dodgeFumble = false, attackerResistance = 0,
  magicAffinity = "normal", isPhysicalAttack = false, ailmentAffinity = "normal",
  incomingMultiplier = 1, finalMultiplier = 1
}) {
  void ailmentAffinity;
  const outcome = affinityOutcome([affinity, isPhysicalAttack ? "normal" : magicAffinity]);
  const scale = Number.isFinite(incomingMultiplier) && incomingMultiplier >= 0 ? incomingMultiplier : 1;
  outcome.multiplier *= scale;

  const result = {
    rawPower,
    affinity,
    afterAffinity: 0,
    resistanceApplied: 0,
    finalDamage: 0,
    isDrain: false,
    isRepel: false,
    isNull: false,
    drainedAmount: 0,
    reflectedDamage: 0,
    dodgeFumble
  };

  if (outcome.absolute === "null") {
    result.isNull = true;
    return result;
  }

  // Floor once, after the whole multiplier: halving twice is a quarter, not two
  // separate roundings.
  let afterAffinity = Math.floor(rawPower * outcome.multiplier);

  // Dodge fumble: double damage, skip resistance (p.65).
  if (dodgeFumble) afterAffinity *= 2;
  const skipResistance = isCritical || dodgeFumble;

  if (outcome.absolute === "drain") {
    result.isDrain = true;
    result.afterAffinity = afterAffinity;
    result.drainedAmount = _applyResistance(afterAffinity, resistance, skipResistance);
    return result;
  }
  if (outcome.absolute === "repel") {
    result.isRepel = true;
    result.afterAffinity = afterAffinity;
    // Attacker's resistance applies on reflect (p.65).
    result.reflectedDamage = _applyResistance(afterAffinity, attackerResistance, skipResistance);
    return result;
  }

  result.afterAffinity = afterAffinity;
  result.resistanceApplied = skipResistance ? 0 : resistance;

  // `finalMultiplier` is Retaliate/Avenge (p.110), which say "Damage dealt is
  // doubled/tripled" — the damage, not the power. It is therefore the LAST step,
  // after resistance has already come off, unlike the crit multiplier (p.59), which
  // the book applies to total power before affinity.
  const counterScale = Number.isFinite(finalMultiplier) && finalMultiplier >= 0 ? finalMultiplier : 1;
  result.finalDamage = Math.floor(_applyResistance(afterAffinity, resistance, skipResistance) * counterScale);

  return result;
}

// The HP write itself, pulled out of SMTActor#applyDamage so it is checkable.
// `dealt` is the HP actually lost, which is NOT finalDamage when the hit overkills —
// the difference is what the FP halve needs to resolve correctly (p.59).
export function applyDamageToHp(hpBefore, hpMax, finalDamage) {
  const before = _sanitize(hpBefore);
  const hpAfter = Math.max(before - _sanitize(finalDamage), 0);
  return { hpAfter, dealt: before - hpAfter };
}

// FP "Halve Damage" (p.59). Resolves against `hpBefore` — the HP at the moment the
// hit landed — so the outcome is exact whether or not the hit overkilled, and stays
// exact across repeated spends (1/2 -> 1/4 -> 1/8), each recomputed from the same base.
//
// `hpNow` is the legacy path for damage cards written before `hpBefore` was stored:
// it restores the difference, which over-restores by exactly the overkill amount.
// Kept so old chat messages keep working; never used when hpBefore is present.
export function halveDamageResult({ hpBefore, hpNow, hpMax, currentDamage, divisor = 2 }) {
  const max = Number.isFinite(hpMax) ? Math.max(Math.floor(hpMax), 0) : MAX_DAMAGE;
  const div = Number.isFinite(divisor) && divisor > 0 ? divisor : 2;
  const damage = _sanitize(currentDamage);
  const newDamage = Math.floor(damage / div);

  const base = Number.isFinite(hpBefore)
    ? _sanitize(hpBefore) - newDamage
    : _sanitize(hpNow) + (damage - newDamage);

  return { newDamage, hpAfter: Math.min(Math.max(base, 0), max) };
}
