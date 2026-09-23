/**
 * Every `RouterError` core builds reaches a caller frozen (#1960) and keeps the
 * fields it was built with (#2538), and this file makes each construction site
 * say HOW.
 *
 * ⚑ The obligation is site-level here, which is the gap #2528 measured:
 * `thrown-error-freeze-authority-1960` is organised by consumer-facing CHANNEL, so a
 * construction no listed channel reaches ships unfrozen green. #2528 owns the
 * measurement of how many sites that leaves unwatched; this file owns the inventory.
 *
 * A site is settled when the freeze happens AT CONSTRUCTION: the construction is
 * the argument of `freezeThrownError`, a raiser tag (`code()` freezes what it
 * builds), or a module const that a top-level statement of the same file
 * freezes. Every other site is listed below with what it does instead —
 * `toStrictEqual`, so one cannot appear or disappear unnoticed.
 *
 * ⚑ The bag fields are held the same way, one axis over (#2538). The behavioural
 * cells read what a consumer RECEIVES, code by code; the field list below is what
 * reds when a field leaves a site no cell reaches.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { refusalSites } from "../helpers";

import type { RefusalSite } from "../helpers";

const SRC = path.resolve(__dirname, "../../../src");

interface Site {
  /** `file · code · form` — what the freeze list keys on. */
  readonly key: string;
  readonly built: RefusalSite["form"];
  readonly settled: boolean;
  /** `file · where · code · fields`, for a site whose bag carries any. */
  readonly fields: string | undefined;
}

const byText = (left: string, right: string): number =>
  left.localeCompare(right);

/** `freeze(name)` or `Object.freeze(name)`, as a statement of its own. */
const freezesByName = (
  statement: ts.Statement,
  name: string,
  source: ts.SourceFile,
): boolean => {
  if (
    !ts.isExpressionStatement(statement) ||
    !ts.isCallExpression(statement.expression)
  ) {
    return false;
  }

  const call = statement.expression;
  const [argument] = call.arguments;

  return (
    /^(?:Object\.)?freeze$/.test(call.expression.getText(source)) &&
    call.arguments.length === 1 &&
    ts.isIdentifier(argument) &&
    argument.text === name
  );
};

/**
 * A module const that a TOP-LEVEL statement of the same file freezes. Both
 * halves at the top level is what makes the name one binding: a function-local
 * `const err` is never settled by a freeze written elsewhere in its file.
 */
const isFrozenModuleConst = (
  declaration: ts.VariableDeclaration,
  source: ts.SourceFile,
): boolean => {
  const statement = declaration.parent.parent;

  return (
    ts.isIdentifier(declaration.name) &&
    ts.isVariableStatement(statement) &&
    statement.parent === source &&
    source.statements.some((candidate) =>
      freezesByName(
        candidate,
        (declaration.name as ts.Identifier).text,
        source,
      ),
    )
  );
};

/** What holds the construction, and whether that freezes it on the spot. */
function freezeForm(site: RefusalSite): { form: string; settled: boolean } {
  if (site.form === "tag") {
    return { form: "raiser", settled: true };
  }

  const parent = site.node.parent;

  if (
    ts.isCallExpression(parent) &&
    parent.expression.getText(site.source) === "freezeThrownError"
  ) {
    return { form: "wrapped", settled: true };
  }

  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return isFrozenModuleConst(parent, site.source)
      ? { form: "frozen-const", settled: true }
      : { form: `const ${parent.name.text}`, settled: false };
  }

  if (ts.isReturnStatement(parent)) {
    return { form: "return", settled: false };
  }

  if (ts.isConditionalExpression(parent)) {
    return { form: "ternary", settled: false };
  }

  if (ts.isBinaryExpression(parent)) {
    return { form: "?? fallback", settled: false };
  }

  return { form: "other", settled: false };
}

/** The bag's entries other than `message`, as written. */
function fieldsOf(bag: ts.Expression | undefined, source: ts.SourceFile) {
  if (bag === undefined) {
    return [];
  }

  if (!ts.isObjectLiteralExpression(bag)) {
    return [`<${bag.getText(source)}>`];
  }

  return bag.properties.flatMap((property) => {
    if (ts.isSpreadAssignment(property)) {
      return [`...${property.expression.getText(source)}`];
    }

    const name = property.name.getText(source);

    return name === "message" ? [] : [name];
  });
}

/** The nearest name around a site: its function, method, or binding. */
function whereOf(node: ts.Node, source: ts.SourceFile): string {
  for (
    let current = node.parent;
    current !== source;
    current = current.parent
  ) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) &&
      current.name !== undefined
    ) {
      return current.name.getText(source);
    }

    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      (ts.isVariableDeclaration(current.parent) ||
        ts.isPropertyAssignment(current.parent))
    ) {
      return current.parent.name.getText(source);
    }
  }

  return "(module)";
}

function sites(root: string): Site[] {
  return refusalSites(root).map((site) => {
    const code = (site.code?.getText(site.source) ?? "?").replace(
      "errorCodes.",
      "",
    );
    const { form, settled } = freezeForm(site);
    const fields = fieldsOf(site.bag, site.source);

    return {
      key: `${site.file} · ${code} · ${form}`,
      built: site.form,
      settled,
      fields:
        fields.length === 0
          ? undefined
          : `${site.file} · ${whereOf(site.node, site.source)} · ${code} · ${fields.join(", ")}`,
    };
  });
}

/**
 * What each unsettled site does instead of freezing at construction, and why
 * that still hands consumer code a frozen error.
 */
const DEFERRED: ReadonlyMap<string, string> = new Map([
  [
    "namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts · ROUTE_NOT_FOUND · const err",
    "thrown through `freezeThrownError` below, with no report in between — the comment above the site says why none is emitted",
  ],
  [
    "namespaces/NavigationNamespace/transition/errorHandling.ts · code as string · const copy",
    "a re-coded copy: `setCode` and `stack` are written after construction, so the freeze cannot move there — it happens at the throw",
  ],
  [
    "namespaces/EventBusNamespace/EventBusNamespace.ts · ROUTER_DISPOSED · return",
    "`#refuseSystemCommit`'s DISPOSED return; its caller wraps the return in `freezeThrownError`, which is what #2507's two-cell mutation pins",
  ],
  [
    "namespaces/EventBusNamespace/EventBusNamespace.ts · ROUTER_NOT_STARTED · return",
    "`#refuseSystemCommit`'s phase return, frozen by the same caller wrapper",
  ],
]);

/**
 * Every site whose bag carries something beside `message`, and what it carries.
 * A dropped field, a new field-carrying site and a site that stops carrying
 * fields all change this list.
 *
 * ⚠ `RouterError.ts · code` is the raiser forwarding its caller's `fields`: every
 * tag's bag reaches the error through that spread, so it is listed like a site.
 */
const FIELDS: readonly string[] = [
  "namespaces/EventBusNamespace/EventBusNamespace.ts · onAbort · TRANSITION_CANCELLED · reason",
  "namespaces/NavigationNamespace/NavigationNamespace.ts · #navigate · ROUTE_NOT_FOUND · routeName",
  "namespaces/NavigationNamespace/NavigationNamespace.ts · #navigateToState · ROUTE_NOT_FOUND · routeName",
  "namespaces/NavigationNamespace/NavigationNamespace.ts · #navigateToState · WRONG_CHANNEL · routeName",
  "namespaces/NavigationNamespace/transition/completeTransition.ts · completeTransition · ROUTE_NOT_FOUND · routeName",
  "namespaces/NavigationNamespace/transition/errorHandling.ts · asCancellation · TRANSITION_CANCELLED · reason",
  "namespaces/NavigationNamespace/transition/errorHandling.ts · resolveAsyncGuard · errorCode · segment",
  "namespaces/NavigationNamespace/transition/errorHandling.ts · rethrowAsRouterError · code as string · ...meta",
  "namespaces/NavigationNamespace/transition/errorHandling.ts · rethrowAsRouterError · errorCode · <wrapSyncError(error, segment)>",
  "namespaces/NavigationNamespace/transition/executeNavigation.ts · abortPreviousNavigation · TRANSITION_CANCELLED · reason",
  "namespaces/NavigationNamespace/transition/executeNavigation.ts · finishAsyncNavigation · TRANSITION_CANCELLED · reason",
  "namespaces/NavigationNamespace/transition/guardPhase.ts · runStep · errorCode · segment",
  "namespaces/NavigationNamespace/transition/navigateToNotFound.ts · commitNotFound · CANNOT_DEACTIVATE · path",
  // Two sites, one per match: before the boot window and after it moved the root.
  "namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts · start · ROUTE_NOT_FOUND · path",
  "namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts · start · ROUTE_NOT_FOUND · path",
  "Router.ts · systemCommit · ROUTE_NOT_FOUND · routeName",
  "RouterError.ts · code · code · ...fields",
];

describe("every RouterError core builds says how it reaches a caller frozen (#2528)", () => {
  const inventory = sites(SRC);

  it("every construction is settled at build time or listed with its reason", () => {
    const unsettled = inventory
      .filter((site) => !site.settled)
      .map((site) => site.key)
      .toSorted(byText);

    expect(unsettled).toStrictEqual([...DEFERRED.keys()].toSorted(byText));
  });

  it("FLOOR — most constructions still freeze at build time", () => {
    // Without this the assertion above passes on a scan that has stopped seeing
    // the settled majority, which is the shape a table-and-equality guard fails
    // in. Counted over `new` alone: the tags are settled by construction and
    // would carry the floor on their own.
    expect(
      inventory.filter((site) => site.built === "new" && site.settled).length,
    ).toBeGreaterThan(18);
  });

  it("every field a refusal carries is listed with its site (#2538)", () => {
    expect(
      inventory.flatMap((site) => site.fields ?? []).toSorted(byText),
    ).toStrictEqual([...FIELDS].toSorted(byText));
  });

  it("CONTROL — the scan classifies planted sites in both polarities", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "freeze-authority-"));

    try {
      writeFileSync(
        path.join(directory, "planted.ts"),
        [
          "const wrapped = freezeThrownError(new RouterError(errorCodes.A));",
          "const bare = new RouterError(errorCodes.B);",
          "const tagged = at.code(errorCodes.C, { routeName })`c`;",
          "const copied = freezeThrownError(new RouterError(errorCodes.D, { ...meta, message }));",
          // The same NAME twice: frozen at the top level, and a function-local
          // binding the top-level freeze does not reach.
          "const err = new RouterError(errorCodes.E);",
          "Object.freeze(err);",
          "function local() { const err = new RouterError(errorCodes.F); throw err; }",
        ].join("\n"),
      );

      const planted = sites(directory);

      expect(
        planted
          .map(({ key, settled }) => ({ key, settled }))
          .toSorted((left, right) => byText(left.key, right.key)),
      ).toStrictEqual([
        { key: "planted.ts · A · wrapped", settled: true },
        { key: "planted.ts · B · const bare", settled: false },
        { key: "planted.ts · C · raiser", settled: true },
        { key: "planted.ts · D · wrapped", settled: true },
        { key: "planted.ts · E · frozen-const", settled: true },
        { key: "planted.ts · F · const err", settled: false },
      ]);
      expect(
        planted.flatMap((site) => site.fields ?? []).toSorted(byText),
      ).toStrictEqual([
        "planted.ts · (module) · C · routeName",
        "planted.ts · (module) · D · ...meta",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
