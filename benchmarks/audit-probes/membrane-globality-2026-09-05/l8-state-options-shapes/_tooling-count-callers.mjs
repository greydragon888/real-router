// Счёт ВЫЗОВОВ (CallExpression с callee-идентификатором) заданных символов по
// git-трекаемым файлам packages/core/src — тот же символ, с арностью и
// охватывающей функцией; определения и упоминания в комментариях не считаются.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const ROOT = process.cwd();
const NAMES = process.argv.slice(2);
const files = execSync("git ls-files packages/core/src", { cwd: ROOT })
  .toString()
  .split("\n")
  .filter((f) => f.endsWith(".ts"));

const hits = {};
for (const n of NAMES) hits[n] = [];

for (const file of files) {
  const src = readFileSync(`${ROOT}/${file}`, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const enclosing = (node) => {
    let cur = node;
    while (cur) {
      if (
        (ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur)) &&
        cur.name
      ) {
        return cur.name.getText(sf);
      }
      if (ts.isVariableDeclaration(cur)) return cur.name.getText(sf);
      if (ts.isPropertyAssignment(cur)) return cur.name.getText(sf);
      cur = cur.parent;
    }
    return "<module>";
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const n = node.expression.text;
      if (n in hits) {
        hits[n].push({
          file,
          in: enclosing(node),
          arity: node.arguments.length,
          firstArg: node.arguments[0]?.getText(sf).replace(/\s+/g, " ").slice(0, 60),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

for (const n of NAMES) {
  console.log(`== ${n}: ${hits[n].length} call sites ==`);
  for (const h of hits[n]) {
    console.log(`  ${h.file} · in ${h.in} · arity ${h.arity} · arg0=${h.firstArg}`);
  }
}
