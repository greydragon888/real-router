import { createRouter } from "@real-router/core";
import { getTransitionSource } from "@real-router/sources";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

// Controllable IntersectionObserver — captures the callback so tests can
// `trigger(entries)` to exercise scroll-spy's pickTopmost / debounce / emit
// logic through the real RouterProvider wiring (parity with the shared
// scroll-spy suite, but driven via `<RouterProvider scrollSpy>` instead of a
// direct `createScrollSpy` call).
interface FakeIO {
  trigger: (entries: IntersectionObserverEntry[]) => void;
  disconnect: ReturnType<typeof vi.fn>;
  observed: Set<Element>;
  options: IntersectionObserverInit | undefined;
}

interface FakeMO {
  trigger: (mutations: MutationRecord[]) => void;
  disconnect: ReturnType<typeof vi.fn>;
}

const ioInstances: FakeIO[] = [];
const moInstances: FakeMO[] = [];

function installFakeIntersectionObserver(): void {
  ioInstances.length = 0;

  const FakeIOClass = class implements IntersectionObserver {
    public readonly root: Element | Document | null = null;
    public readonly rootMargin: string = "";
    public readonly scrollMargin: string = "";
    public readonly thresholds: readonly number[] = [];

    public disconnect = vi.fn((): void => {
      this.#observed.clear();
    });

    readonly #callback: IntersectionObserverCallback;
    readonly #observed = new Set<Element>();

    constructor(
      cb: IntersectionObserverCallback,
      opts?: IntersectionObserverInit,
    ) {
      this.#callback = cb;
      ioInstances.push({
        trigger: (entries: IntersectionObserverEntry[]): void => {
          this.#callback(entries, this);
        },
        disconnect: this.disconnect,
        observed: this.#observed,
        options: opts,
      });
    }

    public observe(element: Element): void {
      this.#observed.add(element);
    }

    public unobserve(element: Element): void {
      this.#observed.delete(element);
    }

    public takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  };

  vi.stubGlobal("IntersectionObserver", FakeIOClass);
}

function installFakeMutationObserver(): void {
  moInstances.length = 0;

  const FakeMOClass = class implements MutationObserver {
    public disconnect = vi.fn();

    readonly #callback: MutationCallback;

    constructor(cb: MutationCallback) {
      this.#callback = cb;
      moInstances.push({
        trigger: (mutations: MutationRecord[]): void => {
          this.#callback(mutations, this);
        },
        disconnect: this.disconnect,
      });
    }

    public observe(): void {
      /* no-op */
    }

    public takeRecords(): MutationRecord[] {
      return [];
    }
  };

  vi.stubGlobal("MutationObserver", FakeMOClass);
}

function buildEntry(
  target: HTMLElement,
  top: number,
  isIntersecting = true,
): IntersectionObserverEntry {
  return {
    target,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: {
      top,
      bottom: top + 100,
      height: 100,
    } as DOMRectReadOnly,
    intersectionRect: {
      top,
      bottom: top + 100,
      height: 100,
    } as DOMRectReadOnly,
    rootBounds: null,
    time: 0,
  };
}

// Variant that pins `rootBounds.top` — exercises the rootMargin-aware
// distance-to-zoneTop selection path in scroll-spy's `pickTopmost`.
function buildEntryWithZone(
  target: HTMLElement,
  top: number,
  height: number,
  zoneTop: number,
): IntersectionObserverEntry {
  return {
    target,
    isIntersecting: true,
    intersectionRatio: 1,
    boundingClientRect: {
      top,
      bottom: top + height,
      height,
    } as DOMRectReadOnly,
    intersectionRect: {
      top: zoneTop,
      bottom: zoneTop,
      height: 0,
    } as DOMRectReadOnly,
    rootBounds: {
      top: zoneTop,
      bottom: zoneTop,
      height: 0,
    } as DOMRectReadOnly,
    time: 0,
  };
}

function setupAnchors(ids: readonly string[]): HTMLElement[] {
  const elements: HTMLElement[] = [];

  for (const id of ids) {
    const element = document.createElement("section");

    element.id = id;
    document.body.append(element);
    elements.push(element);
  }

  return elements;
}

describe("RouterProvider — scrollSpy", () => {
  let router: Router;

  beforeEach(async () => {
    document.body.innerHTML = "";
    // Reset jsdom's shared URL. The real browser-plugin persists the hash into
    // window.location, which otherwise leaks across tests — a prior scroll-spy
    // emit of `#section-N` makes the next `router.start("/")` read a dirty hash
    // and the same-hash skip gate suppresses the emit under assertion.
    globalThis.history.replaceState(null, "", "/");
    installFakeIntersectionObserver();
    installFakeMutationObserver();
    router = createTestRouterWithADefaultRouter();
    await router.start("/");

    // Fake timers AFTER start (start resolves on microtasks, not timers).
    // scroll-spy debounces via rAF + setTimeout(150); shim rAF → setTimeout(0)
    // so `vi.runAllTimers()` flushes the whole debounce chain deterministically.
    vi.useFakeTimers();
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
      /* cancelled via vi.clearAllTimers in afterEach */
    });
  });

  afterEach(() => {
    // Discard (do NOT fire) any leftover debounce timers — firing a stale
    // scroll-spy debounce on the about-to-be-stopped router pollutes the next
    // test's IntersectionObserver instance list.
    vi.clearAllTimers();
    vi.useRealTimers();
    router.stop();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  // ── wiring (no IO callback fired) ─────────────────────────────────────────

  it("no scrollSpy prop — IntersectionObserver not instantiated", () => {
    render(
      <RouterProvider router={router}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances).toHaveLength(0);
  });

  it("scrollSpy with empty selector — no observer", () => {
    render(
      <RouterProvider router={router} scrollSpy={{ selector: "" }}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances).toHaveLength(0);
  });

  it("scrollSpy with selector — creates IntersectionObserver, disposes on unmount", () => {
    const { unmount } = render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances.length).toBeGreaterThanOrEqual(1);

    unmount();

    for (const inst of ioInstances) {
      expect(inst.disconnect).toHaveBeenCalled();
    }
  });

  // ── behavioral (IO callback fired through the wired utility) ───────────────

  it("emits forced same-route transition (hash/replace/force/hashChange) on intersection", () => {
    const [s1] = setupAnchors(["section-1", "section-2", "section-3"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances.length).toBeGreaterThanOrEqual(1);

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.runAllTimers();
    });

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({
      hash: "section-1",
      replace: true,
      force: true,
      hashChange: true,
    });
  });

  it("picks the topmost-visible (smallest non-negative top) anchor", () => {
    const [s1, s2, s3] = setupAnchors(["section-1", "section-2", "section-3"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances
        .at(-1)
        ?.trigger([
          buildEntry(s1, 200),
          buildEntry(s2, 50),
          buildEntry(s3, 400),
        ]);
      vi.runAllTimers();
    });

    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({ hash: "section-2" });
  });

  it("picks anchor closest to rootBounds.top (rootMargin-aware, centered zone)", () => {
    const [s1, s2] = setupAnchors(["section-1", "section-2"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", rootMargin: "-50% 0px -50% 0px" }}
      >
        <div />
      </RouterProvider>,
    );

    // zoneTop = 500. s1 straddles from far above (dist −300); s2 sits at the
    // line (dist −10, least-negative → picked).
    act(() => {
      ioInstances
        .at(-1)
        ?.trigger([
          buildEntryWithZone(s1, 200, 600, 500),
          buildEntryWithZone(s2, 490, 20, 500),
        ]);
      vi.runAllTimers();
    });

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({ hash: "section-2" });
  });

  it("prefers smallest non-negative distance to zoneTop over least-negative", () => {
    const [s1, s2] = setupAnchors(["section-1", "section-2"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", rootMargin: "-50% 0px -50% 0px" }}
      >
        <div />
      </RouterProvider>,
    );

    // s1 above zone (dist −200); s2 just below (dist +20 → picked).
    act(() => {
      ioInstances
        .at(-1)
        ?.trigger([
          buildEntryWithZone(s1, 300, 100, 500),
          buildEntryWithZone(s2, 520, 100, 500),
        ]);
      vi.runAllTimers();
    });

    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({ hash: "section-2" });
  });

  it("falls back to last-above-zone when no entry has top >= 0", () => {
    const [s1, s2] = setupAnchors(["section-1", "section-2"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, -300), buildEntry(s2, -100)]);
      vi.runAllTimers();
    });

    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({ hash: "section-2" });

    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({ hash: "section-2" });
  });

  it("keeps the least-negative anchor when a more-negative one follows", () => {
    const [s1, s2] = setupAnchors(["section-1", "section-2"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    // Both above the zone: s1 (-100) is closer than s2 (-300). s2 must NOT
    // beat bestNegative → exercises the `distance > bestNegativeDist` false arm.
    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, -100), buildEntry(s2, -300)]);
      vi.runAllTimers();
    });

    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({ hash: "section-1" });
  });

  it("skips emit when no entries are intersecting", () => {
    const [s1] = setupAnchors(["section-1"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50, false)]);
      vi.runAllTimers();
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("skips emit when the resolved hash equals the current hash", async () => {
    await act(async () => {
      await router.navigate("test", {}, undefined, {
        hash: "section-1",
        force: true,
        hashChange: true,
      });
    });

    const [s1] = setupAnchors(["section-1"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.runAllTimers();
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("skips emit when the intersecting anchor has no id", () => {
    const target = document.createElement("section");

    target.dataset.anchor = "";
    document.body.append(target);

    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[data-anchor]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(target, 50)]);
      vi.runAllTimers();
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  // ── anti-flicker gates ────────────────────────────────────────────────────

  it("skips emit while a transition is in flight (isTransitioning gate)", () => {
    const [s1] = setupAnchors(["section-1"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    // Cached source — the same instance the wired spy reads.
    const source = getTransitionSource(router);
    const original = source.getSnapshot();

    vi.spyOn(source, "getSnapshot").mockReturnValue({
      ...original,
      isTransitioning: true,
    });

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.runAllTimers();
    });

    expect(navigateSpy).not.toHaveBeenCalled();

    vi.mocked(source.getSnapshot).mockRestore();

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.runAllTimers();
    });

    expect(navigateSpy).toHaveBeenCalledTimes(1);
  });

  it("user-driven hash change sets cooldown; spy skips intermediate IO events", async () => {
    const [s1, s2] = setupAnchors(["section-1", "section-2"]);

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    // A user-driven Link click updates the hash — the spy's subscribe callback
    // must set coolingDown so the ensuing scroll IO events don't fight it.
    await act(async () => {
      await router.navigate("test", {}, undefined, {
        hash: "section-2",
        force: true,
        hashChange: true,
      });
    });

    const navigateSpy = vi.spyOn(router, "navigate");

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50), buildEntry(s2, 200)]);
      vi.runAllTimers();
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("cooldown clears after the 500ms safety timeout", async () => {
    const [s1] = setupAnchors(["section-1", "section-2"]);

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("test", {}, undefined, {
        hash: "section-2",
        force: true,
        hashChange: true,
      });
    });

    const navigateSpy = vi.spyOn(router, "navigate");

    act(() => {
      vi.advanceTimersByTime(550);
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.runAllTimers();
    });

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({ hash: "section-1" });
  });

  it("spy's own emit does NOT set cooldown (selfEmitting guard)", async () => {
    const [s1, s2] = setupAnchors(["section-1", "section-2"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      ioInstances.at(-1)?.trigger([buildEntry(s2, 50)]);
      vi.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Both emits land — a broken selfEmitting guard would cooldown-suppress the
    // second.
    expect(navigateSpy).toHaveBeenCalledTimes(2);
    expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({ hash: "section-1" });
    expect(navigateSpy.mock.calls[1]?.[3]).toMatchObject({ hash: "section-2" });
  });

  // ── debounce coalescing ───────────────────────────────────────────────────

  it("coalesces N intersection events into <= 1 navigate (rAF + 150ms debounce)", () => {
    const [s1, s2, s3] = setupAnchors(["section-1", "section-2", "section-3"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      for (let i = 0; i < 10; i++) {
        ioInstances
          .at(-1)
          ?.trigger([
            buildEntry(s1, 50 + i),
            buildEntry(s2, 200 + i),
            buildEntry(s3, 400 + i),
          ]);
      }

      vi.runAllTimers();
    });

    expect(navigateSpy).toHaveBeenCalledTimes(1);
  });

  // ── destroy lifecycle ─────────────────────────────────────────────────────

  it("unmount disconnects observers and clears the pending debounce", () => {
    const [s1] = setupAnchors(["section-1"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    const { unmount } = render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      unmount();
      vi.runAllTimers();
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  // ── custom options ────────────────────────────────────────────────────────

  it("passes a custom rootMargin to the IntersectionObserver", () => {
    setupAnchors(["section-1"]);

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", rootMargin: "-10% 0px -50% 0px" }}
      >
        <div />
      </RouterProvider>,
    );

    expect(ioInstances.at(-1)?.options?.rootMargin).toBe("-10% 0px -50% 0px");
  });

  it("defaults rootMargin to '-20% 0px -60% 0px'", () => {
    setupAnchors(["section-1"]);

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances.at(-1)?.options?.rootMargin).toBe("-20% 0px -60% 0px");
  });

  it("uses a custom scrollContainer as the IntersectionObserver root", () => {
    const container = document.createElement("div");

    document.body.append(container);
    const anchor = document.createElement("section");

    anchor.id = "scoped";
    container.append(anchor);

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", scrollContainer: () => container }}
      >
        <div />
      </RouterProvider>,
    );

    expect(ioInstances.at(-1)?.options?.root).toBe(container);
  });

  it("falls back to the viewport (root: null) when scrollContainer returns null", () => {
    setupAnchors(["section-1"]);

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", scrollContainer: () => null }}
      >
        <div />
      </RouterProvider>,
    );

    expect(ioInstances.at(-1)?.options?.root).toBeNull();
  });

  // ── MutationObserver reconciliation ───────────────────────────────────────

  it("re-observes newly added matching elements", () => {
    const [s1] = setupAnchors(["section-1"]);

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances.at(-1)?.observed.has(s1)).toBe(true);

    const newAnchor = document.createElement("section");

    newAnchor.id = "section-new";
    document.body.append(newAnchor);

    act(() => {
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
    });

    expect(ioInstances.at(-1)?.observed.has(newAnchor)).toBe(true);
  });

  it("unobserves elements removed from the DOM", () => {
    const [s1, s2] = setupAnchors(["section-1", "section-2"]);

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    s2.remove();

    act(() => {
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
    });

    expect(ioInstances.at(-1)?.observed.has(s1)).toBe(true);
    expect(ioInstances.at(-1)?.observed.has(s2)).toBe(false);
  });

  it("debounces multiple mutations into a single reconcile", () => {
    const [s1] = setupAnchors(["section-1"]);

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      moInstances.at(-1)?.trigger([]);
      moInstances.at(-1)?.trigger([]);
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
    });

    expect(ioInstances.at(-1)?.observed.has(s1)).toBe(true);
  });

  // ── #780: late-mounted / changed scrollContainer (rebuild) ────────────────
  // NOTE: asserted count-relative — StrictMode double-mount already created a
  // baseline pair, so a rebuild is `base + 1`, not an absolute `2`.

  it("recreates the IO rooted at a container that mounts after creation", () => {
    let container: HTMLElement | null = null;

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", scrollContainer: () => container }}
      >
        <div />
      </RouterProvider>,
    );

    const base = ioInstances.length;

    expect(ioInstances.at(-1)?.options?.root).toBeNull();

    container = document.createElement("div");
    document.body.append(container);
    const anchor = document.createElement("section");

    anchor.id = "scoped";
    container.append(anchor);

    act(() => {
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
    });

    expect(ioInstances).toHaveLength(base + 1);
    expect(ioInstances.at(-1)?.options?.root).toBe(container);
    expect(ioInstances.at(-1)?.observed.has(anchor)).toBe(true);
  });

  it("recreates the IO when the resolved container identity changes", () => {
    const containerA = document.createElement("div");
    const containerB = document.createElement("div");

    document.body.append(containerA, containerB);

    let current: HTMLElement = containerA;

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", scrollContainer: () => current }}
      >
        <div />
      </RouterProvider>,
    );

    const base = ioInstances.length;

    expect(ioInstances.at(-1)?.options?.root).toBe(containerA);

    current = containerB;

    act(() => {
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
    });

    expect(ioInstances).toHaveLength(base + 1);
    expect(ioInstances.at(-1)?.options?.root).toBe(containerB);
  });

  it("rebuilds rooted at the viewport when the container unmounts (→ null)", () => {
    const container = document.createElement("div");

    document.body.append(container);

    let current: HTMLElement | null = container;

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", scrollContainer: () => current }}
      >
        <div />
      </RouterProvider>,
    );

    const base = ioInstances.length;

    expect(ioInstances.at(-1)?.options?.root).toBe(container);

    current = null;

    act(() => {
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
    });

    expect(ioInstances).toHaveLength(base + 1);
    expect(ioInstances.at(-1)?.options?.root).toBeNull();
  });

  it("does NOT recreate the IO when the container is unchanged across reconciles", () => {
    const container = document.createElement("div");

    document.body.append(container);

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: "[id]", scrollContainer: () => container }}
      >
        <div />
      </RouterProvider>,
    );

    const base = ioInstances.length;

    act(() => {
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
    });

    expect(ioInstances).toHaveLength(base);
    expect(ioInstances.at(-1)?.options?.root).toBe(container);
  });

  // ── URL plugin detection / warnings ───────────────────────────────────────

  it("warns and disables when there is no URL plugin (state.context.url absent)", async () => {
    const plain = createRouter([
      { name: "home", path: "/" },
      { name: "docs", path: "/docs" },
    ]);

    await plain.start("/docs");

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const navigateSpy = vi.spyOn(plain, "navigate");
    const [s1] = setupAnchors(["section-1"]);

    render(
      <RouterProvider router={plain} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.runAllTimers();
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      "state.context.url is not claimed",
    );
    expect(navigateSpy).not.toHaveBeenCalled();

    plain.stop();
  });

  it("swallows a rejected router.navigate (fire-and-forget) and keeps working", async () => {
    const [s1] = setupAnchors(["section-1"]);
    const navigateSpy = vi
      .spyOn(router, "navigate")
      .mockRejectedValue(new Error("test rejection"));

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(navigateSpy).toHaveBeenCalledTimes(1);
  });

  it("warns once and stays silent on an invalid selector", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: ":::not a real selector::" }}
      >
        <div />
      </RouterProvider>,
    );

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("invalid selector");
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("warns when duplicate ids are observed", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const dup1 = document.createElement("section");

    dup1.id = "section-dup";
    const dup2 = document.createElement("section");

    dup2.id = "section-dup";
    document.body.append(dup1, dup2);

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("duplicate id");
  });

  it("returns a no-op when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    setupAnchors(["section-1"]);

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances).toHaveLength(0);
  });

  it("skips emit when the router has no active state (stopped mid-debounce)", () => {
    const [s1] = setupAnchors(["section-1"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      // Stop between the IO event and the debounce flush → the pending emit
      // reads getState() === null.
      router.stop();
      vi.runAllTimers();
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("clears a pending trailing debounce timeout on unmount", () => {
    const [s1] = setupAnchors(["section-1"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    const { unmount } = render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      // Fire the rAF shim so the trailing setTimeout is now armed, then destroy
      // (unmount) before it fires → debouncer.destroy clears the pending timeout.
      vi.advanceTimersByTime(1);
      unmount();
      vi.runAllTimers();
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("clears a pending mutation-reconcile timer on unmount", () => {
    setupAnchors(["section-1"]);

    const { unmount } = render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    const activeIo = ioInstances.at(-1);

    act(() => {
      // Arm the mutation-reconcile debounce, then destroy mid-flight.
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(50);
      unmount();
      vi.runAllTimers();
    });

    expect(activeIo?.disconnect).toHaveBeenCalled();
  });

  it("clears a superseded trailing timeout across debounce batches", () => {
    const [s1] = setupAnchors(["section-1"]);
    const navigateSpy = vi.spyOn(router, "navigate");

    render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    act(() => {
      ioInstances.at(-1)?.trigger([buildEntry(s1, 50)]);
      vi.advanceTimersByTime(1); // rAF #1 fires → trailing timeout #1 armed
      ioInstances.at(-1)?.trigger([buildEntry(s1, 60)]);
      vi.advanceTimersByTime(1); // rAF #2 fires → clears superseded timeout #1
      vi.runAllTimers();
    });

    expect(navigateSpy).toHaveBeenCalledTimes(1);
  });

  it("does not re-warn on invalid selector across a reconcile (silenced)", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    render(
      <RouterProvider
        router={router}
        scrollSpy={{ selector: ":::not a real selector::" }}
      >
        <div />
      </RouterProvider>,
    );

    const afterMount = warnSpy.mock.calls.length;

    act(() => {
      // A reconcile re-queries the invalid selector → the callback re-enters
      // but returns early (already silenced), so no additional warning.
      moInstances.at(-1)?.trigger([]);
      vi.advanceTimersByTime(300);
    });

    expect(warnSpy).toHaveBeenCalledTimes(afterMount);
  });

  it("defers URL-plugin detection when wired before the router has state", async () => {
    const plain = createRouter([
      { name: "home", path: "/" },
      { name: "docs", path: "/docs" },
    ]);

    // Wire scroll-spy BEFORE starting → createScrollSpy sees getState() === null
    // and defers detection via a router.subscribe.
    render(
      <RouterProvider router={plain} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    // First navigation fires the deferred detector → verify() runs (no URL
    // plugin here → warns) and unsubscribes.
    await act(async () => {
      await plain.start("/docs");
    });

    expect(warnSpy).toHaveBeenCalled();

    plain.stop();
  });

  it("SSR renderToString renders children but never wires scroll-spy (effect is client-only)", () => {
    const view = renderToString(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div>server content</div>
      </RouterProvider>,
    );

    expect(view).toContain("server content");
    // useEffect does not run during renderToString → createScrollSpy is never
    // invoked server-side → no IntersectionObserver instantiated. Consequently
    // the utility's `typeof document === "undefined"` SSR guard is unreachable
    // via the React adapter (it is a defensive guard for direct callers).
    expect(ioInstances).toHaveLength(0);
  });
});
