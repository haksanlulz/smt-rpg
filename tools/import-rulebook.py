# /// script
# requires-python = ">=3.10"
# dependencies = ["pymupdf"]
# ///
"""Import demon stat blocks from a Tokyo Conception rulebook PDF you own.

    uv run --script tools/import-rulebook.py --pdf /path/to/rulebook.pdf

Writes data-local/demon-stats.json, which the system loads at init. That path is
gitignored: the stat blocks are the book's content and are not redistributed. This
script is the shippable half -- supply your own PDF and it builds your own data.

No prose is captured. Names, numbers and skill tables only; the flavour text beside
each stat block is deliberately skipped.

How it reads the page, since neither layout is a real table in the PDF:
  * Blocks are found by their header row (name + LV/LVL + CLAN).
  * Fields are found by LABEL ANCHOR, not fixed coordinates -- general demons
    (p.126-211) and bosses (p.213-235) use different layouts.
  * A label's value is gathered within a small vertical BAND, because long values
    wrap and the label can sit in its own line between them.
  * Skill-table columns are located from an all-dash placeholder row, which has
    exactly one token per column and so is an exact ruler. The ruler is medianed
    across every block of a layout so one odd page cannot set the columns.
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
    ap.add_argument("--force", action="store_true",
                    help="write even if verification fails (not recommended)")
    args = ap.parse_args()

    if not os.path.exists(args.pdf):
        sys.exit(f"no such file: {args.pdf}")

    demons = Importer(args.pdf).run()
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

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"source": "Tokyo Conception Ch.5", "count": len(demons), "demons": demons},
                  fh, ensure_ascii=False, indent=1)
    print(f"-> {args.out}")


if __name__ == "__main__":
    main()
