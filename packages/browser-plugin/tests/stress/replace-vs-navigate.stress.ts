import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import {
  createStressRouter,
  expectedStressError,
  noop,
  waitForTransitions,
} from "./helpers";

/**
 * B7.2 — `replaceHistoryState` racing concurrent `navigate()`
 *
 * `router.replaceHistoryState(name, params)` writes to `history.state`
 * synchronously without going through the navigation pipeline. If a real
 * `navigate()` is in flight at the same moment, the order in which the
 * two writes hit `history.state` is decided by JS microtask scheduling.
 *
 * The invariant we care about: whichever write lands LAST wins, and
 * `history.state` is always one of the two competing states (never
 * stale, never `null`, never a torn merge of the two).
 */
describe("B7.2 — replaceHistoryState vs navigate race", () => {
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

  it("history.state always references one of the two contenders, never tears", async () => {
    const { router, browser } = createStressRouter();

    try {
      await router.start();

      const acceptableNames = new Set<string>(["users.list", "home"]);

      // 200 paired writes: navigate("users.list") interleaved with
      // replaceHistoryState("home"). Both targets are valid routes so a
      // landing on either is fine — what's NOT fine is `history.state`
      // becoming undefined or having a `name` that wasn't dispatched.
      const navPromises: Promise<unknown>[] = [];

      for (let i = 0; i < 200; i++) {
        navPromises.push(
          router.navigate("users.list").catch(expectedStressError),
        );
        // replaceHistoryState is synchronous — this is the race.
        try {
          router.replaceHistoryState("home");
        } catch {
          // Allowed only when the router transitioned mid-call to a state
          // where buildState fails — extremely rare; do not let it kill
          // the test.
        }
      }

      await Promise.allSettled(navPromises);
      await waitForTransitions(20);

      // After the dust settles, replaceHistoryState/onTransitionSuccess
      // both wrote to the buffered `history.state`. The buffer is mutable
      // (B5/A2 — `createUpdateBrowserState`), so the last write wins.
      // Touch `browser.getLocation()` to ensure the cached browser is alive.
      browser.getLocation();
      const finalHistoryState = globalThis.history.state;

      expect(finalHistoryState).not.toBeNull();
      expect(typeof finalHistoryState.name).toBe("string");
      expect(acceptableNames.has(finalHistoryState.name)).toBe(true);

      // The router state itself must also be one of the two — no torn
      // intermediate state should leak through.
      const routerName = router.getState()?.name ?? "";

      expect(acceptableNames.has(routerName)).toBe(true);
    } finally {
      router.stop();
    }
  });
});
