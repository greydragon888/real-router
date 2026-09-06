// Mechanical denominator for "the same object at other entry points": every function-like
// signature in git-tracked `packages/*/src` + `shared/` (tests excluded) that has a
// parameter whose declared type is the router handle (`Router`, `Router<…>`,
// `RouterInterface<…>`, `RouterClass<…>`, `Router<D>` …). Split into
//   (i)  signatures that CALL a getInternals-family door with that parameter (the object
//        crosses into core state there), and
//   (ii) signatures that only hold or forward it (adapters / plugins / hand-outs).
// The classification is textual on the function BODY — "calls getInternals/getPluginApi/
// getRoutesApi/getDependenciesApi/getLifecycleApi/getNavigator/cloneRouter with the same
// identifier" — and every hit is printed, not sampled.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";

const root = path.resolve(__dirname, "../../../..");
const DOORS = [
  "getInternals",
  "getPluginApi",
  "getRoutesApi",
  "getDependenciesApi",
  "getLifecycleApi",
  "getNavigator",
  "cloneRouter",
];

function tracked(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(
      (f) =>
        /^(packages\/[^/]+\/src\/|shared\/)/.test(f) &&
        /\.(ts|tsx)$/.test(f) &&
        !/\.d\.ts$/.test(f) &&
        !/\/tests?\//.test(f) &&
        !/\.(test|spec)\./.test(f),
    );
}

const ROUTER_TYPE = /^(Router|RouterInterface|RouterClass)(<|$)/;

interface Hit {
  file: string;
  symbol: string;
  param: string;
  type: string;
  crossesVia: string[];
}

function nameOf(node: ts.Node, sf: ts.SourceFile): string {
  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) &&
    node.name
  ) {
    return node.name.getText(sf);
  }

  let p: ts.Node | undefined = node.parent;

  while (p) {
    if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p)) {
      return p.name.getText(sf);
    }

    if (ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) {
      return `${p.name?.getText(sf) ?? "?"}›(inner)`;
    }

    if (ts.isSourceFile(p)) {
      break;
    }

    p = p.parent;
  }

  return "(anonymous)";
}

function main(): void {
  const files = tracked();
  const hits: Hit[] = [];
  let signatures = 0;

  for (const file of files) {
    const text = readFileSync(path.join(root, file), "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isFunctionTypeNode(node) ||
        ts.isConstructorDeclaration(node)
      ) {
        signatures += 1;

        for (const p of node.parameters) {
          const typeText = p.type?.getText(sf) ?? "";

          if (ROUTER_TYPE.test(typeText)) {
            const paramName = p.name.getText(sf);
            const body = "body" in node && node.body ? node.body.getText(sf) : "";
            const crossesVia = DOORS.filter((d) =>
              new RegExp(`\\b${d}\\(\\s*${paramName.replace(/[$]/g, "\\$")}\\b`).test(body),
            );

            hits.push({ file, symbol: nameOf(node, sf), param: paramName, type: typeText, crossesVia });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  const crossing = hits.filter((h) => h.crossesVia.length > 0);
  const holding = hits.filter((h) => h.crossesVia.length === 0);

  console.log(
    JSON.stringify(
      {
        "tracked source files scanned": files.length,
        "function-like signatures visited": signatures,
        "signatures with a Router-typed parameter (denominator)": hits.length,
        "(i) crossing into core via a getInternals-family door": crossing.map(
          (h) => `${h.file} · ${h.symbol}(${h.param}: ${h.type}) → ${h.crossesVia.join(",")}`,
        ),
        "(ii) holding / forwarding / hand-out (no door call with that identifier)": holding.map(
          (h) => `${h.file} · ${h.symbol}(${h.param}: ${h.type})`,
        ),
      },
      null,
      2,
    ),
  );
}

main();
