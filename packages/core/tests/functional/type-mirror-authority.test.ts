// A hand-written enumeration that mirrors a TYPE must equal it — checked here for
// every such pair in core, not one.
//
// This is the generalisation of `route-key-authority-1738.test.ts`, and the reason
// it exists is a measured pattern rather than a hunch. Four defects filed in one
// week share one shape: a list of member names written by hand, a type it is
// supposed to mirror, and nothing binding the two — so a later wave added a member
// to the type and the list stayed as it was. `STANDARD_ROUTE_KEYS` missed
// `defaultSearch` for 33 releases (#1738); `@real-router/validation-plugin`'s
// field lists still miss it in six cells (#1787). Each was introduced by a
// STRUCTURAL wave (a package extraction, a channel split, a modularisation): the
// wave's review checked that the new site worked, not that it had inherited every
// rule the old site knew.
//
// ⚑ Every relation below is EQUAL today. That is the point: this file does not fix
// anything, it removes the way the next wave would break them silently. A relation
// that is deliberately a subset rather than an equality does not belong here — say
// so in the table and pin it where the asymmetry is explained.
//
// ⚠ The extractors THROW on a shape they do not recognise and on a missing anchor,
// instead of returning a shorter list. That is the #1738 lesson: a walk keyed on a
// narrow node shape silently returned 3 members out of 5, and no non-vacuity
// threshold catches a PARTIAL list. Same reason every derived list is asserted
// non-empty before it is compared, and the table's own length is asserted outside
// `it.each` — `it.each([])` registers zero cells in silence.
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../src");

function parse(file: string): ts.SourceFile {
  const full = path.join(SRC, file);

  return ts.createSourceFile(
    full,
    readFileSync(full, "utf8"),
    ts.ScriptTarget.Latest,
    // `true`: `insideUnattributedFunction` walks up to the enclosing function to
    // decide whether a write is one the named function actually performs.
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
}

/**
 * Whether the file BINDS `name` anywhere — an import, a namespace import, a
 * `const`/`let`/`var`, a function, a class, a parameter, a binding element, a
 * `namespace`/`module`, an `enum`, or an `import x = …` alias.
 *
 * ⚠ The list of declaration KINDS is the predicate. Reading eight of the eleven
 * kinds that bind a value name is a spelling test wearing a binder's name:
 * measured on `snapshotQueryParams`, `namespace Object { export function
 * freeze… }` — which type-checks clean and hoists above the first use — left
 * this relation GREEN at 4/4 while `nullFormat: "hidden"` stopped reaching the
 * matcher and `buildPath` emitted `/x?a` for a null it was told to hide. The
 * `const` spelling of the identical shadow reds. `enum` and `import x = y` are
 * the other two, and they are here for the same reason rather than because
 * anyone has written them.
 *
 * ⚑ There is no type checker here, so a callee is recognised by SPELLING. That
 * is only sound while the spelling can mean nothing else: one `const Object =
 * { freeze: strip }` — or `import * as Object from "./shim"` — and every
 * `Object.freeze(…)` in the file names a function with no guarantee at all,
 * while this walk keeps reading the argument as the result. Measured on
 * `snapshotQueryParams`: a shadow that deletes one field left the relation
 * GREEN at 4/4 while `nullFormat: "hidden"` stopped reaching the matcher and
 * `buildPath` fell back to the default. Cheap, conservative, and LOUD.
 *
 * ⚠ It does NOT read `isTypeOnly`, and that is one measured over-report rather
 * than an oversight: `import type { Params as Object } from "./types"` compiles
 * (only TS6133, unused) and leaves every `Object.freeze` in the file resolving
 * to the intrinsic, yet this refuses the relation. The refusal is loud, no core
 * file has the shape, and the alternative — deciding by hand which import forms
 * bind a VALUE — is the enumeration this predicate exists to stop being. Erring
 * the other way turns a refusal into silence.
 */
function bindsName(file: ts.SourceFile, name: string): boolean {
  let bound = false;

  const declares = (declared: ts.Node | undefined): void => {
    if (declared === undefined) {
      return;
    }

    if (ts.isIdentifier(declared)) {
      bound ||= declared.text === name;

      return;
    }

    if (
      ts.isObjectBindingPattern(declared) ||
      ts.isArrayBindingPattern(declared)
    ) {
      for (const element of declared.elements) {
        if (ts.isBindingElement(element)) {
          declares(element.name);
        }
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isImportClause(node) ||
      ts.isNamespaceImport(node) ||
      ts.isImportSpecifier(node) ||
      // A `namespace`/`module` body emits a hoisted `var` of that name, an
      // `enum` emits a `var` too, and `import x = …` emits a binding — each
      // shadows the global for every use in the file.
      ts.isModuleDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      // ⚠ A class or function EXPRESSION binds its own name inside its own
      // body, and reading only the declaration forms missed it: measured,
      // `const C = class Object { static make() { return Object.name; } }`
      // left this relation GREEN while the `const Object = …` spelling of the
      // same shadow reds. Two kinds apart, opposite verdicts.
      ts.isClassExpression(node) ||
      ts.isFunctionExpression(node)
    ) {
      declares(node.name);
    }

    // ⚠ `globalThis.Object = …` re-points the intrinsic with no DECLARATION
    // anywhere, so a walk over declaration kinds cannot see it: measured, the
    // assignment left this relation GREEN while `Object.freeze` named whatever
    // was assigned. A write to the global namespace is a binding of that name
    // for every later use in the process, not only in this file.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = peel(node.left);

      if (
        ts.isPropertyAccessExpression(left) &&
        ts.isIdentifier(left.expression) &&
        left.expression.text === "globalThis"
      ) {
        bound ||= left.name.text === name;
      }

      if (
        ts.isElementAccessExpression(left) &&
        ts.isIdentifier(left.expression) &&
        left.expression.text === "globalThis" &&
        ts.isStringLiteralLike(left.argumentExpression)
      ) {
        bound ||= left.argumentExpression.text === name;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return bound;
}

/**
 * The expression with the TYPE-ONLY wrappers removed. `as`, `satisfies`,
 * `<T>x`, `x!` and a bare `(x)` all erase at compile time and none of them
 * changes the value, so refusing to read through them would reject a legitimate
 * spelling of the same code — the mistake `chain-walk-authority`'s `subjectOf`
 * documents from the other side.
 */
function peel(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

/**
 * Whether `node` sits inside a nested function this walk cannot attribute to
 * the function it is scanning.
 *
 * ⚠ Without this, a write that never runs counts as a write. Measured on
 * `buildStructuralPatch`: moving `patch.encodeParams = …` into a
 * `const applyEncode = () => {…}` that is never invoked left the relation GREEN
 * at 7/7 while `encodeParams` stopped reaching TREE_CHANGED, so no
 * `subscribeChanges` consumer revalidated on it. The same move on
 * `clearRouteConfigurations`' `clearConfigEntries(config.encoders, …)` left it
 * GREEN while a removed route kept its encoder and the next `add()` of that
 * name inherited it. Deleting either line outright reds, which is the whole
 * difference this closes.
 *
 * ⚠ "Handed straight to a call" is not "invoked". Reading the SHAPE alone left
 * the identical defect one character over: measured,
 * `neverCalls(() => { patch.encodeParams = …; })` left the relation GREEN at
 * 7/7 while the byte-adjacent `const applyEncode = () => {…}` — the spelling
 * the shape test was written against — reds. Nothing about an argument
 * position says the callee runs it.
 *
 * ⚑ So the callee must be NAMED, at the call site, exactly as
 * `returnedLiteralKeys` makes an allowed bare `return` name its constant.
 * `clearConfigEntries(config.forwardMap, (key) => shouldClear(…))` is a live
 * site and `clearConfigEntries` invokes its matcher; that fact is declared once
 * by the relation that depends on it, and every other callee is refused.
 */
function insideUnattributedFunction(
  node: ts.Node,
  root: ts.Node,
  invokers: readonly string[],
): boolean {
  const invokesItsArguments = (call: ts.Node): boolean => {
    if (!ts.isCallExpression(call)) {
      return false;
    }

    const callee = peel(call.expression);

    return (
      (ts.isIdentifier(callee) && invokers.includes(callee.text)) ||
      (ts.isPropertyAccessExpression(callee) &&
        invokers.includes(callee.name.text))
    );
  };

  for (
    let current: ts.Node | undefined = node.parent;
    current !== undefined && current !== root;
    current = current.parent
  ) {
    if (ts.isFunctionLike(current) && !invokesItsArguments(current.parent)) {
      return true;
    }
  }

  return false;
}

/** Fails by NAME, so a rename or a move says which anchor moved. */
function anchor(found: boolean, what: string, file: string): void {
  if (!found) {
    throw new Error(`${what} not found in src/${file} — an anchor moved`);
  }
}

function propertyName(member: ts.TypeElement, owner: string): string {
  const name = member.name;

  if (
    name !== undefined &&
    (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
  ) {
    return name.text;
  }

  throw new Error(
    `${owner}: a ${ts.SyntaxKind[member.kind]} member this walk cannot classify — ` +
      `decide whether it is a declared field before trusting this guard`,
  );
}

/**
 * The members an interface DECLARES lexically, index signatures aside.
 *
 * ⚠ Throws on `extends`. An inherited member IS a member of the type, and this
 * walk reads `node.members` only — so a base's field would be missing from the
 * "type" side and a code side that omitted it would report agreement. That is
 * the #1738 shape with the roles swapped, and it is silent: the list is merely
 * SHORTER, and no non-vacuity threshold catches a partial list.
 */
function interfaceMembers(file: string, name: string): string[] {
  const names: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      found = true;

      if (node.heritageClauses !== undefined) {
        throw new Error(
          `interface ${name} in src/${file} extends another interface — this ` +
            "walk reads lexical members only, so the inherited ones would be " +
            "missing from the type side and a shorter code side would report " +
            "agreement",
        );
      }

      for (const member of node.members) {
        if (!ts.isIndexSignatureDeclaration(member)) {
          names.push(propertyName(member, name));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `interface ${name}`, file);

  return names;
}

/**
 * The string literals of a `Pick<…, "a" | "b">` alias.
 *
 * ⚠ The SHAPE is checked, not merely harvested. Collecting every string-literal
 * type anywhere under the alias read `Pick<X, "a" | Keys>` as `["a"]` — silently
 * partial, the #1738 shape — and read `Omit<X, "a">` as `["a"]`, i.e. reported
 * the one key the alias EXCLUDES as the one it picks. Anything that is not
 * literally `Pick<Ref, <string literal | union of them>>` throws.
 */
function pickLiterals(file: string, alias: string): string[] {
  const keys: string[] = [];
  let found = false;

  const fail = (why: string): never => {
    throw new Error(
      `type ${alias} in src/${file}: ${why} — this walk reads only ` +
        '`Pick<Ref, "a" | "b">`, and harvesting the literals out of any ' +
        "other shape reports a key set the alias does not have",
    );
  };

  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === alias) {
      found = true;

      const type = node.type;

      if (
        !ts.isTypeReferenceNode(type) ||
        !ts.isIdentifier(type.typeName) ||
        type.typeName.text !== "Pick" ||
        type.typeArguments?.length !== 2
      ) {
        fail("not a two-argument `Pick<…, …>`");

        return;
      }

      const literals = (n: ts.TypeNode): void => {
        if (ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal)) {
          keys.push(n.literal.text);

          return;
        }

        if (ts.isUnionTypeNode(n)) {
          for (const member of n.types) {
            literals(member);
          }

          return;
        }

        fail(`a key selector this walk cannot read (${ts.SyntaxKind[n.kind]})`);
      };

      literals(type.typeArguments[1]);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `type ${alias}`, file);

  return keys;
}

/** The members of an inline object type on a named function's Nth parameter. */
function parameterMembers(file: string, fn: string, index: number): string[] {
  const names: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      const type = node.parameters[index]?.type;

      if (type !== undefined && ts.isTypeLiteralNode(type)) {
        found = true;

        for (const member of type.members) {
          names.push(propertyName(member, `${fn} parameter ${String(index)}`));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `${fn}'s object-typed parameter ${String(index)}`, file);

  return names;
}

/**
 * The names bound by THE object destructuring inside a named function.
 *
 * ⚠ Nested functions are not descended into, and a second destructuring throws
 * — both for `returnedLiteralKeys`' reason. "The first one found" is a walk
 * order, not a fact about the code: a helper's `const { z } = other` a line
 * above satisfied the relation for a function whose real destructure was three
 * statements down, and a rest element (`...rest`) was reported as if `rest`
 * were a declared field.
 */
function destructuredNames(file: string, fn: string): string[] {
  const names: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      const walk = (n: ts.Node): void => {
        // ⚠ A nested function's destructure is not this function's.
        if (n !== node && ts.isFunctionLike(n)) {
          return;
        }

        if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name)) {
          if (found) {
            throw new Error(
              `${fn} in src/${file}: more than one object destructuring — this ` +
                "walk cannot say which one mirrors the type, and reading the " +
                "first is a walk order, not a fact about the code",
            );
          }

          found = true;

          for (const element of n.name.elements) {
            if (element.dotDotDotToken !== undefined) {
              throw new Error(
                `${fn} in src/${file}: a rest element — its name is not a ` +
                  "declared field, and reporting it as one compares the type " +
                  "against a name the type can never have",
              );
            }

            const source = element.propertyName ?? element.name;

            if (!ts.isIdentifier(source)) {
              throw new Error(
                `${fn}: a binding element this walk cannot classify`,
              );
            }

            names.push(source.text);
          }
        }

        ts.forEachChild(n, walk);
      };

      walk(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `an object destructuring inside ${fn}`, file);

  return names;
}

/**
 * Property names assigned on `<target>.<key> = …` inside a named function.
 *
 * ⚠ Every OTHER way of writing `target` throws. Collecting only the dotted form
 * meant `patch["forwardTo"] = …`, `patch.forwardTo ??= …`,
 * `Object.assign(patch, …)`, `Object.defineProperty(patch, …)`,
 * `patch = { …patch, … }` and `const p = patch; p.x = …` each contributed
 * NOTHING and said nothing — a silently shorter list, which is the one failure
 * mode this file exists to remove. A shape it cannot read is not a shape it may
 * ignore.
 */
function assignedProperties(
  file: string,
  fn: string,
  target: string,
  invokers: readonly string[] = [],
): string[] {
  const names: string[] = [];
  let found = false;

  const fail = (why: string): never => {
    throw new Error(
      `${fn} in src/${file}: ${why} on \`${target}\` — this walk reads ` +
        "`<target>.<key> = …` only, and a write it cannot read would be " +
        "missing from the list while the relation reported agreement",
    );
  };

  /**
   * `target` reached as the object of a property or element access.
   *
   * ⚠ Through `peel`, like every other read in this file. Comparing the raw
   * `.expression` made a single `as` invisible: measured on
   * `buildStructuralPatch`, `delete (patch as Record<string, unknown>).forwardTo`
   * left the relation GREEN at 7/7 while the returned object no longer carried
   * `forwardTo`, and the byte-adjacent `delete patch.forwardTo` throws the loud
   * refusal this walk exists to give. `const alias = patch as X` and
   * `Object.assign(patch as X, …)` hid the same way.
   */
  const onTarget = (expression: ts.Expression): boolean => {
    const access = peel(expression);

    return (
      (ts.isPropertyAccessExpression(access) ||
        ts.isElementAccessExpression(access)) &&
      ts.isIdentifier(peel(access.expression)) &&
      (peel(access.expression) as ts.Identifier).text === target
    );
  };

  const mentionsTarget = (n: ts.Node): boolean => {
    let hit = ts.isIdentifier(n) && n.text === target;

    ts.forEachChild(n, (child) => {
      hit ||= mentionsTarget(child);
    });

    return hit;
  };

  /**
   * How many times `name` is BOUND anywhere inside `scope`.
   *
   * ⚠ `target` was a SPELLING, and one re-binding made every later write go to
   * a different object while this walk kept counting them. Measured on
   * `buildStructuralPatch`: wrapping the write in
   * `{ const patch: Record<string, unknown> = {}; patch.encodeParams = …; }`
   * left the relation GREEN at 7/7 while the returned patch never carried
   * `encodeParams`, and simply deleting the line reds. This is
   * `chain-walk-authority`'s `shadowsCapture` question, one file over.
   */
  const bindingCount = (scope: ts.Node, name: string): number => {
    let count = 0;

    const declared = (declaredName: ts.Node | undefined): void => {
      if (declaredName === undefined) {
        return;
      }

      if (ts.isIdentifier(declaredName)) {
        count += declaredName.text === name ? 1 : 0;

        return;
      }

      if (
        ts.isObjectBindingPattern(declaredName) ||
        ts.isArrayBindingPattern(declaredName)
      ) {
        for (const element of declaredName.elements) {
          if (ts.isBindingElement(element)) {
            declared(element.name);
          }
        }
      }
    };

    const look = (n: ts.Node): void => {
      if (
        ts.isVariableDeclaration(n) ||
        ts.isParameter(n) ||
        ts.isFunctionDeclaration(n) ||
        ts.isClassDeclaration(n) ||
        ts.isClassExpression(n) ||
        ts.isFunctionExpression(n)
      ) {
        declared(n.name);
      }

      // A `catch (x)` clause's variable IS a `VariableDeclaration`, so it is
      // already counted by the branch above.
      ts.forEachChild(n, look);
    };

    look(scope);

    return count;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      found = true;

      const bindings = bindingCount(node, target);

      if (bindings !== 1) {
        fail(
          `\`${target}\` is bound ${String(bindings)} times inside it, so a ` +
            "write to it names an object this walk cannot identify",
        );
      }

      /** `<target>.<key> = …` — the one write shape this walk can read. */
      const readableWrite = (
        n: ts.BinaryExpression,
      ): ts.PropertyAccessExpression | undefined => {
        const left = peel(n.left);

        return n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(left) &&
          ts.isIdentifier(peel(left.expression)) &&
          (peel(left.expression) as ts.Identifier).text === target
          ? left
          : undefined;
      };

      const collectAssignment = (n: ts.BinaryExpression): void => {
        const written = readableWrite(n);

        if (written !== undefined) {
          if (insideUnattributedFunction(n, node, invokers)) {
            fail("a write inside a nested function that nothing invokes");
          }

          names.push(written.name.text);

          return;
        }

        if (
          (ts.isIdentifier(peel(n.left)) &&
            (peel(n.left) as ts.Identifier).text === target) ||
          onTarget(n.left) ||
          mentionsTarget(n.left)
        ) {
          fail("an assignment this walk cannot read");
        }
      };

      const walk = (n: ts.Node): void => {
        if (
          ts.isBinaryExpression(n) &&
          n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ) {
          collectAssignment(n);
        }

        // `Object.assign(target, …)` / `Object.defineProperty(target, …)` —
        // writes that never take the `target.<key> =` form at all.
        if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          ts.isIdentifier(n.expression.expression) &&
          n.expression.expression.text === "Object" &&
          ["assign", "defineProperty", "defineProperties"].includes(
            n.expression.name.text,
          ) &&
          n.arguments[0] !== undefined &&
          ts.isIdentifier(peel(n.arguments[0])) &&
          (peel(n.arguments[0]) as ts.Identifier).text === target
        ) {
          fail(`\`Object.${n.expression.name.text}\``);
        }

        // `delete target.<key>` — a REMOVAL this list cannot represent.
        if (ts.isDeleteExpression(n) && onTarget(n.expression)) {
          fail("a `delete`");
        }

        // `const alias = target` — every later write goes through a name this
        // walk is not watching.
        if (
          ts.isVariableDeclaration(n) &&
          n.initializer !== undefined &&
          ts.isIdentifier(peel(n.initializer)) &&
          (peel(n.initializer) as ts.Identifier).text === target
        ) {
          fail("an alias binding");
        }

        ts.forEachChild(n, walk);
      };

      walk(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `function ${fn}`, file);

  return names;
}

/**
 * The `config.<map>` maps a named function touches, however it touches them —
 * `config.decoders[name]` on the read side, `clearConfigEntries(config.decoders, …)`
 * on the purge side. Keyed on the ACCESS, not on the call shape, so a third way of
 * touching a map is in scope by construction rather than by enumeration.
 */
function configMapsTouched(
  file: string,
  fn: string,
  invokers: readonly string[] = [],
): string[] {
  const names = new Set<string>();
  let found = false;

  const fail = (how: string): never => {
    throw new Error(
      `${fn} in src/${file}: \`config\` touched ${how} — this walk reads ` +
        "`config.<map>` only, and a map reached any other way would be " +
        "missing from the list while the relation reported agreement",
    );
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      found = true;

      const walk = (n: ts.Node): void => {
        if (ts.isPropertyAccessExpression(n)) {
          if (ts.isIdentifier(n.expression) && n.expression.text === "config") {
            if (insideUnattributedFunction(n, node, invokers)) {
              fail("inside a nested function that nothing invokes");
            }

            names.add(n.name.text);

            return;
          }

          // `<anything>.config.<map>` is a touch through a name this walk is
          // not watching — it reads the bare `config` binding only.
          if (n.name.text === "config") {
            fail("reached through another object");
          }

          // Never descend into `.name`: a member name is not a binding.
          walk(n.expression);

          return;
        }

        // ⚠ Any other mention of `config` is a touch this walk cannot read —
        // `config["decoders"]`, `const { decoders } = config`, `const c =
        // config`, `clearAll(config)`. Each contributed NOTHING and said
        // nothing, so a map touched only that way was missing from the list
        // while the relation reported agreement. Keyed on the ACCESS is only
        // true while every access has this one shape; the throw is what keeps
        // that so.
        if (ts.isIdentifier(n) && n.text === "config") {
          fail("as a bare binding");
        }

        ts.forEachChild(n, walk);
      };

      // The parameter LIST declares the name; only the body touches the maps.
      if (node.body !== undefined) {
        walk(node.body);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `function ${fn}`, file);

  return [...names];
}

/**
 * The keys a named function's RETURNED object literal produces, including the
 * ones contributed by a conditional spread — `...(x !== undefined && { k: v })`,
 * the shape `exactOptionalPropertyTypes` forces on an optional-field copy.
 *
 * ⚠ Throws on any other element shape rather than skipping it. A spread of a
 * variable, a computed key or a nested call each mean the copy is no longer a
 * flat enumeration this walk can read, and returning the shorter list would
 * report agreement with the type while missing exactly the member that broke it
 * — the #1738 failure this file exists to remove.
 */
/**
 * Names this file binds, at MODULE scope, to `Object.freeze` itself (#2073).
 *
 * ⚑ The capture is the same value, so it carries the same specification
 * guarantee — `Object.freeze` returns its argument. What does NOT travel is the
 * spelling, which is the only thing {@link returnedLiteralKeys} can see, so the
 * binding is resolved here instead of a second spelling being enumerated.
 *
 * ⚠ Exactly ONE declaration of the name in the whole file, and that count is the
 * safety: a `const freeze = (o) => strip(o)` local inside the walked function
 * shadows the capture for every call below it, and admitting the name on the
 * module-level declaration alone would read that stripper's argument as its
 * result — the hole this file's `objectIsShadowed` check exists to close, one
 * identifier down.
 */
function capturedFreezeNames(source: ts.SourceFile): ReadonlySet<string> {
  const declarations = new Map<string, number>();

  const count = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isBindingElement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isImportSpecifier(node) ||
        ts.isImportClause(node) ||
        ts.isNamespaceImport(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name)
    ) {
      declarations.set(
        node.name.text,
        (declarations.get(node.name.text) ?? 0) + 1,
      );
    }

    ts.forEachChild(node, count);
  };

  count(source);

  const captured = new Set<string>();

  for (const statement of source.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    ) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined &&
        ts.isPropertyAccessExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === "Object" &&
        declaration.initializer.name.text === "freeze" &&
        declarations.get(declaration.name.text) === 1
      ) {
        captured.add(declaration.name.text);
      }
    }
  }

  return captured;
}

function returnedLiteralKeys(
  file: string,
  fn: string,
  allowedBareReturns: readonly string[] = [],
): string[] {
  const names: string[] = [];
  const source = parse(file);
  // ⚑ Computed ONCE per file, before any callee is recognised by spelling.
  const objectIsShadowed = bindsName(source, "Object");
  // ⚑ And the same intrinsic reached through a module-load CAPTURE (#2073).
  const freezeAliases = capturedFreezeNames(source);
  let found = false;
  let literalReturns = 0;

  const fail = (why: string): never => {
    throw new Error(
      `${fn} in src/${file}: ${why} — the copy is no longer a flat enumeration ` +
        "this walk can read, and comparing a shorter list would report agreement " +
        "with the type while missing exactly the member that broke it",
    );
  };

  const collect = (literal: ts.ObjectLiteralExpression): void => {
    for (const element of literal.properties) {
      if (
        ts.isPropertyAssignment(element) ||
        ts.isShorthandPropertyAssignment(element)
      ) {
        const name = propertyName(element as unknown as ts.TypeElement, fn);

        // ⚠ `{ __proto__: x }` sets the PROTOTYPE; it produces no own property
        // of that name, so reporting `__proto__` as a produced key compares the
        // type against a name the object never has. (The shorthand
        // `{ __proto__ }` does produce one — hence the non-shorthand test.)
        if (name === "__proto__" && ts.isPropertyAssignment(element)) {
          fail(
            "a `__proto__:` element, which sets a prototype rather than a key",
          );
        }

        names.push(name);
        continue;
      }

      if (
        ts.isSpreadAssignment(element) &&
        ts.isParenthesizedExpression(element.expression) &&
        ts.isBinaryExpression(element.expression.expression) &&
        element.expression.expression.operatorToken.kind ===
          ts.SyntaxKind.AmpersandAmpersandToken &&
        ts.isObjectLiteralExpression(element.expression.expression.right)
      ) {
        collect(element.expression.expression.right);
        continue;
      }

      fail("a returned element this walk cannot read");
    }
  };

  /**
   * The literal a return hands back, seeing through `Object.freeze(...)` — and
   * through NOTHING else.
   *
   * ⚠ The predicate is the CALLEE, not the arity. Keyed on
   * `arguments.length === 1` this admitted EVERY one-argument call ever written
   * — `strip({…})`, `helpers.strip({…})`, `maybe?.({…})`, an IIFE — and read the
   * argument as if it were the result. Measured: swapping `Object.freeze` for a
   * helper that deletes one field left this relation GREEN while the snapshot
   * shipped three formats of four and the router silently fell back to the
   * fourth's default. That is the #1738 failure reproduced THROUGH the guard
   * written to prevent it.
   *
   * `Object.freeze` is transparent because it returns its argument unchanged, by
   * specification. No other callee carries that guarantee, so no other callee may
   * be seen through — an unrecognised wrapper throws, per this file's doctrine,
   * rather than reporting the argument's keys as the return's.
   */
  const literalOf = (
    outer: ts.Expression,
  ): ts.ObjectLiteralExpression | undefined => {
    const expression = peel(outer);

    if (ts.isObjectLiteralExpression(expression)) {
      return expression;
    }

    // ⚑ A module-load CAPTURE of the same intrinsic (#2073). `const freeze =
    // Object.freeze;` IS `Object.freeze` — the return-its-argument guarantee
    // travels with the VALUE, not with the spelling — and #2073 moved every
    // runtime freeze in core onto such a binding, which reds this relation on a
    // rename that changes no behaviour. Admitted only when the name is declared
    // exactly ONCE in the file, so a local of the same name inside the walked
    // function cannot make this read a stripper's argument as its result.
    if (
      ts.isCallExpression(expression) &&
      expression.questionDotToken === undefined &&
      ts.isIdentifier(expression.expression) &&
      freezeAliases.has(expression.expression.text) &&
      expression.arguments.length === 1 &&
      ts.isObjectLiteralExpression(peel(expression.arguments[0]))
    ) {
      if (objectIsShadowed) {
        fail(
          "`Object` is BOUND in this file, so the captured `Object.freeze` " +
            "names something with no return-its-argument guarantee",
        );
      }

      return peel(expression.arguments[0]) as ts.ObjectLiteralExpression;
    }

    if (
      ts.isCallExpression(expression) &&
      // `Object.freeze?.(…)` and `Object?.freeze(…)` are different expressions
      // with a different failure mode; neither is the shape this sees through.
      expression.questionDotToken === undefined &&
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.questionDotToken === undefined &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === "Object" &&
      expression.expression.name.text === "freeze" &&
      expression.arguments.length === 1 &&
      ts.isObjectLiteralExpression(peel(expression.arguments[0]))
    ) {
      // ⚑ The SPELLING `Object.freeze` is only the global while nothing in the
      // file binds that name. One shadow and this reads a stripper's argument
      // as its result — the very hole an arity-keyed predicate had.
      if (objectIsShadowed) {
        fail(
          "`Object` is BOUND in this file, so `Object.freeze` names something " +
            "with no return-its-argument guarantee",
        );
      }

      return peel(expression.arguments[0]) as ts.ObjectLiteralExpression;
    }

    return undefined;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      found = true;

      const walk = (n: ts.Node): void => {
        // ⚠ Do NOT descend into a nested function: its `return` would be
        // collected as if it were this function's, so a helper's literal could
        // satisfy the relation for a caller that discards it.
        if (n !== node && ts.isFunctionLike(n)) {
          return;
        }

        if (ts.isReturnStatement(n)) {
          const expression = n.expression;

          if (expression === undefined) {
            return fail("a bare `return`");
          }

          const literal = literalOf(expression);

          if (literal === undefined) {
            // A named constant is the one other readable form — the absence
            // case. It must be declared as allowed, by name, at the call site.
            const bare = peel(expression);

            if (
              !ts.isIdentifier(bare) ||
              !allowedBareReturns.includes(bare.text)
            ) {
              return fail(
                "a `return` that is neither an object literal, an " +
                  "`Object.freeze(…)` of one, nor an allowed constant",
              );
            }

            return;
          }

          literalReturns += 1;

          if (literalReturns > 1) {
            // ⚑ The union across returns is what let a snapshot that dropped two
            // fields on EVERY path report the full key set: one branch named
            // them, another shipped. One literal return, or this walk cannot say
            // which one the caller gets.
            return fail("more than one object-literal `return`");
          }

          collect(literal);
        }

        ts.forEachChild(n, walk);
      };

      walk(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  anchor(found, `function ${fn}`, file);

  if (literalReturns === 0) {
    fail("no object-literal `return` at all");
  }

  return names;
}

interface Relation {
  readonly label: string;
  readonly why: string;
  readonly type: () => string[];
  readonly code: () => string[];
}

const ROUTES_STORE = "namespaces/RoutesNamespace/routesStore.ts";
const ROUTES_API = "api/getRoutesApi.ts";

const RELATIONS: Relation[] = [
  {
    label: "search-params Options ↔ snapshotQueryParams' copy",
    why: "a format field the snapshot does not name is dropped from what the matcher resolves, so the router silently falls back to that format's default — and the caller's own getOptions() still echoes the value they set, so the two disagree with nothing said",
    type: () => interfaceMembers("engine/search-params/types.ts", "Options"),
    code: () =>
      returnedLiteralKeys("Router.ts", "snapshotQueryParams", [
        "EMPTY_QUERY_PARAMS",
      ]),
  },
  {
    label: "RouteConfigUpdate ↔ commitRouteUpdate's destructure",
    why: "a patchable field the destructure does not name is silently ignored by update()",
    type: () => interfaceMembers("types/router.ts", "RouteConfigUpdate"),
    code: () => destructuredNames(ROUTES_STORE, "commitRouteUpdate"),
  },
  {
    label: "TreeStructuralPatch ↔ buildStructuralPatch's branches",
    why: "a structural field without a branch never reaches TREE_CHANGED, so subscribeChanges consumers never revalidate on it — the exact half INVARIANTS Route-Management #4 named four of five of",
    type: () => pickLiterals("types/tree-changed.ts", "TreeStructuralPatch"),
    code: () => assignedProperties(ROUTES_API, "buildStructuralPatch", "patch"),
  },
  {
    label: "RouteConfig ↔ the maps get()'s reconstruction reads",
    why: "a config map assignRouteConfig does not read is invisible to getRoutesApi(router).get(name), so the route it returns cannot round-trip through add()/replace()",
    type: () =>
      interfaceMembers("namespaces/RoutesNamespace/types.ts", "RouteConfig"),
    code: () => configMapsTouched(ROUTES_API, "assignRouteConfig"),
  },
  {
    label: "RouteConfig ↔ the maps remove() purges",
    why: "a config map clearRouteConfigurations does not purge keeps the removed route's entry, and a later add() of the same name inherits it",
    type: () =>
      interfaceMembers("namespaces/RoutesNamespace/types.ts", "RouteConfig"),
    // `clearConfigEntries` is declared here, by name, because it is the one
    // callee whose function argument this relation needs attributed — and
    // because it demonstrably invokes it (`if (matcher(key)) delete …`).
    code: () =>
      configMapsTouched(ROUTES_API, "clearRouteConfigurations", [
        "clearConfigEntries",
      ]),
  },
  {
    label: "RouteConfigUpdate ↔ the three commit paths that write it",
    why: "a destructured field that no commit path writes is dropped after being read — the scalars go through commitScalarConfig, forwardTo through prepareForwardTo's plan, the two guards through commitGuardUpdate",
    type: () => interfaceMembers("types/router.ts", "RouteConfigUpdate"),
    code: () => [
      ...parameterMembers(ROUTES_STORE, "commitScalarConfig", 2),
      "forwardTo",
      "canActivate",
      "canDeactivate",
    ],
  },
];

describe("Type-mirror authority — a hand-written enumeration equals its type", () => {
  it("the relation table is non-empty", () => {
    // Non-vacuity for the table itself: `it.each([])` registers zero cells and the
    // file passes on nothing. Measured on the #1738 guard — emptying its name list
    // took it from 22 tests to 1, green.
    // ⚠ Bump this WITH the table. It was written tight at 5 rows, so losing any
    // one relation reds; a sixth row added without bumping it let an OLD relation
    // be deleted in silence (measured: 6 passed, fully green).
    expect(RELATIONS.length).toBeGreaterThan(5);
  });

  it.each(RELATIONS.map((relation) => [relation.label, relation] as const))(
    "%s",
    (_label, relation) => {
      const type = relation.type();
      const code = relation.code();

      // Non-vacuity per relation, before any comparison: two empty lists are
      // "equal" and prove nothing.
      expect(type.length).toBeGreaterThan(0);
      expect(code.length).toBeGreaterThan(0);

      // Both directions, and each failure names the offending member rather than
      // printing two lists to diff by eye.
      expect(code.filter((name) => !type.includes(name))).toStrictEqual([]);
      expect(type.filter((name) => !code.includes(name))).toStrictEqual([]);
    },
  );
});
