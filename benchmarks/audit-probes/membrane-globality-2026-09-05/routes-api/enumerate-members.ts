// Знаменатель линзы L3: члены интерфейсов поверхности, взятые через TS API.
import ts from "typescript";
import path from "node:path";

const root = process.argv[2] ?? process.cwd();
const files = {
  api: path.join(root, "packages/core/src/types/api.ts"),
  router: path.join(root, "packages/core/src/types/router.ts"),
  fwd: path.join(
    root,
    "packages/core/src/namespaces/RoutesNamespace/forwardChain.ts",
  ),
};
const program = ts.createProgram(Object.values(files), {
  target: ts.ScriptTarget.ES2022,
});
const out = {};
function members(file, name) {
  const sf = program.getSourceFile(file);
  const res = [];
  ts.forEachChild(sf, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      for (const m of node.members) {
        if (ts.isIndexSignatureDeclaration(m)) {
          res.push("[key: string]");
          continue;
        }
        res.push(m.name.getText(sf));
      }
    }
  });
  return res;
}
function fnParams(file, name) {
  const sf = program.getSourceFile(file);
  let res = null;
  ts.forEachChild(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      res = node.parameters.map(
        (p) => p.name.getText(sf) + ": " + (p.type ? p.type.getText(sf) : "?"),
      );
    }
  });
  return res;
}
function typeAliasParams(file, name) {
  const sf = program.getSourceFile(file);
  let res = null;
  ts.forEachChild(sf, (node) => {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === name &&
      ts.isFunctionTypeNode(node.type)
    ) {
      res = {
        params: node.type.parameters.map(
          (p) => p.name.getText(sf) + ": " + p.type.getText(sf),
        ),
        returns: node.type.type.getText(sf),
      };
    }
  });
  return res;
}
out.RoutesApi = members(files.api, "RoutesApi");
out.PluginApi_subset = members(files.api, "PluginApi").filter((m) =>
  ["setRootPath", "getRootPath", "getRouteConfig"].includes(m),
);
out.PluginApi_all_count = members(files.api, "PluginApi").length;
out.Route = members(files.router, "Route");
out.RouteConfigUpdate = members(files.router, "RouteConfigUpdate");
out.resolveForwardChain = fnParams(files.fwd, "resolveForwardChain");
out.ForwardToCallback = typeAliasParams(files.router, "ForwardToCallback");
out.DefaultParamsCallback = typeAliasParams(
  files.router,
  "DefaultParamsCallback",
);
out.DefaultSearchCallback = typeAliasParams(
  files.router,
  "DefaultSearchCallback",
);
out.GuardFnFactory = typeAliasParams(files.router, "GuardFnFactory");
out.GuardFn = typeAliasParams(files.router, "GuardFn");
console.log(JSON.stringify(out, null, 2));
