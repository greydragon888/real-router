import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getTransitionSource } from "@real-router/sources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScrollSpy } from "../../src/dom-utils";

import type { ScrollSpy } from "../../src/dom-utils";
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

describe("createScrollSpy (Angular dom-utils copy)", () => {
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

    it("returns NOOP when selector is empty string — silent disable, no invalid-selector warning", async () => {
      const router = await createTestRouter();
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      const spy = track(createScrollSpy(router, { selector: "" }));

      expect(ioInstances).toHaveLength(0);
      // "" is the documented DISABLE signal (RFC §5.4 `selector: enable ? "[id]" : ""`),
      // NOT an invalid selector: the `if (!selector) return NOOP` guard short-circuits
      // BEFORE the constructor's querySelectorAll("") — which the try/catch would
      // otherwise treat as invalid and console.warn about (see the "invalid selector"
      // case). Delete the guard → createScrollSpy("") runs querySelectorAll("") →
      // SyntaxError → this warning fires. This assertion is what makes the guard
      // mutation-discriminating; the `ioInstances` check alone passes without it.
      expect(warnSpy).not.toHaveBeenCalled();

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
      expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({
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

      expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({
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

      expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({
        hash: "section-2",
      });

      router.stop();
    });

    it("keeps the least-negative anchor when a more-negative one follows", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1, s2] = setupAnchors(["section-1", "section-2"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      // Both above the zone: s1 (-100) is closer than s2 (-300). s2 must NOT
      // beat bestNegative → exercises the `distance > bestNegativeDist` false arm.
      ioInstances[0].trigger([buildEntry(s1, -100), buildEntry(s2, -300)]);

      flushTimersAndRaf();

      expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({
        hash: "section-1",
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
      await router.navigate("docs", {}, undefined, {
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
      await router.navigate("docs", {}, undefined, {
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

      await router.navigate("docs", {}, undefined, {
        hash: "section-2",
        force: true,
        hashChange: true,
      } as never);

      const navigateSpy = vi.spyOn(router, "navigate");

      vi.advanceTimersByTime(550);

      ioInstances[0].trigger([buildEntry(s1, 50)]);

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({
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
      expect(navigateSpy.mock.calls[0]?.[3]).toMatchObject({
        hash: "section-1",
      });
      expect(navigateSpy.mock.calls[1]?.[3]).toMatchObject({
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

  describe("container-detach reconcile on navigation (#1216)", () => {
    it("re-observes a remounted scroll container after a navigation — the container-scoped MO can't see the container's own removal", async () => {
      const router = await createTestRouter();

      // Container A with an anchor inside.
      let container = document.createElement("div");
      const a1 = document.createElement("section");

      a1.id = "a1";
      container.append(a1);
      document.body.append(container);

      track(
        createScrollSpy(router, {
          selector: "[id]",
          scrollContainer: () => container,
        }),
      );

      // Initial: IO rooted at A observes a1.
      expect(ioInstances[0]?.options?.root).toBe(container);
      expect(ioInstances[0]?.observed.has(a1)).toBe(true);

      const ioCountBefore = ioInstances.length;

      // Container A unmounts; a fresh B (same getter) remounts. The
      // container-scoped MutationObserver cannot observe A's OWN removal (a
      // mutation of A's parent), so no reconcile fires from the MO.
      container.remove();
      const containerB = document.createElement("div");
      const b1 = document.createElement("section");

      b1.id = "b1";
      containerB.append(b1);
      document.body.append(containerB);
      container = containerB;

      // A navigation fires the router.subscribe callback → isContainerDetached →
      // reconcile → the IO is rebuilt under B and observes b1.
      await router.navigate("home");

      expect(ioInstances.length).toBeGreaterThan(ioCountBefore);

      const latest = ioInstances[ioInstances.length - 1];

      expect(latest.options?.root).toBe(containerB);
      expect(latest.observed.has(b1)).toBe(true);

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

  describe("#780 — late-mounted / changed scrollContainer", () => {
    it("recreates the IO rooted at a container that mounts AFTER creation (reconcile)", async () => {
      const router = await createTestRouter();
      // Canonical Angular bootstrap flow: the getter resolves to null at
      // creation (spy wired before any component renders), then the container
      // mounts on a later render.
      let container: HTMLElement | null = null;

      track(
        createScrollSpy(router, {
          selector: "[id]",
          scrollContainer: () => container,
        }),
      );

      expect(ioInstances).toHaveLength(1);
      expect(ioInstances[0]?.options?.root).toBeNull();

      container = document.createElement("div");
      document.body.append(container);
      const anchor = document.createElement("section");

      anchor.id = "scoped";
      container.append(anchor);

      moInstances[0]?.trigger([]);
      vi.advanceTimersByTime(300);

      // IO root + MO target are immutable post-construction, so honouring the
      // late-mounted container requires a fresh IO rooted at it (was: root
      // null/viewport forever).
      expect(ioInstances).toHaveLength(2);
      expect(ioInstances.at(-1)?.options?.root).toBe(container);
      expect(ioInstances.at(-1)?.observed.has(anchor)).toBe(true);

      router.stop();
    });

    it("recreates the IO when the resolved container identity changes", async () => {
      const router = await createTestRouter();
      const containerA = document.createElement("div");
      const containerB = document.createElement("div");

      document.body.append(containerA, containerB);

      let current: HTMLElement = containerA;

      track(
        createScrollSpy(router, {
          selector: "[id]",
          scrollContainer: () => current,
        }),
      );

      expect(ioInstances[0]?.options?.root).toBe(containerA);

      current = containerB;

      moInstances[0]?.trigger([]);
      vi.advanceTimersByTime(300);

      expect(ioInstances).toHaveLength(2);
      expect(ioInstances.at(-1)?.options?.root).toBe(containerB);

      router.stop();
    });

    it("rebuilds rooted at the viewport when the container unmounts (container → null)", async () => {
      const router = await createTestRouter();
      const container = document.createElement("div");

      document.body.append(container);

      let current: HTMLElement | null = container;

      track(
        createScrollSpy(router, {
          selector: "[id]",
          scrollContainer: () => current,
        }),
      );

      expect(ioInstances[0]?.options?.root).toBe(container);

      current = null;

      moInstances[0]?.trigger([]);
      vi.advanceTimersByTime(300);

      expect(ioInstances).toHaveLength(2);
      expect(ioInstances.at(-1)?.options?.root).toBeNull();

      router.stop();
    });

    it("does NOT recreate the IO when the container is unchanged across reconciles", async () => {
      const router = await createTestRouter();
      const container = document.createElement("div");

      document.body.append(container);

      track(
        createScrollSpy(router, {
          selector: "[id]",
          scrollContainer: () => container,
        }),
      );

      expect(ioInstances).toHaveLength(1);

      moInstances[0]?.trigger([]);
      vi.advanceTimersByTime(300);
      moInstances[0]?.trigger([]);
      vi.advanceTimersByTime(300);

      expect(ioInstances).toHaveLength(1);
      expect(ioInstances[0]?.options?.root).toBe(container);

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

  describe("edge coverage", () => {
    it("SSR — returns NOOP when document is undefined", async () => {
      const realDocument = globalThis.document;

      vi.stubGlobal("document", undefined);

      try {
        const router = await createTestRouter();
        const spy = createScrollSpy(router, { selector: "[id]" });

        expect(ioInstances).toHaveLength(0);
        expect(typeof spy.destroy).toBe("function");

        spy.destroy();
        router.stop();
      } finally {
        vi.stubGlobal("document", realDocument);
      }
    });

    it("debounce destroy clears a pending trailing timeout", async () => {
      const router = await createTestRouter();
      const [s1] = setupAnchors(["section-1"]);
      const spy = track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50)]);
      // Fire only the rAF shim (0ms) so the trailing timeout is armed but not
      // yet fired, then destroy → clears the live timeout.
      vi.advanceTimersByTime(1);
      spy.destroy();

      expect(() => {
        flushTimersAndRaf();
      }).not.toThrow();

      router.stop();
    });

    it("debounce reschedule clears the previous trailing timeout", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1] = setupAnchors(["section-1"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50)]);
      vi.advanceTimersByTime(1); // rAF fires → trailing timeout armed
      ioInstances[0].trigger([buildEntry(s1, 60)]);
      vi.advanceTimersByTime(1); // second rAF fires → clears the first timeout

      flushTimersAndRaf();

      expect(navigateSpy).toHaveBeenCalledTimes(1);

      router.stop();
    });

    it("MutationObserver destroy clears a pending reconcile timer", async () => {
      const router = await createTestRouter();

      setupAnchors(["section-1"]);
      const spy = track(createScrollSpy(router, { selector: "[id]" }));

      moInstances[0]?.trigger([]); // arms the mutation-debounce timer
      spy.destroy();

      expect(() => {
        flushTimersAndRaf();
      }).not.toThrow();

      router.stop();
    });

    it("silences once on an invalid selector (second reconcile is a no-op)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const router = await createTestRouter();

      setupAnchors(["section-1"]);
      track(createScrollSpy(router, { selector: "###" }));

      // A second reconcile (MutationObserver) re-enters onInvalidSelector but
      // `silenced` short-circuits it — still exactly one warning.
      moInstances[0]?.trigger([]);
      flushTimersAndRaf();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain("invalid selector");

      warnSpy.mockRestore();
      router.stop();
    });

    it("no-op flush when there are no pending entries", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");

      setupAnchors(["section-1"]);
      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([]); // empty batch → flush with empty pending map
      flushTimersAndRaf();

      expect(navigateSpy).not.toHaveBeenCalled();

      router.stop();
    });

    it("skips the emit when the router has no active state", async () => {
      const router = await createTestRouter();
      const navigateSpy = vi.spyOn(router, "navigate");
      const [s1] = setupAnchors(["section-1"]);

      track(createScrollSpy(router, { selector: "[id]" }));

      ioInstances[0].trigger([buildEntry(s1, 50)]);
      router.stop(); // getState() now returns undefined

      flushTimersAndRaf();

      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });
});
