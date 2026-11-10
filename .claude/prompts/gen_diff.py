#!/usr/bin/env python3
# Word diff of two markdown versions, grouped by hunk, with the section path
# and line numbers of both versions. Usage: gen_diff.py BASE CURRENT OUT
import difflib
import re
import sys

TOK = re.compile(r"\s+|\w+|[^\s\w]", re.UNICODE)
HEAD = re.compile(r"^(#{1,4}) (.*)$")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read().split("\n")


def section_paths(lines):
    path, out, code = [], [], False
    for s in lines:
        if s.startswith("```"):
            code = not code
        m = None if code else HEAD.match(s)
        if m:
            lvl = len(m.group(1))
            path = path[: lvl - 1] + [""] * max(0, lvl - 1 - len(path))
            path.append(m.group(2).strip())
        out.append(" > ".join(p for p in path[1:] if p))
    return out


def wdiff(a, b):
    ta, tb = TOK.findall(a), TOK.findall(b)
    sm = difflib.SequenceMatcher(None, ta, tb, autojunk=False)
    res = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            res.append("".join(ta[i1:i2]))
            continue
        if i2 > i1:
            res.append("[-" + "".join(ta[i1:i2]) + "-]")
        if j2 > j1:
            res.append("{+" + "".join(tb[j1:j2]) + "+}")
    return "".join(res)


def replace_block(a, a0, b, b0, out):
    d = [x for x in difflib.Differ().compare(a, b)]
    ia, ib, i = a0, b0, 0
    while i < len(d):
        tag, text = d[i][:2], d[i][2:]
        if tag == "? ":
            i += 1
            continue
        if tag == "  ":
            ia += 1
            ib += 1
            i += 1
            continue
        if tag == "- ":
            j = i + 1
            hint = j < len(d) and d[j][:2] == "? "
            if hint:
                j += 1
            if j < len(d) and d[j][:2] == "+ ":
                k = j + 1
                hint2 = k < len(d) and d[k][:2] == "? "
                if hint or hint2:
                    out.append(
                        "~ base L%d | cur L%d: %s" % (ia + 1, ib + 1, wdiff(text, d[j][2:]))
                    )
                    ia += 1
                    ib += 1
                    i = k + 1 if hint2 else k
                    continue
            out.append("- base L%d: %s" % (ia + 1, text))
            ia += 1
            i += 1
            continue
        if tag == "+ ":
            out.append("+ cur L%d: %s" % (ib + 1, text))
            ib += 1
            i += 1


def main(base, cur, outp):
    a, b = read(base), read(cur)
    pa, pb = section_paths(a), section_paths(b)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    hunks, body = [], []
    n = 0
    for op, a1, a2, b1, b2 in sm.get_opcodes():
        if op == "equal":
            continue
        n += 1
        sa = pa[a1] if a1 < len(pa) else (pa[-1] if pa else "")
        sb = pb[b1] if b1 < len(pb) else (pb[-1] if pb else "")
        ra = "L%d-%d" % (a1 + 1, a2) if a2 > a1 else "after L%d" % a1
        rb = "L%d-%d" % (b1 + 1, b2) if b2 > b1 else "after L%d" % b1
        hunks.append("| %d | %s | %s | %s | %s | %s |" % (n, op, ra, rb, sa, sb))
        body.append("")
        body.append("## Hunk %d (%s): base %s | current %s" % (n, op, ra, rb))
        body.append("- section in base: %s" % sa)
        body.append("- section in current: %s" % sb)
        body.append("")
        out = []
        if op == "delete":
            for k in range(a1, a2):
                out.append("- base L%d: %s" % (k + 1, a[k]))
        elif op == "insert":
            for k in range(b1, b2):
                out.append("+ cur L%d: %s" % (k + 1, b[k]))
        else:
            replace_block(a[a1:a2], a1, b[b1:b2], b1, out)
        body.append("```text")
        body.extend(out)
        body.append("```")
    with open(outp, "w", encoding="utf-8") as f:
        f.write("# Word diff: %s -> %s\n\n" % (base, cur))
        f.write(
            "Legend: `~` paired line with word diff, `[-removed-]` `{+added+}`; "
            "`-` line only in base; `+` line only in current. "
            "Line numbers: base = old version, cur = current version.\n\n"
        )
        f.write("| # | op | base lines | current lines | section (base) | section (current) |\n")
        f.write("|---|---|---|---|---|---|\n")
        f.write("\n".join(hunks) + "\n")
        f.write("\n".join(body) + "\n")
    print("hunks=%d" % n)


if __name__ == "__main__":
    main(*sys.argv[1:4])
