// node .claude/prompts/audit-convergence-runs.mjs <каталог транскриптов> <подстрока пути документа> <каталог вывода> [--since=YYYY-MM-DD] [--alias=<regex>]
// Раунды цикла проверок одного документа: прогоны /audit-rfc и /code-review-rfc — набранные, через
// Skill tool и короткой репликой о сверке — и ревью П6: агенты-ревьюеры, которых сессия /implement-rfc
// запустила вне этих прогонов. На каждый раунд пишет итоговый отчёт (*.report.md) и отчёты агентов
// (*.agents.md); печатает: время | сессия | вид | запуск | аргументы или описание | агентов | символов отчёта.
import {
  createReadStream,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const [dir, doc, out, ...opts] = process.argv.slice(2);
if (!dir || !doc || !out) {
  throw new Error(
    "usage: .claude/prompts/audit-convergence-runs.mjs <dir> <doc> <out> [--since=YYYY-MM-DD] [--alias=<regex>]",
  );
}
const opt = (key) =>
  opts.find((o) => o.startsWith(`--${key}=`))?.slice(key.length + 3) ?? "";
const since = opt("since");
const alias = opt("alias") ? new RegExp(opt("alias")) : null;
// Алиас — имя документа или шага его плана в промптах ревьюеров; текстовый запуск судится по пути.
const namesReviewer = (t) =>
  t.includes(doc) || (alias !== null && alias.test(t));
const KIND = { "audit-rfc": "аудит", "code-review-rfc": "ревью кода" };
const REVIEW = /П6|ревью|рецензент|review|сверк|delta/i;
const OTHER_DOCS = /\b[\w-]*rfc[\w-]*\.md\b/gi;
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

let total = 0;
let other = 0;
const emit = (r) => {
  if (r.ts < since) return;
  const report =
    [...r.texts].reverse().find((t) => t.length > 1500) ?? r.texts.at(-1) ?? "";
  // Реплика о сверке, чьи ответ и агенты не называют документ, — о другом документе.
  if (r.launch === "текст?" && !(report + r.agents.join("")).includes(doc)) {
    other++;
    return;
  }
  if (r.texts.length === 0 && r.agents.length === 0) {
    console.log(`${r.ts} | ${r.session} | ${r.kind} | (прерван, ответа нет)`);
    return;
  }
  // Текстовый «запуск» без агентов — реплика, которая выдаёт команду или вносит правки, а не прогон.
  if (r.launch === "текст?" && r.agents.length === 0) {
    console.log(
      `${r.ts} | ${r.session} | (запуск текстом без агентов — не прогон, проверь вручную)`,
    );
    return;
  }
  total++;
  const base = join(
    out,
    `${r.ts.replace(/[:.]/g, "-")}-${r.session}${r.kind === "агент" ? `-${r.n}` : ""}`,
  );
  writeFileSync(`${base}.report.md`, report);
  writeFileSync(`${base}.agents.md`, r.agents.join("\n\n---\n\n"));
  console.log(
    [
      r.ts,
      r.session,
      r.kind,
      r.launch,
      r.args.replace(/\s+/g, " ").slice(0, 100),
      `agents=${r.agents.length}`,
      `report=${report.length}`,
    ].join(" | "),
  );
};

for (const f of readdirSync(dir)
  .filter((n) => n.endsWith(".jsonl"))
  .sort()) {
  let run = null;
  let rounds = 0;
  let implementing = false; // ревью П6 ведёт сессия /implement-rfc
  const launched = new Map(); // id вызова агента-ревьюера → описание
  const reviewers = new Map(); // agentId → { desc, docs, rounds }
  const start = (ts, kind, launch, args) => ({
    ts,
    session: f.slice(0, 8),
    kind,
    launch,
    args,
    texts: [],
    agents: [],
  });
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
      if (run) emit(run);
      run = null;
      if (/<command-name>\/implement-rfc<\/command-name>/.test(text))
        implementing = true;
      const m = text.match(
        /<command-name>\/(audit-rfc|code-review-rfc)<\/command-name>[\s\S]*?<command-args>([\s\S]*?)<\/command-args>/,
      );
      if (m && m[2].includes(doc))
        run = start(j.timestamp, KIND[m[1]], "команда", m[2].trim());
      // Сверку часто запускают прозой («запускай сверку --delta R41»): такой прогон засчитывается,
      // только если его отчёт или агенты называют документ.
      else if (
        !/<command-name>/.test(text) &&
        text.length < 300 &&
        /--delta|сверк/i.test(text)
      ) {
        run = start(
          j.timestamp,
          "аудит",
          "текст?",
          text.replace(/\s+/g, " ").trim(),
        );
      }
      continue;
    }
    if (j.type === "assistant" && !j.isSidechain) {
      for (const b of j.message?.content ?? []) {
        if (b.type !== "tool_use") continue;
        const input = b.input ?? {};
        const skill = String(input.skill ?? "").replace(/^\//, "");
        if (b.name === "Skill" && skill === "implement-rfc")
          implementing = true;
        if (
          b.name === "Skill" &&
          KIND[skill] &&
          String(input.args ?? "").includes(doc)
        ) {
          if (run) emit(run);
          run = start(j.timestamp, KIND[skill], "Skill", String(input.args));
        } else if (
          implementing &&
          (!run || run.launch === "текст?") &&
          (b.name === "Agent" || b.name === "Task")
        ) {
          const prompt = String(input.prompt ?? "");
          const desc = String(input.description ?? "");
          if (
            namesReviewer(prompt) &&
            (REVIEW.test(desc) || REVIEW.test(prompt.slice(0, 800)))
          ) {
            const docs = new Set(
              (prompt.match(OTHER_DOCS) ?? []).map((d) => d.toLowerCase()),
            );
            launched.set(b.id, { desc, docs: docs.size, ts: j.timestamp });
          }
        }
      }
    }
    // Вызов агента возвращает его id сразу, а отчёт агент сдаёт позже сообщением.
    if (j.type === "user" && Array.isArray(j.message?.content)) {
      for (const b of j.message.content) {
        if (b.type !== "tool_result" || !launched.has(b.tool_use_id)) continue;
        const id = textOf(b.content).match(/agentId: (\w+)/)?.[1];
        if (id)
          reviewers.set(id, { ...launched.get(b.tool_use_id), rounds: 0 });
      }
    }
    const queued =
      j.type === "attachment" && j.attachment?.type === "queued_command"
        ? (j.attachment.prompt ?? "")
        : "";
    // Отчёт агента приходит двумя формами: записью пользователя от peer и вложением queued_command.
    for (const message of [text, queued]) {
      const from = message.match(/<agent-message from="(\w+)"/)?.[1];
      if (!from) continue;
      const reviewer = reviewers.get(from);
      if (reviewer) {
        reviewer.rounds++;
        rounds++;
        const r = start(
          j.timestamp,
          "агент",
          reviewer.rounds === 1 ? "агент" : `агент, круг ${reviewer.rounds}`,
          `${reviewer.desc}${reviewer.docs > 1 ? ` (документов в промпте: ${reviewer.docs})` : ""}`,
        );
        r.n = rounds;
        r.texts.push(message);
        emit(r);
      } else if (run) {
        run.agents.push(message);
      }
    }
    if (run && j.type === "assistant") {
      for (const b of j.message?.content ?? [])
        if (b.type === "text" && b.text.trim()) run.texts.push(b.text);
    }
  }
  if (run) emit(run);
}
console.log(`runs: ${total}; реплик о сверке другого документа: ${other}`);
