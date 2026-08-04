// First-launch signposting for the no-PDF path (1.0 oracle #2).
//
// The system ships RAW RULES ONLY — every stat block, skill, Magatama and gear entry
// arrives through the importer from the user's own PDF. That is a deliberate non-goal,
// not an omission, but it means a stranger who installs this and looks at the sidebar
// sees nothing at all and has no way to know the importer exists. Premortem #8 named
// that as the way a public user bounces off; `the-no-pdf-path-degrades-cleanly` wrote
// it into a spec; this module is the thing behind the promise.
//
// Three signposts, in the order a new GM meets them:
//   1. The four packs are created EMPTY at first launch, so the Compendium tab is
//      populated and named rather than blank.
//   2. A one-time dialog on the first ready with no data, with a button that opens
//      the importer directly.
//   3. Opening one of those empty packs says how to fill it — which is where the
//      confusion actually happens.
//
// ⚑ Foundry's pack metadata schema has NO description field (v14 `packs` accepts
// name/label/banner/path/type/system/ownership/flags and nothing else), so the spec's
// "every empty compendium states how to fill it" cannot be satisfied ON the pack. The
// third signpost is the closest the API allows and is written that way deliberately.

// The four world packs, in the order the importer writes them. Single source of truth:
// importer/app.mjs consumes this rather than declaring its own list, so a pack cannot
// exist in one place and not the other.
export const PACK_DEFS = [
  { name: "smt-demons", type: "Actor", labelKey: "SMT.Importer.PackLabel" },
  { name: "smt-magatama", type: "Item", labelKey: "SMT.Importer.PackMagatama" },
  { name: "smt-skills", type: "Item", labelKey: "SMT.Importer.PackSkills" },
  { name: "smt-gear", type: "Item", labelKey: "SMT.Importer.PackGear" },
];

export const SETTING_ONBOARDED = "onboardingDismissed";

export const packId = (name) => `world.${name}`;

// Which of the declared packs do not exist yet. Pure.
export function packsToCreate(existingIds) {
  const have = new Set(existingIds ?? []);
  return PACK_DEFS.filter(p => !have.has(packId(p.name)));
}

// Which existing packs actually hold documents. Pure — and it is what makes the
// importer's confirm-then-replace honest: replacing four EMPTY packs it created
// itself is not a destructive act and must not ask.
export function packsWithContent(packs) {
  return (packs ?? []).filter(p => (p?.count ?? 0) > 0);
}

// Whether to show the first-launch dialog. Pure. A GM, not previously dismissed, and
// no imported data anywhere — a world that already has content never gets prompted,
// including one whose packs came from somewhere other than this importer.
export function needsOnboarding({ isGM, dismissed, packs } = {}) {
  if (!isGM || dismissed) return false;
  return packsWithContent(packs).length === 0;
}

// ---------------------------------------------------------------- Foundry side

// Create any missing world pack, empty. GM only; safe to call on every ready.
export async function ensureWorldPacks() {
  if (!game.user.isGM) return [];
  const missing = packsToCreate(game.packs.map(p => p.collection));
  if (!missing.length) return [];

  const CompendiumCollection = foundry.documents.collections.CompendiumCollection;
  const created = [];
  for (const def of missing) {
    try {
      created.push(await CompendiumCollection.createCompendium({
        label: game.i18n.localize(def.labelKey),
        name: def.name,
        type: def.type
      }));
    } catch (err) {
      // A world that cannot take a pack is not a reason to break world load.
      console.warn(`smt-rpg | could not create the ${def.name} compendium:`, err.message);
    }
  }
  return created;
}

// The one-time first-launch dialog.
export async function showOnboarding() {
  const dismiss = () => game.settings.set("smt-rpg", SETTING_ONBOARDED, true);

  const content = `
    <section class="smt-onboarding">
      <p>${game.i18n.localize("SMT.Onboarding.Intro")}</p>
      <p>${game.i18n.localize("SMT.Onboarding.HowTo")}</p>
      <p class="smt-onboarding-note">${game.i18n.localize("SMT.Onboarding.NoData")}</p>
    </section>`;

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SMT.Onboarding.Title") },
    position: { width: 480 },
    content,
    buttons: [
      { action: "import", label: game.i18n.localize("SMT.Onboarding.OpenImporter"), default: true },
      { action: "later", label: game.i18n.localize("SMT.Onboarding.Later") }
    ]
  }).catch(() => "later");

  // Dismissed either way: a GM who chose "later" has been told, and being told twice
  // is nagging. The importer stays in the Settings menu regardless.
  await dismiss();
  if (choice === "import") {
    const { default: SMTImporterApp } = await import("../importer/app.mjs");
    new SMTImporterApp().render(true);
  }
}

// Signpost #3: opening one of our own EMPTY packs says how to fill it. This is where
// the confusion actually lands, and it is the closest the API allows to putting the
// guidance on the pack itself.
export function noticeEmptyPack(pack) {
  if (!game.user.isGM) return false;
  const ours = PACK_DEFS.some(d => packId(d.name) === pack?.collection);
  if (!ours || (pack.index?.size ?? 0) > 0) return false;
  ui.notifications.info(game.i18n.format("SMT.Onboarding.EmptyPack",
    { pack: pack.metadata.label }));
  return true;
}
