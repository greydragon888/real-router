import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, it, expect } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Route } from "@real-router/core/types";

/**
 * The batch a guard validates is the batch registration stores (#1911).
 *
 * `snapshotRouteBatch` exists so that every reader sees one value. On the `add`
 * and `replace` doors the validator ran ABOVE it, so a definition that answers
 * differently per read was validated under one value and registered under
 * another — and a `Proxy` does exactly that while reporting an ordinary data
 * descriptor, which is why the accessor ban (`Route must not have getters or
 * setters`) does not reach this shape. `Proxy`-backed bags are supported input.
 *
 * ⚑ The table records the read COUNT beside the outcome. An outcome-only cell is
 * satisfied by whichever guard happens to refuse the value; the property under
 * test is that no later reader can be shown something else, and one read is what
 * leaves nothing to differ from.
 */
describe("a route definition is read once, above every validator (#1911)", () => {
  const sync = (c: unknown): unknown => c;
  const asyncFn = async (c: unknown): Promise<unknown> => c;

  /** Pass-through Proxy answering `decodeParams` async from read `flipAt` on. */
  const driftingRoute = (
    flipAt: number,
  ): { route: Route; reads: () => number } => {
    let reads = 0;
    const target: Record<string, unknown> = {
      name: "a",
      path: "/a/:id",
      decodeParams: sync,
    };

    return {
      route: new Proxy(target, {
        get(t, k, r) {
          if (k === "decodeParams") {
            reads += 1;

            return reads < flipAt ? sync : asyncFn;
          }

          return Reflect.get(t, k, r);
        },
      }) as unknown as Route,
      reads: () => reads,
    };
  };

  const mk = (): ReturnType<typeof createRouter> => {
    const router = createRouter([]);

    router.usePlugin(validationPlugin());

    return router;
  };

  /** `reads · outcome` for one flip ordinal, through one door. */
  const attempt = (door: "add" | "replace", flipAt: number): string => {
    const router = mk();
    const { route, reads } = driftingRoute(flipAt);
    let outcome: string;

    try {
      getRoutesApi(router)[door]([route]);

      try {
        getPluginApi(router).matchPath("/a/7");
        outcome = "accepted, tree usable";
      } catch {
        outcome = "accepted, TREE BROKEN";
      }
    } catch {
      outcome = "refused";
    }

    router.dispose();

    return `${reads()} read · ${outcome}`;
  };

  it("CONTROL — a literal async decodeParams is refused", () => {
    const router = mk();

    // The literal form of what the Proxy smuggles. `decodeParams` is declared
    // synchronous, so the cast is what lets the cell express the misuse the rule
    // exists to refuse.
    const literalAsync = {
      name: "a",
      path: "/a/:id",
      decodeParams: asyncFn,
    } as unknown as Route;

    expect(() => {
      getRoutesApi(router).add([literalAsync]);
    }).toThrow(/decodeParams cannot be async/);

    router.dispose();
  });

  it("no ordinal drifts past the rule, at either door", () => {
    const table: Record<string, string> = {};

    for (const flipAt of [1, 2, 3, 4, 5, 6, 7]) {
      table[`add · flip at read ${flipAt}`] = attempt("add", flipAt);
    }

    for (const flipAt of [1, 4, 6]) {
      table[`replace · flip at read ${flipAt}`] = attempt("replace", flipAt);
    }

    // Read 1 IS the snapshot, so only a bag that answers async on its very first
    // read can put an async callback in front of the rule — and that one is
    // refused. Every later flip never happens, and no row says "TREE BROKEN".
    expect(table).toStrictEqual({
      "add · flip at read 1": "1 read · refused",
      "add · flip at read 2": "1 read · accepted, tree usable",
      "add · flip at read 3": "1 read · accepted, tree usable",
      "add · flip at read 4": "1 read · accepted, tree usable",
      "add · flip at read 5": "1 read · accepted, tree usable",
      "add · flip at read 6": "1 read · accepted, tree usable",
      "add · flip at read 7": "1 read · accepted, tree usable",
      "replace · flip at read 1": "1 read · refused",
      "replace · flip at read 4": "1 read · accepted, tree usable",
      "replace · flip at read 6": "1 read · accepted, tree usable",
    });
  });
});
