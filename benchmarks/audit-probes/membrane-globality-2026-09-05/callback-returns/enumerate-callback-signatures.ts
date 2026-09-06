// The DENOMINATOR of lens L6: every function-typed member / alias in core's
// PUBLIC type surface, with its declared return type — derived with the TS
// compiler API, not listed by hand. The census in the report is checked
// against this output (numerator / denominator).
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/callback-returns/enumerate-callback-signatures.ts
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";

const ROOT = path.resolve(__dirname, "../../../../packages/core/src");
const FILES = [
  "types/router.ts",
  "types/api.ts",
  "types/index.ts",
  "types/base.ts",
  "types/RouterValidator.ts",
  "types/tree-changed.ts",
  "types/route-node-types.ts",
  "api/types.ts",
];

interface Row {
  file: string;
  container: string;
  member: string;
  returns: string;
}

const rows: Row[] = [];

function returnTypeText(
  node: ts.SignatureDeclarationBase | ts.FunctionTypeNode,
  sf: ts.SourceFile,
): string {
  return node.type ? node.type.getText(sf) : "<inferred>";
}

function isFunctionType(node: ts.TypeNode | undefined): node is ts.FunctionTypeNode {
  return node !== undefined && ts.isFunctionTypeNode(node);
}

function walkTypeLiteralMembers(
  container: string,
  members: ts.NodeArray<ts.TypeElement>,
  file: string,
  sf: ts.SourceFile,
): void {
  for (const m of members) {
    if (ts.isPropertySignature(m)) {
      const name = m.name.getText(sf);
      const t = m.type;

      if (isFunctionType(t)) {
        rows.push({ file, container, member: name, returns: returnTypeText(t, sf) });
      } else if (t && ts.isTypeLiteralNode(t)) {
        // nested object of callbacks (RouterValidator.routes etc.)
        walkTypeLiteralMembers(`${container}.${name}`, t.members, file, sf);
        // a type literal with call signatures (claimContextNamespace overloads)
        for (const cs of t.members) {
          if (ts.isCallSignatureDeclaration(cs)) {
            rows.push({
              file,
              container,
              member: `${name} (call signature)`,
              returns: returnTypeText(cs, sf),
            });
          }
        }
      } else if (t && ts.isUnionTypeNode(t)) {
        for (const u of t.types) {
          if (isFunctionType(u)) {
            rows.push({
              file,
              container,
              member: `${name} (union arm)`,
              returns: returnTypeText(u, sf),
            });
          }
        }
      } else if (t && ts.isParenthesizedTypeNode(t) && isFunctionType(t.type)) {
        rows.push({ file, container, member: name, returns: returnTypeText(t.type, sf) });
      }
    } else if (ts.isMethodSignature(m)) {
      rows.push({
        file,
        container,
        member: m.name.getText(sf),
        returns: returnTypeText(m, sf),
      });
    } else if (ts.isCallSignatureDeclaration(m)) {
      rows.push({ file, container, member: "(call signature)", returns: returnTypeText(m, sf) });
    }
  }
}

for (const rel of FILES) {
  const full = path.join(ROOT, rel);
  const sf = ts.createSourceFile(full, readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);

  sf.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node)) {
      const t = node.type;

      if (isFunctionType(t)) {
        rows.push({ file: rel, container: "(alias)", member: node.name.text, returns: returnTypeText(t, sf) });
      } else if (ts.isTypeLiteralNode(t)) {
        walkTypeLiteralMembers(node.name.text, t.members, rel, sf);
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      walkTypeLiteralMembers(node.name.text, node.members, rel, sf);
    }
  });
}

// Members whose declared return admits an OBJECT the callee constructs
// (anything that is not void / a primitive / a bare `Unsubscribe` / `boolean`).
const PRIMITIVE = /^(void|string|boolean|number|Unsubscribe|never|this)$/;
const objectReturning = rows.filter((r) => !PRIMITIVE.test(r.returns.trim()));

console.log(`TOTAL function-typed members in public types: ${String(rows.length)}`);
console.log(`Object-admitting return types: ${String(objectReturning.length)}`);
for (const r of rows) {
  console.log(`${r.file} | ${r.container}.${r.member} | returns ${r.returns.replaceAll(/\s+/g, " ")}`);
}
