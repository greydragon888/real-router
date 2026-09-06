// Tool control for lens L5-plugin-api: enumerate every member of the surface
// interfaces MECHANICALLY (TS parser, no type-checker), so the census
// denominator is derived from the source rather than remembered.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/l5-plugin-api/enumerate-surface.ts
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";

const CORE = path.resolve(process.cwd(), "../packages/core/src");

interface Target {
  file: string;
  kind: "interface" | "type" | "class";
  name: string;
}

const TARGETS: Target[] = [
  { file: "types/api.ts", kind: "interface", name: "PluginApi" },
  { file: "types/api.ts", kind: "interface", name: "ContextNamespaceClaim" },
  { file: "types/api.ts", kind: "interface", name: "InterceptableMethodMap" },
  { file: "types/api.ts", kind: "type", name: "InterceptorFn" },
  { file: "api/types.ts", kind: "interface", name: "PluginApi" },
  { file: "internals.ts", kind: "interface", name: "RouterInternals" },
  { file: "types/router.ts", kind: "interface", name: "Plugin" },
  { file: "types/router.ts", kind: "type", name: "PluginFactory" },
  { file: "types/router.ts", kind: "interface", name: "Router" },
];

function describeMember(m: ts.TypeElement | ts.ClassElement, sf: ts.SourceFile): string {
  const name = (m as { name?: ts.Node }).name?.getText(sf) ?? "<anon>";

  if (ts.isPropertySignature(m) && m.type) {
    if (ts.isFunctionTypeNode(m.type)) {
      const params = m.type.parameters.map((p) => `${p.name.getText(sf)}: ${p.type?.getText(sf) ?? "?"}`);

      return `${name}(${params.join(", ")}) => ${m.type.type.getText(sf)}`;
    }

    if (ts.isTypeLiteralNode(m.type)) {
      const inner = m.type.members.map((x) => describeMember(x, sf));

      return `${name}: { ${inner.join("; ")} }`;
    }

    return `${name}: ${m.type.getText(sf).replaceAll(/\s+/g, " ")}`;
  }

  if (ts.isMethodSignature(m)) {
    const params = m.parameters.map((p) => `${p.name.getText(sf)}: ${p.type?.getText(sf) ?? "?"}`);

    return `${name}(${params.join(", ")}) => ${m.type?.getText(sf) ?? "?"}`;
  }

  return `${name}: <${ts.SyntaxKind[m.kind]}>`;
}

for (const target of TARGETS) {
  const file = path.join(CORE, target.file);
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  let found = false;

  sf.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === target.name && target.kind === "interface") {
      found = true;
      const members = node.members.map((m) => describeMember(m, sf));

      console.log(`\n## ${target.file} · interface ${target.name} — ${members.length} members`);
      for (const line of members) {
        if (target.name === "Router" && !line.startsWith("usePlugin")) {
          continue;
        }

        console.log(`  ${line.replaceAll(/\s+/g, " ")}`);
      }
    }

    if (ts.isTypeAliasDeclaration(node) && node.name.text === target.name && target.kind === "type") {
      found = true;
      console.log(`\n## ${target.file} · type ${target.name}`);
      console.log(`  ${node.type.getText(sf).replaceAll(/\s+/g, " ")}`);
    }
  });

  if (!found) {
    console.log(`\n!! NOT FOUND: ${target.file} · ${target.kind} ${target.name}`);
  }
}
