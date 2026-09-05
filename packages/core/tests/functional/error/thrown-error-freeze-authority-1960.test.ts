// Every `RouterError` that reaches consumer code is frozen.
//
// #1606 froze the four CACHED rejections, and its reason applies verbatim to the
// rest: these instances are handed to arbitrary consumer code — every `.catch()`,
// `onTransitionError`, a leave signal's `reason` — so an in-place write rewrites
// the error for every other consumer that sees it. For a cached instance that is
// process-wide and crosses routers (SSR: requests); for a fresh one it is
// narrower, but the consumer cannot tell the two apart at the catch site: same
// class, same fields, same `name`. One shape refused an annotation and the other
// accepted it, with nothing to discriminate on (#1960).
//
// ⚠ THE TABLE KEYS ON CHANNELS, NOT ON THROW SITES, and that is the whole point
// of its shape. Core throws a `RouterError` from ~30 places; a guard that
// enumerated them would go stale at the 31st and would still say nothing about
// what a consumer actually receives. These rows are the doors: a rejected
// navigation, a rejected `start`, a plugin hook, a call after `dispose`. A new
// throw site inside any of them is covered without editing this file.
//
// ⚠ FROZEN AT THE THROW, NOT IN THE CONSTRUCTOR. `RouterError` publishes three
// mutators — `setCode`, `setErrorInstance`, `setAdditionalFields` — with worked
// examples in the wiki, and `rethrowAsRouterError` itself copies an error and
// re-codes the copy before throwing it. Freezing in the constructor was
// measured: red across the tier and concentrated in this class's own suite,
// because it removes published API from errors a consumer BUILDS. Freezing at
// the throw leaves those untouched: the only capability withdrawn is annotating
// an error core threw at you, and a repository-wide sweep of every `catch`
// binding found nobody doing that.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRouter, RouterError } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "blocked", path: "/blocked" },
];

async function started(): Promise<Router> {
  const router = createRouter(ROUTES);

  getLifecycleApi(router).addActivateGuard("blocked", () => () => false);
  await router.start("/home");

  return router;
}

const catchError = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  throw new Error("expected a rejection, got none");
};

/** Every door that hands a `RouterError` to consumer code. */
const CHANNELS = [
  {
    name: "navigate refused by a guard",
    produce: async () => {
      const router = await started();

      return catchError(() => router.navigate("blocked"));
    },
  },
  {
    name: "navigate to the current route",
    produce: async () => {
      const router = await started();

      return catchError(() => router.navigate("home"));
    },
  },
  {
    name: "navigate to an unknown route",
    produce: async () => {
      const router = await started();

      return catchError(() => router.navigate("nope"));
    },
  },
  {
    name: "start on an already started router",
    produce: async () => {
      const router = await started();

      return catchError(() => router.start("/home"));
    },
  },
  {
    name: "navigate before start",
    produce: async () =>
      catchError(() => createRouter(ROUTES).navigate("home")),
  },
  {
    name: "a route door after dispose",
    produce: async () => {
      const router = await started();

      router.dispose();

      return catchError(async () => {
        getRoutesApi(router).add({ name: "z", path: "/z" });
      });
    },
  },
  {
    // ⚠ BOTH ARMS of `rethrowAsRouterError`, and they used to disagree. A guard
    // throwing a plain `Error` reached `throw new RouterError(...)` and came back
    // frozen; a guard throwing a RouterError reached `throw copy` — the copy the
    // function builds and re-codes — and came back MUTABLE. One function, two
    // exits, opposite answers, and the earlier table missed it because its only
    // guard row returned `false` rather than throwing.
    name: "a guard that throws a plain Error",
    produce: async () => {
      const router = createRouter(ROUTES);

      getLifecycleApi(router).addActivateGuard("blocked", () => () => {
        throw new Error("boom");
      });
      await router.start("/home");

      return catchError(() => router.navigate("blocked"));
    },
  },
  {
    name: "a guard that throws a RouterError",
    produce: async () => {
      const router = createRouter(ROUTES);

      getLifecycleApi(router).addActivateGuard("blocked", () => () => {
        throw new RouterError("CUSTOM", { message: "mine" });
      });
      await router.start("/home");

      return catchError(() => router.navigate("blocked"));
    },
  },
  {
    name: "navigateToNotFound refused by a deactivate guard",
    produce: async () => {
      const router = createRouter(ROUTES, { allowNotFound: true });

      getLifecycleApi(router).addDeactivateGuard("home", () => () => false);
      await router.start("/home");

      return catchError(() => router.navigateToNotFound("/nope"));
    },
  },
  {
    name: "start on a path that matches nothing",
    produce: async () =>
      catchError(() =>
        createRouter(ROUTES, { allowNotFound: false }).start("/nope"),
      ),
  },
  {
    // The route disappears BETWEEN the transition starting and its commit, so
    // `completeTransition` refuses a target the table no longer has.
    name: "a route removed mid-transition",
    produce: async () => {
      const router = createRouter(ROUTES);

      getLifecycleApi(router).addActivateGuard("blocked", () => async () => {
        getRoutesApi(router).remove("blocked");

        return true;
      });
      await router.start("/home");

      return catchError(() => router.navigate("blocked"));
    },
  },
  {
    name: "the error a plugin's onTransitionError receives",
    produce: async () => {
      const router = await started();
      let seen: unknown;

      router.usePlugin(() => ({
        onTransitionError: (_to, _from, error) => {
          seen = error;
        },
      }));
      await catchError(() => router.navigate("blocked"));

      return seen;
    },
  },
] as const;

const SRC = path.resolve(__dirname, "../../../src");

function walk(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);

    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else if (full.endsWith(".ts")) {
      found.push(full);
    }
  }

  return found;
}

/**
 * Cached error instances, found BY SHAPE across the whole package. #1606 froze
 * four of them and missed the fifth for one reason only: its sweep was scoped to
 * `NavigationNamespace/constants.ts`, and `CACHED_ALREADY_STARTED_ERROR` lives in
 * `RouterLifecycleNamespace/constants.ts`. A file-scoped list would have repeated
 * that; enumerating the shape cannot.
 */
const cachedErrors = walk(SRC).flatMap((file) => {
  const text = readFileSync(file, "utf8");

  return [...text.matchAll(/export const (CACHED_\w*ERROR)\b/g)].map(
    ([, name]) => ({
      frozen: text.includes(`Object.freeze(${name})`),
      name,
    }),
  );
});

describe("thrown-error freeze authority (#1960)", () => {
  it("covers every consumer-facing channel", () => {
    // Counted outside the `each` (`table-vacuity-authority`): an empty table
    // registers no cells and still exits green.
    expect(CHANNELS).toHaveLength(12);
  });

  it("the detector distinguishes frozen from not", () => {
    // Without this, "every row reports frozen" could equally mean the assertion
    // is stuck on `true`.
    expect(Object.isFrozen(Object.freeze({}))).toBe(true);
    expect(Object.isFrozen({})).toBe(false);
  });

  it("finds every cached error instance in the package", () => {
    // Counted outside the `each` below; five today, and a sixth must answer the
    // question rather than inherit the gap.
    expect(cachedErrors.length).toBeGreaterThanOrEqual(5);
  });

  it.each(cachedErrors)(
    "$name is frozen where it is declared",
    ({ frozen }) => {
      expect(frozen).toBe(true);
    },
  );

  it.each(CHANNELS)(
    "$name: hands back a frozen RouterError",
    async ({ produce }) => {
      const error = await produce();

      expect(error).toBeInstanceOf(Error);
      expect((error as { code?: unknown }).code).toBeTypeOf("string");
      expect(Object.isFrozen(error)).toBe(true);
    },
  );
});
