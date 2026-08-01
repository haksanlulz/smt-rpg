// Item payloads for the p.116-118 price lists. Pure apart from CONFIG reads.
//
// The printed GEAR PRICE LIST holds three mechanically different things and the
// builder routes each to the document type that actually expresses it:
//   * weapons and armor -> `gear` Items (equip bonuses, ammo, slots);
//   * grenades -> `consumable` Items with attack fields — they are single-use attack
//     items, exactly the Rock family's mechanics, whatever page they are printed on;
//   * Bullets x10 -> a `consumable` of the new `ammo` type.
// The ITEM PRICE LIST rows are all consumables; their effect SENTENCES are parsed
// into the structured fields the schema declares (heal, revive, cure, attack), and
// anything the sentence states that the fields cannot express is returned as a caveat
// rather than silently dropped.

const GRANT_MAG_RESIST = /Grants (\d+) magic resistance/i;
const AMMO_COUNT = /Ammo Count (\d+)/i;

// "Weapon (Firearm)" -> weapon-ranged, "Head Armor" -> armor + slot, and the two
// consumable-shaped rows route away from gear entirely.
export function classifyGear(type) {
  const t = String(type ?? "").trim();
  if (/Grenade/i.test(t)) return { route: "consumable", consumableType: "rock" };
  if (/^Ammo$/i.test(t)) return { route: "consumable", consumableType: "ammo" };
  if (/Firearm/i.test(t)) return { route: "gear", gearType: "weapon-ranged", slot: "" };
  if (/^Weapon/i.test(t)) return { route: "gear", gearType: "weapon-melee", slot: "" };
  if (/Armor/i.test(t)) {
    return { route: "gear", gearType: "armor", slot: t.replace(/\s*Armor$/i, "").trim() };
  }
  return { route: "gear", gearType: "accessory", slot: "" };
}

// A gear entry -> `gear` Item system payload.
export function buildGearSystem(entry, cls) {
  const effect = entry.effect ?? "";
  const magResist = GRANT_MAG_RESIST.exec(effect);
  const ammo = AMMO_COUNT.exec(effect);
  const system = {
    gearType: cls.gearType,
    slot: cls.slot,
    powerBonus: entry.gearPower ?? 0,
    resistBonus: {
      physical: entry.physResist ?? 0,
      magical: magResist ? Number(magResist[1]) : 0
    },
    ammo: {
      max: ammo ? Number(ammo[1]) : 0,
      value: ammo ? Number(ammo[1]) : 0
    },
    price: entry.buy ?? 0,
    description: effect
  };
  return { system };
}

// Effect-sentence patterns shared by the consumable rows. Each fills a schema field;
// what none of them catch stays expressed only as description text, and the caveat
// list says so for the mechanically-relevant cases.
const HEAL_HP = /recovers? (\d+) HP/i;
const HEAL_MP = /recovers? (\d+) MP/i;
const HEAL_ALL_HP = /recovers? (?:from )?all HP/i;
const HEAL_ALL_MP = /recovers? all MP|and all MP/i;
const REVIVE_1 = /returned to life at 1 HP/i;
const REVIVE_FULL = /returned to life at full HP/i;
const CURES = /recovers? from ([A-Za-z, ]+?)\./i;
const ATTACK_DMG = /Deals? (\w+) damage/i;
const ATTACK_WITH = /Attack all enemies with (\w+)/i;
const ATTACK_POWER = /base magical power \+ (\d+)/i;
const AILMENT = /(\d+)% chance to inflict (\w+)/i;
const INSTANT_KILL = /(\d+)% chance to Instant Kill/i;
const REUSABLE = /not discarded upon use/i;

export function buildConsumableSystem(entry, consumableType) {
  const effect = entry.effect ?? "";
  const caveats = [];

  const type = consumableType
    ?? (/Rock$/.test(entry.name) ? "rock"
      : /^Bead|Bead$/.test(entry.name.trim()) || /Bead of Life|Bead Chain/.test(entry.name) ? "bead"
        : "medicine");

  const system = {
    consumableType: type,
    effect,
    quantity: 1,
    price: entry.buy ?? 0,
    description: effect,
    reusable: REUSABLE.test(effect)
  };

  const hp = HEAL_HP.exec(effect);
  const mp = HEAL_MP.exec(effect);
  if (hp) system.healHP = Number(hp[1]);
  if (mp) system.healMP = Number(mp[1]);
  if (HEAL_ALL_HP.test(effect) || HEAL_ALL_MP.test(effect)) system.healFull = true;
  if (/^All allies/i.test(effect)) system.healAllAllies = true;
  if (REVIVE_1.test(effect)) system.revive = true;
  if (REVIVE_FULL.test(effect)) { system.revive = true; system.reviveFull = true; }

  const cures = CURES.exec(effect);
  if (cures) {
    const list = cures[1].split(/,|and/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const known = list.filter(a => a in CONFIG.SMT.ailments);
    if (known.length === 1) system.curesAilment = known[0];
    else if (known.length > 1) {
      // The schema's cure field holds ONE ailment; Sacred Water's three cannot be
      // expressed and saying so beats silently curing only the first.
      caveats.push(`${entry.name}: cures ${known.join(", ")} — the field holds one; effect text carries the rest`);
    }
  }

  const dmg = ATTACK_DMG.exec(effect) ?? ATTACK_WITH.exec(effect);
  if (dmg) {
    const el = dmg[1].toLowerCase();
    if (el in CONFIG.SMT.elements) {
      system.attackElement = el;
      system.attackAll = /all enemies/i.test(effect);
      const power = ATTACK_POWER.exec(effect) ?? (entry.gearPower != null ? [null, entry.gearPower] : null);
      if (power) system.attackPower = Number(power[1]);
      const ail = AILMENT.exec(effect);
      const kill = INSTANT_KILL.exec(effect);
      if (ail && ail[2].toLowerCase() in CONFIG.SMT.ailments) {
        system.attackAilment = { type: ail[2].toLowerCase(), rate: Number(ail[1]) };
      } else if (kill) {
        system.attackAilment = { type: "death", rate: Number(kill[1]) };
      }
    }
  }

  return { system, caveats };
}

// Route every printed row to its payload. Returns Item payloads plus the caveat list.
export function buildGearItemPayloads(consumables, gear) {
  const payloads = [];
  const caveats = [];
  for (const c of consumables) {
    const { system, caveats: cs } = buildConsumableSystem(c);
    caveats.push(...cs);
    payloads.push({ name: c.name, type: "consumable", system });
  }
  for (const g of gear) {
    const cls = classifyGear(g.type);
    if (cls.route === "consumable") {
      const { system, caveats: cs } = buildConsumableSystem(g, cls.consumableType);
      caveats.push(...cs);
      payloads.push({ name: g.name, type: "consumable", system });
    } else {
      const { system } = buildGearSystem(g, cls);
      payloads.push({ name: g.name, type: "gear", system });
    }
  }
  return { payloads, caveats };
}
