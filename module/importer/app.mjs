// The in-Foundry importer (1.0 oracle #1-#3): point it at your own rulebook PDF and it
// builds a world compendium of demons. No CLI, no Python, nothing leaves the client —
// the PDF is read in memory via Foundry's own bundled pdf.js and never uploaded.
//
// Write discipline (the R4 conversions, verbatim rules):
//   * A failed or cancelled import writes NOTHING. The whole PDF is parsed and
//     verified in memory first; packs are touched only after verification passes.
//   * Re-import is CONFIRM-THEN-REPLACE. The world pack is source data; user
//     customizations belong on documents dragged OUT of it, which are never touched.
//   * Everything the build could not express is said out loud in the report.

import { GENERAL_PAGES, BOSS_PAGES, PRINTED_OFFSET, parseDemons, verifyDemons }
  from "./demon-parse.mjs";
import { loadPdfjs, extractPages } from "./extract.mjs";
import { buildDemonSystem, buildDemonSkills } from "../helpers/compendium.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PACK_NAME = "smt-demons";
const WRITE_CHUNK = 25;

export default class SMTImporterApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "smt-importer",
    tag: "section",
    window: { title: "SMT.Importer.Title", resizable: true },
    position: { width: 520, height: "auto" },
    classes: ["smt-importer"],
    actions: {
      chooseFile: SMTImporterApp.#onChooseFile,
      runImport: SMTImporterApp.#onRunImport
    }
  };

  static PARTS = {
    body: { template: "systems/smt-rpg/templates/importer/importer.hbs" }
  };

  /** @type {File|null} the picked PDF; read only on Import. */
  #file = null;

  /** UI state: idle | working | done | failed. Drives which panel renders. */
  #state = "idle";

  #status = "";
  #report = [];

  async _prepareContext() {
    return {
      state: this.#state,
      fileName: this.#file?.name ?? "",
      hasFile: !!this.#file,
      working: this.#state === "working",
      status: this.#status,
      report: this.#report
    };
  }

  // The visible button proxies to a hidden <input type="file"> so the picker styling
  // stays native. The input's change handler is bound per render.
  _onRender(context, options) {
    super._onRender?.(context, options);
    const input = this.element.querySelector("input[type=file]");
    input?.addEventListener("change", () => {
      this.#file = input.files?.[0] ?? null;
      this.render();
    });
  }

  static #onChooseFile() {
    this.element.querySelector("input[type=file]")?.click();
  }

  static async #onRunImport() {
    if (!this.#file || this.#state === "working") return;
    this.#state = "working";
    this.#report = [];
    try {
      await this.#run();
      this.#state = "done";
    } catch (err) {
      // Every failure path lands here AFTER having written nothing.
      this.#state = "failed";
      this.#report.push(err.message);
      console.error("smt-rpg | importer", err);
    }
    this.#status = "";
    this.render();
  }

  async #setStatus(text) {
    this.#status = text;
    const el = this.element.querySelector(".smt-importer-status");
    if (el) el.textContent = text;
    // Yield a frame so the status paints between async stages.
    await new Promise(r => requestAnimationFrame(r));
  }

  #progress(done, total) {
    const bar = this.element.querySelector(".smt-importer-bar");
    if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
  }

  async #run() {
    const i18n = game.i18n;

    // --- read + parse, all in memory ---------------------------------------
    await this.#setStatus(i18n.localize("SMT.Importer.Reading"));
    const buffer = await this.#file.arrayBuffer();

    let pdfjs;
    try {
      pdfjs = await loadPdfjs();
    } catch (err) {
      throw new Error(i18n.localize("SMT.Importer.NoPdfjs"));
    }
    const doc = await pdfjs.getDocument({ data: buffer }).promise;

    const indices = [];
    for (let p = GENERAL_PAGES[0]; p <= GENERAL_PAGES[1]; p++) indices.push(p + PRINTED_OFFSET);
    for (let p = BOSS_PAGES[0]; p <= BOSS_PAGES[1]; p++) indices.push(p + PRINTED_OFFSET);

    // A PDF that does not even have the pages cannot be the book. Refuse before
    // reading a single word.
    if (doc.numPages < indices[indices.length - 1] + 1) {
      throw new Error(i18n.format("SMT.Importer.WrongPdf",
        { pages: doc.numPages, needed: indices[indices.length - 1] + 1 }));
    }

    await this.#setStatus(i18n.localize("SMT.Importer.Extracting"));
    const { pages, splitTotal } = await extractPages(doc, indices, (done, total) => {
      this.#progress(done, total);
      if (done % 10 === 0) {
        this.#status = i18n.format("SMT.Importer.Page", { done, total });
        const el = this.element.querySelector(".smt-importer-status");
        if (el) el.textContent = this.#status;
      }
    });

    await this.#setStatus(i18n.localize("SMT.Importer.Parsing"));
    const demons = parseDemons(pages);

    // --- verify; a failure here has written nothing ------------------------
    await this.#setStatus(i18n.localize("SMT.Importer.Verifying"));
    const { errs, warns } = verifyDemons(demons);
    if (errs.length) {
      // The shareable diagnostic: every error verbatim, count first. This is the
      // wrong-PDF path and the layout-drift path; both refuse rather than half-import.
      this.#report = [
        i18n.format("SMT.Importer.VerifyFailed", { count: errs.length }),
        ...errs.slice(0, 30),
        i18n.localize("SMT.Importer.NothingWritten")
      ];
      throw new Error(i18n.localize("SMT.Importer.Refused"));
    }

    // --- confirm-then-replace ----------------------------------------------
    const packId = `world.${PACK_NAME}`;
    const existing = game.packs.get(packId);
    if (existing) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: i18n.localize("SMT.Importer.ReplaceTitle") },
        content: `<p>${i18n.format("SMT.Importer.ReplaceBody",
          { pack: existing.metadata.label, count: existing.index.size })}</p>`
      });
      if (!confirmed) throw new Error(i18n.localize("SMT.Importer.Cancelled"));
      await existing.deleteCompendium();
    }

    // --- write --------------------------------------------------------------
    await this.#setStatus(i18n.localize("SMT.Importer.CreatingPack"));
    const CompendiumCollection = foundry.documents.collections.CompendiumCollection;
    const pack = await CompendiumCollection.createCompendium({
      label: i18n.localize("SMT.Importer.PackLabel"),
      name: PACK_NAME,
      type: "Actor"
    });

    const caveats = [];
    const payloads = demons.map(stats => {
      const { system, affinity, anomalies } = buildDemonSystem(stats);
      if (affinity.unparsed.length) {
        caveats.push(`${stats.name}: affinities not applied: "${affinity.unparsed[0]}"`);
      }
      for (const a of anomalies) caveats.push(`${stats.name}: book prints ${a} — kept as printed`);
      return { name: stats.name, type: "demon", system, items: buildDemonSkills(stats) };
    });

    for (let i = 0; i < payloads.length; i += WRITE_CHUNK) {
      await Actor.createDocuments(payloads.slice(i, i + WRITE_CHUNK), { pack: pack.collection });
      this.#progress(Math.min(i + WRITE_CHUNK, payloads.length), payloads.length);
      await this.#setStatus(i18n.format("SMT.Importer.Writing",
        { done: Math.min(i + WRITE_CHUNK, payloads.length), total: payloads.length }));
    }

    // --- report -------------------------------------------------------------
    this.#report = [
      i18n.format("SMT.Importer.Done", { count: payloads.length, pack: pack.metadata.label })
    ];
    if (warns.length) this.#report.push(...warns.map(w => i18n.format("SMT.Importer.AsPrinted", { note: w })));
    if (caveats.length) this.#report.push(...caveats);
    if (splitTotal) {
      this.#report.push(i18n.format("SMT.Importer.SplitNote", { count: splitTotal }));
    }
    if (CONFIG.SMT.debug) console.log("smt-rpg | importer report", this.#report);
  }
}
