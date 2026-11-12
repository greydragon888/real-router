import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

/**
 * The unknown-`queryParams`-key report, end to end (#2323).
 *
 * The retrospective pass reads `ctx.getOptions()`, and for this one slot that
 * is still the CALLER's own object rather than a core-owned copy. A key core
 * never declared therefore survives into what the plugin reads, and a
 * mis-spelled option name is reported instead of silently doing nothing.
 *
 * ⚑ **The reach is what this file pins, not the message.** Narrowing
 * `getOptions().queryParams` to core's own snapshot leaves every other cell in
 * this package green — measured — so without a cell that walks the whole path
 * the report would disappear as a side effect of an unrelated cleanup. The
 * qualification lives in `OptionsNamespace/adoption.ts`, which names this file.
 *
 * ⚠ **The declared key set is DERIVED, never listed.** Core's snapshot IS the
 * set of names core reads, so the cells below compare the caller's bag against
 * the names a construction is SEEN to read rather than against four literals.
 * A fifth declared format changes both sides at once.
 *
 * ⚠ **A clone is silent, deliberately.** `cloneRouter` builds from the base's
 * resolved strategies, so the caller's unknown key is not in the clone's copy
 * to report — the consequence `api/cloneRouter.ts` records. Pinned here because
 * it is the half a reader assumes is an oversight.
 */

const ROUTES = [{ name: "a", path: "/a" }];

/** The caller's bag: one declared format, one typo of another. */
function callerBag(): Record<string, unknown> {
  return { arrayFormat: "none", arrayFromat: "brackets" };
}

function install(router: Router): void {
  router.usePlugin(validationPlugin());
}

/** What the plugin's retrospective pass reads. */
function handoutNames(router: Router): string[] {
  return Object.keys(
    getPluginApi(router).getOptions().queryParams as object,
  ).toSorted((left, right) => left.localeCompare(right));
}

/**
 * The names of `bag` core reads while it builds a router — the set its
 * snapshot keeps.
 *
 * ⚑ Observed, not looked up: every key is offered behind a getter, and a name
 * core reads is a name whose getter ran.
 *
 * ⚠ The cells require at least one name back: a probe that observes nothing
 * would leave every key outside the set, the typo among them.
 */
function declaredNames(bag: Record<string, unknown>): string[] {
  const read = new Set<string>();
  const observed = {};

  for (const [key, value] of Object.entries(bag)) {
    Object.defineProperty(observed, key, {
      enumerable: true,
      get: () => {
        read.add(key);

        return value;
      },
    });
  }

  createRouter(ROUTES, { queryParams: observed }).dispose();

  return [...read].toSorted((left, right) => left.localeCompare(right));
}

describe("the analyser's reach into queryParams (#2323)", () => {
  it("reports the caller's mis-spelled key through usePlugin", () => {
    const router = createRouter(ROUTES, { queryParams: callerBag() });

    expect(() => {
      install(router);
    }).toThrow('Invalid "queryParams.arrayFromat": unknown option');
  });

  it("CONTROL — a bag with no typo installs cleanly", () => {
    // Without this the cell above would pass for a plugin that refuses every
    // `queryParams` bag, which is a different defect wearing the same colour.
    const router = createRouter(ROUTES, {
      queryParams: { arrayFormat: "none" },
    });

    expect(() => {
      install(router);
    }).not.toThrow();
  });

  it("the reported key is one the handout carries and core's snapshot does not", () => {
    const router = createRouter(ROUTES, { queryParams: callerBag() });
    const declared = declaredNames(callerBag());

    expect(declared.length).toBeGreaterThan(0);

    expect(
      handoutNames(router).filter((key) => !declared.includes(key)),
    ).toStrictEqual(["arrayFromat"]);
  });

  it("a clone carries only what core declared, so it reports nothing", () => {
    const clone = cloneRouter(
      createRouter(ROUTES, { queryParams: callerBag() }),
    );
    const declared = declaredNames(callerBag());

    expect(declared.length).toBeGreaterThan(0);
    expect(handoutNames(clone)).toStrictEqual(declared);

    expect(() => {
      install(clone);
    }).not.toThrow();
  });
});
