/**
 * Every `RouterError` core builds reaches a caller frozen (#1960), and this file
 * makes each construction site say HOW.
 *
 * ⚑ The obligation is site-level here, which is the gap #2528 measured:
 * `thrown-error-freeze-authority-1960` is organised by consumer-facing CHANNEL, so a
 * construction no listed channel reaches ships unfrozen green. #2528 owns the
 * measurement of how many sites that leaves unwatched; this file owns the inventory.
 *
 * A site is settled when the freeze happens AT CONSTRUCTION: the construction is
 * the argument of `freezeThrownError`, or it is a module const the same file then
 * freezes by name. Every other site is listed below with what it does instead —
 * `toStrictEqual`, so one cannot appear or disappear unnoticed.
 */
import {
  globSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../../src");

interface Site {
  readonly key: string;
  readonly settled: boolean;
}

/** Every `new RouterError` under `root`, keyed by file, code and what holds it. */
function sites(root: string): Site[] {
  const found: Site[] = [];

  for (const file of globSync(`${root}/**/*.ts`)) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      if (
        !ts.isNewExpression(node) ||
        node.expression.getText(source) !== "RouterError"
      ) {
        ts.forEachChild(node, visit);

        return;
      }

      const code = (node.arguments?.[0]?.getText(source) ?? "?").replace(
        "errorCodes.",
        "",
      );
      const parent = node.parent;
      let form = "other";
      let settled = false;

      if (
        ts.isCallExpression(parent) &&
        parent.expression.getText(source) === "freezeThrownError"
      ) {
        form = "wrapped";
        settled = true;
      } else if (
        ts.isVariableDeclaration(parent) &&
        ts.isIdentifier(parent.name)
      ) {
        const name = parent.name.text;

        if (text.includes(`freeze(${name})`)) {
          form = "frozen-const";
          settled = true;
        } else {
          form = `const ${name}`;
        }
      } else if (ts.isReturnStatement(parent)) {
        form = "return";
      } else if (ts.isConditionalExpression(parent)) {
        form = "ternary";
      } else if (ts.isBinaryExpression(parent)) {
        form = "?? fallback";
      }

      found.push({
        key: `${path.relative(root, file)} · ${code} · ${form}`,
        settled,
      });

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found;
}

/**
 * What each unsettled site does instead of freezing at construction. ⚠ Four of
 * them are NOT established, and saying so is the point: #2528 owns them, and a
 * reason of "not established" is a claim a reader can check rather than a hole
 * they have to find.
 */
const DEFERRED: ReadonlyMap<string, string> = new Map([
  [
    "namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts · ROUTE_NOT_FOUND · const err",
    "thrown through `freezeThrownError` below, with no report in between — the comment above the site says why none is emitted",
  ],
  [
    "namespaces/NavigationNamespace/transition/completeTransition.ts · ROUTE_NOT_FOUND · const err",
    "REPORTED to FAIL listeners and only then thrown through `freezeThrownError` — the freeze lands after the report, which is the shape #2509 corrected at `navigateToNotFound`. NOT ESTABLISHED that a listener's write reaches the caller: the branch needs a route to vanish between the guards and the commit, and three probes failed to reach it (#2528)",
  ],
  [
    "namespaces/NavigationNamespace/transition/errorHandling.ts · TRANSITION_CANCELLED · ternary",
    "`asCancellation` RETURNS it unfrozen. NOT ESTABLISHED where it reaches a caller (#2528)",
  ],
  [
    "namespaces/NavigationNamespace/transition/errorHandling.ts · code as string · const copy",
    "a re-coded copy: `setCode` and `stack` are written after construction, so the freeze cannot move there — it happens at the throw",
  ],
  [
    "namespaces/EventBusNamespace/EventBusNamespace.ts · TRANSITION_CANCELLED · ternary",
    "handed to `reject(...)` unfrozen, i.e. straight to a consumer's `.catch()`. NOT ESTABLISHED (#2528)",
  ],
  [
    "namespaces/EventBusNamespace/EventBusNamespace.ts · ROUTER_DISPOSED · return",
    "`#refuseSystemCommit`'s DISPOSED return; its caller wraps the return in `freezeThrownError`, which is what #2507's two-cell mutation pins",
  ],
  [
    "namespaces/EventBusNamespace/EventBusNamespace.ts · ROUTER_NOT_STARTED · return",
    "`#refuseSystemCommit`'s phase return, frozen by the same caller wrapper",
  ],
  [
    "namespaces/EventBusNamespace/EventBusNamespace.ts · TRANSITION_CANCELLED · ?? fallback",
    "`cancelReason`, recorded on the navigation rather than thrown. NOT ESTABLISHED (#2528)",
  ],
]);

describe("every RouterError core builds says how it reaches a caller frozen (#2528)", () => {
  const inventory = sites(SRC);

  it("every construction is settled at build time or listed with its reason", () => {
    const unsettled = inventory
      .filter((site) => !site.settled)
      .map((site) => site.key)
      .toSorted((left, right) => left.localeCompare(right));

    expect(unsettled).toStrictEqual(
      [...DEFERRED.keys()].toSorted((left, right) => left.localeCompare(right)),
    );
  });

  it("FLOOR — most constructions still freeze at build time", () => {
    // Without this the assertion above passes on a scan that has stopped seeing
    // the settled majority, which is the shape a table-and-equality guard fails in.
    expect(inventory.filter((site) => site.settled).length).toBeGreaterThan(18);
  });

  it("CONTROL — the scan classifies a planted wrapped and a planted bare site", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "freeze-authority-"));

    try {
      writeFileSync(
        path.join(directory, "planted.ts"),
        [
          "const wrapped = freezeThrownError(new RouterError(errorCodes.A));",
          "const bare = new RouterError(errorCodes.B);",
        ].join("\n"),
      );

      expect(
        sites(directory).toSorted((left, right) =>
          left.key.localeCompare(right.key),
        ),
      ).toStrictEqual([
        { key: "planted.ts · A · wrapped", settled: true },
        { key: "planted.ts · B · const bare", settled: false },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
