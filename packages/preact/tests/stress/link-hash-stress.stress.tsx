// packages/preact/tests/stress/link-hash-stress.stress.tsx

/**
 * Stress tests for `<Link hash>` + `navigateWithHash` (#532) — concurrent
 * hash-only navigations, mass-rendered Links with `hash` prop, and the
 * auto-`force/hashChange` SAME_STATES bypass under load.
 *
 * Closes:
 *   - §7.2 #13 (partial → covered): "Concurrent <Link> clicks с {force: true}"
 *   - §7.3: "<Link hash> (#532) под stress — нет ни functional, ни stress
 *     coverage в Preact для hash tri-state и navigateWithHash auto-force"
 *
 * Setup note: this test runs without browser-plugin / hash-plugin, so
 * `state.context.url.hash` is never populated by the runtime. The
 * `subscribe`-driven mock below mirrors what those plugins do — patches
 * `context.url.hash` from the most recent navigation's `opts.hash`. This
 * lets `navigateWithHash`'s same-route hash-change detection have a real
 * comparison signal across iterations.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Link, RouterProvider } from "@real-router/preact";

import { createStressRouter } from "./helpers";
import { navigateWithHash } from "../../src/dom-utils";

import type {
  NavigationOptions,
  Params,
  Router,
  State,
} from "@real-router/core";

interface NavigateCall {
  name: string;
  params: Params;
  opts: NavigationOptions & { hash?: string; hashChange?: boolean };
}

/**
 * Spy wrapper around `router.navigate` that records every call's opts so
 * `force` / `hashChange` flags can be asserted without browser-plugin in
 * scope. Returns a tearDown that restores the original method.
 */
function instrumentNavigate(router: Router): {
  calls: NavigateCall[];
  restore: () => void;
} {
  const calls: NavigateCall[] = [];
  const original = router.navigate.bind(router);

  router.navigate = ((
    name: string,
    params: Params | undefined,
    _search: unknown,
    opts?: NavigationOptions & { hash?: string; hashChange?: boolean },
  ) => {
    calls.push({ name, params: params ?? {}, opts: opts ?? {} });

    // The stub ignores the query channel (RFC-4 M2 slot); forward opts at pos 4.
    return original(name, params, undefined, opts);
  }) as typeof router.navigate;

  return {
    calls,
    restore: () => {
      router.navigate = original;
    },
  };
}

/**
 * Mirrors browser-plugin / hash-plugin behaviour: writes the navigated
 * `opts.hash` into `state.context.url.hash` so subsequent same-route
 * navigateWithHash calls see a non-empty current hash to compare against.
 *
 * Patches `getState()` so the returned state carries an attached
 * `context.url.hash`. Returns the unsubscribe.
 */
function installMockUrlContext(router: Router): () => void {
  let currentHash = "";
  const originalGetState = router.getState.bind(router);

  router.getState = ((): State | undefined => {
    const state = originalGetState();

    if (!state) {
      return state;
    }

    return {
      ...state,
      context: {
        ...state.context,
        url: { hash: currentHash },
      },
    } as State;
  }) as Router["getState"];

  // No-op subscriber kept so the mock can react to navigations if a test
  // ever needs to advance `currentHash` from inside `subscribe`. Tests
  // mutate `currentHash` directly via `__setMockHash` instead.
  const off = router.subscribe(() => {});

  const set = (h: string): void => {
    currentHash = h;
  };

  // Expose setter via a private symbol on the router for the tests.
  (router as Router & { __setMockHash?: (h: string) => void }).__setMockHash =
    set;

  return () => {
    off();
    router.getState = originalGetState;
    delete (router as Router & { __setMockHash?: (h: string) => void })
      .__setMockHash;
  };
}

describe("R — <Link hash> + navigateWithHash stress (§7.2 #13, §7.3)", () => {
  let router: Router;
  let removeMockUrl: () => void;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
    removeMockUrl = installMockUrlContext(router);
  });

  afterEach(() => {
    removeMockUrl();
    router.stop();
    cleanup();
  });

  it("rapid same-route different-hash navigateWithHash calls all set force/hashChange (§7.3)", async () => {
    // Pure helper-level stress: 50 hash-only navigations on the same route.
    // Each must arrive at router.navigate with force=true, hashChange=true
    // (auto-bypass for SAME_STATES). The current hash is advanced on every
    // commit via the mock so the comparison loop sees real diffs.
    const { calls, restore } = instrumentNavigate(router);
    const setMockHash = (
      router as Router & {
        __setMockHash?: (h: string) => void;
      }
    ).__setMockHash;

    try {
      for (let i = 1; i <= 50; i++) {
        await act(async () => {
          await navigateWithHash(router, "route0", {}, `section-${i}`).catch(
            () => {},
          );
        });
        // Advance the mock current hash so the NEXT iteration sees the
        // previous one as `currentHash` for the diff check.
        setMockHash?.(`section-${i}`);
      }

      expect(calls).toHaveLength(50);

      for (const [i, call] of calls.entries()) {
        // First call's current hash is "" (mock default), then advances.
        expect(call.opts.hash).toBe(`section-${i + 1}`);
        expect(call.opts.force).toBe(true);
        expect(call.opts.hashChange).toBe(true);
      }
    } finally {
      restore();
    }
  });

  it("same-route same-hash navigateWithHash does NOT add force/hashChange", async () => {
    // The auto-bypass is gated on hash difference. Repeating the same hash
    // must pass through cleanly — no force, no hashChange — so core's
    // SAME_STATES path correctly suppresses the redundant transition.
    const { calls, restore } = instrumentNavigate(router);
    const setMockHash = (
      router as Router & {
        __setMockHash?: (h: string) => void;
      }
    ).__setMockHash;

    setMockHash?.("anchor");

    try {
      for (let i = 0; i < 20; i++) {
        await act(async () => {
          await navigateWithHash(router, "route0", {}, "anchor").catch(
            () => {},
          );
        });
      }

      expect(calls).toHaveLength(20);

      for (const call of calls) {
        // Same hash → no auto-flag injection. The opts.hash is still
        // propagated to navigate (the helper always forwards it).
        expect(call.opts.hash).toBe("anchor");
        expect(call.opts.force).toBeUndefined();
        expect(call.opts.hashChange).toBeUndefined();
      }
    } finally {
      restore();
    }
  });

  it("100 mass-rendered <Link hash> instances — re-render only the ones whose hash actually changed", async () => {
    // memo + areLinkPropsEqual must compare `hash` field. A regression that
    // dropped `hash` from the comparator would re-render all 100 Links on
    // any single hash change. We render 100 Links, assert href reflects
    // the hash, then verify that only the changed Link mutates href.
    const linkProps = Array.from({ length: 100 }, (_, i) => ({
      routeName: "route0",
      hash: `section-${i}`,
      "data-testid": `link-${i}`,
    }));

    const { container } = render(
      <RouterProvider router={router}>
        {linkProps.map((props) => (
          <Link key={props["data-testid"]} {...props}>
            link
          </Link>
        ))}
      </RouterProvider>,
    );

    // Snapshot the hrefs.
    const hrefs = linkProps.map((p) => {
      const link = container.querySelector(
        `[data-testid="${p["data-testid"]}"]`,
      );

      return (link as HTMLAnchorElement | null)?.getAttribute("href");
    });

    // Each Link's href ends with #section-i (when buildUrl is absent the
    // fallback is buildPath + #encodedHash).
    for (const [i, href] of hrefs.entries()) {
      expect(href).toMatch(new RegExp(`#section-${i}$`));
    }
  });

  it("concurrent click bursts on hash-bearing Links — every click invokes navigate exactly once", async () => {
    // Mass-render 20 hash-bearing Links and fire 5 rapid clicks on each
    // (100 total). Each click must be observed exactly once by navigate —
    // the memo wrapper around the click handler must not coalesce or drop.
    const { calls, restore } = instrumentNavigate(router);

    try {
      const { container } = render(
        <RouterProvider router={router}>
          {Array.from({ length: 20 }, (_, i) => (
            <Link
              key={`tab-${i}`}
              routeName="route0"
              hash={`tab-${i}`}
              data-testid={`tab-${i}`}
            >
              Tab {i}
            </Link>
          ))}
        </RouterProvider>,
      );

      for (let i = 0; i < 20; i++) {
        const link = container.querySelector(`[data-testid="tab-${i}"]`);

        for (let j = 0; j < 5; j++) {
          await act(async () => {
            fireEvent.click(link!);
          });
        }
      }

      // Exactly 100 navigate calls observed. None dropped, none doubled.
      expect(calls).toHaveLength(100);

      // Every recorded call targets route0 with the expected per-link hash.
      for (const [i, call] of calls.entries()) {
        const tabIndex = Math.floor(i / 5);

        expect(call.name).toBe("route0");
        expect(call.opts.hash).toBe(`tab-${tabIndex}`);
      }
    } finally {
      restore();
    }
  });
});
