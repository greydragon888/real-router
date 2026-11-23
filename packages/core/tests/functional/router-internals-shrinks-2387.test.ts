import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `RouterInternals` only shrinks (#2387).
 *
 * The bag takes no new member (owner decision, 2026-11-13): a door gets a new
 * capability through the store that carries it — `ARCHITECTURE.md` ›
 * _Namespaces, stores and doors_. `MEMBERS` is the interface as it stands: a
 * member the walk finds outside it reds the first cell, and a row naming a
 * member the interface no longer declares reds the second, so the change that
 * removes a member deletes its row. The file goes together with the interface.
 *
 * ⚑ `door-census/surface.test.ts` pins the live object's composition in both
 * directions. This file holds the direction: growth reds here with the rule in
 * the message, not as a list to bring up to date.
 *
 * ⚠ Names only: a member whose type widens passes this file.
 *
 * ⚠ The walk refuses a shape it cannot read rather than reading it as empty: no
 * declaration or a second one, a heritage clause, a member without a name.
 */
const MEMBERS = [
  "makeState",
  "getMetaForState",
  "getDeclaredQueryNames",
  "forwardState",
  "buildStateResolved",
  "buildPathResolved",
  "matchPath",
  "getOptions",
  "getAdoptedOrigins",
  "addEventListener",
  "subscribeDiagnostic",
  "port",
  "emitTransitionError",
  "navigateToNotFound",
  "revalidateToNotFound",
  "start",
  "navigateToState",
  "interceptors",
  "checks",
  "setRootPath",
  "getRootPath",
  "getTree",
  "isDisposed",
  "logger",
  "dependenciesGetStore",
  "getCloneState",
  "routeGetStore",
  "getStateName",
  "isTransitioning",
  "systemCommit",
  "routerExtensions",
  "contextClaimRecords",
];

const FILE = path.resolve(__dirname, "../../src/internals.ts");

function nameOf(name: ts.PropertyName, source: ts.SourceFile): string {
  return ts.isIdentifier(name) ? name.text : name.getText(source);
}

/** Every member of `RouterInternals`, by name, in declaration order. */
function membersOf(text: string): string[] {
  const source = ts.createSourceFile(
    "internals.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declarations = source.statements.filter(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === "RouterInternals",
  );

  if (declarations.length !== 1) {
    throw new Error(
      `Expected one RouterInternals interface, found ${declarations.length}`,
    );
  }

  const [declaration] = declarations;

  if (declaration.heritageClauses !== undefined) {
    throw new Error(
      "RouterInternals has a heritage clause, whose members the walk cannot see",
    );
  }

  return declaration.members.map((member) => {
    if (member.name === undefined) {
      throw new Error(
        `RouterInternals has a member without a name: ${member.getText(source)}`,
      );
    }

    return nameOf(member.name, source);
  });
}

function refusalOf(text: string): string {
  try {
    membersOf(text);
  } catch (error) {
    return (error as Error).message;
  }

  return "no refusal";
}

describe("RouterInternals only shrinks (#2387)", () => {
  const declared = membersOf(readFileSync(FILE, "utf8"));
  const listed = new Set(MEMBERS);

  it("declares no member beyond the list", () => {
    expect(
      declared.filter((member) => !listed.has(member)),
      "RouterInternals takes no new member — a door gets a new capability through its store: packages/core/ARCHITECTURE.md › Namespaces, stores and doors",
    ).toStrictEqual([]);
  });

  it("lists no member the interface no longer declares", () => {
    expect(
      MEMBERS.filter((member) => !declared.includes(member)),
      "a member that leaves RouterInternals leaves this list in the same change",
    ).toStrictEqual([]);
  });

  it("CONTROL — the walk reads a property, a readonly one, an optional one and a method", () => {
    expect(
      membersOf(`
        export interface RouterInternals<D extends object = object> {
          property: (value: D) => void;
          readonly fixed: string;
          optional?: () => void;
          method(value: unknown): void;
        }
      `),
    ).toStrictEqual(["property", "fixed", "optional", "method"]);
  });

  it("CONTROL — a shape the walk cannot read is refused, not read as empty", () => {
    expect(refusalOf("export interface Other { a: string }")).toBe(
      "Expected one RouterInternals interface, found 0",
    );
    expect(
      refusalOf(
        "interface RouterInternals { a: string }\ninterface RouterInternals { b: string }",
      ),
    ).toBe("Expected one RouterInternals interface, found 2");
    expect(
      refusalOf("interface RouterInternals extends Base { a: string }"),
    ).toBe(
      "RouterInternals has a heritage clause, whose members the walk cannot see",
    );
    expect(
      refusalOf("interface RouterInternals { [name: string]: unknown }"),
    ).toBe(
      "RouterInternals has a member without a name: [name: string]: unknown",
    );
    expect(refusalOf("interface RouterInternals { (): void }")).toBe(
      "RouterInternals has a member without a name: (): void",
    );
  });
});
