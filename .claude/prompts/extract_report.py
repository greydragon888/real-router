#!/usr/bin/env python3
# Отчёт субагента — из его транскрипта в файл досье, мимо контекста основной сессии («Режим --delta», п. 1).
# Транскрипт — output_file из ответа Agent (tasks/<id>.output, JSONL). Запуск: extract_report.py <транскрипт> <файл>
import json
import sys

src, out = sys.argv[1], sys.argv[2]
report, longest = None, ""
for line in open(src, encoding="utf-8"):
    try:
        entry = json.loads(line)
    except ValueError:
        continue
    message = entry.get("message") or {}
    if message.get("role") != "assistant" or not isinstance(message.get("content"), list):
        continue
    for block in message["content"]:
        if block.get("type") == "tool_use" and "handback" in block.get("name", "").lower():
            data = block.get("input") or {}
            report = data.get("report") or data.get("message") or json.dumps(data, ensure_ascii=False)
        elif block.get("type") == "text" and len(block.get("text", "")) > len(longest):
            longest = block["text"]
text = report or longest
if not text:
    raise SystemExit("в транскрипте нет отчёта")
open(out, "w", encoding="utf-8").write(text)
print(out, len(text.encode("utf-8")), "bytes", "(handback)" if report else "(самый длинный текст)")
