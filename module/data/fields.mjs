const { SchemaField, StringField } = foundry.data.fields;

export const AFFINITY_CHOICES = ["normal", "strong", "null", "drain", "repel", "weak"];
export const AILMENT_AFFINITY_CHOICES = ["normal", "strong", "null", "weak"];
// Canonical affinity-bearing element list (the 11 elements that carry damage
// affinities). This is the single source for affinity schemas + affinity UI.
// Distinct from CONFIG.SMT.elements, which is the FULL label map (adds
// recovery/support/none) used for skill element choices.
export const ELEMENTS = ["phys", "fire", "ice", "elec", "force", "mind", "nerve", "ruin", "dark", "light", "almighty"];
export const AILMENT_ELEMENTS = ["mind", "nerve", "ruin", "dark"];
export const STATS = ["strength", "magic", "vitality", "agility", "luck"];

export function makeAffinitySchema(choices = AFFINITY_CHOICES) {
  return new SchemaField(
    Object.fromEntries(ELEMENTS.map(el => [el, new StringField({ initial: "normal", choices })]))
  );
}

export function makeAilmentAffinitySchema() {
  return new SchemaField(
    Object.fromEntries(AILMENT_ELEMENTS.map(el => [el, new StringField({ initial: "normal", choices: AILMENT_AFFINITY_CHOICES })]))
  );
}
