// The lens denominator, derived mechanically: every member of `interface Router` and
// `interface Navigator` (types/router.ts) and every public method of `class Router`
// (Router.ts), with parameter lists — so the reviewed-signature list can be checked
// against the source rather than against memory.
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";

const root = path.resolve(__dirname, "../../../../packages/core/src");

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function paramsOf(sf: ts.SourceFile, node: ts.SignatureDeclarationBase): string {
  return node.parameters
    .map((p) => `${p.name.getText(sf)}${p.questionToken ? "?" : ""}: ${p.type?.getText(sf) ?? "?"}`)
    .join(", ");
}

function interfaceMembers(sf: ts.SourceFile, name: string): string[] {
  const out: string[] = [];

  sf.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      for (const m of node.members) {
        if (ts.isPropertySignature(m) && m.name && m.type) {
          const t = m.type;

          if (ts.isFunctionTypeNode(t)) {
            out.push(`${name}.${m.name.getText(sf)}(${paramsOf(sf, t)})`);
          } else if (ts.isTypeLiteralNode(t)) {
            for (const cs of t.members) {
              if (ts.isCallSignatureDeclaration(cs)) {
                out.push(`${name}.${m.name.getText(sf)}(${paramsOf(sf, cs)})`);
              }
            }
          } else {
            out.push(`${name}.${m.name.getText(sf)}: ${t.getText(sf)}`);
          }
        } else if (ts.isIndexSignatureDeclaration(m)) {
          out.push(`${name}.[index signature]`);
        }
      }
    }
  });

  return out;
}

function classPublicMethods(sf: ts.SourceFile, name: string): string[] {
  const out: string[] = [];

  sf.forEachChild((node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === name) {
      for (const m of node.members) {
        if (ts.isConstructorDeclaration(m)) {
          out.push(`${name}.constructor(${paramsOf(sf, m)})`);
        } else if (ts.isMethodDeclaration(m) && m.name) {
          const n = m.name.getText(sf);
          const isPrivate =
            n.startsWith("#") ||
            m.modifiers?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword);

          if (!isPrivate) {
            const isStatic = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword);

            out.push(`${name}.${isStatic ? "static " : ""}${n}(${paramsOf(sf, m)})`);
          }
        }
      }
    }
  });

  return out;
}

const routerTypes = parse(path.join(root, "types/router.ts"));
const routerClass = parse(path.join(root, "Router.ts"));
const navigatorFile = parse(path.join(root, "getNavigator.ts"));

let getNavigatorSig = "";

navigatorFile.forEachChild((node) => {
  if (ts.isVariableStatement(node)) {
    for (const d of node.declarationList.declarations) {
      if (d.name.getText(navigatorFile) === "getNavigator" && d.initializer && ts.isArrowFunction(d.initializer)) {
        getNavigatorSig = `getNavigator(${paramsOf(navigatorFile, d.initializer)})`;
      }
    }
  }
});

const result = {
  "interface Router": interfaceMembers(routerTypes, "Router"),
  "interface Navigator": interfaceMembers(routerTypes, "Navigator"),
  "class Router (public)": classPublicMethods(routerClass, "Router"),
  getNavigator: getNavigatorSig,
};

console.log(JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    counts: {
      interfaceRouter: result["interface Router"].length,
      interfaceNavigator: result["interface Navigator"].length,
      classRouterPublic: result["class Router (public)"].length,
    },
  }),
);
