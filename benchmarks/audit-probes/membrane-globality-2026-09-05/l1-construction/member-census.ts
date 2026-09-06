// L1-construction · the DENOMINATOR of the lens, derived from the TYPES with the
// TypeScript compiler API rather than hand-listed: every member of every
// interface / type alias on the construction surface, with its declared type
// text, so the door list can be checked member-for-member against it.
import path from "node:path";

import * as ts from "typescript";

const CORE = path.resolve(process.cwd(), "../packages/core/src");
const FILES: Record<string, string[]> = {
  "types/router.ts": [
    "Options",
    "Route",
    "RouteConfigUpdate",
    "LoggerConfig",
    "DefaultRouteCallback",
    "DefaultParamsCallback",
    "DefaultSearchCallback",
    "ForwardToCallback",
    "GuardFnFactory",
    "GuardFn",
    "DefaultDependencies",
  ],
  "types/route-node-types.ts": ["QueryParamsOptions"],
  "types/limits.ts": ["LimitsConfig"],
  "types/base.ts": ["ParamsSearch", "Params", "SearchParams"],
  "api/cloneRouter.ts": ["CloneOptions", "cloneRouter"],
  "createRouter.ts": ["createRouter"],
  "Router.ts": ["Router"],
};

const program = ts.createProgram(
  Object.keys(FILES).map((f) => path.join(CORE, f)),
  { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, noResolve: true },
);

let total = 0;

for (const [file, names] of Object.entries(FILES)) {
  const sf = program.getSourceFile(path.join(CORE, file));

  if (!sf) {
    throw new Error(`no source file ${file}`);
  }

  const visit = (node: ts.Node): void => {
    if (
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      names.includes(node.name.text)
    ) {
      const members: string[] = [];

      if (ts.isInterfaceDeclaration(node)) {
        for (const m of node.members) {
          if (ts.isPropertySignature(m) && m.name) {
            members.push(
              `${m.name.getText(sf)}${m.questionToken ? "?" : ""}: ${m.type?.getText(sf).replaceAll(/\s+/g, " ") ?? "?"}`,
            );
          } else if (ts.isIndexSignatureDeclaration(m)) {
            members.push(`[index]: ${m.type.getText(sf)}`);
          }
        }
      } else {
        members.push(`= ${node.type.getText(sf).replaceAll(/\s+/g, " ")}`);
      }

      total += members.length;
      console.log(`\n${file} · ${node.name.text} (${members.length} members)`);

      for (const m of members) {
        console.log(`  ${m}`);
      }
    }

    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      names.includes(node.name.text)
    ) {
      console.log(`\n${file} · function ${node.name.text}(${node.parameters.map((p) => p.getText(sf).replaceAll(/\s+/g, " ")).join(", ")})`);
      total += node.parameters.length;
    }

    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && names.includes(d.name.text) && d.initializer && ts.isArrowFunction(d.initializer)) {
          console.log(`\n${file} · const ${d.name.text} = (${d.initializer.parameters.map((p) => p.getText(sf).replaceAll(/\s+/g, " ")).join(", ")})`);
          total += d.initializer.parameters.length;
        }
      }
    }

    if (ts.isClassDeclaration(node) && node.name && names.includes(node.name.text)) {
      for (const m of node.members) {
        if (ts.isConstructorDeclaration(m)) {
          console.log(`\n${file} · class ${node.name.text} constructor(${m.parameters.map((p) => p.getText(sf).replaceAll(/\s+/g, " ")).join(", ")})`);
          total += m.parameters.length;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
}

console.log(`\nTOTAL members/parameters enumerated: ${total}`);
