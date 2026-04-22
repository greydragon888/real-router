import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, noop, waitForTransitions } from "./helpers";

/**
 * B7.6 — Exotic popstate.state stress
 *
 * `isStateStrict` from `type-guards` filters `history.state` shape:
 * - plain object with `name: string` and `params: Record<string, string>`
 *
 * Anything else must fall through the validator silently and trigger the
 * URL-matching fallback in `getRouteFromEvent`. Plain-object stress is
 * already covered by `corrupted-state-storm.stress.ts` — this file
 * targets prototypes that only show up via reflection.
 */
describe("B7.6 — exotic popstate.state values", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("filters non-plain-object state shapes (Map, function, Symbol box, Date)", async () => {
    const { router, dispatchPopstate } = createStressRouter();

    try {
      await router.start();
      await router.navigate("users.list");

      const baselineName = router.getState()?.name;

      const exoticStates: unknown[] = [];

      // 250 each of: Map, function-shaped, Symbol-keyed wrapper, Date.
      for (let i = 0; i < 250; i++) {
        exoticStates.push(
          new Map([["name", "users.view"]]),
          (() => ({ name: "users.view" })) as unknown,
          { [Symbol("name")]: "users.view" },
          new Date(),
        );
      }

      // Set the URL to one that does NOT match any route, so any incorrect
      // pass-through to the matchPath fallback would visibly change the
      // router state away from `baselineName`.
      globalThis.history.replaceState({}, "", "/never-matches-anything");

      for (const state of exoticStates) {
        dispatchPopstate(state as Record<string, unknown> | null);
      }

      await waitForTransitions(50);

      // None of the exotic shapes pass `isStateStrict`, and the URL doesn't
      // match — with `allowNotFound: true` (helpers default) every event
      // resolves through `navigateToNotFound`. The router state will be
      // UNKNOWN_ROUTE, but the key invariant is: no crash, all events
      // processed, URL-matching fallback always runs (never the state-based
      // fast path). Either UNKNOWN_ROUTE or the baseline route is acceptable
      // — what's NOT acceptable is the router silently adopting the exotic
      // payload's `name` field.
      const finalName = router.getState()?.name ?? "";

      expect(finalName).not.toBe("users.view");
      expect(finalName === baselineName || finalName.includes("UNKNOWN")).toBe(
        true,
      );
    } finally {
      router.stop();
    }
  });
});
