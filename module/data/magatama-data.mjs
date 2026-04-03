import { makeAffinitySchema, STATS } from "./fields.mjs";

const { SchemaField, NumberField, StringField, BooleanField, ArrayField } = foundry.data.fields;

export default class MagatamaData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      statBonuses: new SchemaField(
        Object.fromEntries(STATS.map(s => [s, new NumberField({ integer: true, initial: 0 })]))
      ),
      affinities: makeAffinitySchema(),
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
