// #2141 — the NESTED level of a restored entry, which #1837 left open.
//
// `getRouteFromEvent` takes one snapshot of the four top-level members and both
// validates and commits that snapshot (#1837). The nested bags went into it BY
// REFERENCE, so `isStateStrict` — which screens `params` and `search` by VALUE —
// walked the caller's object and `makeState` walked it again. A key inside those
// bags could therefore answer one thing to the guard and another to the commit.
//
// ⚠ Reachability, stated because it decides the priority: a real browser runs
// StructuredSerializeForStorage on `pushState`, so a genuine `history.state`
// comes back plain and cannot drift. This is reachable from a SYNTHETIC
// `PopStateEvent` and under jsdom, which stores the entry by identity — the test
// environment, not production. What it buys is that a test cannot construct a
// committed state the guard never approved.
//
// ⚠ The copy is SHAPE-PRESERVING and that is load-bearing: a non-object `params`
// must stay a non-object so the guard still refuses it. `{...null}` is `{}` and
// `{..."ab"}` is `{0:"a",1:"b"}`, so an unconditional spread would turn every
// shape the guard exists to reject into an acceptable one — the laundering the
// registration walk met in #2139.
import { createRouter } from "@real-router/core";
import { describe, expect, it, vi } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import {
  createMockedBrowser,
  routerConfig,
  noop,
} from "../../helpers/testUtils";

import type { Router } from "@real-router/core";

describe("#2141 — the nested bags of a restored entry are read once", () => {
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  };

  it("commits the nested value the guard validated, not a later read", async () => {
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);

    const browser = createMockedBrowser(noop);
    const router: Router = createRouter(routerConfig, {
      defaultRoute: "home",
    });

    router.usePlugin(browserPluginFactory({}, browser));
    await router.start("/users/list");

    // The `params` OBJECT is stable — only a key inside it drifts, which is
    // exactly what a top-level snapshot cannot see.
    let reads = 0;
    const params = {
      get id(): string {
        reads += 1;

        return reads === 1 ? "1" : "SECOND";
      },
    };

    globalThis.history.replaceState({}, "", "/users/view/1");
    globalThis.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { name: "users.view", params, path: "/users/view/1" },
      }),
    );
    await settle();

    expect({
      committedPath: router.getState()?.path,
      committedId: (router.getState()?.params as { id?: unknown } | undefined)
        ?.id,
    }).toStrictEqual({ committedPath: "/users/view/1", committedId: "1" });

    router.stop();
  });

  it("a non-object nested bag is still REFUSED, not laundered into one", async () => {
    // The control that keeps the copy honest. Each of these reaches the guard as
    // the caller wrote it; a plain spread would hand the guard `{}` — or, for a
    // string, a bag of numeric keys — and the entry would restore instead of
    // falling back to `matchPath`.
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);

    const table: Record<string, unknown> = {};

    for (const [label, value] of [
      ["null", null],
      ["string", "ab"],
      ["number", 42],
      // ⚠ The shape the copy's predicate actually turns on. A shorthand
      // `__proto__` in a literal sets the PROTOTYPE and creates no own key, so a
      // `typeof`-gated copy hands the guard a plain object — measured, the first
      // form of the helper did exactly that and `security.test.ts` went from
      // refusing this entry to committing it.
      ["modified prototype", { id: "1", __proto__: { polluted: true } }],
    ] as const) {
      const browser = createMockedBrowser(noop);
      const router: Router = createRouter(routerConfig, {
        defaultRoute: "home",
      });

      router.usePlugin(browserPluginFactory({}, browser));
      await router.start("/users/list");

      globalThis.history.replaceState({}, "", "/users/view/7");
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { name: "users.view", params: value, path: "/users/view/1" },
        }),
      );
      await settle();

      // Refused ⇒ `matchPath` of the LOCATION wins, so the path is `/7`, not the
      // `/1` the entry claimed.
      table[label] = router.getState()?.path;
      router.stop();
    }

    expect(table).toStrictEqual({
      null: "/users/view/7",
      string: "/users/view/7",
      number: "/users/view/7",
      "modified prototype": "/users/view/7",
    });
  });

  it("CONTROL — an ordinary nested bag restores exactly as before", async () => {
    const browser = createMockedBrowser(noop);
    const router: Router = createRouter(routerConfig, {
      defaultRoute: "home",
    });

    router.usePlugin(browserPluginFactory({}, browser));
    await router.start("/users/list");

    globalThis.history.replaceState({}, "", "/users/view/9");
    globalThis.dispatchEvent(
      new PopStateEvent("popstate", {
        state: {
          name: "users.view",
          params: { id: "9" },
          path: "/users/view/9",
        },
      }),
    );
    await settle();

    expect(router.getState()?.path).toBe("/users/view/9");

    router.stop();
  });
});
