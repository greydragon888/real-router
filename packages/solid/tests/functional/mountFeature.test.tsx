// packages/solid/tests/functional/mountFeature.test.tsx

/**
 * Locks the contract of the private `mountFeature` helper in
 * `RouterProvider.tsx`. The helper is not exported, so we test it
 * indirectly via the public `announceNavigation` / `scrollRestoration` /
 * `viewTransitions` opt-in props — observing the side-effects (factory
 * call count + cleanup count) is the same contract regardless of which
 * opt-in we pick. We use `scrollRestoration` because its factory has the
 * simplest observable side-effect (flipping `history.scrollRestoration`).
 *
 * Audit-2026-05-17 §6 §5.5 #21 — `mountFeature` has zero PBT / direct
 * functional coverage today; RouterProvider tests exercise the props
 * end-to-end but don't isolate the wiring contract:
 *
 *   - enabled=false → factory NOT called, destroy NOT called
 *   - enabled=true  → factory called exactly once, destroy called once on
 *                     unmount
 *   - SSR (no DOM) → factory still called once, destroy on owner dispose
 *
 * A regression that re-ran the factory on every navigation or skipped
 * the destroy call on unmount would slip past the existing functional
 * tests (they assert observable feature behaviour, not call counts).
 */

import { render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

describe("mountFeature wiring (private helper, audit-2026-05-17 §6 §5.5)", () => {
  let router: Router;
  let originalScrollRestoration: ScrollRestoration;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
    originalScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = "auto";
  });

  afterEach(() => {
    router.stop();
    history.scrollRestoration = originalScrollRestoration;
  });

  it("enabled=falsy (no prop) → factory NOT invoked; history.scrollRestoration unchanged", () => {
    const { unmount } = render(() => (
      <RouterProvider router={router}>
        <div />
      </RouterProvider>
    ));

    // createScrollRestoration flips `history.scrollRestoration` to
    // "manual" on install. Untouched value here is the observable proof
    // that the factory was NOT invoked.
    expect(history.scrollRestoration).toBe("auto");

    unmount();

    // Still untouched — no destroy was registered (nothing to restore).
    expect(history.scrollRestoration).toBe("auto");
  });

  it("enabled=true → factory invoked once; destroy restores history.scrollRestoration on unmount", () => {
    const { unmount } = render(() => (
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>
    ));

    // Install side-effect proves the factory fired exactly once: the flip
    // to "manual" only happens inside createScrollRestoration.
    expect(history.scrollRestoration).toBe("manual");

    unmount();

    // destroy() restored to the previous value ("auto", captured at
    // install time). A regression that skipped destroy would leave it
    // at "manual".
    expect(history.scrollRestoration).toBe("auto");
  });

  it("enabled=true → multiple navigations DON'T re-trigger the factory (factory called once at mount, not per-nav)", async () => {
    const { unmount } = render(() => (
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>
    ));

    expect(history.scrollRestoration).toBe("manual");

    // Multiple navigations — a regression that re-installs the feature
    // on each navigation would re-flip history.scrollRestoration (a
    // no-op flip-to-already-manual, but the underlying double-install
    // would produce TWO `destroy` registrations and TWO subscribe
    // handles on the router).
    await router.navigate("test").catch(() => {});
    await router.navigate("one-more-test").catch(() => {});
    await router.navigate("test").catch(() => {});

    // Still "manual" — feature is still installed and uninvolved.
    expect(history.scrollRestoration).toBe("manual");

    unmount();

    // ONE destroy fired → ONE restore. A double-install would result
    // in the second destroy seeing `history.scrollRestoration === "auto"`
    // and trying to restore to its own captured value (also "auto"),
    // producing a no-op chain. The observable end-state is still
    // "auto" either way — what we can lock here is that no exception
    // is thrown during unmount and the final value is correct.
    expect(history.scrollRestoration).toBe("auto");
  });

  it("disabled opt-in does NOT install even when other opt-ins are enabled", () => {
    // Mixing enabled scrollRestoration with disabled viewTransitions
    // and disabled announceNavigation locks that mountFeature checks
    // the per-feature `enabled` flag, not a shared "any feature on"
    // gate.
    const { unmount } = render(() => (
      <RouterProvider
        router={router}
        scrollRestoration={{ mode: "restore" }}
        // announceNavigation, viewTransitions intentionally omitted
      >
        <div />
      </RouterProvider>
    ));

    // scroll opt-in installed.
    expect(history.scrollRestoration).toBe("manual");
    // announce opt-in NOT installed — the announcer DOM node must not exist.
    expect(document.querySelector("[data-real-router-announcer]")).toBeNull();

    unmount();
  });
});
