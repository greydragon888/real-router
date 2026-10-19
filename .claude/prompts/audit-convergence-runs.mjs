// node .claude/prompts/audit-convergence-runs.mjs <каталог транскриптов> <подстрока пути документа> <каталог вывода> [YYYY-MM-DD]
// На каждый прогон /audit-rfc по документу (не раньше даты, если она дана) пишет итоговый отчёт
// (*.report.md) и отчёты агентов (*.agents.md); печатает: время | сессия | запуск | аргументы | агентов | символов отчёта.
import {
  createReadStream,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const [dir, doc, out, since = ""] = process.argv.slice(2);
if (!dir || !doc || !out)
  throw new Error(
    "usage: .claude/prompts/audit-convergence-runs.mjs <dir> <doc> <out> [YYYY-MM-DD]",
  );
mkdirSync(out, { recursive: true });

const textOf = (c) =>
  typeof c === "string"
    ? c
    : Array.isArray(c)
      ? c
          .map(
            (x) => x.text ?? (typeof x.content === "string" ? x.content : ""),
          )
          .join("\n")
      : "";

let total = 0,
  other = 0;
for (const f of readdirSync(dir)
  .filter((n) => n.endsWith(".jsonl"))
  .sort()) {
  const runs = [];
  let run = null;
  for await (const line of createInterface({
    input: createReadStream(join(dir, f)),
  })) {
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    const text = j.type === "user" ? textOf(j.message?.content) : "";
    if (j.type === "user" && j.origin?.kind === "human") {
      if (run) runs.push(run);
      run = null;
      const start = (launch, args) => ({
        ts: j.timestamp,
        session: f.slice(0, 8),
        launch,
        args,
        texts: [],
        agents: [],
      });
      const m = text.match(
        /<command-name>\/audit-rfc<\/command-name>[\s\S]*?<command-args>([\s\S]*?)<\/command-args>/,
      );
      if (m && m[1].includes(doc)) run = start("команда", m[1].trim());
      // Сверку часто запускают прозой («запускай сверку --delta R41»): такой прогон
      // помечен и засчитывается, только если его отчёт или агенты называют документ.
      else if (!m && text.length < 300 && /--delta|сверк/i.test(text))
        run = start("текст?", text.replace(/\s+/g, " ").trim());
      continue;
    }
    if (!run) continue;
    // Отчёт агента приходит двумя формами: записью пользователя от peer и вложением queued_command.
    if (text.includes("<agent-message")) run.agents.push(text);
    const queued =
      j.type === "attachment" && j.attachment?.type === "queued_command"
        ? (j.attachment.prompt ?? "")
        : "";
    if (queued.includes("<agent-message")) run.agents.push(queued);
    if (j.type === "assistant") {
      for (const b of j.message?.content ?? [])
        if (b.type === "text" && b.text.trim()) run.texts.push(b.text);
    }
  }
  if (run) runs.push(run);
  for (const r of runs) {
    if (r.ts < since) continue;
    const report =
      [...r.texts].reverse().find((t) => t.length > 1500) ??
      r.texts.at(-1) ??
      "";
    // Реплика о сверке, чьи ответ и агенты не называют документ, — о другом документе.
    if (r.launch !== "команда" && !(report + r.agents.join("")).includes(doc)) {
      other++;
      continue;
    }
    if (r.texts.length === 0 && r.agents.length === 0) {
      console.log(`${r.ts} | ${r.session} | (прерван, ответа нет)`);
      continue;
    }
    // Текстовый «запуск» без агентов — реплика, которая выдаёт команду или вносит правки, а не прогон.
    if (r.launch !== "команда" && r.agents.length === 0) {
      console.log(
        `${r.ts} | ${r.session} | (запуск текстом без агентов — не прогон, проверь вручную)`,
      );
      continue;
    }
    total++;
    const base = join(out, `${r.ts.replace(/[:.]/g, "-")}-${r.session}`);
    writeFileSync(`${base}.report.md`, report);
    writeFileSync(`${base}.agents.md`, r.agents.join("\n\n---\n\n"));
    console.log(
      [
        r.ts,
        r.session,
        r.launch,
        r.args.slice(0, 100),
        `agents=${r.agents.length}`,
        `report=${report.length}`,
      ].join(" | "),
    );
  }
}
console.log(`runs: ${total}; реплик о сверке другого документа: ${other}`);
