import { act, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

const ANNOUNCER_SEL = "[data-real-router-announcer]";
const SAFARI_READY_DELAY = 100;
const CLEAR_DELAY = 7000;

function announcer(): Element | null {
  return document.querySelector(ANNOUNCER_SEL);
}

describe("RouterProvider — announceNavigation", () => {
  let router: Router;

  beforeEach(async () => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
    // Deferred rAF (setTimeout-based) so the double-rAF announce can be driven
    // AND interrupted (destroy before it fires) deterministically.
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        setTimeout(() => {
          cb(0);
        }, 0);

        return 0;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", (): void => {
      /* cleared via vi.clearAllTimers in afterEach */
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    router.stop();
    vi.unstubAllGlobals();
    announcer()?.remove();
    document.body.innerHTML = "";
  });

  // ── wiring ────────────────────────────────────────────────────────────────

  it("no announceNavigation prop — no announcer element", () => {
    render(
      <RouterProvider router={router}>
        <div />
      </RouterProvider>,
    );

    expect(announcer()).toBeNull();
  });

  it("announceNavigation — element has aria-live='assertive' + aria-atomic='true'", () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    expect(announcer()?.getAttribute("aria-live")).toBe("assertive");
    expect(announcer()?.getAttribute("aria-atomic")).toBe("true");
  });

  it("cleanup on unmount — announcer element removed", () => {
    const { unmount } = render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    expect(announcer()).not.toBeNull();

    unmount();

    expect(announcer()).toBeNull();
  });

  // ── announce behaviour ──────────────────────────────────────────────────
  //
  // The announcer skips the FIRST navigation it observes (isInitialNavigation),
  // so every announce test performs a throwaway warm-up navigation first.

  async function warmup(): Promise<void> {
    await act(async () => {
      await router.navigate("home");
    });
  }

  it("announces the route after the Safari-ready window (direct path)", async () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await warmup();

    // isReady = true (Safari window elapsed) BEFORE the announced navigation →
    // direct doAnnounce (no buffering).
    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10); // fire the double rAF
    });

    expect(announcer()?.textContent).toBe("Navigated to about");
  });

  it("buffers a navigation during the Safari-ready window, then flushes it", async () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await warmup();

    // No advance to isReady → the double rAF resolves the text but `isReady`
    // is still false, so it is deferred into `pendingText`.
    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10); // double rAF fires → defer (isReady false)
    });

    expect(announcer()?.textContent).toBe("");

    // Safari window elapses → the buffered text flushes.
    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY);
    });

    expect(announcer()?.textContent).toBe("Navigated to about");
  });

  it("clears the announcement after CLEAR_DELAY", async () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(announcer()?.textContent).toBe("Navigated to about");

    void act(() => {
      vi.advanceTimersByTime(CLEAR_DELAY + 1);
    });

    expect(announcer()?.textContent).toBe("");
  });

  it("does not announce when destroyed before the double rAF resolves", async () => {
    const { unmount } = render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    const node = announcer();

    await act(async () => {
      await router.navigate("about");
    });

    // Unmount (destroy) BEFORE the deferred double rAF fires → the rAF callback
    // sees isDestroyed and bails without touching the (already-removed) node.
    unmount();

    expect(() => {
      void act(() => {
        vi.advanceTimersByTime(10);
      });
    }).not.toThrow();

    expect(node?.textContent ?? "").toBe("");
  });

  it("reads the incoming <h1>, focuses it, and skips an identical re-announce", async () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <h1>Docs</h1>
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    // First announced navigation resolves its text from the <h1> and focuses it.
    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    const h1 = document.querySelector("h1");

    expect(h1?.getAttribute("tabindex")).toBe("-1");
    expect(announcer()?.textContent).toBe("Navigated to Docs");

    // Second navigation resolves to the SAME text (same <h1>) → skipped.
    await act(async () => {
      await router.navigate("home");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(announcer()?.textContent).toBe("Navigated to Docs");
  });

  it("shares one ref-counted announcer element across providers", () => {
    const { unmount: unmountA } = render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    const { unmount: unmountB } = render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    // The second provider's announcer reuses the first's element
    // (getOrCreateAnnouncer returns the existing node) — one shared element.
    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

    // Ref-count: releasing one holder keeps the shared element alive.
    unmountA();

    expect(announcer()).not.toBeNull();

    unmountB();

    expect(announcer()).toBeNull();
  });

  // ── announceNavigation options (getAnnouncementText / prefix) ─────────────

  it("uses a custom getAnnouncementText", async () => {
    render(
      <RouterProvider
        router={router}
        announceNavigation={{
          getAnnouncementText: (route) => `You are on ${route.name}`,
        }}
      >
        <div />
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(announcer()?.textContent).toBe("You are on about");
  });

  it("falls back to default resolution when getAnnouncementText returns empty", async () => {
    render(
      <RouterProvider
        router={router}
        announceNavigation={{ getAnnouncementText: () => "" }}
      >
        <div />
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    // Empty custom result → fall through to the default chain.
    expect(announcer()?.textContent).toBe("Navigated to about");
  });

  it("falls back to default resolution when getAnnouncementText throws", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <RouterProvider
        router={router}
        announceNavigation={{
          getAnnouncementText: () => {
            throw new Error("boom");
          },
        }}
      >
        <div />
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(errorSpy).toHaveBeenCalled();
    expect(announcer()?.textContent).toBe("Navigated to about");
  });

  it("uses a custom prefix", async () => {
    render(
      <RouterProvider router={router} announceNavigation={{ prefix: "Page: " }}>
        <div />
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(announcer()?.textContent).toBe("Page: about");
  });

  it("falls through to the pathname for an unknown (internal @@) route", async () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    // A not-found navigation lands on @@UNKNOWN_ROUTE → the internal-route
    // guard blanks the route name, so resolution falls through the chain
    // (no <h1>, empty title) to `location.pathname`.
    await act(async () => {
      router.navigateToNotFound("/does-not-exist");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(announcer()?.textContent).toContain("Navigated to");
    expect(announcer()?.textContent).not.toContain("@@");
  });

  it("does not override an existing tabindex on the incoming <h1>", async () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <h1 tabIndex={0}>Home</h1>
      </RouterProvider>,
    );

    await warmup();

    void act(() => {
      vi.advanceTimersByTime(SAFARI_READY_DELAY + 1);
    });

    await act(async () => {
      await router.navigate("about");
    });

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    // Existing tabindex is preserved (manageFocus skips the setAttribute).
    expect(document.querySelector("h1")?.getAttribute("tabindex")).toBe("0");
  });
});
