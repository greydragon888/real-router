import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getTransitionSource } from "@real-router/sources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScrollSpy } from "../../src";

import type { ScrollSpy } from "../../src";
import type { Plugin, PluginFactory, Router } from "@real-router/core";

interface FakeIntersectionObserver {
  observe: (element: Element) => void;
  unobserve: (element: Element) => void;
  disconnect: () => void;
  trigger: (entries: IntersectionObserverEntry[]) => void;
  options: IntersectionObserverInit | undefined;
  observed: Set<Element>;
}

interface FakeMutationObserver {
  observe: (target: Node, init: MutationObserverInit) => void;
  disconnect: () => void;
  trigger: (mutations: MutationRecord[]) => void;
}

const ioInstances: FakeIntersectionObserver[] = [];
const moInstances: FakeMutationObserver[] = [];

function installFakeIntersectionObserver(): void {
  const FakeIO = class implements IntersectionObserver {
    public readonly root: Element | Document | null = null;
    public readonly rootMargin: string = "";
    public readonly scrollMargin: string = "";
    public readonly thresholds: readonly number[] = [];
    private readonly callback: IntersectionObserverCallback;
    private readonly observed = new Set<Element>();

    constructor(
      cb: IntersectionObserverCallback,
      opts?: IntersectionObserverInit,
    ) {
      this.callback = cb;

      const fake: FakeIntersectionObserver = {
        observe: (element: Element) => {
          this.observed.add(element);
        },
        unobserve: (element: Element) => {
          this.observed.delete(element);
        },
        disconnect: () => {
          this.observed.clear();
        },
        trigger: (entries: IntersectionObserverEntry[]) => {
          this.callback(entries, this);
        },
        options: opts,
        observed: this.observed,
      };

      ioInstances.push(fake);
    }

    public observe(element: Element): void {
      this.observed.add(element);
    }

    public unobserve(element: Element): void {
      this.observed.delete(element);
    }

    public disconnect(): void {
      this.observed.clear();
    }

    public takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  };

  vi.stubGlobal("IntersectionObserver", FakeIO);
}

function installFakeMutationObserver(): void {
  const FakeMO = class implements MutationObserver {
    private readonly callback: MutationCallback;

    constructor(cb: MutationCallback) {
      this.callback = cb;

      const fake: FakeMutationObserver = {
        observe: () => {
          /* no-op — observe captures state in real MO; tests only need trigger. */
        },
        disconnect: () => {
          /* no-op */
        },
        trigger: (mutations: MutationRecord[]) => {
          this.callback(mutations, this);
        },
      };

      moInstances.push(fake);
    }

    public observe(_target: Node, _init: MutationObserverInit): void {
      /* no-op */
    }

    public disconnect(): void {
      /* no-op */
    }

    public takeRecords(): MutationRecord[] {
      return [];
    }
  };

  vi.stubGlobal("MutationObserver", FakeMO);
}

function flushTimersAndRaf(): void {
  vi.runAllTimers();
}

const activeInstances: ScrollSpy[] = [];

function track(spy: ScrollSpy): ScrollSpy {
  activeInstances.push(spy);

  return spy;
}

function setupAnchors(ids: readonly string[]): HTMLElement[] {
  document.body.innerHTML = "";
  const elements: HTMLElement[] = [];

  for (const id of ids) {
    const element = document.createElement("section");

    element.id = id;
    document.body.append(element);
    elements.push(element);
  }

  return elements;
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
    time: Date.now(),
  };
}

// Variant of buildEntry that pins `rootBounds.top` — required to exercise
// the rootMargin-aware selection path in `pickTopmost`. In real browsers
// `entry.rootBounds` reflects the `IntersectionObserver` root rect with
// `rootMargin` applied (W3C IO §3.3); a `rootMargin: "-50% 0px -50% 0px"`
// configuration yields rootBounds.top = 0.5 * root.clientHeight.
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
    time: Date.now(),
  };
}

const urlContextPluginFactory: PluginFactory = (router) => {
  const api = getPluginApi(router);
  const claim = api.claimContextNamespace("url");

  return {
    onTransitionSuccess: (toState, _fromState, opts) => {
      const ctx = toState.context as { url?: { hash?: string } };
      const previousHash = ctx.url?.hash ?? "";
      const optsRecord = opts as { hash?: string; hashChange?: boolean };
      const hash = optsRecord.hash ?? previousHash;
      const hashChange = optsRecord.hashChange ?? false;

      claim.write(toState, {
        hash,
        hashChanged: hashChange,
      });
    },
  } satisfies Plugin;
};

async function createTestRouter(opts?: {
  withUrlPlugin?: boolean;
  start?: boolean;
}): Promise<Router> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "docs", path: "/docs" },
  ]);

  if (opts?.withUrlPlugin !== false) {
    router.usePlugin(urlContextPluginFactory);
  }

  if (opts?.start !== false) {
    await router.start("/docs");
  }

  return router;
}

describe("createScrollSpy", () => {
  beforeEach(() => {
    ioInstances.length = 0;
    moInstances.length = 0;
    document.body.innerHTML = "";
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
    vi.stubGlobal("cancelAnimationFrame", (_id: number): void => {
      // setTimeout-based shim — cancel via vi.clearAllTimers in afterEach.
    });
    installFakeIntersectionObserver();
    installFakeMutationObserver();
  });

  afterEach(() => {
    while (activeInstances.length > 0) {
      activeInstances.pop()?.destroy();
    }

    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  describe("feature detection / SSR", () => {
    it("returns NOOP when IntersectionObserver is undefined", async () => {
      vi.stubGlobal("IntersectionObserver", undefined);

      const router = await createTestRouter();
      const spy = track(createScrollSpy(router, { selector: "[id]" }));

      expect(ioInstances).toHaveLength(0);
      expect(typeof spy.destroy).toBe("function");

      spy.destroy();
      router.stop();
    });

    it("returns NOOP when selector is empty string", async () => {
      const router = await createTestRouter();
      const spy = track(createScrollSpy(router, { selector: "" }));

      expect(ioInstances).toHaveLength(0);

      spy.destroy();
      router.stop();
    });
  });

  describe("basic intersection flow", () => {
    it("emits forced same-route transition with hash/replace/force/hashChange on intersection", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1] = setupAnchors(["section-1", "section-2", "section-3"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      expect(ioInstances).toHaveLength(1);

      ioInstances[0].trigger([buildEntry(s1, 50)]);

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy.mock.calls[0]?.[0]).toBe("docs");
      expect(navigateSpy.mock.calls[0]?.[2]).toMatchObject({
        hash: "section-1",
        replace: true,
        force: true,
        hashChange: true,
      });

      router.stop();
    });

    it("picks the topmost-visible (smallest non-negative top) anchor", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1, s2, s3] = setupAnchors([
        "section-1",
        "section-2",
        "section-3",
      ]);

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([
        buildEntry(s1, 200),
        buildEntry(s2, 50),
        buildEntry(s3, 400),
      ]);

      flushTimersAndRaf();

      expect(navigateSpy.mock.calls[0]?.[2]).toMatchObject({
        hash: "section-2",
      });

      router.stop();
    });

    it("accumulates intersection state across IO batches (merges by target)", async () => {
      // Regression pin: IO delivers entries ONLY for targets whose
      // intersection state CHANGED (W3C IO §3.2.1). A fast scroll that
      // lands two callbacks inside one debounce window must merge by
      // target — overwriting `pendingEntries` per batch loses the
      // "still intersecting" state for anchors not in the latest batch
      // and breaks topmost-selection.
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1, s2, s3] = setupAnchors([
        "section-1",
        "section-2",
        "section-3",
      ]);

      track(createScrollSpy(router, { selector: "[id]" }));

      // Batch 1: s1 leaves, s2 enters. s2 is the topmost intersecting
      // anchor at this point.
      ioInstances[0].trigger([
        buildEntry(s1, -50, false),
        buildEntry(s2, 100, true),
      ]);

      // Batch 2 (same debounce window): s3 enters. s2 stays intersecting
      // but IO does not re-emit unchanged entries — without accumulation
      // we would forget s2 entirely and emit `#section-3` instead.
      ioInstances[0].trigger([buildEntry(s3, 300, true)]);

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy.mock.calls[0]?.[2]).toMatchObject({
        hash: "section-2",
      });

      router.stop();
    });

    it("picks anchor closest to rootBounds.top (rootMargin-aware) for centered zones", async () => {
      // Regression pin for non-default rootMargin. With `"-50% 0px -50% 0px"`
      // the active zone collapses to a horizontal line at the root center
      // (entry.rootBounds.top = root.clientHeight / 2). A tall anchor whose
      // body crosses that line from far above is NOT the user's current
      // section — the small anchor sitting right at the line is. The naive
      // "smallest boundingClientRect.top" heuristic picks the tall one;
      // distance-to-zoneTop picks the right one.
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1, s2] = setupAnchors(["section-1", "section-2"]);

      track(
        createScrollSpy(router, {
          selector: "[id]",
          rootMargin: "-50% 0px -50% 0px",
        }),
      );

      // zoneTop = 500 (viewport center).
      // s1: top=200, height=600 → spans [200, 800], crosses 500 from far above.
      //     distance = 200 − 500 = −300.
      // s2: top=490, height=20 → spans [490, 510], straddles 500.
      //     distance = 490 − 500 = −10 (least negative — picked).
      ioInstances[0].trigger([
        buildEntryWithZone(s1, 200, 600, 500),
        buildEntryWithZone(s2, 490, 20, 500),
      ]);

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy.mock.calls[0]?.[2]).toMatchObject({
        hash: "section-2",
      });

      router.stop();
    });

    it("prefers smallest non-negative distance to zoneTop over least-negative fallback", async () => {
      // Companion to the centered-zone test above: when at least one entry
      // sits AT-OR-BELOW the zone top, the fallback branch is not reached.
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1, s2] = setupAnchors(["section-1", "section-2"]);

      track(
        createScrollSpy(router, {
          selector: "[id]",
          rootMargin: "-50% 0px -50% 0px",
        }),
      );

      // zoneTop = 500.
      // s1 top=300 → distance = −200 (above zone).
      // s2 top=520 → distance = +20 (just below zone top — picked).
      ioInstances[0].trigger([
        buildEntryWithZone(s1, 300, 100, 500),
        buildEntryWithZone(s2, 520, 100, 500),
      ]);

      flushTimersAndRaf();

      expect(navigateSpy.mock.calls[0]?.[2]).toMatchObject({
        hash: "section-2",
      });

      router.stop();
    });

    it("falls back to last-above-zone when no entry has top >= 0", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1, s2] = setupAnchors(["section-1", "section-2"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, -300), buildEntry(s2, -100)]);

      flushTimersAndRaf();

      expect(navigateSpy.mock.calls[0]?.[2]).toMatchObject({
        hash: "section-2",
      });

      router.stop();
    });

    it("skips emit when no entries are intersecting", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1] = setupAnchors(["section-1"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50, false)]);

      flushTimersAndRaf();

      expect(navigateSpy).not.toHaveBeenCalled();

      router.stop();
    });

    it("skips emit when newHash === current hash", async () => {
      const router = await createTestRouter();

      // Initialize URL context with a matching hash via a prior emit.
      await router.navigate("docs", {}, {
        hash: "section-1",
        force: true,
        hashChange: true,
      } as never);

      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1] = setupAnchors(["section-1"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50)]);

      flushTimersAndRaf();

      expect(navigateSpy).not.toHaveBeenCalled();

      router.stop();
    });

    it("skips emit when anchor has no id", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");

      const anchor = document.createElement("section");

      anchor.id = ""; // Edge case: matches selector via classname but has no id.
      document.body.append(anchor);

      const selectorTarget = document.createElement("section");

      selectorTarget.dataset.anchor = "";
      document.body.append(selectorTarget);

      track(createScrollSpy(router, { selector: "[data-anchor]" }));

      ioInstances[0].trigger([buildEntry(selectorTarget, 50)]);

      flushTimersAndRaf();

      expect(navigateSpy).not.toHaveBeenCalled();

      router.stop();
    });
  });

  describe("anti-flicker gates", () => {
    it("skips emit while a transition is in flight (isTransitioning gate)", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1] = setupAnchors(["section-1"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      // Cached source — same instance the spy reads.
      const source = getTransitionSource(router);
      const originalSnapshot = source.getSnapshot();

      vi.spyOn(source, "getSnapshot").mockReturnValue({
        ...originalSnapshot,
        isTransitioning: true,
      });

      ioInstances[0].trigger([buildEntry(s1, 50)]);

      flushTimersAndRaf();

      expect(navigateSpy).not.toHaveBeenCalled();

      vi.mocked(source.getSnapshot).mockRestore();

      ioInstances[0].trigger([buildEntry(s1, 50)]);

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(1);

      router.stop();
    });

    it("user-driven hashChanged triggers cooldown; spy skips intermediate IO events", async () => {
      const router = await createTestRouter();
      const [s1, s2] = setupAnchors(["section-1", "section-2"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      // Simulate a user-driven Link click that updates the hash via the URL
      // plugin. The spy's subscribe callback should set coolingDown=true.
      await router.navigate("docs", {}, {
        hash: "section-2",
        force: true,
        hashChange: true,
      } as never);

      const navigateSpy = vi.spyOn(router, "navigate");

      ioInstances[0].trigger([buildEntry(s1, 50), buildEntry(s2, 200)]);

      flushTimersAndRaf();

      expect(navigateSpy).not.toHaveBeenCalled();

      router.stop();
    });

    it("cooldown clears after 500ms safety timeout", async () => {
      const router = await createTestRouter();
      const [s1] = setupAnchors(["section-1", "section-2"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      await router.navigate("docs", {}, {
        hash: "section-2",
        force: true,
        hashChange: true,
      } as never);

      const navigateSpy = vi.spyOn(router, "navigate");

      vi.advanceTimersByTime(550);

      ioInstances[0].trigger([buildEntry(s1, 50)]);

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy.mock.calls[0]?.[2]).toMatchObject({
        hash: "section-1",
      });

      router.stop();
    });

    it("spy's own emit does NOT set cooldown (selfEmitting guard)", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1, s2] = setupAnchors(["section-1", "section-2"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50)]);
      flushTimersAndRaf();
      await Promise.resolve();
      await Promise.resolve();

      ioInstances[0].trigger([buildEntry(s2, 50)]);
      flushTimersAndRaf();
      await Promise.resolve();
      await Promise.resolve();

      // Both emits should land — if selfEmitting failed, the second emit would
      // be rate-limited by cooldown.
      expect(navigateSpy).toHaveBeenCalledTimes(2);
      expect(navigateSpy.mock.calls[0]?.[2]).toMatchObject({
        hash: "section-1",
      });
      expect(navigateSpy.mock.calls[1]?.[2]).toMatchObject({
        hash: "section-2",
      });

      router.stop();
    });
  });

  describe("debounce coalescing", () => {
    it("coalesces N intersection events into <= 1 navigate via rAF + 150ms debounce", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1, s2, s3] = setupAnchors([
        "section-1",
        "section-2",
        "section-3",
      ]);

      track(createScrollSpy(router, { selector: "[id]" }));

      for (let i = 0; i < 10; i++) {
        ioInstances[0].trigger([
          buildEntry(s1, 50 + i),
          buildEntry(s2, 200 + i),
          buildEntry(s3, 400 + i),
        ]);
      }

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(1);

      router.stop();
    });
  });

  describe("destroy lifecycle", () => {
    it("destroy is idempotent", async () => {
      const router = await createTestRouter();

      setupAnchors(["section-1"]);

      const spy = track(createScrollSpy(router, { selector: "[id]" }));

      spy.destroy();
      spy.destroy();
      spy.destroy();

      expect(ioInstances[0].observed.size).toBe(0);

      router.stop();
    });

    it("destroy disconnects observers and clears timers", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1] = setupAnchors(["section-1"]);

      const spy = track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50)]);
      spy.destroy();

      flushTimersAndRaf();

      expect(navigateSpy).not.toHaveBeenCalled();

      router.stop();
    });
  });

  describe("custom options", () => {
    it("passes custom rootMargin to IntersectionObserver", async () => {
      const router = await createTestRouter();

      track(
        createScrollSpy(router, {
          selector: "[id]",
          rootMargin: "-10% 0px -50% 0px",
        }),
      );

      expect(ioInstances[0]?.options?.rootMargin).toBe("-10% 0px -50% 0px");

      router.stop();
    });

    it("default rootMargin = '-20% 0px -60% 0px'", async () => {
      const router = await createTestRouter();

      track(createScrollSpy(router, { selector: "[id]" }));

      expect(ioInstances[0]?.options?.rootMargin).toBe("-20% 0px -60% 0px");

      router.stop();
    });

    it("uses custom scrollContainer when getter returns an element", async () => {
      const router = await createTestRouter();
      const container = document.createElement("div");

      document.body.append(container);
      const anchor = document.createElement("section");

      anchor.id = "scoped";
      container.append(anchor);

      track(
        createScrollSpy(router, {
          selector: "[id]",
          scrollContainer: () => container,
        }),
      );

      expect(ioInstances[0]?.options?.root).toBe(container);

      router.stop();
    });

    it("scrollContainer returning null falls back to window viewport (root: null)", async () => {
      const router = await createTestRouter();

      track(
        createScrollSpy(router, {
          selector: "[id]",
          scrollContainer: () => null,
        }),
      );

      expect(ioInstances[0]?.options?.root).toBeNull();

      router.stop();
    });
  });

  describe("MutationObserver reconciliation", () => {
    it("re-observes newly added matching elements", async () => {
      const router = await createTestRouter();
      const [s1] = setupAnchors(["section-1"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      expect(ioInstances[0]?.observed.has(s1)).toBe(true);
      expect(ioInstances[0]?.observed.size).toBe(1);

      const newAnchor = document.createElement("section");

      newAnchor.id = "section-new";
      document.body.append(newAnchor);

      moInstances[0]?.trigger([]);
      vi.advanceTimersByTime(300);

      expect(ioInstances[0]?.observed.has(newAnchor)).toBe(true);
      expect(ioInstances[0]?.observed.size).toBe(2);

      router.stop();
    });

    it("unobserves elements removed from the DOM", async () => {
      const router = await createTestRouter();
      const [s1, s2] = setupAnchors(["section-1", "section-2"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      s2.remove();

      moInstances[0]?.trigger([]);
      vi.advanceTimersByTime(300);

      expect(ioInstances[0]?.observed.has(s1)).toBe(true);
      expect(ioInstances[0]?.observed.has(s2)).toBe(false);

      router.stop();
    });

    it("debounces multiple mutations into a single reconcile", async () => {
      const router = await createTestRouter();

      setupAnchors(["section-1"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      moInstances[0]?.trigger([]);
      moInstances[0]?.trigger([]);
      moInstances[0]?.trigger([]);
      vi.advanceTimersByTime(300);

      // No assertion needed here — debounce timer collapses calls; we verify
      // no observer state corruption by ensuring observed.size is sane.
      expect(ioInstances[0]?.observed.size).toBe(1);

      router.stop();
    });
  });

  describe("URL plugin detection", () => {
    it("warns once and disables when state.context.url is undefined (no URL plugin)", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "docs", path: "/docs" },
      ]);

      await router.start("/docs");

      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1] = setupAnchors(["section-1"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50)]);
      flushTimersAndRaf();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain(
        "state.context.url is not claimed",
      );
      expect(navigateSpy).not.toHaveBeenCalled();

      router.stop();
    });

    it("defers detection when router has not started yet", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "docs", path: "/docs" },
      ]);

      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      track(createScrollSpy(router, { selector: "[id]" }));

      // Before start, no warning yet.
      expect(warnSpy).not.toHaveBeenCalled();

      // Start without URL plugin → deferred detection should warn.
      await router.start("/docs");

      expect(warnSpy).toHaveBeenCalledTimes(1);

      router.stop();
    });
  });

  describe("router.navigate error handling", () => {
    it("swallows rejection from router.navigate (fire-and-forget)", async () => {
      const router = await createTestRouter();
      const [s1] = setupAnchors(["section-1"]);

      const navigateSpy = vi
        .spyOn(router, "navigate")
        .mockRejectedValue(new Error("test rejection"));

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50)]);

      flushTimersAndRaf();

      // Microtask drain for the .catch handler.
      await Promise.resolve();
      await Promise.resolve();

      expect(navigateSpy).toHaveBeenCalledTimes(1);

      // After rejection, spy continues to work — subsequent emits land too.
      navigateSpy.mockResolvedValueOnce(router.getState()!);
      ioInstances[0].trigger([buildEntry(s1, 60)]);

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(2);

      router.stop();
    });
  });

  describe("invalid selector", () => {
    it("warns once and stays silent on invalid selector", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      track(
        createScrollSpy(router, {
          selector: ":::not a real selector::",
        }),
      );

      // The constructor would throw on querySelectorAll with invalid selector;
      // utility catches once and silences.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain("invalid selector");
      expect(navigateSpy).not.toHaveBeenCalled();

      router.stop();
    });
  });

  describe("duplicate id detection", () => {
    it("warns once when duplicate ids are observed", async () => {
      const router = await createTestRouter();
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      document.body.innerHTML = "";
      const dup1 = document.createElement("section");

      dup1.id = "section-dup";
      const dup2 = document.createElement("section");

      dup2.id = "section-dup";
      document.body.append(dup1, dup2);

      track(createScrollSpy(router, { selector: "[id]" }));

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain("duplicate id");

      router.stop();
    });
  });
});
