import { makeAffinitySchema, makeCategoryAffinitySchema, STATS } from "./fields.mjs";

const { SchemaField, NumberField, StringField, BooleanField, ArrayField } = foundry.data.fields;

export default class MagatamaData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      statBonuses: new SchemaField(
        Object.fromEntries(STATS.map(s => [s, new NumberField({ integer: true, initial: 0 })]))
      ),
      affinities: makeAffinitySchema(),
      // Three of the printed Magatama grant a CATEGORY affinity rather than an
      // elemental one, and one of them is a starter: Kamudo is "Strong Phys and
      // Ailment Attack Weak" (p.40), Muspell is "Strong Ailment Attack", Kamurogi is
      // "Strong Phys and Magic Weak". Magic and Ailment are the p.65 category axes,
      // not elements, so makeAffinitySchema could never express any of them.
      categoryAffinities: makeCategoryAffinitySchema(),
      skillList: new ArrayField(
        new SchemaField({
          skillName: new StringField({ initial: "" }),
          learnLevel: new NumberField({ integer: true, min: 1, initial: 1 })
        })
      ),
      acquisition: new StringField({ initial: "Starter" }),
      isStarter: new BooleanField({ initial: false }),
      description: new StringField({ initial: "" })
    };
  }
}
