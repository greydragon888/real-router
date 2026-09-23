// raiser-head.mjs — the PARSE of a raiser head, shared by every reader of one (#2537).
//
// Which binding a site reads, and what receiver and door that binding names. The
// RENDERING stays with each reader: they spell a dynamic door differently, each for a
// reason it owns and states beside its own spelling, and one shared spelling would
// break three of them.
//
// ⚠ Every reader answers for `packages/core/tests/fixtures/raiser-heads/`, so a defect
// here reds all of them at once — which is the point of having one copy.
import ts from "typescript";

/**
 * The parts one `raiser(receiver, door?)` call names: the literal receiver, the
 * literal door, and whether a door was passed that is not a literal.
 */
export const raiserCallParts = (call) => {
  const [receiver, door] = call.arguments;

  return {
    receiver:
      receiver !== undefined && ts.isStringLiteral(receiver)
        ? receiver.text
        : undefined,
    door:
      door !== undefined && ts.isStringLiteral(door) ? door.text : undefined,
    dynamic: door !== undefined && !ts.isStringLiteral(door),
  };
};

/** The name and parts a declaration binds, when it binds `raiser(...)`. */
export const raiserBindingOf = (node) => {
  if (
    !ts.isVariableDeclaration(node) ||
    !ts.isIdentifier(node.name) ||
    node.initializer === undefined ||
    !ts.isCallExpression(node.initializer) ||
    !ts.isIdentifier(node.initializer.expression) ||
    node.initializer.expression.text !== "raiser"
  ) {
    return undefined;
  }

  return { name: node.name.text, parts: raiserCallParts(node.initializer) };
};

/**
 * The base and member of a tag read off a named binding: `at` and `type` in
 * ``at.type`…` ``, `at` and `code` in ``at.code(code)`…` ``. Whether the member is
 * a raiser flavour is the reader's question.
 */
export const raiserTagOf = (node) => {
  if (!ts.isTaggedTemplateExpression(node)) {
    return undefined;
  }

  const member = ts.isCallExpression(node.tag) ? node.tag.expression : node.tag;

  return ts.isPropertyAccessExpression(member) &&
    ts.isIdentifier(member.expression)
    ? { base: member.expression.text, member: member.name.text }
    : undefined;
};

/**
 * The parts the raiser binding `name` names AT `node`, resolved by LEXICAL SCOPE:
 * the nearest enclosing block, module block or file with a statement binding
 * `name` to `raiser(...)`. Each scope is read whole, so a binding written below
 * its use still answers for it.
 *
 * ⚠ Not a file-wide map keyed by name: `validation-plugin` names every per-call
 * binding `at`, and such a map handed the last one to every site.
 *
 * ⚠ A same-named binding that is NOT a raiser does not shadow an outer one here.
 */
export const raiserPartsAt = (node, name) => {
  for (let scope = node.parent; scope !== undefined; scope = scope.parent) {
    if (
      !ts.isBlock(scope) &&
      !ts.isSourceFile(scope) &&
      !ts.isModuleBlock(scope)
    ) {
      continue;
    }

    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement)) {
        continue;
      }

      for (const declaration of statement.declarationList.declarations) {
        const binding = raiserBindingOf(declaration);

        if (binding?.name === name) {
          return binding.parts;
        }
      }
    }
  }

  return undefined;
};
