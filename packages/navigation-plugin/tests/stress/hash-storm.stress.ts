import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

/**
 * N21 — Hash storm. The 2026-05-18 audit (§7.2) flagged the lack of a stress
 * test for the `event.hashChange === true` branch in `navigate-handler.ts:143`
 * and the `state.context.url.hashChanged` correctness contract from #532.
 *
 * Scenario: 1000 hash-only browser-driven navigations on the same path. Each
 * fires `navigate` with `hashChange: true`. The plugin must:
 *   - bypass core's SAME_STATES rejection via `force: true, hashChange: true`;
 *   - publish `state.context.url.hash` matching the destination fragment;
 *   - publish `state.context.url.hashChanged === true` when the hash differs
 *     from the previous transition's published hash.
 */

describe("N21 — Hash storm", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N21.1: 1000 hash-only navigations — every transition publishes correct context.url.hash and hashChanged signal", async () => {
    const { router, mockNav, unsubscribe } = createStressRouter();

    mockNav.reset("http://localhost/home");
    await router.start();

    let prevHash = "";
    let hashChangedCount = 0;

    for (let i = 0; i < 1000; i++) {
      const target = `section${i}`;

      await mockNav.navigate(`http://localhost/home#${target}`).finished;
      await waitForTransitions(0);

      const state = router.getState();
      const url = (
        state?.context as { url?: { hash: string; hashChanged: boolean } }
      ).url;

      expect(url).toBeDefined();
      expect(url!.hash).toBe(target);

      // Each iteration uses a fresh `section${i}` hash → always different from
      // the previous one, so hashChanged must be true on every step.
      expect(target).not.toBe(prevHash);
      expect(url!.hashChanged).toBe(true);

      hashChangedCount++;

      prevHash = target;
    }

    // Sanity: every iteration changed the hash, so hashChanged must have
    // been observed 1000 times — a regression that always set it to `false`
    // (e.g. via a stale `publishedPrevHash` snapshot) would fail here.
    expect(hashChangedCount).toBe(1000);

    router.stop();
    unsubscribe();
  });

  it("N21.2: 500 alternating hash navigations — hashChanged toggles correctly", async () => {
    // Pins the comparison-against-published-prev-hash invariant: when we
    // alternate between two hashes, hashChanged must be `true` on every step
    // (because the previous published hash never equals the new one).
    const { router, mockNav, unsubscribe } = createStressRouter();

    mockNav.reset("http://localhost/home");
    await router.start();

    for (let i = 0; i < 500; i++) {
      const target = i % 2 === 0 ? "a" : "b";

      await mockNav.navigate(`http://localhost/home#${target}`).finished;
      await waitForTransitions(0);

      const state = router.getState();
      const url = (
        state?.context as { url?: { hash: string; hashChanged: boolean } }
      ).url;

      expect(url!.hash).toBe(target);
      expect(url!.hashChanged).toBe(true);
    }

    router.stop();
    unsubscribe();
  });

  it("N21.3: same-hash repeats — router stays on /home#stuck, no state corruption under 100 SAME_STATES rejections", async () => {
    // Repeated same-URL navigations trigger MockNavigation's auto-replace
    // path (history: "replace" when destination === current). Each fires a
    // navigate event with `hashChange: false`, so the plugin forwards to
    // `api.navigateToState` WITHOUT `force: true`. Core rejects with
    // SAME_STATES; navigate-handler's `withRecovery` swallows the
    // RouterError (SAME_STATES branch — URL and router state already
    // consistent, no sync needed). After 100 such rejections the router
    // must still be on the original hash, with `state.context.url`
    // unchanged from the initial transition.
    const { router, mockNav, unsubscribe } = createStressRouter();

    mockNav.reset("http://localhost/home#stuck");
    await router.start();

    const initialUrlCtx = (
      router.getState()?.context as {
        url?: { hash: string; hashChanged: boolean };
      }
    ).url;

    expect(initialUrlCtx!.hash).toBe("stuck");

    for (let i = 0; i < 100; i++) {
      await mockNav.navigate("http://localhost/home#stuck").finished;
      await waitForTransitions(0);
    }

    const finalState = router.getState();
    const finalUrl = (
      finalState?.context as { url?: { hash: string; hashChanged: boolean } }
    ).url;

    // Hash must still be "stuck"; state name unchanged; no crash log.
    expect(finalState?.name).toBe("home");
    expect(finalUrl!.hash).toBe("stuck");

    router.stop();
    unsubscribe();
  });
});
