/**
 * Codemod: Transform router.getNavigator() to getNavigator(router)
 *
 * USAGE:
 *   npx jscodeshift -t packages/core/codemods/get-navigator-standalone.ts \
 *     --extensions=ts,tsx,js,jsx <target-dir>
 *
 * EXAMPLES:
 *   npx jscodeshift -t packages/core/codemods/get-navigator-standalone.ts \
 *     --extensions=ts,tsx src/
 *
 *   npx jscodeshift -t packages/core/codemods/get-navigator-standalone.ts \
 *     --extensions=ts,tsx --dry src/
 *
 * LIMITATIONS:
 *   - Does NOT handle aliased variables (const r = router; r.getNavigator())
 *   - Does NOT handle computed property access (router['getNavigator']())
 *   - Does NOT handle dynamic references (router[method]())
 *
 * @see RFC-10 lines 146-147
 * @see Issue #83 checklist item 12
 */

export const parser = "tsx";

export default function transformer(file: any, api: any, _options: any) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasModifications = false;

  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        property: {
          type: "Identifier",
          name: "getNavigator",
        },
      },
    })
    .forEach((path: any) => {
      const callExpr = path.node;
      const memberExpr = callExpr.callee;
      const objectExpr = memberExpr.object;

      const newCallExpr = j.callExpression(j.identifier("getNavigator"), [
        objectExpr,
      ]);

      j(path).replaceWith(newCallExpr);
      hasModifications = true;
    });

  if (hasModifications) {
    addGetNavigatorImport(j, root);
  }

  return hasModifications ? root.toSource() : undefined;
}

function addGetNavigatorImport(j: any, root: any) {
  const importSource = "@real-router/core";
  const importName = "getNavigator";

  const existingImports = root.find(j.ImportDeclaration, {
    source: { value: importSource },
  });

  if (existingImports.length > 0) {
    let alreadyImported = false;

    existingImports.forEach((path: any) => {
      const importDecl = path.node;
      const specifiers = importDecl.specifiers || [];

      const hasGetNavigator = specifiers.some(
        (spec: any) =>
          spec.type === "ImportSpecifier" &&
          spec.imported.type === "Identifier" &&
          spec.imported.name === importName,
      );

      if (hasGetNavigator) {
        alreadyImported = true;
        return;
      }

      if (!alreadyImported) {
        const newSpecifier = j.importSpecifier(j.identifier(importName));
        importDecl.specifiers = [...specifiers, newSpecifier];
        alreadyImported = true;
      }
    });
  } else {
    const newImport = j.importDeclaration(
      [j.importSpecifier(j.identifier(importName))],
      j.literal(importSource),
    );

    const firstNode = root.find(j.Program).get("body", 0);
    if (firstNode) {
      j(firstNode).insertBefore(newImport);
    }
  }
}
