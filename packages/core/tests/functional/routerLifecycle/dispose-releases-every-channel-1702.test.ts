// `dispose()` closes the router's outer scope as a hand-written sequence of
// statements, and its completeness has been asserted the same way — one named
// test per step. That arrangement has already failed once: `ctx.interceptors`
// was the THIRD per-plugin registration channel and reached the safety net only
// because an audit probe found it missing (#1199), long after the other two,
// with the two already in place reading like a complete set.
//
// #1702 is the same shape one iteration later: two steps had no test at all —
// deleting `ctx.contextClaimRecords.clear()` or `#routeLifecycle.clearAll()`
// left the whole suite green and coverage at 100 %. Coverage cannot help and
// never could: both statements execute on every `dispose()`, so line and branch
// coverage are satisfied by any test that disposes a router, and nothing
// asserted their EFFECT. That effect is RETENTION, not wrong behaviour, which
// is why no functional test could see it either.
//
// The two behavioural pins now live beside their siblings in `dispose.test.ts`.
// What is here is the other half — the part that stops the LIST from going
// stale again. Both scans below derive the channel set from the source rather
// than restating it, so a channel added without a release line fails HERE
// rather than at the next audit.
//
// ⚠ Neither scan is a substitute for the other: the first knows nothing about
// state a namespace holds privately, and the second knows nothing about the
// `RouterInternals` surface.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../../src");
const ROUTER_FILE = path.join(SRC, "Router.ts");
const INTERNALS_FILE = path.join(SRC, "internals.ts");
const NAMESPACES_DIR = path.join(SRC, "namespaces");

const COLLECTIONS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/**
 * A GROWABLE registry, by its type node.
 *
 * An `ArrayType` counts and a `TupleType` does not — the latter is a
 * fixed-shape record, and `RouteLifecycleNamespace` holds exactly one
 * (`#functionsTuple: [Map, Map]`, the cached `getFunctions()` pair). Emptying
 * that would break the accessor, and both Maps inside it are released on their
 * own account anyway. A function type is excluded for the same reason of
 * precision: `getQueryParams: (name: string) => readonly string[]` RETURNS an
 * array, it does not hold one.
 */
function isCollectionType(type: ts.TypeNode): boolean {
  return (
    ts.isArrayTypeNode(type) ||
    (ts.isTypeReferenceNode(type) && COLLECTIONS.has(type.typeName.getText()))
  );
}

// ============================================================================
// 1. The RouterInternals surface — every channel a plugin can write into
// ============================================================================

/** Members of `RouterInternals` that hold a mutable collection. */
function internalsChannels(source: ts.SourceFile): string[] {
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === "RouterInternals"
    ) {
      for (const member of node.members) {
        if (
          ts.isPropertySignature(member) &&
          ts.isIdentifier(member.name) &&
          member.type !== undefined &&
          isCollectionType(member.type)
        ) {
          found.push(member.name.text);
        }
      }
    }

    node.forEachChild(visit);
  };

  visit(source);

  return found;
}

/** `ctx.<member>` names appearing anywhere in `dispose()`'s body. */
function ctxTouchedByDispose(source: ts.SourceFile): string[] {
  const found = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name.getText() === "dispose") {
      const inner = (child: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(child) &&
          child.expression.getText() === "ctx"
        ) {
          found.add(child.name.getText());
        }

        child.forEachChild(inner);
      };

      node.body?.forEachChild(inner);
    }

    node.forEachChild(visit);
  };

  visit(source);

  return [...found];
}

const sorted = (values: string[]): string[] =>
  values.toSorted((a, b) => a.localeCompare(b));

describe("#1702 — every RouterInternals channel is released by dispose()", () => {
  const channels = internalsChannels(parse(INTERNALS_FILE));
  const released = ctxTouchedByDispose(parse(ROUTER_FILE));

  it("finds the channels at all", () => {
    // POSITIVE CONTROL for both scans. Without it a renamed interface or a
    // renamed method would assert two empty lists against each other and pass.
    expect(channels.length).toBeGreaterThan(0);
    expect(released.length).toBeGreaterThan(0);
  });

  it("the two sets are the same set", () => {
    // Both directions matter. A fourth channel added to `RouterInternals`
    // without a release line reds this; so does deleting one of the three
    // release lines — which is how `ctx.contextClaimRecords.clear()` could be
    // dropped with the whole suite still green.
    expect(sorted(released)).toStrictEqual(sorted(channels));
  });

  it("names them, so a change to the set is a decision and not a diff", () => {
    expect(sorted(channels)).toStrictEqual([
      "contextClaimRecords",
      "interceptors",
      "routerExtensions",
    ]);
  });
});

// ============================================================================
// 2. The namespaces — state dispose() cannot see from the outside
// ============================================================================

interface Teardown {
  readonly className: string;
  readonly method: string;
}

function tsFilesUnder(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);

    if (statSync(full).isDirectory()) {
      out.push(...tsFilesUnder(full));
    } else if (full.endsWith(".ts")) {
      out.push(full);
    }
  }

  return out;
}

/** Names released inside one method body — `x.clear()` and `x.length = 0`. */
function releasedIn(method: ts.MethodDeclaration): Set<string> {
  const names = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.getText() === "clear"
    ) {
      names.add(node.expression.expression.getText().replace("this.", ""));
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.getText() === "length" &&
      node.right.getText() === "0"
    ) {
      names.add(node.left.expression.getText().replace("this.", ""));
    }

    node.forEachChild(visit);
  };

  method.body?.forEachChild(visit);

  return names;
}

/**
 * A namespace method that releases EVERY collection field its class declares —
 * i.e. a whole-namespace teardown rather than a partial one. The distinction is
 * derived, not listed: `RouteLifecycleNamespace.clearDefinitionGuards` releases
 * the definition-side factories alone and is correctly not one of these.
 */
function fullTeardowns(source: ts.SourceFile): Teardown[] {
  const found: Teardown[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      found.push(...teardownsOf(node, node.name.text));
    }

    node.forEachChild(visit);
  };

  visit(source);

  return found;
}

/**
 * Collection fields the class declares. The annotation is authoritative when
 * present; only a field left to inference is judged by its `new Map()` /
 * `new Set()` initializer, which is how `PluginsNamespace` declares both of
 * its own.
 */
function collectionFields(node: ts.ClassDeclaration): string[] {
  const isDeclaredCollection = (m: ts.ClassElement): boolean => {
    if (!ts.isPropertyDeclaration(m)) {
      return false;
    }

    if (m.type !== undefined) {
      return isCollectionType(m.type);
    }

    return (
      m.initializer !== undefined &&
      ts.isNewExpression(m.initializer) &&
      COLLECTIONS.has(m.initializer.expression.getText())
    );
  };

  return node.members
    .filter((m) => isDeclaredCollection(m))
    .map((m) => {
      // `filter` above already established this is a named property.
      const named = m as ts.PropertyDeclaration;

      return named.name.getText();
    });
}

function teardownsOf(node: ts.ClassDeclaration, className: string): Teardown[] {
  const fields = collectionFields(node);

  if (fields.length === 0) {
    return [];
  }

  const isFull = (member: ts.ClassElement): boolean => {
    if (!ts.isMethodDeclaration(member)) {
      return false;
    }

    const released = releasedIn(member);

    return released.size > 0 && fields.every((f) => released.has(f));
  };

  return node.members
    .filter((member) => isFull(member))
    .map((member) => ({ className, method: member.name?.getText() ?? "" }));
}

/**
 * `RouteLifecycleNamespace` → `this.#routeLifecycle`, read off the Router's own
 * private field annotations.
 *
 * The pair is what makes the next assertion discriminate. Matching a bare
 * method NAME does not: `clearAll` is the teardown of two different namespaces,
 * so deleting `this.#routeLifecycle.clearAll()` left the name in the set —
 * contributed by `#eventBus` — and the check passed on a genuinely broken
 * `dispose()`. Found by mutation, not by reading.
 */
function namespaceFields(source: ts.SourceFile): Map<string, string> {
  const fields = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === "Router") {
      for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member) || member.type === undefined) {
          continue;
        }

        const { type } = member;

        if (!ts.isTypeReferenceNode(type)) {
          continue;
        }

        const className = type.typeName.getText();

        if (className.endsWith("Namespace")) {
          fields.set(className, member.name.getText());
        }
      }
    }

    node.forEachChild(visit);
  };

  visit(source);

  return fields;
}

/** `this.#ns.<method>` pairs called by `dispose()`, as `"#ns.method"`. */
function namespaceCallsInDispose(source: ts.SourceFile): Set<string> {
  const found = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name.getText() === "dispose") {
      const inner = (child: ts.Node): void => {
        if (ts.isPropertyAccessExpression(child)) {
          const receiver = child.expression.getText();

          if (receiver.startsWith("this.#")) {
            found.add(
              `${receiver.replace("this.", "")}.${child.name.getText()}`,
            );
          }
        }

        child.forEachChild(inner);
      };

      node.body?.forEachChild(inner);
    }

    node.forEachChild(visit);
  };

  visit(source);

  return found;
}

describe("#1702 — every namespace-wide teardown is called by dispose()", () => {
  const teardowns = tsFilesUnder(NAMESPACES_DIR).flatMap((file) =>
    fullTeardowns(parse(file)),
  );
  const routerSource = parse(ROUTER_FILE);
  const called = namespaceCallsInDispose(routerSource);
  const fields = namespaceFields(routerSource);

  it("the set of whole-namespace teardowns is exactly these", () => {
    // POSITIVE CONTROL and closed set in one. The membership is DERIVED — a
    // method qualifies only while it still releases every collection its class
    // declares — so adding an eleventh Map to `RouteLifecycleNamespace` without
    // extending `clearAll()` drops it from this list and reds the assertion.
    // That is the failure #1702 is about, caught one level below dispose().
    expect(
      teardowns
        .map((t) => `${t.className}.${t.method}`)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([
      "EventBusNamespace.clearAll",
      "PluginsNamespace.disposeAll",
      "RouteLifecycleNamespace.clearAll",
    ]);
  });

  it("dispose() calls every one of them", () => {
    // A new namespace holding per-router registrations, wired in and given a
    // teardown that nobody calls, reds here — the #1199 shape, which was a
    // channel that existed and was never released.
    for (const teardown of teardowns) {
      const field = fields.get(teardown.className);

      expect(
        field,
        `${teardown.className} is not a private field of Router`,
      ).toBeDefined();

      expect(
        called.has(`${field}.${teardown.method}`),
        `dispose() never calls ${field}.${teardown.method}() (${teardown.className})`,
      ).toBe(true);
    }
  });
});
