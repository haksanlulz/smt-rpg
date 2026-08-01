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
import collections
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
PROSE_COLUMN_SPLIT = 265.0             # the p.39-41 two-column gutter (x 240-270)

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

    def prose_lines(self, idx):
        """Reading-order lines for a two-column prose page, from its WORD list.

        Deliberately words-based rather than get_text(): the in-Foundry importer only
        has words (pdf.js), and the two implementations must reconstruct the same
        lines or the affinity grants cannot be held equal by the parity suite. The
        columns split at a fixed x — measured off the rendered pages, where the gap
        between columns sits at x 240-270 on all three — and each column reads
        top-to-bottom, left column first."""
        ws = self.words(idx)
        lines = []
        for column in (lambda x: x < PROSE_COLUMN_SPLIT, lambda x: x >= PROSE_COLUMN_SPLIT):
            col = [(x, y, w) for x, y, w in ws if column(x)]
            buckets = {}
            for x, y, w in col:
                k = next((k for k in buckets if abs(k - y) <= 3.0), y)
                buckets.setdefault(k, []).append((x, w))
            for k in sorted(buckets):
                lines.append(" ".join(w for _x, w in sorted(buckets[k])))
        return lines

    def prose_sections(self):
        """(heading, body) for the p.39-41 prose, split on its ALL-CAPS headings."""
        sections, head, buf = [], None, []
        for p in range(MAGATAMA_PROSE[0], MAGATAMA_PROSE[1] + 1):
            for line in self.prose_lines(p + PRINTED_OFFSET):
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


SKILL_PAGES = (97, 110)                # the skill list proper; talk (p.112) and gear
                                       # (p.115+) are different tables and not skills
# Every column set the skill list uses, keyed by the cost resource it declares. The
# shape IS the resource: spells print an MP column, physical skills an HP one, and
# passives cost nothing and print neither.
SKILL_HEADERS = {
    ("Name", "MP", "Potency", "Element", "Effect", "Note"): "mp",
    ("Name", "HP", "Potency", "Element", "Effect", "Note"): "hp",
    ("Name", "Effect"): None,
}
SKILL_COL_TOL = 3.0
# A table's rows are evenly pitched. A gap wider than this many pitches ends it, which
# is what keeps a trailing group note or the next section's heading out of the last row.
SKILL_PITCH_GAP = 1.5


class SkillListImporter:
    """The ch4 skill list (p.97-110): what a skill costs, how hard it hits and what it
    does, for every skill the book prints rather than only the ones a demon happens to
    know.

    Three table shapes, and the shape declares the cost resource -- spells print an MP
    column, physical skills an HP one, passives neither. The affinity-changer pages
    print TWO tables side by side, so a header row can carry the column set more than
    once and one printed row holds two skills; column groups are therefore read from
    each "Name" onward and bounded by the next group's start.

    Columns are assigned by RANGE, not by nearest anchor. Effect text runs wide enough
    that its last words sit closer to the Note anchor than to their own, and a
    nearest-anchor read files them under Note."""

    def __init__(self, doc):
        self.doc = doc

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

    @staticmethod
    def header_groups(items):
        """Column groups on a header row: [(shape, [(label, x), ...]), ...] or []."""
        toks = [(x, w) for x, w in items]
        starts = [i for i, (_x, w) in enumerate(toks) if w == "Name"]
        if not starts:
            return []
        groups = []
        for gi, start in enumerate(starts):
            end = starts[gi + 1] if gi + 1 < len(starts) else len(toks)
            cols = toks[start:end]
            shape = tuple(w for _x, w in cols)
            if shape not in SKILL_HEADERS:
                return []
            groups.append((shape, cols))
        return groups

    @staticmethod
    def cells(items, cols, limit):
        """Split one printed row into this group's columns, by x range."""
        out = ["" for _ in cols]
        bounds = [x for x, _label in cols]
        for x, w in items:
            # `continue`, not `break`: the caller hands these in reading order (y then
            # x), so a word past this group's limit is not the end of the row.
            if x >= limit:
                continue
            i = None
            for j, bx in enumerate(bounds):
                if x >= bx - SKILL_COL_TOL:
                    i = j
            # A word left of the first column still belongs to it: the name cell starts
            # a point or two before its own header label on some pages.
            if i is None:
                i = 0 if x >= bounds[0] - 12 else None
            if i is None:
                continue
            out[i] = (out[i] + " " + w).strip()
        return out

    def page_skills(self, printed):
        ws = self.words(printed + PRINTED_OFFSET)
        rows = self.rows(ws)
        headers = [(i, y, self.header_groups(items))
                   for i, (y, items) in enumerate(rows) if self.header_groups(items)]

        skills, junk = [], []
        for hi, (idx, hy, groups) in enumerate(headers):
            stop = headers[hi + 1][1] if hi + 1 < len(headers) else 10_000.0
            body = [(y, items) for y, items in rows if hy + 4 < y < stop]
            if not body:
                continue

            for gi, (shape, cols) in enumerate(groups):
                limit = groups[gi + 1][1][0][0] if gi + 1 < len(groups) else 10_000.0
                # Pitch is measured between rows that OPEN a record -- ones carrying a
                # token in the name column -- not between every printed line. A wrapped
                # Effect puts two extra lines ~4pt from its own row, and measuring those
                # collapsed the pitch to 4pt, so the very next record read as a gap and
                # every table ended after one row.
                # A record OPENS at a row carrying a token in the name column, and its
                # cells are gathered from a vertical BAND around that row rather than
                # from the row itself. A wrapped Effect prints one line ABOVE the name
                # and one below it, so a row-at-a-time read gave Endure an empty effect
                # and dropped it, and silently truncated the effect text of every
                # wrapped skill in the list.
                name_x = cols[0][0]
                anchors = [y for y, items in body
                           if any(abs(x - name_x) <= 12 and x < limit for x, _w in items)]
                if not anchors:
                    continue
                # Pitch is measured between those anchors, never between every printed
                # line: wrap lines sit ~4pt apart and collapsed it, which made the next
                # real record look like a gap and ended every table after one row.
                gaps = sorted(b - a for a, b in zip(anchors, anchors[1:]))
                pitch = gaps[len(gaps) // 2] if gaps else 16.0
                resource = SKILL_HEADERS[shape]

                for ai, y in enumerate(anchors):
                    prev = anchors[ai - 1] if ai else None
                    nxt = anchors[ai + 1] if ai + 1 < len(anchors) else None
                    # A gap wider than SKILL_PITCH_GAP pitches means the table ended and
                    # what follows is a group note, a heading or body prose.
                    if prev is not None and y - prev > pitch * SKILL_PITCH_GAP:
                        break
                    lo = (prev + y) / 2 if prev is not None else y - pitch * 0.6
                    hi = (y + nxt) / 2 if nxt is not None else y + pitch * 0.6
                    # Reading order across the band is (y, then x). Sorting by x alone
                    # interleaves the words of a two-line Effect into nonsense.
                    band = [(x, w) for _by, x, w in
                            sorted((by, x, w) for by, items in body if lo <= by < hi
                                   for x, w in items)]
                    cell = self.cells(band, cols, limit)
                    if not cell[0]:
                        continue
                    row = self.skill_row(shape, resource, cell, printed)
                    if row:
                        skills.append(row)
                    else:
                        junk.append(f"p.{printed}: {' | '.join(c for c in cell if c)[:70]}")
        return skills, junk

    @staticmethod
    def skill_row(shape, resource, cell, printed):
        """One parsed row, or None when it is not a skill at all.

        The guards are the whole reason this can run over pages that also carry prose:
        an active row must print a numeric cost, a numeric potency and a single-word
        element, none of which a sentence does, and a passive row must have a short name
        that is neither an ALL-CAPS heading nor a "... Group" note."""
        name = clean(cell[0])
        if not name or name.isupper() or name.endswith(" Group"):
            return None

        if resource is None:                      # Name | Effect
            if len(name.split()) > 4:
                return None
            effect = clean(cell[1])
            if not effect:
                return None
            return {"name": title_case(name), "kind": "passive",
                    "effect": effect, "page": printed}

        cost, element, effect = clean(cell[1]), clean(cell[3]), clean(cell[4])
        # "All" is a printed cost, not a missing one: Last Resort, Sacrifice and Kamikaze
        # all spend the caster's entire pool. The schema has no way to hold that, so it
        # is carried as 0 plus a flag, the same way the demon importer records it.
        spends_all = cost.lower() == "all"
        if spends_all:
            cost = "0"
        # Potency is the one cell the book leaves as a dash on purpose: the instant-kill
        # and pure-ailment skills (Hama, Mudo, Marin Karin) deal no damage at all, so a
        # dash is a real value and rejecting it dropped whole tables. `clean` has already
        # turned it into "", so the RAW cell decides between "printed a dash" and "read
        # nothing at all" -- only the latter means this is not a skill row.
        raw_potency = (cell[2] or "").strip()
        if num(cost) is None or not raw_potency:
            return None
        if num(raw_potency) is None and raw_potency not in (DASH, "-"):
            return None
        if not re.fullmatch(r"[A-Za-z]+", element):
            return None
        row = {"name": title_case(name), "kind": "active",
               "cost": {"value": num(cost), "resource": resource},
               "potency": num(raw_potency) or 0, "element": element,
               "effect": effect, "page": printed}
        if num(raw_potency) is None:
            row["noDamage"] = True            # printed as a dash, not as a zero
        if spends_all:
            row["spendsAll"] = True
        return row

    def run(self):
        skills, junk = [], []
        for printed in range(SKILL_PAGES[0], SKILL_PAGES[1] + 1):
            s, j = self.page_skills(printed)
            skills.extend(s)
            junk.extend(j)
        return skills, junk


# Talk skills (p.112-113) are a different table with a different schema -- a
# negotiation modifier plus impress/offend speaker and subject types -- and are NOT
# imported here. Two Magatama teach one, so they are named rather than left to look
# like a parse failure.
TALK_SKILLS_NOT_IMPORTED = {"Jive Talk", "Stone Hunt"}

# The book spells two skills differently between the p.42 Magatama table and the ch4
# list. Spacing folds out on its own; the vowel does not, so it is recorded here with
# the printed spellings kept on both sides rather than silently rewritten.
SKILL_NAME_VARIANTS = {"agirao": "agilao"}


def skill_key(name):
    """Match key for a skill name. Folds case and spacing, which is the whole of the
    Warcry / "War Cry" difference, then applies the recorded variants."""
    k = re.sub(r"[\s\-']", "", str(name or "")).lower()
    return SKILL_NAME_VARIANTS.get(k, k)


def verify_skills(skills, demons, magatama, junk):
    """The ch4 list and the Ch.5 stat blocks are two independent printings of the same
    skills, so the overlap between them checks itself. That is the bar this project
    already holds transcribed data to, and here it comes free: ~1,400 demon skill rows
    name a cost, a potency and an element for skills this list prints again."""
    errs, warns = [], []

    by_key = {}
    for s in skills:
        key = skill_key(s["name"])
        if key in by_key:
            # The book prints a few skills in more than one table. An identical repeat is
            # fine; one that DISAGREES means two different rows collapsed onto one key.
            prior = by_key[key]
            if {k: v for k, v in s.items() if k != "page"} \
                    != {k: v for k, v in prior.items() if k != "page"}:
                errs.append(f"{s['name']}: key {key!r} collides with {prior['name']!r} "
                            f"(p.{prior['page']} and p.{s['page']}) with different values")
            continue
        by_key[key] = s

    if len(by_key) < 200:
        errs.append(f"expected at least 200 distinct skills in the ch4 list, got {len(by_key)}")

    for s in skills:
        if re.fullmatch(r"\d+", s["name"]) or "Order #" in s["name"]:
            errs.append(f"p.{s['page']}: page furniture imported as a skill: {s['name']!r}")
        if s["kind"] == "active" and not 0 <= s["potency"] <= 999:
            errs.append(f"{s['name']}: potency {s['potency']} out of range")

    # Cross-printing check. A column landing one place right, or a row read off its
    # neighbour, breaks agreement immediately -- and silently, otherwise.
    #
    # A disagreement is only an ERROR when the ch4 value is the odd one out. Where other
    # demons printing the same skill agree with ch4, the lone dissenter is a slip in the
    # book, and §1 clause 1 says to keep it as printed and report it rather than correct
    # it -- the same treatment Pixie's Magic TN and Scáthach's HP already get.
    checked = 0
    votes = collections.defaultdict(collections.Counter)
    dissent = collections.defaultdict(list)
    for d in demons:
        for row in d.get("skills", []):
            ref = by_key.get(skill_key(row.get("name")))
            if not ref or ref["kind"] != "active":
                continue
            m = re.fullmatch(r"(\d+)\s*(HP|MP)", row.get("cost", ""))
            if not m:
                continue
            checked += 1
            want = (int(m.group(1)), m.group(2).lower())
            got = (ref["cost"]["value"], ref["cost"]["resource"])
            votes[ref["name"]][want] += 1
            if want != got:
                dissent[ref["name"]].append((d["name"], d["page"], row["cost"]))

    for name, cases in sorted(dissent.items()):
        ref = by_key[skill_key(name)]
        agree = votes[name][(ref["cost"]["value"], ref["cost"]["resource"])]
        printed = f"{ref['cost']['value']} {ref['cost']['resource'].upper()}"
        where = ", ".join(f"{n} (p.{p}) prints {c}" for n, p, c in cases[:3])
        if agree:
            warns.append(f"{name}: ch4 prints {printed} and {agree} stat block(s) agree; "
                         f"{where} - kept as printed")
        else:
            errs.append(f"{name}: ch4 prints {printed} and NO stat block agrees; {where}")

    if checked < 500:
        errs.append(f"only {checked} skill costs could be cross-checked against the "
                    f"stat blocks; expected 500+ (the overlap did not resolve)")

    # Every skill a Magatama teaches must exist, or the fiend progression has a hole.
    wanted = {s["name"] for m in magatama for s in m["skills"]}
    # A name the ch4 list omits but the stat blocks print is a gap in the BOOK, not in
    # the parse, and the runtime falls back to the corpus for exactly these. Reported
    # so the omission stays visible instead of being absorbed silently.
    in_corpus = {skill_key(row["name"]) for d in demons for row in d.get("skills", [])}
    unknown = [n for n in wanted
               if skill_key(n) not in by_key and n not in TALK_SKILLS_NOT_IMPORTED]
    omitted = sorted(n for n in unknown if skill_key(n) in in_corpus)
    missing = sorted(n for n in unknown if skill_key(n) not in in_corpus)
    if missing:
        errs.append(f"{len(missing)} Magatama skill(s) found in NO printing: "
                    + ", ".join(missing[:12]))
    if omitted:
        warns.append(f"{len(omitted)} Magatama skill(s) the ch4 list omits but the stat "
                     f"blocks print (resolved from the corpus): " + ", ".join(omitted))
    skipped_talk = sorted(n for n in wanted if n in TALK_SKILLS_NOT_IMPORTED)
    if skipped_talk:
        recovered = [n for n in skipped_talk if skill_key(n) in in_corpus]
        absent = [n for n in skipped_talk if skill_key(n) not in in_corpus]
        warns.append("talk skills are a different table and are NOT imported from ch4: "
                     + ", ".join(skipped_talk)
                     + (f" ({', '.join(recovered)} still resolves from a stat block)" if recovered else "")
                     + (f" - NO definition anywhere for {', '.join(absent)}" if absent else ""))

    for j in junk[:8]:
        warns.append(f"row skipped as not-a-skill: {j}")
    return errs, warns, {"distinct": len(by_key), "crossChecked": checked}


ITEM_PAGES = (116, 117)                # ITEM PRICE LIST, ordinary horizontal tables
GEAR_PAGE = 118                        # GEAR PRICE LIST, rotated like p.42
GEAR_LABELS = ("Name", "Type", "Buy", "Sell", "Effect", "Gear Power", "Phys Resist")
GEAR_SCALAR = {"Buy", "Sell", "Gear Power", "Phys Resist"}
GEAR_LABEL_X = 450.0                   # everything right of the last entry column


class GearItemImporter:
    """The ITEM PRICE LIST (p.116-117) and the GEAR PRICE LIST (p.118).

    Two different shapes. The item list is an ordinary horizontal table -- name
    column anchors a record, cells split by the header's own x positions, wrapped
    effects gathered from a band around the anchor row, exactly the ch4 skill-list
    pattern.

    The gear list is ROTATED like the p.42 Magatama table, with one addition that
    table does not have: MULTI-LINE cells. Each gear is a column anchored by its
    name's first-line x; a wrapped cell continues in lines that stack RIGHT-TO-LEFT
    (each next line ~5pt left of the last), so a cell reads lines in descending x,
    words within a line in ascending y. Entry windows are the midpoints between
    neighbouring name anchors, which is what keeps a five-line effect inside its own
    gear. Scalar bands (Buy / Sell / Gear Power / Phys Resist) print their values on
    the label's own row, so they are read at that row alone -- which also keeps the
    page number and the watermark, which sit far below, out of the last band."""

    def __init__(self, doc):
        self.doc = doc

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

    # --- the horizontal item list -------------------------------------------

    def item_page(self, printed):
        ws = self.words(printed + PRINTED_OFFSET)
        rows = self.rows(ws)
        header = None
        for y, items in rows:
            toks = [w for _, w in items]
            if toks[:4] == ["Name", "Buy", "Sell", "Effect"]:
                header = (y, [x for x, _ in items[:4]])
                break
        if header is None:
            return []
        hy, xs = header
        bounds = xs + [10_000.0]

        body = [(y, items) for y, items in rows if y > hy + 4]
        name_x = xs[0]
        anchors = [y for y, items in body
                   if any(abs(x - name_x) <= 12 and x < xs[1] for x, _ in items)]
        if not anchors:
            return []
        gaps = sorted(b - a for a, b in zip(anchors, anchors[1:]))
        pitch = gaps[len(gaps) // 2] if gaps else 16.0

        # No gap-break here, deliberately: a two-line effect makes a legitimate gap
        # near twice the pitch (p.117's first row is exactly that, and a break there
        # ended the table at one item). Nothing below these tables ever lands in the
        # name column -- the watermark sits at x~5 -- so the guards on the record
        # itself are the protection, not a break.
        out = []
        for i, y in enumerate(anchors):
            prev = anchors[i - 1] if i else None
            nxt = anchors[i + 1] if i + 1 < len(anchors) else None
            lo = (prev + y) / 2 if prev is not None else y - pitch * 0.6
            hi = (y + nxt) / 2 if nxt is not None else y + pitch * 0.6
            band = sorted(((by, x, w) for by, items in body if lo <= by < hi
                           for x, w in items))
            cells = ["", "", "", ""]
            for _by, x, w in band:
                ci = 0
                for j in range(4):
                    if x >= bounds[j] - 3.0:
                        ci = j
                cells[ci] = (cells[ci] + " " + w).strip()
            name = clean(cells[0])
            if not name or name.isupper():
                continue
            # The per-purchaser watermark's "(Order" token sits inside the name
            # window, so it anchors like a row. Same furniture rule as every other
            # parser: refuse it by content, never import it.
            if re.fullmatch(r"\d+", name) or "Order #" in name or "(Order" in name:
                continue
            out.append({"name": name, "buy": num(cells[1]), "sell": num(cells[2]),
                        "effect": clean(cells[3]), "page": printed})
        return out

    # --- the rotated gear list ----------------------------------------------

    def gear_page(self, printed):
        ws = self.words(printed + PRINTED_OFFSET)
        label_ws = [(x, y, w) for x, y, w in ws if x >= GEAR_LABEL_X]
        entry_ws = [(x, y, w) for x, y, w in ws if x < GEAR_LABEL_X]

        # Label rows: a rotated two-line label ("Gear" then "Power") lands as two
        # words on one row at descending x.
        labels = []
        for y, items in self.rows(label_ws):
            text = " ".join(w for _x, w in sorted(items, key=lambda t: -t[0]))
            if text in GEAR_LABELS:
                labels.append((y, text))
        if [t for _y, t in labels] != list(GEAR_LABELS):
            return [], [f"p.{printed}: gear labels read as {[t for _y, t in labels]}"]

        # Entry anchors: the name band's FIRST row carries every gear's first name
        # word, one per column -- and a gear whose name WRAPS puts its second line on
        # that same row, ~10pt left ("(Masterwork)" beside "Katana"). Cluster anchors
        # closer than the column pitch so a wrapped name is one entry, not two.
        name_y = labels[0][0]
        anchor_xs = sorted(x for x, y, _w in entry_ws if abs(y - name_y) <= 3.0)
        clusters = []
        for x in anchor_xs:
            if clusters and x - clusters[-1][-1] < 12.0:
                clusters[-1].append(x)
            else:
                clusters.append([x])
        windows = []
        for i, cl in enumerate(clusters):
            lo = (max(clusters[i - 1]) + min(cl)) / 2 if i \
                else min(cl) - (min(clusters[1]) - max(cl)) / 2
            hi = (max(cl) + min(clusters[i + 1])) / 2 if i + 1 < len(clusters) \
                else max(cl) + (min(cl) - max(clusters[i - 1])) / 2
            windows.append((lo, hi))

        def cell(lo_x, hi_x, lo_y, hi_y):
            """Multi-line rotated cell: lines in DESCENDING x, words in ascending y."""
            got = [(x, y, w) for x, y, w in entry_ws
                   if lo_x <= x < hi_x and lo_y <= y < hi_y]
            lines = {}
            for x, y, w in got:
                k = next((k for k in lines if abs(k - x) <= 3.0), x)
                lines.setdefault(k, []).append((y, w))
            out = []
            for k in sorted(lines, reverse=True):
                out.extend(w for _y, w in sorted(lines[k]))
            return clean(" ".join(out))

        out = []
        errs = []
        # Printed order: a rotated table reads right-to-left, Knife first.
        for lo_x, hi_x in reversed(windows):
            d = {}
            for li, (ly, label) in enumerate(labels):
                if label in GEAR_SCALAR:
                    value = cell(lo_x, hi_x, ly - 3.0, ly + 3.0)
                else:
                    hi_y = labels[li + 1][0] - 3.0 if li + 1 < len(labels) else 10_000.0
                    value = cell(lo_x, hi_x, 0.0 if li == 0 else ly - 3.0, hi_y)
                key = {"Name": "name", "Type": "type", "Buy": "buy", "Sell": "sell",
                       "Effect": "effect", "Gear Power": "gearPower",
                       "Phys Resist": "physResist"}[label]
                d[key] = num(value) if label in GEAR_SCALAR else value
            d["page"] = printed
            out.append(d)
        return out, errs

    def run(self):
        consumables = []
        for p in range(ITEM_PAGES[0], ITEM_PAGES[1] + 1):
            consumables.extend(self.item_page(p))
        gear, errs = self.gear_page(GEAR_PAGE)
        return consumables, gear, errs


def verify_gear_items(consumables, gear, table_errs):
    """Counts read off the rendered pages, plus anchors from three different rows."""
    errs = list(table_errs)
    warns = []

    if len(consumables) != 48:
        errs.append(f"expected 48 items in the ITEM PRICE LIST, got {len(consumables)}")
    if len(gear) != 20:
        errs.append(f"expected 20 entries in the GEAR PRICE LIST, got {len(gear)}")

    for c in consumables:
        where = f"{c['name']} (p.{c['page']})"
        if not c["effect"]:
            errs.append(f"{where}: no effect text")
        if re.fullmatch(r"\d+", c["name"]) or "Order #" in c["name"]:
            errs.append(f"{where}: page furniture imported as an item")
        if c["buy"] is None and c["sell"] is None:
            errs.append(f"{where}: neither price parsed")
    for g in gear:
        where = f"{g['name']} (p.{g['page']})"
        if not g["effect"]:
            errs.append(f"{where}: no effect text")
        if not g["type"]:
            errs.append(f"{where}: no type")

    anchors_c = {
        "Medicine": {"buy": 100, "sell": 50, "effect": "One ally recovers 50 HP."},
        "Spyglass": {"sell": 50000},
        "Bead of Life": {"buy": None, "sell": 10000},
    }
    by_c = {c["name"]: c for c in consumables}
    for name, want in anchors_c.items():
        got = by_c.get(name)
        if not got:
            errs.append(f"anchor missing: {name}")
            continue
        for k, v in want.items():
            if got.get(k) != v:
                errs.append(f"anchor {name}.{k}: expected {v!r}, got {got.get(k)!r}")

    anchors_g = {
        "Knife": {"type": "Weapon", "buy": 20, "sell": 10, "gearPower": 5, "physResist": None},
        "Plate Mail": {"type": "Head/Body/Leg Armor", "physResist": 12, "sell": 5000},
        "MP5": {"type": "Weapon (Firearm)", "gearPower": 12},
        "Katana (Masterwork)": {"gearPower": 35, "sell": 6000},
    }
    by_g = {g["name"]: g for g in gear}
    for name, want in anchors_g.items():
        got = by_g.get(name)
        if not got:
            errs.append(f"anchor missing: {name}")
            continue
        for k, v in want.items():
            if got.get(k) != v:
                errs.append(f"anchor {name}.{k}: expected {v!r}, got {got.get(k)!r}")
    return errs, warns


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
    ap.add_argument("--out-skills", default="data-local/skill-stats.json")
    ap.add_argument("--out-gear", default="data-local/gear-stats.json")
    ap.add_argument("--dump-words", action="store_true",
                    help="also write data-local/word-dump.json: the raw word lists this "
                         "importer parsed, per pdf page index. The in-Foundry importer's "
                         "parse is a port of this one, and the parity suite runs the port "
                         "over these exact words and diffs the output against --out.")
    ap.add_argument("--force", action="store_true",
                    help="write even if verification fails (not recommended)")
    args = ap.parse_args()

    if not os.path.exists(args.pdf):
        sys.exit(f"no such file: {args.pdf}")

    importer = Importer(args.pdf)

    if args.dump_words:
        # Every page range any importer reads, keyed by PDF INDEX (printed + 2).
        ranges = [
            (GENERAL_PAGES[0] + PRINTED_OFFSET, GENERAL_PAGES[1] + PRINTED_OFFSET),
            (BOSS_PAGES[0] + PRINTED_OFFSET, BOSS_PAGES[1] + PRINTED_OFFSET),
            (MAGATAMA_PROSE[0] + PRINTED_OFFSET, MAGATAMA_PAGE + PRINTED_OFFSET),
            (SKILL_PAGES[0] + PRINTED_OFFSET, SKILL_PAGES[1] + PRINTED_OFFSET),
            (ITEM_PAGES[0] + PRINTED_OFFSET, GEAR_PAGE + PRINTED_OFFSET),
        ]
        pages = {}
        for lo, hi in ranges:
            for idx in range(lo, hi + 1):
                if idx not in pages:
                    pages[idx] = importer.words(idx)
        write_json("data-local/word-dump.json", {
            "source": "PyMuPDF word lists, rounded to 0.1, keyed by pdf index",
            "printedOffset": PRINTED_OFFSET,
            "generalPages": list(GENERAL_PAGES),
            "bossPages": list(BOSS_PAGES),
            "pages": pages,
        })
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

    skills, junk = SkillListImporter(importer.doc).run()
    s_errs, s_warns, stats = verify_skills(skills, demons, magatama, junk)

    print(f"\nparsed {len(skills)} ch4 skill rows "
          f"({stats['distinct']} distinct, "
          f"{sum(1 for s in skills if s['kind'] == 'passive')} passive), "
          f"{stats['crossChecked']} costs cross-checked against the stat blocks")
    for w in s_warns:
        print(f"  note: {w}")

    if s_errs:
        print(f"\nSkill-list verification FAILED ({len(s_errs)} problems):")
        for e in s_errs[:20]:
            print("  " + e)
        if len(s_errs) > 20:
            print(f"  ... +{len(s_errs) - 20} more")
        if not args.force:
            sys.exit("\nrefusing to write the skill list. "
                     "Re-run with --force only if you know why.")
    else:
        print("verification passed: counts, page furniture, and every cost the ch4 list "
              "and the Ch.5 stat blocks both print")

    write_json(args.out_skills, {"source": "Tokyo Conception Ch.4",
                                 "count": len(skills), "skills": skills})

    consumables, gear, g_table_errs = GearItemImporter(importer.doc).run()
    g_errs, g_warns = verify_gear_items(consumables, gear, g_table_errs)

    print(f"\nparsed {len(consumables)} price-list items and {len(gear)} gear entries")
    for w in g_warns:
        print(f"  note: {w}")
    if g_errs:
        print(f"\nGear/item verification FAILED ({len(g_errs)} problems):")
        for e in g_errs[:20]:
            print("  " + e)
        if len(g_errs) > 20:
            print(f"  ... +{len(g_errs) - 20} more")
        if not args.force:
            sys.exit("\nrefusing to write the gear list. "
                     "Re-run with --force only if you know why.")
    else:
        print("verification passed: counts and seven row anchors across both lists")

    write_json(args.out_gear, {"source": "Tokyo Conception Ch.4 p.116-118",
                               "consumables": consumables, "gear": gear})


def write_json(path, payload):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    print(f"-> {path}")


if __name__ == "__main__":
    main()
