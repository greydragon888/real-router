#!/usr/bin/env python3
# Выдержка /audit-rfc для агента сверки (`Режим --delta`, п. 1): три файла по разделам, каждый меньше лимита Read.
# Запуск: excerpts.py <путь к audit-rfc.md> <каталог досье>
import hashlib
import pathlib
import re
import sys

skill = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
src = skill.read_text(encoding="utf-8")
md5 = hashlib.md5(skill.read_bytes()).hexdigest()[:8]
parts = re.split(r"(?m)^(?=## )", src)
sections = {p.split("\n", 1)[0][3:].strip(): p for p in parts if p.startswith("## ")}


def find(prefix):
    keys = [k for k in sections if k.startswith(prefix)]
    if len(keys) != 1:
        raise SystemExit(f"раздел «{prefix}»: найдено {keys}")
    return sections[keys[0]]


def item(text, n):
    for x in re.split(r"(?m)^(?=\d+\. )", text):
        if x.startswith(f"{n}. "):
            return x
    raise SystemExit(f"нет пункта {n}")


chunks = [
    ("skill-1-claims-protocol3-plan.md",
     find("Классификация утверждений") + "\n## Протокол на каждый claim — пункт 3\n\n"
     + item(find("Протокол"), 3) + "\n" + find("План: что проверяется")),
    ("skill-2-findings-rules.md", find("Классификация находок") + find("Жёсткие правила")),
    ("skill-3-caveats-report-delta2.md",
     find("Оговорки") + find("Валидация и отчёт") + "\n## Режим `--delta` — пункт 2\n\n"
     + item(find("Режим `--delta`"), 2)),
]
for name, text in chunks:
    (out / name).write_text(f"# Выдержка `{skill}` (md5 {md5})\n\n" + text, encoding="utf-8")
    print(name, len(text.encode("utf-8")), "bytes")
