import SMTBaseActorData from "./base-actor.mjs";

const { StringField } = foundry.data.fields;

export default class HumanData extends SMTBaseActorData {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      subclass: new StringField({
        initial: "potential",
        choices: Object.keys(CONFIG.SMT.humanSubclasses)
      })
      // isManikin not persisted; derived from subclass below (p.47).
    };
  }

  get expMultiplier() {
    return 0.8;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    this.affinities.light = "null"; // Humans can't be exorcized (p.47)
    // Manikin: human subclass with extra rules (p.47).
    this.isManikin = this.subclass === "manikin";
    this._applyEquippedGear();
    this._clampCurrentValues();
  }

  _applyEquippedGear() {
    const equipped = this.parent.items.filter(i => i.type === "gear" && i.system.equipped);

    let meleeWeapon = null;
    let rangedWeapon = null;

    for (const gear of equipped) {
      const sys = gear.system;

      switch (sys.gearType) {
        case "weapon-melee":
          meleeWeapon = gear;
          this.basePhysicalPower += sys.powerBonus;
          break;
        case "weapon-ranged":
          rangedWeapon = gear;
          break;
        case "armor":
        case "accessory":
          this.physicalResistance += sys.resistBonus.physical;
          this.magicalResistance += sys.resistBonus.magical;
          break;
      }
    }

    // Gun power = gear power + agility (no level)
    if (rangedWeapon) {
      this.hasRangedWeapon = true;
      this.rangedWeapon = {
        name: rangedWeapon.name,
        power: rangedWeapon.system.powerBonus + this.agilityTotal,
        tn: this.agilityTN + this.rangedTnBonus,
        ammo: rangedWeapon.system.ammo
      };
    } else {
      this.hasRangedWeapon = false;
      this.rangedWeapon = null;
    }
  }
}
