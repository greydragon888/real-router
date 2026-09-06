// Механическая перепись экспортов shared/**/*.ts — знаменатель линзы L7-shared.
// Список файлов приходит АРГУМЕНТОМ (stdin-список из `git ls-files shared`),
// чтобы скрипт сам не трогал git; симлинки/globSync не используются.
import { readFileSync } from "node:fs";
import ts from "typescript";

const root = process.cwd();
const files = readFileSync(0, "utf8")
  .split("\n")
  .map((f) => f.trim())
  .filter((f) => f.endsWith(".ts"));

let total = 0;
const rows = [];

for (const file of files) {
  const src = readFileSync(`${root}/${file}`, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const names = [];

  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    const isExport = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

    if (ts.isExportDeclaration(st)) {
      const spec =
        st.exportClause && ts.isNamedExports(st.exportClause)
          ? st.exportClause.elements.map((e) => e.name.text)
          : ["*"];

      names.push(...spec.map((s) => `re-export:${s}`));
      continue;
    }

    if (!isExport) {
      continue;
    }

    if (ts.isFunctionDeclaration(st)) {
      const params = st.parameters.map((p) => p.getText(sf).replace(/\s+/g, " "));

      names.push(`function:${st.name?.text}(${params.join("; ")})`);
    } else if (ts.isClassDeclaration(st)) {
      names.push(`class:${st.name?.text}`);
    } else if (ts.isInterfaceDeclaration(st)) {
      const members = st.members.map((m) => m.name?.getText(sf) ?? "?");

      names.push(`interface:${st.name.text}{${members.join(",")}}`);
    } else if (ts.isTypeAliasDeclaration(st)) {
      names.push(`type:${st.name.text}`);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        names.push(`const:${d.name.getText(sf)}`);
      }
    }
  }

  const own = names.filter((n) => !n.startsWith("re-export:"));

  total += own.length;
  rows.push({ file, own: own.length, reexports: names.length - own.length, names });
}

for (const r of rows) {
  console.log(`${r.file}  own=${r.own} reexports=${r.reexports}`);

  for (const n of r.names) {
    console.log(`    ${n}`);
  }
}

console.log(`FILES=${files.length} OWN_EXPORTED_DECLS=${total}`);
