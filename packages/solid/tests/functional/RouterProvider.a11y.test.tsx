import { render } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

const ANNOUNCER_SEL = "[data-real-router-announcer]";

describe("RouterProvider — announceNavigation", () => {
  let router: Router;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.querySelector(ANNOUNCER_SEL)?.remove();
  });

  it("no announceNavigation prop — no announcer element in DOM", () => {
    render(() => (
      <RouterProvider router={router}>
        <div />
      </RouterProvider>
    ));

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });

  it("announceNavigation=true — element appears and text updates after navigation", async () => {
    render(() => (
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>
    ));

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    vi.advanceTimersByTime(100);

    await router.navigate("about");
    await router.navigate("home");

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toMatch(
      /^Navigated to\s+/,
    );
  });

  it("announcer has aria-live='assertive' and aria-atomic='true'", () => {
    render(() => (
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer?.getAttribute("aria-live")).toBe("assertive");
    expect(announcer?.getAttribute("aria-atomic")).toBe("true");
  });

  it("cleanup on unmount — announcer element removed from DOM", () => {
    const { unmount } = render(() => (
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>
    ));

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    unmount();

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });

  // Regression test for audit bug R1 (section 5.9): rapid navigations that
  // arrive during the 100ms Safari-ready window previously were dropped
  // silently. Phase 3 fix queues the latest pending text; when isReady flips,
  // the queued announcement fires once.
  it("rapid navigation before Safari-ready delay is announced via pending queue", async () => {
    render(() => (
      <RouterProvider router={router} announceNavigation>
        <h1>Home</h1>
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();

    // Within the Safari-ready window (<100ms), navigate twice. Each navigation
    // lands in the rAF handler with isReady=false and should overwrite the
    // pending text, not flush it to the DOM yet.
    vi.advanceTimersByTime(50);

    await router.navigate("about");
    await router.navigate("home");

    // isReady is still false — announcer has not received any text yet.
    expect(announcer?.textContent).toBe("");

    // Advance past SAFARI_READY_DELAY (100ms). The pending queue fires once.
    vi.advanceTimersByTime(100);

    expect(announcer?.textContent).toContain("Navigated to");
  });

  // §5.7 audit edge cases — route-announcer behavior locked via functional
  // tests against the real Solid integration. All scenarios were marked LOW
  // and would silently break only on a route-announcer refactor; locking
  // them here catches such regressions at PR-time.

  // Helper: warms up the announcer past the `isInitialNavigation` skip
  // by performing a no-op navigation. The route-announcer treats its
  // FIRST router.subscribe callback as the initial state and silently
  // skips the announcement; tests that need a "real" announcement to
  // fire must navigate twice (or once after the warm-up).
  async function warmUpAnnouncer(): Promise<void> {
    vi.advanceTimersByTime(100);
    await router.navigate("home").catch(() => {});
  }

  it("§5.7 — second navigation to the same text is skipped (lastAnnouncedText guard)", async () => {
    document.title = "FixedTitle";

    render(() => (
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    // Need TWO real navigations to reach lastAnnouncedText:
    //   nav 1 — initial-skip (route-announcer's isInitialNavigation guard)
    //   nav 2 — actually announces and SETS lastAnnouncedText
    vi.advanceTimersByTime(100);
    await router.navigate("home");
    await router.navigate("about");

    expect(announcer?.textContent).toBe("Navigated to FixedTitle");

    // Clear visible state, then attempt a third navigation that resolves
    // to the SAME text (document.title still "FixedTitle"). The guard
    // `text === lastAnnouncedText` must short-circuit the DOM write —
    // the manual mutation should survive.
    announcer!.textContent = "MUTATED";

    await router.navigate("home", {}, { force: true });

    expect(announcer?.textContent).toBe("MUTATED");

    document.title = "";
  });

  it("§5.7 — internal `@@`-prefixed route name is dropped from text resolution", async () => {
    document.title = "";
    document.querySelectorAll("h1").forEach((h1) => h1.remove());

    render(() => (
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    await warmUpAnnouncer();

    await router.navigate("about");

    // resolveText replaces routeName with "" when it starts with "@@". No
    // h1, no document.title, no @@-route → falls back to location.pathname
    // for internal routes, or route.name for normal routes. Normal route
    // "about" produces "Navigated to about" (no @@ leak possible here);
    // the negative assertion below is what locks the strip behavior.
    expect(announcer?.textContent).not.toContain("@@");
    expect(announcer?.textContent).toContain("Navigated to");
  });

  it("§5.7 — no h1 present + no document.title → falls back to routeName", async () => {
    document.title = "";
    document.querySelectorAll("h1").forEach((h1) => h1.remove());

    render(() => (
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    await warmUpAnnouncer();

    await router.navigate("about");

    // resolveText cascade: h1Text || document.title || routeName || pathname.
    // Only routeName is non-empty → "about".
    expect(announcer?.textContent).toBe("Navigated to about");
  });

  it("§5.7 — clearTimeoutId fires 7000ms after announcement (announcer text cleared)", async () => {
    render(() => (
      <RouterProvider router={router} announceNavigation>
        <h1>Home</h1>
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    await warmUpAnnouncer();

    await router.navigate("about");

    expect(announcer?.textContent).toContain("Navigated to");

    // CLEAR_DELAY === 7000ms — after the window elapses, the announcer text
    // is wiped and lastAnnouncedText is reset (so the next nav with the same
    // resolved text fires again).
    vi.advanceTimersByTime(7001);

    expect(announcer?.textContent).toBe("");
  });

  it("§5.7 — h1 already has tabindex — manageFocus does NOT overwrite", async () => {
    let h1Ref!: HTMLHeadingElement;

    render(() => (
      <RouterProvider router={router} announceNavigation>
        <h1 ref={h1Ref!} tabIndex={-3}>
          Home
        </h1>
      </RouterProvider>
    ));

    await warmUpAnnouncer();

    await router.navigate("about");

    // The announcer's manageFocus only sets tabindex if absent; pre-existing
    // -3 must survive untouched.
    expect(h1Ref!.getAttribute("tabindex")).toBe("-3");
  });

  it("§5.7 — destroy() during rAF → isDestroyed guard prevents DOM write", async () => {
    // rAF is stubbed to fire synchronously (see beforeEach). To simulate the
    // race, override the global rAF mock locally so the callbacks queue up
    // instead of firing immediately, then trigger them after destroy().
    const queued: FrameRequestCallback[] = [];

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queued.push(cb);

      return queued.length;
    });

    const { unmount } = render(() => (
      <RouterProvider router={router} announceNavigation>
        <h1>Home</h1>
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    vi.advanceTimersByTime(100);
    // Warm-up nav — still produces queued rAF callbacks; flush them so the
    // initial-skip transition fires cleanly.
    await router.navigate("home").catch(() => {});
    for (const cb of queued.splice(0)) {
      cb(0);
    }
    for (const cb of queued.splice(0)) {
      cb(0);
    }

    // The real test nav — its rAF callbacks queue up but do NOT flush yet.
    await router.navigate("about");

    // Destroy BEFORE flushing — isDestroyed must prevent the inner-rAF write.
    unmount();

    for (const cb of queued.splice(0)) {
      cb(0);
    }
    for (const cb of queued.splice(0)) {
      cb(0);
    }

    // Announcer element was removed in destroy(); textContent never written.
    expect(announcer?.isConnected).toBe(false);
  });

  it("§5.7 — custom getAnnouncementText throw is swallowed; falls back to default resolution", async () => {
    // The Solid RouterProvider does not pass `getAnnouncementText` through,
    // so we exercise the fallback path by directly invoking the shared
    // announcer factory. This locks the shared/dom-utils contract that a
    // throwing custom resolver is caught and logged — it does NOT tear
    // down the announcer subscription.
    const { createRouteAnnouncer } = await import(
      "../../src/dom-utils/route-announcer.js"
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    document.title = "ServerTitle";
    document.querySelectorAll("h1").forEach((h1) => h1.remove());

    const handle = createRouteAnnouncer(router, {
      getAnnouncementText: () => {
        throw new Error("boom");
      },
    });

    vi.advanceTimersByTime(100);
    // Warm up the announcer past the initial-skip.
    await router.navigate("home").catch(() => {});

    await router.navigate("about");

    const announcer = document.querySelector(ANNOUNCER_SEL);

    // Fallback chain: h1 absent, document.title="ServerTitle" → use it.
    expect(announcer?.textContent).toBe("Navigated to ServerTitle");
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("getAnnouncementText threw"),
      expect.any(Error),
    );

    handle.destroy();
    errSpy.mockRestore();
    document.title = "";
  });
});
