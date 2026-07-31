# /// script
# requires-python = ">=3.10"
# dependencies = ["pymupdf"]
# ///
"""Import demon stat blocks and Magatama from a Tokyo Conception rulebook PDF you own.

    uv run --script tools/import-rulebook.py --pdf /path/to/rulebook.pdf

Writes data-local/demon-stats.json and data-local/magatama-stats.json, which the
system loads at init. That path is gitignored: the stat blocks are the book's content
and are not redistributed. This script is the shippable half -- supply your own PDF
and it builds your own data.

No prose is captured. Names, numbers and skill tables only; the flavour text beside
each stat block is deliberately skipped. The one exception is the Magatama affinity
grant, which the book states only in prose -- and there the parser accepts a CLOSED
vocabulary of keywords and elements and truncates at the first word outside it, so a
sentence is never carried through as description text.

How it reads the demon pages, since neither layout is a real table in the PDF:
  * Blocks are found by their header row (name + LV/LVL + CLAN).
  * Fields are found by LABEL ANCHOR, not fixed coordinates -- general demons
    (p.126-211) and bosses (p.213-235) use different layouts.
  * A label's value is gathered within a small vertical BAND, because long values
    wrap and the label can sit in its own line between them.
  * Skill-table columns are located from an all-dash placeholder row, which has
    exactly one token per column and so is an exact ruler. The ruler is medianed
    across every block of a layout so one odd page cannot set the columns.

The Magatama table (p.42) is a different shape again: it is printed ROTATED, so each
Magatama is a COLUMN at a fixed x and each field is a horizontal band anchored by its
label down the right-hand side. See MagatamaImporter.
"""
import argparse
import json
import os
import re
import sys

try:
    import fitz
except ImportError:
    sys.exit("PyMuPDF is required. Run via:  uv run --script tools/import-rulebook.py --pdf <file>")

GENERAL_PAGES = (126, 211)
BOSS_PAGES = (213, 235)
PRINTED_OFFSET = 2                 # pdf index = printed page + 2
DASH = "—"

STATS = [("St", "strength"), ("Ma", "magic"), ("Vi", "vitality"),
         ("Ag", "agility"), ("Lu", "luck")]
SUBSTATS = [(("Physical", "Power"), "physicalPower"),
            (("Magical", "Power"), "magicalPower"),
            (("Save", "TN"), "saveTN"),
            (("Dodge", "TN"), "dodgeTN"),
            (("Negotiation", "TN"), "negotiationTN")]
SKILL_COLS = ["name", "learnLv", "traits", "type", "target", "cost", "tn",
              "potency", "basePower", "total", "element", "effect"]

# Stats/substats sit LEFT for general demons, RIGHT for bosses. Windowed so a stray
# "St" in the flavour column cannot be read as the Strength row.
STAT_WINDOW = {False: (130.0, 270.0), True: (355.0, 560.0)}

# The book prints Baal Avatar's clan as "DIETY" (p.223). Unambiguously Deity;
# normalised so lookups resolve, with the printed spelling preserved on the entry.
CLAN_TYPOS = {"diety": "deity"}

ORDINAL = re.compile(r"^(\d+)(ST|ND|RD|TH)$", re.I)
# The TYPE column has a closed vocabulary; anything else is a misread row.
TYPE_PREFIX = re.compile(r"^(Physical|Magical|Ranged|Spell|Passive|Talk)(\s|$)", re.I)


def title_case(name):
    def cap(w):
        m = ORDINAL.match(w)
        if m:
            return m.group(1) + m.group(2).lower()
        if w.isdigit():
            return w
        if "-" in w:
            return "-".join(cap(p) for p in w.split("-"))
        if w == "O'":
            return "o'"
        if w.startswith("(") or w.endswith(")") or w.endswith(","):
            lead = "(" if w.startswith("(") else ""
            trail = "".join(c for c in w[-1] if c in "),")
            return lead + cap(w.strip("(),")) + trail
        return w[:1].upper() + w[1:].lower()
    return " ".join(cap(w) for w in name.split())


def num(tok):
    try:
        return int(tok.replace(",", "").replace("%", ""))
    except (ValueError, AttributeError):
        return None


def clean(v):
    """A dash placeholder means 'no value', not the literal character."""
    v = (v or "").strip()
    return "" if v in (DASH, "-", "") else v


def repair_split_cells(row):
    """Re-join two-token values that a column boundary cut in half.

    Column x drifts a few points between pages. Where a boundary lands inside a
    value, its second word is assigned to the next column: "Physical Attack" becomes
    type "Physical" + target "Attack 1", and "13 HP" becomes cost "13" + tn "HP".
    Both halves are still present and in order, so they can be put back.

    Ruler precedence (block -> page -> nearest page -> corpus) fixed this for all but
    p.161, where BOTH printed blocks have a full skill table and so neither offers an
    empty row to measure. Rather than special-case that page, repair the split
    wherever it appears -- the joins below are unambiguous because "Physical Attack"
    is one vocabulary item and a cost is always "<number> HP|MP"."""
    if row["target"].startswith("Attack") and TYPE_PREFIX.match(row["type"] + " "):
        row["type"] = f"{row['type']} Attack".strip()
        row["target"] = row["target"][len("Attack"):].strip()
    # The unit can land in the TN cell alongside the real TN ("MP 87%"), so take the
    # leading unit token and leave whatever follows it in place.
    unit = re.match(r"^(HP|MP)\b\s*(.*)$", row["tn"], re.I)
    if row["cost"].isdigit() and unit:
        row["cost"] = f"{row['cost']} {unit.group(1).upper()}"
        row["tn"] = unit.group(2).strip()

    # A demon with a Boost passive has its affected skills printed as "115 (77)":
    # the boosted total first, the unboosted in parentheses (Berith's Fire Boost,
    # p.161; Quetzalcoatl's Ice Boost, p.163). The parenthetical is wide enough to
    # spill into the element cell, so pull it back before it is read as an element.
    paren = re.match(r"^\((\d+)\)\s*(.*)$", row["element"])
    if paren and row["total"].isdigit():
        row["total"] = f"{row['total']} ({paren.group(1)})"
        row["element"] = paren.group(2).strip()


class Importer:
    def __init__(self, path):
        self.doc = fitz.open(path)

    def words(self, idx):
        return [(round(x, 1), round(y, 1), w)
                for x, y, _x1, _y1, w, *_ in self.doc[idx].get_text("words")]

    @staticmethod
    def rows(ws, tol=3.0):
        buckets = {}
        for x, y, w in ws:
            k = next((k for k in buckets if abs(k - y) <= tol), y)
            buckets.setdefault(k, []).append((x, w))
        return [(k, sorted(v)) for k, v in sorted(buckets.items())]

    def blocks(self, idx):
        ws = self.words(idx)
        heads = []
        for _x, y, w in ws:
            if w != "CLAN":
                continue
            row = sorted((xx, ww) for xx, yy, ww in ws if abs(yy - y) <= 8)
            toks = [t for _, t in row]
            if not any(t in ("LV", "LVL") for t in toks):
                continue
            li = next(i for i, t in enumerate(toks) if t in ("LV", "LVL"))
            ci = toks.index("CLAN")
            lvl = next((int(t) for t in toks[li + 1:ci] if t.isdigit()), None)
            if lvl is None:
                continue
            heads.append({"y": y, "name": " ".join(toks[:li]).strip(),
                          "level": lvl, "clan": " ".join(toks[ci + 1:]).strip()})
        heads.sort(key=lambda h: h["y"])
        out = []
        for i, h in enumerate(heads):
            lo = h["y"] - 4
            hi = heads[i + 1]["y"] - 4 if i + 1 < len(heads) else 10_000
            out.append((h, [(x, y, w) for x, y, w in ws if lo <= y < hi]))
        return out

    def label_value(self, block_ws, label, stop_x=None, max_tokens=12, band=8.0):
        n = len(label)
        for _, items in self.rows(block_ws):
            toks = [w for _, w in items]
            for i in range(len(toks) - n + 1):
                if tuple(toks[i:i + n]) != tuple(label):
                    continue
                label_x = items[i + n - 1][0]
                ly = next(y for x, y, w in block_ws
                          if x == items[i][0] and w == toks[i])
                near = sorted(((y, x, w) for x, y, w in block_ws
                               if abs(y - ly) <= band and x > label_x),
                              key=lambda t: (round(t[0]), t[1]))
                out = []
                for _, x, w in near:
                    if stop_x is not None and x >= stop_x:
                        continue
                    if re.fullmatch(r"[A-Z][A-Z?]+", w) and w not in ("MP", "HP", "TN", "EXP"):
                        break
                    out.append(w)
                    if len(out) >= max_tokens:
                        break
                return " ".join(out).strip()
        return ""

    def scalar(self, block_ws, label):
        return num(self.label_value(block_ws, label, max_tokens=1))

    def skill_body(self, block_ws):
        rows = self.rows(block_ws)
        hy = next((y for y, items in rows
                   if {"SKILL", "NAME"} <= {w for _, w in items}), None)
        if hy is None:
            return None
        return [(y, items) for y, items in rows if y > hy + 6]

    @staticmethod
    def build_ruler(bodies):
        cols = [[] for _ in SKILL_COLS]
        for body in bodies:
            for _, items in body:
                xs = sorted(x for x, w in items if w == DASH)
                if len(xs) != len(SKILL_COLS):
                    continue
                for i, x in enumerate(xs):
                    cols[i].append(x)
        if any(not c for c in cols):
            return None
        return [sorted(c)[len(c) // 2] for c in cols]

    @staticmethod
    def parse_skills(body, anchors):
        if not body or not anchors:
            return []
        skills = []
        for _, items in body:
            cells = {c: [] for c in SKILL_COLS}
            for x, w in items:
                if re.fullmatch(r"\d+\.", w):        # the "1." row index
                    continue
                ci = min(range(len(anchors)), key=lambda i: abs(anchors[i] - x))
                cells[SKILL_COLS[ci]].append(w)
            row = {c: clean(" ".join(cells[c])) for c in SKILL_COLS}
            if not row["name"]:
                continue
            # Page furniture sits below the skill table and lands in the name column
            # alone: the printed page number, and the PDF's per-purchaser watermark.
            # Both were being imported as skills and written onto 109 demons, putting
            # the buyer's name and order number inside every created Actor.
            # A real skill always populates at least one other cell -- Legion's
            # "Anti-Phys" (p.194) is a passive carrying only a learn level.
            if not any(v for k, v in row.items() if k != "name"):
                continue
            # Footnotes wrap below the table and land across the skill columns as
            # prose -- "When evolving into Queen Mab, learn Mediarahan instead of
            # Diarahan" (p.186-187) parsed as two skills. A real row either names a
            # type from the book's closed vocabulary or carries a learn level
            # (Legion's "Anti-Phys", p.194, is a passive with only the latter).
            # The learn level must be NUMERIC: the wrapped footnote puts a word
            # ("into") in that column, which a mere non-empty check accepted.
            if num(row["learnLv"]) is None and not TYPE_PREFIX.match(row["type"]):
                continue
            repair_split_cells(row)
            # "115 (77)" -> total 115 (as printed, Boost applied) plus the unboosted
            # 77, which is the value that equals potency + base power.
            boosted = re.fullmatch(r"(\d+)\s*\((\d+)\)", row["total"])
            if boosted:
                row["total"] = boosted.group(1)
                row["totalUnboosted"] = boosted.group(2)
            for k in ("learnLv", "potency", "basePower", "total", "totalUnboosted"):
                if k in row:
                    row[k] = num(row[k])
            row["tn"] = num(row["tn"])
            skills.append({k: v for k, v in row.items() if v not in ("", None)})
        return skills

    def parse(self, head, block_ws, is_boss, printed, fallback_anchors):
        # Prefer this block's OWN all-dash row as the ruler. Column x drifts by a few
        # points between pages, and a corpus-wide median put "Attack" (of "Physical
        # Attack") into the target column on 85 of 194 demons and stripped the HP/MP
        # unit off 372 costs. The global ruler is only a fallback for blocks whose
        # skill table has no fully-empty row to measure.
        anchors = self.build_ruler([self.skill_body(block_ws)] if self.skill_body(block_ws) else []) \
            or fallback_anchors
        lo_x, hi_x = STAT_WINDOW[is_boss]
        raw_clan = head["clan"].lower()
        clan = CLAN_TYPOS.get(raw_clan, raw_clan)

        d = {"name": title_case(head["name"]), "clan": clan, "level": head["level"]}
        if clan != raw_clan:
            d["bookClan"] = head["clan"]
        if not 1 <= head["level"] <= 99:
            d["bookLevel"] = True
        if is_boss:
            d["boss"] = True

        d["hp"] = self.scalar(block_ws, ("HP",))
        d["mp"] = self.scalar(block_ws, ("MP",))
        d["physicalResist"] = self.scalar(block_ws, ("PHYSICAL", "RESIST"))
        d["magicResist"] = self.scalar(block_ws, ("MAGIC", "RESIST"))
        d["fatePoints"] = self.scalar(block_ws, ("FATE", "POINTS"))
        d["macca"] = self.scalar(block_ws, ("MACCA",))
        d["exp"] = self.scalar(block_ws, ("EXP",))

        stats, tns, favored = {}, {}, None
        for abbr, key in STATS:
            for _, items in self.rows(block_ws):
                toks = [w for _, w in items]
                xs = [x for x, _ in items]
                if abbr not in toks:
                    continue
                i = toks.index(abbr)
                if not lo_x <= xs[i] <= hi_x:
                    continue
                rest = list(zip(xs[i + 1:], toks[i + 1:]))
                if rest and rest[0][1] == "(*)":
                    favored = key
                    rest = rest[1:]
                vals = [w for _, w in rest if num(w) is not None]
                if len(vals) >= 2:
                    stats[key] = num(vals[0])
                    tns[key] = num(vals[1])
                break
        d["stats"] = stats
        d["statTNs"] = tns
        if favored:
            d["favoredStat"] = favored

        d["substats"] = {key: num(self.label_value(block_ws, toks, stop_x=hi_x, max_tokens=1))
                         for toks, key in SUBSTATS}

        d["affinities"] = clean(self.label_value(block_ws, ("AFFINITIES",), max_tokens=20))
        d["inheritTraits"] = clean(self.label_value(block_ws, ("INHERIT", "TRAITS"), max_tokens=10))
        d["evolve"] = clean(self.label_value(block_ws, ("EVOLVE?",), stop_x=hi_x))
        d["behavior"] = clean(self.label_value(block_ws, ("BEHAVIOR",), stop_x=425, max_tokens=6))
        d["dropItems"] = clean(self.label_value(block_ws, ("DROP", "ITEMS"), stop_x=425, max_tokens=8))
        d["skills"] = self.parse_skills(self.skill_body(block_ws), anchors)
        d["page"] = printed
        return d

    def collect(self, lo, hi):
        return [(h, ws, p) for p in range(lo, hi + 1)
                for h, ws in self.blocks(p + PRINTED_OFFSET)]

    def page_rulers(self, blocks):
        """One ruler per printed page, from every all-dash row on that page.

        Column x drifts a few points between pages but is identical for the two
        blocks printed on the same page, so a page-level ruler covers a block whose
        own skill table is full and therefore has no empty row to measure."""
        by_page = {}
        for _h, ws, printed in blocks:
            body = self.skill_body(ws)
            if body:
                by_page.setdefault(printed, []).append(body)
        return {p: self.build_ruler(bodies) for p, bodies in by_page.items()}

    def run(self):
        gen = self.collect(*GENERAL_PAGES)
        boss = self.collect(*BOSS_PAGES)
        # Ruler precedence: this block -> this page -> the whole layout. Each step out
        # is less precise, so the narrowest one that can be measured always wins.
        corpus = {
            False: self.build_ruler([b for b in (self.skill_body(ws) for _, ws, _ in gen) if b]),
            True: self.build_ruler([b for b in (self.skill_body(ws) for _, ws, _ in boss) if b]),
        }
        pages = {False: self.page_rulers(gen), True: self.page_rulers(boss)}
        def ruler_for(is_boss, printed):
            by_page = pages[is_boss]
            if by_page.get(printed):
                return by_page[printed]
            # Nearest page that could be measured. Some pages (p.161) print two full
            # skill tables and so contain no empty row at all; a neighbouring page in
            # the same chapter shares the layout far more closely than a corpus median.
            near = sorted((abs(q - printed), q) for q, r in by_page.items() if r)
            if near:
                return by_page[near[0][1]]
            return corpus[is_boss]

        return ([self.parse(h, ws, False, p, ruler_for(False, p)) for h, ws, p in gen]
                + [self.parse(h, ws, True, p, ruler_for(True, p)) for h, ws, p in boss])


MAGATAMA_PAGE = 42                     # the whole table, printed rotated 90 degrees
MAGATAMA_PROSE = (39, 41)              # the per-Magatama paragraphs, inclusive

# Field labels run down the RIGHT of the rotated table, one per band. A bare digit in
# that column CONTINUES the label above it ("Skill" on one line, "1" on the next), so
# it opens no band of its own.
MAGATAMA_FIELDS = ("Name", "St", "Ma", "Vi", "Ag", "Lu", "Acquire", "Skill", "LV", "Special")
# Every word in a column shares one baseline x, and the columns are ~13pt apart, so a
# tight tolerance both groups a column and rejects page furniture outright. The page
# number and the per-purchaser watermark sit at x 5-65, left of every column.
COLUMN_TOL = 4.0
MAGATAMA_STATS = [("St", "strength"), ("Ma", "magic"), ("Vi", "vitality"),
                  ("Ag", "agility"), ("Lu", "luck")]

# The affinity grant is stated only in the p.39-41 prose ("It grants Null Ice and Elec
# Weak"), never in the table. Both triggers are followed by a CLOSED vocabulary check:
# the capture is truncated at the first word outside GRANT_VOCAB, and discarded unless
# it opens with an affinity keyword. That is what keeps Kailash's "grants not only the
# Almighty attack spell Megido" from being read as an affinity grant.
GRANT_TRIGGER = re.compile(r"\bgrants?\s+(?:you\s+)?|\bhaving\s+a\s+", re.I)
GRANT_KEYWORDS = {"null", "strong", "weak", "drain", "repel"}
GRANT_VOCAB = GRANT_KEYWORDS | {
    "phys", "fire", "ice", "elec", "force", "mind", "nerve", "ruin", "dark", "light",
    "almighty", "magic", "ailment", "attack", "attacks", "and",
    # Masakados (p.41) is the one grant phrased as an exclusion rather than a list.
    "affinity", "to", "all", "elements", "besides",
}
HEADING = re.compile(r"^[A-Z][A-Z0-9:'\- ]*$")


class MagatamaImporter:
    """The 25 Magatama: stat bonuses and skill list from the p.42 table, affinity
    grants from the p.39-41 prose.

    The table is printed rotated 90 degrees. That inverts the usual reading: a
    Magatama is a COLUMN at one fixed x, and a field ("St", "Acquire", "Skill 3") is a
    horizontal BAND bounded by its own label and the next label below it. Cells are
    therefore read DOWN their column -- "Hell" then "Fang", "Tower" then "of" then
    "Kagutsuchi" -- which is why every cell joins its words in y order, not x order.

    The Name band is the one exception to "a band starts at its label": the names are
    printed ABOVE the "Name" label rather than beside it, so that band opens at the top
    of the page instead."""

    def __init__(self, doc):
        self.doc = doc

    def words(self, idx):
        return [(round(x, 1), round(y, 1), w)
                for x, y, _x1, _y1, w, *_ in self.doc[idx].get_text("words")]

    @staticmethod
    def bands(ws, label_x):
        """(field, lo, hi) for each label in the right-hand column, in printed order."""
        labels = sorted(((y, w) for x, y, w in ws if abs(x - label_x) <= COLUMN_TOL))
        fields = [(y, w) for y, w in labels if w in MAGATAMA_FIELDS]
        out = []
        for i, (y, w) in enumerate(fields):
            lo = 0.0 if i == 0 else y
            hi = fields[i + 1][0] if i + 1 < len(fields) else 10_000.0
            out.append((w, lo, hi))
        return out

    @staticmethod
    def cell(ws, lo, hi, col_x):
        toks = sorted((y, w) for x, y, w in ws if lo <= y < hi and abs(x - col_x) <= COLUMN_TOL)
        return clean(" ".join(w for _, w in toks))

    def table(self):
        ws = self.words(MAGATAMA_PAGE + PRINTED_OFFSET)
        label_x = next((x for x, _y, w in ws if w == "Name"), None)
        if label_x is None:
            return [], ["p.42: no 'Name' label found -- the Magatama table did not parse"], []

        bands = self.bands(ws, label_x)
        if not bands or bands[0][0] != "Name":
            return [], ["p.42: the first field band is not 'Name'"], []

        # Column x positions come from the Name band itself, so a change in the number
        # of printed Magatama is picked up rather than assumed.
        _f, lo, hi = bands[0]
        cols = {}
        for x, y, w in ws:
            if lo <= y < hi and abs(x - label_x) > COLUMN_TOL:
                cols.setdefault(x, []).append((y, w))
        columns = {x: " ".join(w for _, w in sorted(toks)) for x, toks in cols.items()}

        entries, errs = [], []
        for col_x in sorted(columns, reverse=True):      # printed right-to-left
            d = {"name": columns[col_x], "page": MAGATAMA_PAGE, "skills": []}
            pending = None                                # a Skill/Special awaiting its LV
            for field, blo, bhi in bands[1:]:
                value = self.cell(ws, blo, bhi, col_x)
                if field == "LV":
                    if pending and value:
                        lv = num(value)
                        if lv is None:
                            errs.append(f"{d['name']}: learn level {value!r} is not a number")
                        else:
                            d["skills"].append({"name": pending, "learnLv": lv})
                    elif value:
                        errs.append(f"{d['name']}: learn level {value!r} with no skill above it")
                    pending = None
                elif field in ("Skill", "Special"):
                    pending = value or None
                elif field == "Acquire":
                    d["acquisition"] = value
                else:
                    key = dict(MAGATAMA_STATS).get(field)
                    if key:
                        d.setdefault("statBonuses", {})[key] = num(value)
            entries.append(d)

        # Anything belonging to no column is reported, never dropped silently -- but
        # WHERE it sits decides whether that is a problem. Inside the span the columns
        # occupy, a stray means a column failed to register and its cells are being
        # lost, so the import refuses. Outside it, the page simply carries furniture:
        # the printed page number and the per-purchaser watermark at the left margin,
        # and the rotated "CHARACTER CREATION" running head to the right of the labels.
        pitch = min((b - a for a, b in zip(sorted(columns), sorted(columns)[1:])), default=0.0)
        lo_c, hi_c = min(columns) - pitch, max(columns) + pitch
        inside, outside = set(), set()
        for x, _y, w in ws:
            if abs(x - label_x) <= COLUMN_TOL or any(abs(x - c) <= COLUMN_TOL for c in columns):
                continue
            (inside if lo_c <= x <= hi_c else outside).add(w)
        if inside:
            errs.append(f"p.42: {len(inside)} word(s) inside the table but in no column "
                        f"(a Magatama column did not register): " + ", ".join(sorted(inside)[:6]))
        return entries, errs, sorted(outside)

    def prose_sections(self):
        """(heading, body) for the p.39-41 prose, split on its ALL-CAPS headings."""
        text = "\n".join(self.doc[p + PRINTED_OFFSET].get_text()
                         for p in range(MAGATAMA_PROSE[0], MAGATAMA_PROSE[1] + 1))
        sections, head, buf = [], None, []
        for line in text.splitlines():
            s = line.strip()
            if s and HEADING.fullmatch(s):
                if head is not None:
                    sections.append((head, " ".join(buf)))
                head, buf = s, []
            elif head is not None and s:
                buf.append(s)
        if head is not None:
            sections.append((head, " ".join(buf)))
        return sections

    def grants(self, names):
        """name -> the affinity clause the book states for it, or "" for none."""
        sections = self.prose_sections()
        by_head = {h: b for h, b in sections}
        out = {}
        for name in names:
            body = by_head.get(name.upper())
            if body is None:
                # Masakados has no heading of its own: it is described under
                # "LEGENDARY MAGATAMA". Fall back to the section that names it.
                body = next((b for _h, b in sections if name in b), "")
            out[name] = extract_grant(body)
        return out

    def run(self):
        entries, errs, ignored = self.table()
        grants = self.grants([d["name"] for d in entries])
        for d in entries:
            d["grant"] = grants.get(d["name"], "")
            d["isStarter"] = d.get("acquisition", "").lower() == "starter"
        return entries, errs, ignored


def extract_grant(paragraph):
    """The affinity clause inside a prose paragraph, or "" if it states none.

    Truncates at the first word outside the closed grant vocabulary, which is what
    separates a real grant from a trigger word used in another sense, and requires the
    result to OPEN with an affinity keyword -- every grant the book prints does. The
    longest candidate wins rather than the first, so a decoy earlier in the paragraph
    cannot shadow the real clause after it."""
    best = ""
    for m in GRANT_TRIGGER.finditer(paragraph or ""):
        toks = []
        for raw in paragraph[m.end():].split():
            word = raw.strip(".,;:").lower()
            if word not in GRANT_VOCAB:
                break
            toks.append(raw.strip(".,;:") if "," not in raw else raw.strip(".;:"))
        if not toks or toks[0].lower() not in GRANT_KEYWORDS:
            continue
        text = " ".join(toks).strip().rstrip(",")
        if len(text) > len(best):
            best = text
    return best


def verify_magatama(entries):
    """The table and the prose are two independent printings, and the eight sample
    character sheets (p.25-32) are a third. Anchors are read off the RENDERED sample
    sheets, so a systematic extraction error cannot pass unnoticed."""
    errs, warns = [], []

    if len(entries) != 25:
        errs.append(f"expected 25 Magatama (24 + Masakados), got {len(entries)}")
    starters = [d for d in entries if d.get("isStarter")]
    if len(starters) != 8:
        errs.append(f"expected 8 starter Magatama (p.39), got {len(starters)}")

    for d in entries:
        where = f"{d['name']} (p.{d['page']})"
        bonuses = d.get("statBonuses") or {}
        if len(bonuses) != 5 or any(v is None for v in bonuses.values()):
            errs.append(f"{where}: {sum(v is not None for v in bonuses.values())}/5 stat bonuses")
        # p.39: "stats have a maximum of 40". A bonus outside 0-10 is a misread column.
        for k, v in bonuses.items():
            if v is not None and not 0 <= v <= 10:
                errs.append(f"{where}: {k} bonus {v} outside 0-10")
        if not d.get("acquisition"):
            errs.append(f"{where}: no acquisition")
        if not d["skills"]:
            errs.append(f"{where}: no skills")
        for s in d["skills"]:
            if re.fullmatch(r"\d+", s["name"]) or "Order #" in s["name"] or "(Order" in s["name"]:
                errs.append(f"{where}: page furniture imported as a skill: {s['name']!r}")
            if not 1 <= s["learnLv"] <= 99:
                errs.append(f"{where}: skill {s['name']!r} learn level {s['learnLv']} out of range")
        if not d.get("grant"):
            # Marogareh and Kailash are printed with no affinity grant at all; anything
            # else with none means the prose scan missed a paragraph.
            warns.append(f"{where}: no affinity grant stated (as printed)")

    # p.25-32 print three of the starters on made character sheets, independently of
    # both the p.42 table and the p.39 prose. Bonuses and grants are checked together
    # because they come from two different pages via two different parsers.
    anchors = {
        "Marogareh": dict(strength=4, magic=1, vitality=2, agility=2, luck=1, grant=""),
        "Shiranui": dict(strength=1, magic=5, vitality=0, agility=4, luck=0,
                         grant="Null Fire and Force Weak"),
        "Ankh": dict(strength=1, magic=2, vitality=5, agility=0, luck=2,
                     grant="Null Light and Dark Weak"),
    }
    by_name = {d["name"]: d for d in entries}
    for name, want in anchors.items():
        got = by_name.get(name)
        if not got:
            errs.append(f"anchor missing: {name}")
            continue
        for k, v in want.items():
            actual = got.get("grant") if k == "grant" else (got.get("statBonuses") or {}).get(k)
            if actual != v:
                errs.append(f"anchor {name}.{k}: expected {v!r}, got {actual!r}")
    return errs, warns


def verify(demons):
    """Structural checks. A wrong number here produces a working wrong answer, so
    the import refuses rather than writing something plausible but unverified."""
    errs = []
    warns = []          # faithful-but-odd values the book itself prints
    gen = [d for d in demons if not d.get("boss")]
    boss = [d for d in demons if d.get("boss")]

    if len(gen) != 171:
        errs.append(f"expected 171 general demons, got {len(gen)}")
    if len(boss) != 23:
        errs.append(f"expected 23 boss demons, got {len(boss)}")

    for d in demons:
        where = f"{d['name']} (p.{d['page']})"
        if len(d["stats"]) != 5:
            errs.append(f"{where}: {len(d['stats'])}/5 stats")
        for k in ("hp", "mp", "physicalResist", "magicResist", "fatePoints", "macca", "exp"):
            if d.get(k) is None:
                errs.append(f"{where}: missing {k}")
        if any(v is None for v in d["substats"].values()):
            errs.append(f"{where}: incomplete substats")
        if not d["affinities"]:
            errs.append(f"{where}: no affinities")
        if not d["skills"]:
            errs.append(f"{where}: no skills")
        # Page furniture must never survive into the data. The watermark carries the
        # buyer's real name and order number, so this is a privacy check, not a
        # tidiness one: refuse the import rather than write it.
        for s in d["skills"]:
            n = s.get("name", "")
            if re.fullmatch(r"\d+", n) or "Order #" in n or "(Order" in n:
                errs.append(f"{where}: page furniture imported as a skill: {n!r}")
            # A column boundary landing mid-value splits "Physical Attack" and
            # "13 HP" across two cells. Both halves survive, so the damage is silent:
            # the type reads "Physical" and the cost loses its resource. Neither is
            # a value the book ever prints, so both are checkable.
            t = s.get("type", "")
            if t and not TYPE_PREFIX.match(t):
                errs.append(f"{where}: skill {n!r} has type {t!r}, not a printed type")
            c = s.get("cost", "")
            if c in ("HP", "MP"):
                # The book itself prints a bare unit with no quantity for Recarmdra
                # (p.163, p.207, p.209) -- and its Ch.4 entry leaves the MP column
                # blank too. Faithful, so it is reported rather than refused.
                warns.append(f"{where}: skill {n!r} cost is a bare {c!r} (as printed)")
            elif c and not re.fullmatch(r"(\d+ (HP|MP)|All HP)", c):
                errs.append(f"{where}: skill {n!r} has cost {c!r}, expected '<n> HP|MP'")
        if not d.get("bookLevel") and not 1 <= d["level"] <= 99:
            errs.append(f"{where}: level {d['level']} out of range")

    # Anchors read off the RENDERED pages, not the text layer, so a systematic
    # extraction error cannot pass unnoticed.
    anchors = {
        "Vishnu": dict(level=93, clan="deity", hp=708, mp=384, exp=1044),
        "Manikin 1": dict(level=13, clan="corpus", hp=84, mp=54, exp=5),
        "Baal Avatar": dict(level=85, clan="deity", hp=13000, mp=5000, exp=10000),
        "Specter (3rd Time)": dict(level=440, clan="foul", hp=700, mp=500, exp=1500),
    }
    by_name = {d["name"]: d for d in demons}
    for name, want in anchors.items():
        got = by_name.get(name)
        if not got:
            errs.append(f"anchor missing: {name}")
            continue
        for k, v in want.items():
            if got.get(k) != v:
                errs.append(f"anchor {name}.{k}: expected {v}, got {got.get(k)}")
    return errs, warns


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True, help="path to your own rulebook PDF")
    ap.add_argument("--out", default="data-local/demon-stats.json")
    ap.add_argument("--out-magatama", default="data-local/magatama-stats.json")
    ap.add_argument("--force", action="store_true",
                    help="write even if verification fails (not recommended)")
    args = ap.parse_args()

    if not os.path.exists(args.pdf):
        sys.exit(f"no such file: {args.pdf}")

    importer = Importer(args.pdf)
    demons = importer.run()
    errs, warns = verify(demons)

    print(f"parsed {len(demons)} demons "
          f"({sum(1 for d in demons if not d.get('boss'))} general, "
          f"{sum(1 for d in demons if d.get('boss'))} boss), "
          f"{sum(len(d['skills']) for d in demons)} skill rows")

    for w in warns:
        print(f"  note (as printed in the book): {w}")

    if errs:
        print(f"\nverification FAILED ({len(errs)} problems):")
        for e in errs[:20]:
            print("  " + e)
        if len(errs) > 20:
            print(f"  ... +{len(errs) - 20} more")
        if not args.force:
            sys.exit("\nrefusing to write. Re-run with --force only if you know why.")
    else:
        print("verification passed: counts, per-demon completeness, and 4 page anchors")

    write_json(args.out, {"source": "Tokyo Conception Ch.5",
                          "count": len(demons), "demons": demons})

    magatama, table_errs, ignored = MagatamaImporter(importer.doc).run()
    m_errs, m_warns = verify_magatama(magatama)
    m_errs = table_errs + m_errs

    print(f"\nparsed {len(magatama)} Magatama "
          f"({sum(1 for d in magatama if d.get('isStarter'))} starter), "
          f"{sum(len(d['skills']) for d in magatama)} skill rows, "
          f"{sum(1 for d in magatama if d.get('grant'))} affinity grants")
    if ignored:
        print(f"  ignored {len(ignored)} word(s) outside the table "
              f"(page furniture): {', '.join(ignored[:8])}")
    for w in m_warns:
        print(f"  note (as printed in the book): {w}")

    if m_errs:
        print(f"\nMagatama verification FAILED ({len(m_errs)} problems):")
        for e in m_errs[:20]:
            print("  " + e)
        if len(m_errs) > 20:
            print(f"  ... +{len(m_errs) - 20} more")
        if not args.force:
            sys.exit("\nrefusing to write the Magatama. "
                     "Re-run with --force only if you know why.")
    else:
        print("verification passed: counts, per-Magatama completeness, "
              "and 3 sample-character anchors")

    write_json(args.out_magatama, {"source": "Tokyo Conception Ch.2",
                                   "count": len(magatama), "magatama": magatama})


def write_json(path, payload):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    print(f"-> {path}")


if __name__ == "__main__":
    main()
