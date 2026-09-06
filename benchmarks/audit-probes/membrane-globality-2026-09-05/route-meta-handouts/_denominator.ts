// Lens denominator — "route-registry hand-outs keyed by route name" — derived
// mechanically from the source rather than from memory: every member of
// `interface RouterInternals` (internals.ts), `interface RouteResolver`
// (pipeline/port.ts), `interface PluginApi` (types/api.ts) and its `api/types.ts`
// override, every public method of `class RoutesNamespace` and `class SegmentMatcher`
// (= `Matcher`, reachable through `routeGetStore().matcher`), the record types the
// family travels in (`RouteTreeState`, `MatchResult`, `CompiledRoute`, `RouteTree`),
// and the round-trip consumer (`getTransitionPath` / `RouteMetaLookup`,
// `RoutesNamespace.static shouldUpdateNode`).
//
// TOOL CONTROL (printed last): the lens seed `getMetaForState` MUST appear in the
// RouterInternals AND RoutesNamespace lists and `getMetaByName` in SegmentMatcher's —
// an enumerator that does not surface its own seed is broken, not "clean".
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";

const root = path.resolve(__dirname, "../../../../packages/core/src");

function parse(rel: string): ts.SourceFile {
  const file = path.join(root, rel);

  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

function paramsOf(sf: ts.SourceFile, node: ts.SignatureDeclarationBase): string {
  return node.parameters
    .map(
      (p) =>
        `${p.name.getText(sf)}${p.questionToken ? "?" : ""}: ${squash(p.type?.getText(sf) ?? "?")}`,
    )
    .join(", ");
}

function retOf(sf: ts.SourceFile, node: ts.SignatureDeclarationBase): string {
  return node.type ? squash(node.type.getText(sf)) : "?";
}

function interfaceMembers(sf: ts.SourceFile, name: string): string[] {
  const out: string[] = [];

  sf.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      for (const m of node.members) {
        if (ts.isPropertySignature(m) && m.name && m.type) {
          const t = m.type;
          const prop = m.name.getText(sf);

          if (ts.isFunctionTypeNode(t)) {
            out.push(`${name}.${prop}(${paramsOf(sf, t)}) → ${retOf(sf, t)}`);
          } else if (ts.isTypeLiteralNode(t)) {
            let pushed = false;

            for (const cs of t.members) {
              if (ts.isCallSignatureDeclaration(cs)) {
                out.push(
                  `${name}.${prop}(${paramsOf(sf, cs)}) → ${retOf(sf, cs)}`,
                );
                pushed = true;
              }
            }

            if (!pushed) {
              out.push(`${name}.${prop}: ${squash(t.getText(sf))}`);
            }
          } else {
            out.push(`${name}.${prop}: ${squash(t.getText(sf))}`);
          }
        } else if (ts.isMethodSignature(m) && m.name) {
          out.push(
            `${name}.${m.name.getText(sf)}(${paramsOf(sf, m)}) → ${retOf(sf, m)}`,
          );
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
            const isStatic = m.modifiers?.some(
              (x) => x.kind === ts.SyntaxKind.StaticKeyword,
            );

            out.push(
              `${name}.${isStatic ? "static " : ""}${n}(${paramsOf(sf, m)}) → ${retOf(sf, m)}`,
            );
          }
        } else if (ts.isGetAccessorDeclaration(m) && m.name) {
          const n = m.name.getText(sf);

          if (!n.startsWith("#")) {
            out.push(`${name}.get ${n} → ${retOf(sf, m)}`);
          }
        }
      }
    }
  });

  return out;
}

function functionDecl(sf: ts.SourceFile, name: string): string[] {
  const out: string[] = [];

  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      out.push(`${name}(${paramsOf(sf, node)}) → ${retOf(sf, node)}`);
    }
  });

  return out;
}

function typeAlias(sf: ts.SourceFile, name: string): string[] {
  const out: string[] = [];

  sf.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) {
      out.push(`type ${name} = ${squash(node.type.getText(sf))}`);
    }
  });

  return out;
}

const internals = parse("internals.ts");
const port = parse("pipeline/port.ts");
const typesApi = parse("types/api.ts");
const apiTypes = parse("api/types.ts");
const routesNs = parse("namespaces/RoutesNamespace/RoutesNamespace.ts");
const matcher = parse("engine/path-matcher/SegmentMatcher.ts");
const routeNodeTypes = parse("types/route-node-types.ts");
const pmTypes = parse("engine/path-matcher/types.ts");
const builderTypes = parse("engine/builder/types.ts");
const transitionPath = parse("transitionPath.ts");
const navTypes = parse("namespaces/NavigationNamespace/types.ts");

const result = {
  "interface RouterInternals (internals.ts)": interfaceMembers(
    internals,
    "RouterInternals",
  ),
  "interface RouteResolver (pipeline/port.ts)": interfaceMembers(
    port,
    "RouteResolver",
  ),
  "interface PluginApi (types/api.ts)": interfaceMembers(typesApi, "PluginApi"),
  "interface PluginApi override (api/types.ts)": interfaceMembers(
    apiTypes,
    "PluginApi",
  ),
  "class RoutesNamespace (public)": classPublicMethods(
    routesNs,
    "RoutesNamespace",
  ),
  "class SegmentMatcher (public) = Matcher": classPublicMethods(
    matcher,
    "SegmentMatcher",
  ),
  "interface RouteTreeState (types/route-node-types.ts)": interfaceMembers(
    routeNodeTypes,
    "RouteTreeState",
  ),
  "interface MatchResult (engine/path-matcher/types.ts)": interfaceMembers(
    pmTypes,
    "MatchResult",
  ),
  "interface CompiledRoute (engine/path-matcher/types.ts)": interfaceMembers(
    pmTypes,
    "CompiledRoute",
  ),
  "interface MatcherInputNode (engine/path-matcher/types.ts)": interfaceMembers(
    pmTypes,
    "MatcherInputNode",
  ),
  "interface RouteTree (engine/builder/types.ts)": interfaceMembers(
    builderTypes,
    "RouteTree",
  ),
  "function getTransitionPath (transitionPath.ts)": functionDecl(
    transitionPath,
    "getTransitionPath",
  ),
  "type RouteMetaLookup (transitionPath.ts)": typeAlias(
    transitionPath,
    "RouteMetaLookup",
  ),
  "interface NavigationDependencies — family members only": interfaceMembers(
    navTypes,
    "NavigationDependencies",
  ).filter((s) => /getMetaForState|getQueryParams|hasRoute/.test(s)),
};

console.log(JSON.stringify(result, null, 2));

const flat = Object.values(result).flat();
const control = {
  "RouterInternals.getMetaForState": flat.some((s) =>
    s.startsWith("RouterInternals.getMetaForState("),
  ),
  "RoutesNamespace.getMetaForState": flat.some((s) =>
    s.startsWith("RoutesNamespace.getMetaForState("),
  ),
  "SegmentMatcher.getMetaByName": flat.some((s) =>
    s.startsWith("SegmentMatcher.getMetaByName("),
  ),
  "RouterInternals.getQueryParams": flat.some((s) =>
    s.startsWith("RouterInternals.getQueryParams("),
  ),
  "RouteResolver.queryNames": flat.some((s) =>
    s.startsWith("RouteResolver.queryNames("),
  ),
  "RouteResolver.pathNames": flat.some((s) =>
    s.startsWith("RouteResolver.pathNames("),
  ),
  "RouterInternals.getTree": flat.some((s) =>
    s.startsWith("RouterInternals.getTree("),
  ),
  "RouterInternals.buildStateResolved": flat.some((s) =>
    s.startsWith("RouterInternals.buildStateResolved("),
  ),
  "RoutesNamespace.static shouldUpdateNode": flat.some((s) =>
    s.startsWith("RoutesNamespace.static shouldUpdateNode("),
  ),
};

console.log(
  JSON.stringify(
    {
      counts: Object.fromEntries(
        Object.entries(result).map(([k, v]) => [k, v.length]),
      ),
      total: flat.length,
      seedControl: control,
      seedControlAllFound: Object.values(control).every(Boolean),
    },
    null,
    2,
  ),
);
