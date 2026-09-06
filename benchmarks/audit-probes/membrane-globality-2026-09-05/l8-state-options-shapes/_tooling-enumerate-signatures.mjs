// Перечислитель сигнатур линзы L8: все параметры/поля-функции/возвраты колбэков,
// чей ТИП допускает объект, построенный вызывающим (State-образные и
// options-образные типы), по git-трекаемым файлам packages/core/src.
// Печатает: file · container · member · param · typeText, плюс маркер
// "surface" (экспортировано / член экспортированного интерфейса-класса).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const ROOT = process.cwd();
const files = execSync("git ls-files packages/core/src", { cwd: ROOT })
  .toString()
  .split("\n")
  .filter((f) => f.endsWith(".ts"));

const LENS =
  /\b(State|SimpleState|TransitionMeta|NavigationOptions|NavigationTarget|Options|AnyOptions|Params|SearchParams|ParamsSearch|SerializedRouterState|StateContext|LoggerConfig|LimitsConfig|CloneOptions|Route|RouteConfigUpdate|Dependencies|DefaultDependencies|Plugin|Record<|object|unknown|TreeChangedEvent|RouterValidator|RouteTreeState)\b/;

const rows = [];
let totalParams = 0;

function isExported(node) {
  return (
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ??
    false
  );
}

function typeText(sf, t) {
  return t ? t.getText(sf).replace(/\s+/g, " ") : "<inferred>";
}

function recordParams(sf, file, container, member, params, surface, kind) {
  for (const p of params) {
    totalParams++;
    const tt = typeText(sf, p.type);
    if (LENS.test(tt)) {
      rows.push({
        file,
        container,
        member,
        param: p.name.getText(sf),
        type: tt,
        surface,
        kind,
      });
    }
  }
}

function recordReturn(sf, file, container, member, retType, surface, kind) {
  const tt = typeText(sf, retType);
  if (retType && LENS.test(tt)) {
    rows.push({
      file,
      container,
      member,
      param: "<return>",
      type: tt,
      surface,
      kind,
    });
  }
}

for (const file of files) {
  const src = readFileSync(`${ROOT}/${file}`, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);

  function visit(node, container, surface) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const s = surface || isExported(node);
      recordParams(sf, file, container, node.name.text, node.parameters, s, "function");
      recordReturn(sf, file, container, node.name.text, node.type, s, "function-return");
    } else if (ts.isVariableStatement(node)) {
      const s = surface || isExported(node);
      for (const d of node.declarationList.declarations) {
        if (
          d.initializer &&
          (ts.isArrowFunction(d.initializer) ||
            ts.isFunctionExpression(d.initializer))
        ) {
          recordParams(sf, file, container, d.name.getText(sf), d.initializer.parameters, s, "const-fn");
        }
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      const s = surface || isExported(node);
      for (const m of node.members) {
        if (ts.isConstructorDeclaration(m)) {
          recordParams(sf, file, node.name.text, "constructor", m.parameters, s, "ctor");
        } else if (ts.isMethodDeclaration(m)) {
          const isPrivate =
            ts.isPrivateIdentifier(m.name) ||
            m.modifiers?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword);
          recordParams(sf, file, node.name.text, m.name.getText(sf), m.parameters, s && !isPrivate, "method");
          recordReturn(sf, file, node.name.text, m.name.getText(sf), m.type, s && !isPrivate, "method-return");
        }
      }
      return;
    } else if (ts.isInterfaceDeclaration(node)) {
      const s = surface || isExported(node);
      for (const m of node.members) {
        if (ts.isMethodSignature(m)) {
          recordParams(sf, file, node.name.text, m.name.getText(sf), m.parameters, s, "iface-method");
          recordReturn(sf, file, node.name.text, m.name.getText(sf), m.type, s, "iface-method-return");
        } else if (ts.isPropertySignature(m) && m.type) {
          if (ts.isFunctionTypeNode(m.type)) {
            recordParams(sf, file, node.name.text, m.name.getText(sf), m.type.parameters, s, "iface-fnprop");
            recordReturn(sf, file, node.name.text, m.name.getText(sf), m.type.type, s, "iface-fnprop-return");
          } else if (ts.isTypeLiteralNode(m.type)) {
            for (const mm of m.type.members) {
              if (ts.isPropertySignature(mm) && mm.type && ts.isFunctionTypeNode(mm.type)) {
                recordParams(sf, file, `${node.name.text}.${m.name.getText(sf)}`, mm.name.getText(sf), mm.type.parameters, s, "iface-nested-fnprop");
                recordReturn(sf, file, `${node.name.text}.${m.name.getText(sf)}`, mm.name.getText(sf), mm.type.type, s, "iface-nested-fnprop-return");
              }
            }
          } else {
            // объектное поле интерфейса лензового типа (напр. Route.defaultParams: Params)
            const tt = typeText(sf, m.type);
            if (LENS.test(tt)) {
              rows.push({ file, container: node.name.text, member: m.name.getText(sf), param: "<field>", type: tt, surface: s, kind: "iface-field" });
            }
          }
        } else if (ts.isIndexSignatureDeclaration(m)) {
          const tt = typeText(sf, m.type);
          rows.push({ file, container: node.name.text, member: "[index]", param: "<field>", type: tt, surface: s, kind: "iface-index" });
        }
      }
      return;
    } else if (ts.isTypeAliasDeclaration(node)) {
      const s = surface || isExported(node);
      if (ts.isFunctionTypeNode(node.type)) {
        recordParams(sf, file, node.name.text, "<alias>", node.type.parameters, s, "type-fn");
        recordReturn(sf, file, node.name.text, "<alias>", node.type.type, s, "type-fn-return");
      }
    }
    ts.forEachChild(node, (c) => visit(c, container, surface));
  }

  visit(sf, "<module>", false);
}

const surfaceRows = rows.filter((r) => r.surface);
const out = {
  files: files.length,
  totalParamsSeen: totalParams,
  lensRows: rows.length,
  surfaceRows: surfaceRows.length,
  rows,
};
writeFileSync(
  `${process.env.SCRATCH}/lens-rows.json`,
  JSON.stringify(out, null, 2),
);
console.log(`files=${files.length} paramsSeen=${totalParams} lensRows=${rows.length} surfaceRows=${surfaceRows.length}`);
for (const r of surfaceRows) {
  console.log(`${r.file} · ${r.container}.${r.member} · ${r.param}: ${r.type} [${r.kind}]`);
}
