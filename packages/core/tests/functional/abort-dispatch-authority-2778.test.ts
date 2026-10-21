// #2778, structural half — every abort of a navigation's controller that runs
// listeners while core still settles a navigation goes through the counted
// `EventBusNamespace.dispatchAbort`.
//
// `abort()` dispatches the signal's `abort` listeners synchronously, and the
// signal was handed to application code. An abort written straight on a
// controller is a dispatch the reentrancy ban cannot see: a navigation started
// from one of those listeners runs to completion inside the cancel or the
// failure that aborted it. The behavioural pins live in
// `navigation/reentrant-start-and-abort-2778.test.ts`; this file holds the SHAPE,
// so a new raw abort reds on the day it is written.
//
// Two raw aborts stay, each for a reason the scan names:
// - `openController` aborts a controller it has just created, so nothing has
//   had the chance to listen to it;
// - `finishAsyncNavigation` releases its controller in a `finally`, after
//   `routeTransitionError`, so a navigation started from that abort is a new
//   one (pinned in the behavioural file).
//
// ⚠ The scan reads NAMES. An abort reached through a key held in a variable
// (`controller[key]()`) or through `Reflect.get` is out of its reach, and so is
// the position of an abort inside its owner: the behavioural file pins where
// `finishAsyncNavigation`'s release sits.

import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../src");

/**
 * Where a raw `abort` may stand — keyed by file AND owner, so a helper of the
 * same name elsewhere is not admitted — and why.
 */
const RAW_ABORT_OWNERS = new Map([
  [
    "namespaces/EventBusNamespace/EventBusNamespace.ts › dispatchAbort",
    "the counted primitive itself",
  ],
  [
    "namespaces/NavigationNamespace/transition/executeNavigation.ts › openController",
    "a controller nothing has listened to yet",
  ],
  [
    "namespaces/NavigationNamespace/transition/executeNavigation.ts › finishAsyncNavigation",
    "a release after routeTransitionError",
  ],
]);

interface AbortSite {
  readonly site: string;
  readonly text: string;
}

/** The name a function-like `node` is known by, when it has one. */
function nameOf(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return node.name?.getText();
  }

  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }

  if (!ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) {
    return undefined;
  }

  if (node.name !== undefined) {
    return node.name.getText();
  }

  // An anonymous function takes the name of what it is assigned to: a `const`,
  // a class field or a property of an object literal.
  const holder = node.parent;

  if (
    ts.isVariableDeclaration(holder) ||
    ts.isPropertyDeclaration(holder) ||
    ts.isPropertyAssignment(holder)
  ) {
    return holder.name.getText();
  }

  return undefined;
}

/** The name of the nearest named function-like around `node`. */
function ownerOf(node: ts.Node): string {
  for (
    let current = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    const name = nameOf(current);

    if (name !== undefined) {
      return name;
    }
  }

  return "<module>";
}

/** Is `node` the object pattern of a destructuring ASSIGNMENT (`({ a } = b)`)? */
function isAssignedPattern(node: ts.Node): boolean {
  const { parent } = node;

  return (
    ts.isObjectLiteralExpression(node) &&
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
}

/** Does `node` read a member called `abort` by its NAME? */
function readsAbort(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === "abort";
  }

  if (ts.isElementAccessExpression(node)) {
    return (
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === "abort"
    );
  }

  // `const { abort } = controller` and `const { abort: stop } = controller`.
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    return (node.propertyName ?? node.name).getText() === "abort";
  }

  // `({ abort } = controller)` and `({ abort: stop } = controller)`.
  if (
    (ts.isShorthandPropertyAssignment(node) || ts.isPropertyAssignment(node)) &&
    isAssignedPattern(node.parent)
  ) {
    return node.name.getText() === "abort";
  }

  return false;
}

/**
 * Every READ of a member called `abort` by its name, not only every call: an
 * alias (`const stop = controller.abort`), a literal key or a destructuring
 * would otherwise take the abort out of sight, and a scan that skips a form
 * reports a SHORTER list rather than an empty one.
 */
function abortSites(file: string, text: string): AbortSite[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const sites: AbortSite[] = [];

  const visit = (node: ts.Node): void => {
    if (readsAbort(node)) {
      sites.push({
        site: `${path.relative(SRC, file)} › ${ownerOf(node)}`,
        text: node.getText(source),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return sites;
}

/** The owners of every `recordNavigationEnd(<…>.signal.reason)` call. */
function signalReasonRecords(file: string, text: string): string[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const owners: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "recordNavigationEnd" &&
      (node.arguments[0]?.getText(source) ?? "").endsWith(".signal.reason")
    ) {
      owners.push(`${path.relative(SRC, file)} › ${ownerOf(node)}`);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return owners;
}

describe("#2778 — an abort of a navigation's controller is a counted dispatch", () => {
  const sites = globSync(`${SRC}/**/*.ts`).flatMap((file) =>
    abortSites(file, readFileSync(file, "utf8")),
  );

  it("finds every abort in src — the scan is not vacuously green", () => {
    // One site per owner. Adding one is a decision about the reentrancy ban's
    // reach, so it lands here on purpose.
    expect(sites).toHaveLength(RAW_ABORT_OWNERS.size);
    expect(new Set(sites.map(({ site }) => site))).toStrictEqual(
      new Set(RAW_ABORT_OWNERS.keys()),
    );
  });

  it("aborts nowhere else", () => {
    expect(
      sites.filter(({ site }) => !RAW_ABORT_OWNERS.has(site)),
    ).toStrictEqual([]);
  });

  it("every owner of a raw abort records what the signal then holds as the navigation's end", () => {
    // A request bound to a navigation's signal rejects with `signal.reason`. A
    // guard of ANOTHER navigation waiting on it tells that reason from its own
    // quiet cancel only through `navigationEnds.ts`, so an abort that skips
    // the record hands it a reason it reads as its own.
    const recorded = globSync(`${SRC}/**/*.ts`).flatMap((file) =>
      signalReasonRecords(file, readFileSync(file, "utf8")),
    );

    expect(new Set(recorded)).toStrictEqual(new Set(RAW_ABORT_OWNERS.keys()));
  });

  it("sees an alias, a literal key and a destructuring, not only a call", () => {
    // Synthetic source: no edit of `src` can show that the scan reads the forms
    // `src` happens not to use.
    const sample = `
      function aliased(controller: AbortController) {
        const stop = controller.abort;
        controller["abort"]();
        stop.call(controller);
        const { abort } = controller;
        const { abort: halt } = controller;
        let later: () => void;
        ({ abort: later } = controller);
        const { signal } = controller;
        // An object that merely HAS a key called abort is not a read of one.
        const options = { abort: true };
        const fallback = { abort: later } || options;
      }
    `;

    expect(
      abortSites(path.join(SRC, "sample.ts"), sample).map(({ text }) => text),
    ).toStrictEqual([
      "controller.abort",
      'controller["abort"]',
      "abort",
      "abort: halt",
      "abort: later",
    ]);
  });

  it("names the owner of every function form", () => {
    const sample = `
      function declared(c: AbortController) { c.abort(); }
      const arrow = (c: AbortController) => { c.abort(); };
      const expressed = function (c: AbortController) { c.abort(); };
      class Holder {
        method(c: AbortController) { c.abort(); }
        field = (c: AbortController) => { c.abort(); };
        constructor(c: AbortController) { c.abort(); }
        get getter() { return new AbortController().abort(); }
      }
      const bag = { member: (c: AbortController) => { c.abort(); } };
      new AbortController().abort();
    `;

    expect(
      abortSites(path.join(SRC, "sample.ts"), sample).map(({ site }) => site),
    ).toStrictEqual(
      [
        "declared",
        "arrow",
        "expressed",
        "method",
        "field",
        "constructor",
        "getter",
        "member",
        "<module>",
      ].map((owner) => `sample.ts › ${owner}`),
    );
  });
});
