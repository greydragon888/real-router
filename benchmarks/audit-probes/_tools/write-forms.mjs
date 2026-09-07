// Перепись ФОРМ ЗАПИСИ в свойство — инструмент против одного класса ложных выводов.
//
// ⚠ **Зачем он есть, замерено 2026-09-07.** Клейм «в этот объект никто не пишет»
// был получен шаблоном `x.y =` и оказался ложным: запись стояла за кастом —
// `(toState as { transition: TransitionMeta }).transition = …` в
// `completeTransition.ts`. Шаблон её не видит, вывод получается синтаксически
// безупречным и неверным, и на нём чуть не снесли несущую конструкцию.
//
// ⚑ Отрицательный клейм («здесь не пишут», «единственная запись») требует
// инструмента, который видит ВСЕ формы. Их восемь, и семь из восьми невидимы для
// наивного шаблона.
//
// ⚠ И границы функции здесь НЕ считаются скобками. Счётчик скобок дважды за один
// заход сломался на многострочной сигнатуре и вернул диапазон в одну строку, то
// есть «записей нет» на функции, где они были. Границы берутся из AST.
//
// Запуск (из КОРНЯ репозитория — там резолвится `typescript`):
//   node benchmarks/audit-probes/_tools/write-forms.mjs <glob> [символ]
//   node benchmarks/audit-probes/_tools/write-forms.mjs --self-test
//
// Примеры:
//   … write-forms.mjs 'packages/core/src/**/*.ts' completeTransition
//   … write-forms.mjs 'packages/core/src/namespaces/**/*.ts'
import { globSync, readFileSync } from "node:fs";
import * as ts from "typescript";

/** Восемь форм. Первая — та, которую ищут наивно; остальные семь она не видит. */
const FORMS = [
  // ⚠ `=(?![=>])` а НЕ `=[^=>]`: второй требует символ ПОСЛЕ знака равенства и
  // потому не видит присваивание, у которого значение перенесено на следующую
  // строку — а именно так написана та самая запись за кастом. Собственный
  // позитивный контроль этого инструмента поймал это на первом же прогоне.
  ["прямая", /(?<![.\w])[\w$]+\.[\w$]+\s*=(?![=>])/],
  ["за кастом", /\([\w$.]+\s+as\s+[^)]+\)\s*\.[\w$]+\s*=(?![=>])/],
  ["по индексу", /[\w$]+\[[^\]]+\]\s*=(?![=>])/],
  ["Object.assign", /\bObject\.assign\s*\(/],
  ["Reflect.set", /\bReflect\.set\s*\(/],
  ["defineProperty", /\bdefineProperty\s*\(/],
  ["putField", /\bputField\s*\(/],
  ["copyFields", /\bcopyFields\s*\(/],
];

const isComment = (line) => {
  const t = line.trim();

  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
};

/** Диапазон строк объявления с данным именем — из AST, не из счёта скобок. */
function rangeOf(text, file, symbol) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let found;

  const named = (node) => {
    const n = node.name?.getText?.();

    return n === symbol;
  };

  const walk = (node) => {
    if (found) return;

    const isDecl =
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertyAssignment(node);

    if (isDecl && named(node)) {
      const start = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;

      found = [start, end];

      return;
    }

    ts.forEachChild(node, walk);
  };

  walk(sf);

  return found;
}

function scan(pattern, symbol) {
  const files = globSync(pattern).filter((f) => !/node_modules|dist/.test(f));
  const rows = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");

    if (symbol !== undefined && !text.includes(symbol)) continue;

    const lines = text.split("\n");
    const range = symbol === undefined ? undefined : rangeOf(text, file, symbol);

    if (symbol !== undefined && range === undefined) continue;

    const [from, to] = range ?? [0, lines.length - 1];

    for (let i = from; i <= to; i++) {
      if (isComment(lines[i])) continue;

      for (const [name, re] of FORMS) {
        if (!re.test(lines[i])) continue;

        rows.push({ file, line: i + 1, form: name, text: lines[i].trim() });
        break;
      }
    }
  }

  return rows;
}

/**
 * ⚑ Позитивный контроль: сканер, вернувший ноль, ничего не доказывает, пока не
 * показано, что он находит заведомую запись. Семя — та самая запись за кастом,
 * из-за которой инструмент и появился.
 */
function selfTest() {
  const rows = scan("packages/core/src/**/*.ts", "completeTransition");
  const hit = rows.find((r) => r.form === "за кастом");

  console.log(`  найдено записей в completeTransition: ${rows.length}`);
  for (const r of rows) console.log(`    :${r.line}  [${r.form}] ${r.text.slice(0, 76)}`);

  if (hit === undefined) {
    console.log("\n  ✗ ПОЗИТИВНЫЙ КОНТРОЛЬ ПРОВАЛЕН: запись за кастом не найдена.");
    console.log("    Инструмент сломан — чините его, а не отчёт.");
    process.exitCode = 2;

    return;
  }

  console.log(`\n  ✓ контроль пройден: форма «за кастом» найдена на :${hit.line}`);
}

const [arg, symbol] = process.argv.slice(2);

if (arg === "--self-test" || arg === undefined) {
  selfTest();
} else {
  const rows = scan(arg, symbol);

  console.log(`  файлов по шаблону: ${globSync(arg).length} · записей: ${rows.length}`);

  for (const r of rows) {
    console.log(`  ${r.file}:${r.line}  [${r.form}] ${r.text.slice(0, 80)}`);
  }

  if (rows.length === 0) {
    console.log("\n  ⚠ Ноль записей. Прежде чем читать это как отсутствие — прогоните");
    console.log("    `--self-test`: он подтверждает, что инструмент вообще находит.");
  }
}
