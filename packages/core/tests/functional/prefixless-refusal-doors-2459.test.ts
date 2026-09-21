import { describe, expect, it } from "vitest";

import { createRouter, RouterError } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

/**
 * Every refusal a caller can reach names something they can look up (#1845).
 *
 * `message-prefix-authority-1845` judges the SOURCE — it walks `throw new
 * X(<literal>)` in `src` and asks which prefix the literal opens with. This file
 * asks the other half, and it is the half #2459 turned on: drive the DOOR and
 * read what the caller actually sees. A message can be prefixed at one raiser
 * and reached through a second door that prefixes it differently, and the
 * source walk cannot see that.
 *
 * ⚑ Every row below was measured before it was written — each is a door that
 * PRINTS the message, not one inferred from the file the raiser lives in. Three
 * of them refuted a guess while the register was being adjudicated: `cloneRouter`
 * takes the bag as its SECOND POSITIONAL argument (a `{ dependencies }` wrapper
 * is silently installed as a key), `addEventListener` is on `PluginApi` rather
 * than the facade, and `subscribe` cannot reach `Duplicate listener` at all
 * because it wraps the caller's function in a fresh closure per call.
 * A fourth: the logger family's second door is `cloneRouter`'s THIRD argument,
 * not `RouterLogger.configure` — that method exists on the class and not on the
 * `RouterLogger` interface `getInternals` hands out, so a caller cannot type it.
 */

const ROUTES = [{ name: "home", path: "/" }];

/** The message a door printed, or `NO THROW` when it did not refuse. */
const refusalFrom = (door: () => unknown): string => {
  try {
    door();

    return "NO THROW";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/**
 * What a door's refusal says about the freeze, as a fact rather than a branch.
 *
 * `routerErrorUnfrozen` is scoped to `RouterError` on purpose: #1960 is about the
 * asymmetry between frozen and unfrozen ROUTER errors, and a plain `TypeError` is
 * not frozen by convention — asserting "everything is frozen" would red the
 * honest rows. `refused` is the control: a row that stops refusing measures
 * nothing, and would otherwise pass this cell for ever.
 */
const freezeFactOf = (
  door: () => unknown,
): { readonly refused: boolean; readonly routerErrorUnfrozen: boolean } => {
  try {
    door();

    return { refused: false, routerErrorUnfrozen: false };
  } catch (error) {
    return {
      refused: true,
      routerErrorUnfrozen:
        error instanceof RouterError && !Object.isFrozen(error),
    };
  }
};

const getterBag = () => ({
  get a() {
    return 1;
  },
});

/** [door, the refusal it prints] */
const DOORS: readonly (readonly [string, () => unknown])[] = [
  // ── dependency bag: three doors, one raiser ──────────────────────────────
  ["createRouter(deps)", () => createRouter(ROUTES, {}, 42 as never)],
  [
    "getDependenciesApi().setAll()",
    () => {
      getDependenciesApi(createRouter(ROUTES)).setAll(42 as never);
    },
  ],
  ["cloneRouter(deps)", () => cloneRouter(createRouter(ROUTES), 42 as never)],
  [
    "createRouter(deps with getter)",
    () => createRouter(ROUTES, {}, getterBag() as never),
  ],
  [
    "getDependenciesApi().setAll(getter)",
    () => {
      getDependenciesApi(createRouter(ROUTES)).setAll(getterBag());
    },
  ],
  [
    "cloneRouter(deps with getter)",
    () => cloneRouter(createRouter(ROUTES), getterBag() as never),
  ],
  // ── logger config: the constructor and the handed-out logger ─────────────
  ["createRouter(logger)", () => createRouter(ROUTES, { logger: 42 } as never)],
  [
    "cloneRouter(logger override)",
    () =>
      cloneRouter(createRouter(ROUTES), undefined, {
        logger: { nope: 1 },
      } as never),
  ],
  [
    "createRouter(logger.level)",
    () => createRouter(ROUTES, { logger: { level: "nope" } } as never),
  ],
  [
    "createRouter(logger.callback)",
    () => createRouter(ROUTES, { logger: { callback: 42 } } as never),
  ],
  [
    "createRouter(logger.callbackIgnoresLevel)",
    () =>
      createRouter(ROUTES, {
        logger: { callbackIgnoresLevel: 42 },
      } as never),
  ],
  [
    "createRouter(logger unknown key)",
    () => createRouter(ROUTES, { logger: { nope: 1 } } as never),
  ],
  // ── route shape ─────────────────────────────────────────────────────────
  ["createRouter([42])", () => createRouter([42] as never)],
  [
    "getRoutesApi().add(42)",
    () => {
      getRoutesApi(createRouter(ROUTES)).add(42 as never);
    },
  ],
  // ── forwardTo ───────────────────────────────────────────────────────────
  [
    "createRouter(forwardTo: number)",
    () => createRouter([{ name: "a", path: "/a", forwardTo: 42 }] as never),
  ],
  [
    "getRoutesApi().add(forwardTo: number)",
    () => {
      getRoutesApi(createRouter(ROUTES)).add({
        name: "kid",
        path: "/kid",
        forwardTo: 42,
      } as never);
    },
  ],
  [
    "createRouter(forwardTo: async)",
    () =>
      createRouter([
        { name: "a", path: "/a", forwardTo: async () => "home" },
      ] as never),
  ],
  // ── event emitter ───────────────────────────────────────────────────────
  [
    "PluginApi.addEventListener (duplicate)",
    () => {
      const api = getPluginApi(createRouter(ROUTES));
      const listener = () => {};

      api.addEventListener("$$start", listener);
      api.addEventListener("$$start", listener);
    },
  ],
  [
    "PluginApi.addEventListener (limit)",
    () => {
      const api = getPluginApi(
        createRouter(ROUTES, { limits: { maxListeners: 1 } }),
      );

      api.addEventListener("$$start", () => {});
      api.addEventListener("$$start", () => {});
    },
  ],
  [
    "router.subscribe (limit)",
    () => {
      const router = createRouter(ROUTES, {
        limits: { maxListeners: 1 },
      });

      router.subscribe(() => {});
      router.subscribe(() => {});
    },
  ],
  // ── two doors whose message lives in a RouterError options bag, the shape
  //    the source walk reads since #2493 ─────────────────────────────────────
  [
    "getPluginApi().extendRouter (conflict)",
    () => {
      getPluginApi(createRouter(ROUTES)).extendRouter({
        navigate: () => {},
      });
    },
  ],
  [
    "getPluginApi().claimContextNamespace (twice)",
    () => {
      const api = getPluginApi(createRouter(ROUTES));

      api.claimContextNamespace("taken");
      api.claimContextNamespace("taken");
    },
  ],
];

describe("every refusal a caller can reach names a door (#2459)", () => {
  // The floor is what keeps a narrowed table from passing vacuously: drop a row
  // and the count moves, drop them all and this is the only assertion left.
  it("the table still drives every door the register named", () => {
    expect(DOORS).toHaveLength(22);
  });

  it.each(DOORS)("%s hands back a FROZEN RouterError", (_door, open) => {
    expect(freezeFactOf(open)).toStrictEqual({
      refused: true,
      routerErrorUnfrozen: false,
    });
  });

  it("a refusal built by a helper and thrown by its caller is frozen too", async () => {
    // The seam #1960 and #1964 both missed: construction moved into a private
    // helper, and the throw site adds nothing. Its channel is asynchronous — the
    // refusal arrives inside `start()` — so it cannot join the table above.
    const router = createRouter(ROUTES);
    let caught: unknown = "NO THROW";

    getPluginApi(router).addInterceptor("start", async (next, path) => {
      try {
        router.navigateToNotFound("/zzz");
      } catch (error) {
        caught = error;
      }

      return next(path);
    });

    await router.start("/");

    expect(caught).toBeInstanceOf(RouterError);
    expect(Object.isFrozen(caught)).toBe(true);
  });

  it.each(DOORS)("%s refuses with a prefix", (_door, open) => {
    const message = refusalFrom(open);

    // CONTROL: a door that did not refuse measured nothing, and a row that
    // silently stops refusing would otherwise pass this file for ever.
    expect(message).not.toBe("NO THROW");
    expect(message).toMatch(/^\[router[\].]/u);
  });
});
