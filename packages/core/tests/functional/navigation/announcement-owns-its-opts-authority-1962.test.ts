import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every announcement hands `onTransitionSuccess` a container CORE owns (#1962).
 *
 * The point-fix this guards is one door — `executeNavigation`'s entry copy —
 * but the defect class is wider than that door: *any* site that announces a
 * success with a bag core did not build hands the application's own object to
 * every installed plugin, unfrozen, and the aliasing is invisible from the hook
 * (a plugin cannot tell whose object it holds).
 *
 * ⚠ The five arcs pinned behaviourally in `options-entry-door-1962` are the ones
 * that exist TODAY. They cannot catch a SIXTH announcement added later, which is
 * exactly how this class recurred before: the object was fine on the arcs anyone
 * thought to test. So the set of announcement sites is DERIVED here, and each is
 * required to pass a container with a known owner.
 *
 * Two owners are legitimate, and no third:
 *
 * - **`payload.opts`** — the FSM payload, whose `opts` is core's frozen record
 *   because the entry door built it above every other read;
 * - **a module constant** named `*_OPTS` — `FROZEN_REPLACE_OPTS`
 *   (`navigateToNotFound`) and `REVALIDATE_OPTS` (`getRoutesApi`), both
 *   `Object.freeze`d literals core authors.
 *
 * Anything else is a caller's bag reaching plugins by reference, and reds here.
 *
 * ⚠ Addressed by file plus the matched argument text, never by line number: the
 * sites this watches are edited often and a `:NNN` citation rots on the first
 * reformat.
 */

const SRC = path.resolve(__dirname, "../../../src");

/** The announcement whose third argument is the container plugins receive. */
const ANNOUNCE = "emitTransitionSuccess";

interface Site {
  readonly file: string;
  readonly argument: string;
}

const OWNED = /^payload\.opts$|_OPTS$/;

function announcementSites(root: string): Site[] {
  const found: Site[] = [];

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
    );

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === ANNOUNCE &&
        // The DECLARATION is not a site; only calls that pass a container are.
        node.arguments.length >= 3
      ) {
        found.push({
          file: path.relative(root, file),
          argument: node.arguments[2].getText(source).replaceAll(/\s+/g, " "),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found;
}

describe("every announcement owns the opts it hands out (#1962)", () => {
  const sites = announcementSites(SRC);

  it("finds the announcement sites at all — the guard must not pass on an empty walk", () => {
    // Without this the whole file goes green the moment the method is renamed,
    // the directory moves, or the AST shape stops matching: a derived set that
    // finds NOTHING satisfies "every site is owned" vacuously.
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sites.map((s) => s.file)).size).toBeGreaterThanOrEqual(1);
  });

  it("passes a container with a known owner at every site", () => {
    const unowned = sites.filter((s) => !OWNED.test(s.argument));

    expect(unowned.map((s) => `${s.file}: ${s.argument}`)).toStrictEqual([]);
  });

  it("CONTROL — the predicate refuses a caller-supplied bag", () => {
    // The mutation this file exists to catch, run against the predicate itself
    // so a future loosening of `OWNED` cannot pass unnoticed.
    expect(OWNED.test("payload.opts")).toBe(true);
    expect(OWNED.test("FROZEN_REPLACE_OPTS")).toBe(true);
    expect(OWNED.test("REVALIDATE_OPTS")).toBe(true);

    expect(OWNED.test("opts")).toBe(false);
    expect(OWNED.test("this.#callerOpts")).toBe(false);
    expect(OWNED.test("payload.opts.signal === undefined ? opts : copy")).toBe(
      false,
    );
  });

  it("CONTROL — the walk sees a site it is shown", () => {
    // A positive control on the SCANNER, not on the predicate: proves the AST
    // shape being matched is the one the source actually has, so "no unowned
    // sites" is a measurement rather than a failure to look.
    const probe = ts.createSourceFile(
      "probe.ts",
      `class X { f(o: unknown) { this.${ANNOUNCE}(a, b, o); } }`,
      ts.ScriptTarget.ESNext,
      true,
    );

    const hits: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === ANNOUNCE &&
        node.arguments.length >= 3
      ) {
        hits.push(node.arguments[2].getText(probe));
      }

      ts.forEachChild(node, visit);
    };

    visit(probe);

    expect(hits).toStrictEqual(["o"]);
    expect(OWNED.test(hits[0])).toBe(false);
  });
});
