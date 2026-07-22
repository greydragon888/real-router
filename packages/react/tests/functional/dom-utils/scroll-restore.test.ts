import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createScrollRestoration } from "../../../src/dom-utils";

import type { Router, State } from "@real-router/core";

const STORAGE_KEY = "real-router:scroll";

type Listener = (s: { route: State; previousRoute?: State }) => void;

interface FakeRouter {
  emit: (route: State, previousRoute?: State) => void;
  router: Router;
}

function makeState(
  name: string,
  params: Record<string, unknown> = {},
  context: Record<string, unknown> = {},
  transition: Partial<State["transition"]> = {},
): State {
  return {
    name,
    params: params as State["params"],
    search: {},
    path: "/",
    context: context,
    transition: transition as State["transition"],
  };
}

function makeFakeRouter(initial?: State): FakeRouter {
  const listeners = new Set<Listener>();
  let current = initial;

  const router = {
    subscribe(fn: Listener) {
      listeners.add(fn);

      return () => {
        listeners.delete(fn);
      };
    },
    getState() {
      return current;
    },
  } as unknown as Router;

  return {
    emit(route, previousRoute) {
      current = route;

      for (const fn of listeners) {
        fn(previousRoute ? { route, previousRoute } : { route });
      }
    },
    router,
  };
}

const activeInstances: { destroy: () => void }[] = [];

function track<T extends { destroy: () => void }>(instance: T): T {
  activeInstances.push(instance);

  return instance;
}

describe("createScrollRestoration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    document.body.innerHTML = "";

    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        cb(0);

        return 0;
      },
    );
  });

  afterEach(() => {
    while (activeInstances.length > 0) {
      activeInstances.pop()?.destroy();
    }

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("SSR no-op when window is undefined-like", () => {
    // We can't actually unset window in jsdom; emulate via destroy-only contract.
    // A truly SSR-only assertion lives elsewhere (integration). Here we at
    // least verify that the utility returns an object with a destroy function.
    const router = makeFakeRouter().router;
    const sr = track(createScrollRestoration(router));

    expect(typeof sr.destroy).toBe("function");

    sr.destroy();
  });

  it("flips history.scrollRestoration to 'manual' on create, restores on destroy", () => {
    history.scrollRestoration = "auto";

    const router = makeFakeRouter().router;
    const sr = track(createScrollRestoration(router));

    expect(history.scrollRestoration).toBe("manual");

    sr.destroy();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("mode 'native' returns noop — no history flip, no subscribe, no pagehide", () => {
    history.scrollRestoration = "auto";

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router, { mode: "native" }));

    // No flip — browser's default auto-restore stays active.
    expect(history.scrollRestoration).toBe("auto");

    fake.emit(makeState("about"), makeState("home"));
    globalThis.dispatchEvent(new Event("pagehide"));

    expect(scrollSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    sr.destroy();
  });

  it("mode 'top' scrolls to top on every transition regardless of direction", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router, { mode: "top" }));

    fake.emit(
      makeState("about", {}, { navigation: { direction: "back" } }),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("behavior option: 'smooth' is forwarded to scrollTo and scrollIntoView", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(
      createScrollRestoration(fake.router, {
        mode: "top",
        behavior: "smooth",
      }),
    );

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "smooth",
    });

    sr.destroy();
  });

  it("behavior option: 'smooth' is forwarded to anchor scrollIntoView", () => {
    const anchor = document.createElement("div");

    anchor.id = "target";
    document.body.append(anchor);
    const scrollIntoViewSpy = vi.fn();

    anchor.scrollIntoView = scrollIntoViewSpy;
    globalThis.history.replaceState(null, "", "/#target");

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(
      createScrollRestoration(fake.router, { behavior: "smooth" }),
    );

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: "smooth" });

    sr.destroy();
    globalThis.history.replaceState(null, "", "/");
  });

  it("storageKey: custom key isolates store from default key", () => {
    const fake = makeFakeRouter(makeState("home"));
    const sr = track(
      createScrollRestoration(fake.router, { storageKey: "my-app:scroll" }),
    );

    Object.defineProperty(globalThis, "scrollY", {
      value: 250,
      configurable: true,
    });
    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );

    // Custom key was written
    expect(sessionStorage.getItem("my-app:scroll")).not.toBeNull();
    // Default key untouched
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    sr.destroy();
  });

  it("storageKey: defaults to 'real-router:scroll' when omitted", () => {
    const fake = makeFakeRouter(makeState("home"));
    const sr = track(createScrollRestoration(fake.router));

    Object.defineProperty(globalThis, "scrollY", {
      value: 100,
      configurable: true,
    });
    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );

    expect(sessionStorage.getItem("real-router:scroll")).not.toBeNull();

    sr.destroy();
  });

  it("storageKey: two utilities with different keys don't share state", () => {
    const fake = makeFakeRouter(makeState("home"));
    const srA = track(
      createScrollRestoration(fake.router, { storageKey: "app-a:scroll" }),
    );
    const srB = track(
      createScrollRestoration(fake.router, { storageKey: "app-b:scroll" }),
    );

    Object.defineProperty(globalThis, "scrollY", {
      value: 333,
      configurable: true,
    });

    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );

    // Both wrote (both are subscribed) but to different keys.
    const storeA = JSON.parse(
      sessionStorage.getItem("app-a:scroll") ?? "{}",
    ) as Record<string, number>;
    const storeB = JSON.parse(
      sessionStorage.getItem("app-b:scroll") ?? "{}",
    ) as Record<string, number>;

    expect(storeA["home:{}"]).toBe(333);
    expect(storeB["home:{}"]).toBe(333);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    srA.destroy();
    srB.destroy();
  });

  it("behavior defaults to 'auto' when omitted", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router, { mode: "top" }));

    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("mode 'restore' + direction 'back' writes saved position for new key", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "home:{}": 420 }));

    const fake = makeFakeRouter(makeState("about"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "home",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("about"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 420,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("mode 'restore' + back + no saved position → scroll to 0", () => {
    const fake = makeFakeRouter(makeState("about"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "home",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("about"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("mode 'restore' + push + no hash → scroll to 0", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("mode 'restore' + push + hash with existing id → scrollIntoView", () => {
    const anchor = document.createElement("div");

    anchor.id = "target";
    document.body.append(anchor);
    const scrollIntoViewSpy = vi.fn();

    anchor.scrollIntoView = scrollIntoViewSpy;
    globalThis.history.replaceState(null, "", "/#target");

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    sr.destroy();
    globalThis.history.replaceState(null, "", "/");
  });

  it("mode 'restore' + push + hash with missing id → scroll to 0", () => {
    globalThis.history.replaceState(null, "", "/#missing");
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
    globalThis.history.replaceState(null, "", "/");
  });

  it("mode 'restore' + navigationType 'replace' → no-op", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "replace" } }),
      makeState("home"),
    );

    expect(scrollSpy).not.toHaveBeenCalled();

    sr.destroy();
  });

  it("navigationType 'traverse' + direction 'forward' → restore (best-effort)", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 77 }));

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 77,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("back/traverse carrying transition.replace=true (post-#657) restores, not skipped", () => {
    // Regression guard for the Scenario 6 e2e failure. Since #657 lifted
    // `replace` into TransitionMeta, a history TRAVERSAL under navigation-plugin
    // arrives with BOTH navigationType "traverse" AND transition.replace=true
    // (a traversal reuses an existing entry → replace-shaped). The restore
    // branch must win over the replace-skip; otherwise every back/forward gets
    // swallowed and scroll is never restored.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 640 }));

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
        { replace: true },
      ),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenCalledWith({
      top: 640,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("navigationType 'reload' triggers restore from storage", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "home:{}": 200 }));

    // After F5 the router starts fresh — initial navigation, no previousRoute.
    const fake = makeFakeRouter();
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState("home", {}, { navigation: { navigationType: "reload" } }),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 200,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("no state.context.navigation → falls back to scrollToHashOrTop", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(makeState("about"), makeState("home"));

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("subscribe captures previousRoute's scrollY into storage", () => {
    const fake = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 350,
      configurable: true,
    });

    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(saved["home:{}"]).toBe(350);

    sr.destroy();
  });

  // ===========================================================================
  // #782 — the previousRoute scroll position is captured synchronously inside
  // router.subscribe, but the snap/restore effect runs in a requestAnimationFrame.
  // When two navigations land in the same frame (await navigate(b); await
  // navigate(c) — a programmatic redirect), the second capture runs before the
  // first nav's rAF snap, so readPos() still returns the route BEFORE
  // previousRoute and writes it under previousRoute's key. The fix skips the
  // capture while the scroll is unsettled.
  // ===========================================================================
  describe("#782 — two navigations in one frame must not capture a foreign position", () => {
    function makeRafQueue(): () => void {
      const queue: FrameRequestCallback[] = [];

      vi.stubGlobal(
        "requestAnimationFrame",
        (cb: FrameRequestCallback): number => {
          queue.push(cb);

          return queue.length;
        },
      );

      return () => {
        const pending = queue.splice(0);

        for (const cb of pending) {
          cb(0);
        }
      };
    }

    function makeScroller(top: number): HTMLElement {
      const element = document.createElement("div");

      Object.defineProperty(element, "scrollTop", {
        value: top,
        writable: true,
        configurable: true,
      });
      element.scrollTo = ((opts: ScrollToOptions) => {
        element.scrollTop = opts.top ?? 0;
      }) as typeof element.scrollTo;

      return element;
    }

    it("control: navigations in SEPARATE frames capture honest positions", () => {
      const flush = makeRafQueue();
      const element = makeScroller(500);
      const fake = makeFakeRouter(makeState("a"));

      track(
        createScrollRestoration(fake.router, {
          scrollContainer: () => element,
        }),
      );

      // a → b: capture a at 500, snap-b deferred.
      fake.emit(makeState("b"), makeState("a"));
      flush(); // b's rAF snaps the container to top → scrollTop 0.
      // b → c in a LATER frame: capture b at its honest 0.
      fake.emit(makeState("c"), makeState("b"));
      flush();

      const store = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) ?? "{}",
      ) as Record<string, number>;

      expect(store["a:{}"]).toBe(500);
      expect(store["b:{}"]).toBe(0);
    });

    it("probe: navigations in the SAME frame must not write a's position under b's key", () => {
      const flush = makeRafQueue();
      const element = makeScroller(500);
      const fake = makeFakeRouter(makeState("a"));

      track(
        createScrollRestoration(fake.router, {
          scrollContainer: () => element,
        }),
      );

      // a → b then b → c with NO frame in between (programmatic redirect): b's
      // snap-to-top rAF has not run, so readPos() still returns a's 500.
      fake.emit(makeState("b"), makeState("a")); // capture a = 500
      fake.emit(makeState("c"), makeState("b")); // capture b — must NOT read a's 500
      flush(); // both deferred snaps run now

      const store = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) ?? "{}",
      ) as Record<string, number>;

      expect(store["a:{}"]).toBe(500); // a's honest position survives
      expect(store["b:{}"]).toBeUndefined(); // b's foreign 500 must not be written
    });
  });

  it("initial navigation without previousRoute — nothing saved", () => {
    const fake = makeFakeRouter();

    Object.defineProperty(globalThis, "scrollY", {
      value: 100,
      configurable: true,
    });
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState("home", {}, { navigation: { navigationType: "push" } }),
    );

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    sr.destroy();
  });

  it("pagehide saves current position under current key", () => {
    const fake = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 500,
      configurable: true,
    });

    const sr = track(createScrollRestoration(fake.router));

    globalThis.dispatchEvent(new Event("pagehide"));

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(saved["home:{}"]).toBe(500);

    sr.destroy();
  });

  it("custom scrollContainer reads/writes via element.scrollTo, not window", () => {
    const element = document.createElement("div");

    element.id = "scroller";
    document.body.append(element);
    Object.defineProperty(element, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    const elementScrollToSpy = vi.fn();

    element.scrollTo = elementScrollToSpy;

    const fake = makeFakeRouter(makeState("home"));
    const windowScrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(
      createScrollRestoration(fake.router, {
        scrollContainer: () => element,
      }),
    );

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 200 }));
    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    expect(elementScrollToSpy).toHaveBeenLastCalledWith({
      top: 200,
      left: 0,
      behavior: "auto",
    });
    expect(windowScrollSpy).not.toHaveBeenCalled();

    sr.destroy();
  });

  it("scrollContainer resolved lazily — late-mounted element is used on next event", () => {
    let element: HTMLElement | null = null;

    // Pre-populate before instance creation (mirrors production: previous-session
    // putPos wrote to sessionStorage before the next page's createScrollRestoration
    // initialises). The write-through cache reads sessionStorage once on first
    // loadStore() — data must be present at that point.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 150 }));

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(
      createScrollRestoration(fake.router, { scrollContainer: () => element }),
    );

    // Element doesn't exist yet; pagehide should fall back to window without error.
    expect(() => {
      globalThis.dispatchEvent(new Event("pagehide"));
    }).not.toThrow();

    // Now mount the container.
    element = document.createElement("div");
    element.id = "late-scroller";
    document.body.append(element);
    Object.defineProperty(element, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    const elementScrollToSpy = vi.fn();

    element.scrollTo = elementScrollToSpy;

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    // Lazy resolve picked up the newly-mounted container.
    expect(elementScrollToSpy).toHaveBeenLastCalledWith({
      top: 150,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("scrollContainer returns null → falls back to window", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(
      createScrollRestoration(fake.router, {
        scrollContainer: () => null,
      }),
    );

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("restore: late-mounted container resolved via bounded retry; window restored immediately", () => {
    // The container is not in the DOM when the restore frame fires (heavy route
    // still committing) — `getContainer()` returns null for the first two
    // resolves, then the element appears. The synchronous rAF stub drives the
    // retry loop inline.
    const element = document.createElement("div");

    element.id = "late-restore-scroller";
    Object.defineProperty(element, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    const elementScrollToSpy = vi.fn();

    element.scrollTo = elementScrollToSpy;

    let calls = 0;
    const fake = makeFakeRouter(makeState("home"));
    const windowScrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(
      createScrollRestoration(fake.router, {
        scrollContainer: () => {
          calls += 1;

          // Resolve order on this navigation: #1 = capture-side readPos, #2 =
          // restorePos fast-path probe, #3 = first retry frame. Stay null until
          // the retry frame so both the fast-path and ≥1 retry see no element.
          return calls >= 3 ? element : null;
        },
      }),
    );

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 350 }));
    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    // Window was restored immediately (harmless clamp on a container route)...
    expect(windowScrollSpy).toHaveBeenCalledWith({
      top: 350,
      left: 0,
      behavior: "auto",
    });
    // ...and the late container caught the saved position once it mounted.
    expect(elementScrollToSpy).toHaveBeenCalledWith({
      top: 350,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("restore: container never mounts → window fallback after retry budget, no element scroll", () => {
    const elementScrollToSpy = vi.fn();
    const fake = makeFakeRouter(makeState("home"));
    const windowScrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(
      createScrollRestoration(fake.router, {
        // Getter is configured but the route never renders the container.
        scrollContainer: () => null,
      }),
    );

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 420 }));

    expect(() => {
      fake.emit(
        makeState(
          "about",
          {},
          { navigation: { direction: "back", navigationType: "traverse" } },
        ),
        makeState("home"),
      );
    }).not.toThrow();

    expect(windowScrollSpy).toHaveBeenCalledWith({
      top: 420,
      left: 0,
      behavior: "auto",
    });
    expect(elementScrollToSpy).not.toHaveBeenCalled();

    sr.destroy();
  });

  it("restore: destroy() during container retry cancels the late scroll", () => {
    vi.unstubAllGlobals();
    const pending: FrameRequestCallback[] = [];

    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        pending.push(cb);

        return pending.length;
      },
    );

    const element = document.createElement("div");

    element.id = "destroy-during-retry-scroller";
    const elementScrollToSpy = vi.fn();

    element.scrollTo = elementScrollToSpy;

    // Container is absent while the restore frame runs, becomes resolvable
    // afterwards — so only the destroyed-guard can stop the late scroll.
    let mounted = false;
    const fake = makeFakeRouter(makeState("home"));
    const sr = createScrollRestoration(fake.router, {
      scrollContainer: () => (mounted ? element : null),
    });

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 500 }));
    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    // pending[0] = subscribe's outer rAF. Fire it → restorePos runs, schedules
    // the container-retry frame.
    pending.shift()?.(0);

    // Container would now resolve, but we tear down first.
    mounted = true;
    sr.destroy();

    // Fire the retry frame — the destroyed guard must bail before scrolling.
    pending.shift()?.(0);

    expect(elementScrollToSpy).not.toHaveBeenCalled();
  });

  it("restore: instant container scroll stops re-applying once it sticks", () => {
    const element = document.createElement("div");

    element.id = "sticky-scroller";
    Object.defineProperty(element, "scrollHeight", {
      value: 5000,
      configurable: true,
    });
    Object.defineProperty(element, "clientHeight", {
      value: 500,
      configurable: true,
    });
    let top = 0;

    Object.defineProperty(element, "scrollTop", {
      get: () => top,
      set: (value: number) => {
        top = value;
      },
      configurable: true,
    });
    // A real container updates scrollTop synchronously for instant scrolls.
    const scrollToSpy = vi.fn((opts?: ScrollToOptions) => {
      element.scrollTop = Math.min(opts?.top ?? 0, 5000 - 500);
    });

    element.scrollTo = scrollToSpy as unknown as typeof element.scrollTo;

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(
      createScrollRestoration(fake.router, { scrollContainer: () => element }),
    );

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 1200 }));
    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    expect(element.scrollTop).toBe(1200);
    // Stuck on the first apply → no wasted re-applies across the frame budget.
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    sr.destroy();
  });

  it("restore: smooth container scroll re-applies across the whole frame budget", () => {
    const element = document.createElement("div");

    element.id = "smooth-scroller";
    Object.defineProperty(element, "scrollHeight", {
      value: 5000,
      configurable: true,
    });
    Object.defineProperty(element, "clientHeight", {
      value: 500,
      configurable: true,
    });
    let top = 0;

    Object.defineProperty(element, "scrollTop", {
      get: () => top,
      set: (value: number) => {
        top = value;
      },
      configurable: true,
    });
    const scrollToSpy = vi.fn((opts?: ScrollToOptions) => {
      element.scrollTop = Math.min(opts?.top ?? 0, 5000 - 500);
    });

    element.scrollTo = scrollToSpy as unknown as typeof element.scrollTo;

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(
      createScrollRestoration(fake.router, {
        scrollContainer: () => element,
        behavior: "smooth",
      }),
    );

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 1200 }));
    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    // Smooth restores animate asynchronously, so the sampled position never
    // matches synchronously — the loop never early-stops and runs the full
    // budget (initial attempt + RESTORE_RETRY_FRAMES retries = 11 applies).
    expect(scrollToSpy).toHaveBeenCalledTimes(11);
    expect(scrollToSpy).toHaveBeenLastCalledWith({
      top: 1200,
      left: 0,
      behavior: "smooth",
    });

    sr.destroy();
  });

  it("anchorScrolling=false + hash → ignores hash, scrolls to top", () => {
    const anchor = document.createElement("div");

    anchor.id = "target";
    document.body.append(anchor);
    const scrollIntoViewSpy = vi.fn();

    anchor.scrollIntoView = scrollIntoViewSpy;
    globalThis.history.replaceState(null, "", "/#target");

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(
      createScrollRestoration(fake.router, {
        anchorScrolling: false,
      }),
    );

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
    globalThis.history.replaceState(null, "", "/");
  });

  it("key canonicalization: {a:1,b:2} and {b:2,a:1} collapse to one bucket", () => {
    const fake = makeFakeRouter(makeState("list", { a: 1, b: 2 }));

    Object.defineProperty(globalThis, "scrollY", {
      value: 100,
      configurable: true,
    });
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState("item", {}, { navigation: { navigationType: "push" } }),
      makeState("list", { b: 2, a: 1 }),
    );

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;
    // Both orderings normalize to the same key: list:{"a":1,"b":2}
    const keys = Object.keys(saved);

    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('list:{"a":1,"b":2}');

    sr.destroy();
  });

  it("sessionStorage persistence across instances", () => {
    const fake1 = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 77,
      configurable: true,
    });
    const sr1 = track(createScrollRestoration(fake1.router));

    fake1.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );
    sr1.destroy();

    // Second instance starts fresh but sessionStorage persists.
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const fake2 = makeFakeRouter(makeState("about"));
    const sr2 = track(createScrollRestoration(fake2.router));

    fake2.emit(
      makeState(
        "home",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("about"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 77,
      left: 0,
      behavior: "auto",
    });

    sr2.destroy();
  });

  it("two concurrent instances share storage without corrupting each other", () => {
    // Different routers, different route names → distinct storage keys.
    const fake1 = makeFakeRouter(makeState("home"));
    const fake2 = makeFakeRouter(makeState("dashboard"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 100,
      configurable: true,
    });

    const sr1 = track(createScrollRestoration(fake1.router));
    const sr2 = track(createScrollRestoration(fake2.router));

    // Both instances must not throw on pagehide; both keys end up in storage.
    expect(() => {
      globalThis.dispatchEvent(new Event("pagehide"));
    }).not.toThrow();

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(saved["home:{}"]).toBe(100);
    expect(saved["dashboard:{}"]).toBe(100);

    // destroy() of one instance doesn't affect the other's subscription.
    sr1.destroy();
    // After destroy of sr1, sr2 is still alive: emit should still work.
    fake2.emit(
      makeState("settings", {}, { navigation: { navigationType: "push" } }),
      makeState("dashboard"),
    );

    const after = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    // Previous route for fake2 was re-captured on navigation.
    expect(after["dashboard:{}"]).toBeDefined();

    sr2.destroy();
  });

  it("colliding keys: last write wins, history.scrollRestoration restores in LIFO order", () => {
    history.scrollRestoration = "auto";

    // Two instances on the SAME route → same key → last write wins.
    const fake1 = makeFakeRouter(makeState("home"));
    const fake2 = makeFakeRouter(makeState("home"));

    const sr1 = createScrollRestoration(fake1.router);

    // After sr1 flip: prevScrollRestoration = "auto", current = "manual"
    expect(history.scrollRestoration).toBe("manual");

    const sr2 = createScrollRestoration(fake2.router);

    // sr2 sees "manual" as prev, still "manual" current.
    expect(history.scrollRestoration).toBe("manual");

    // Both write into the same bucket; last one wins — not corrupt.
    Object.defineProperty(globalThis, "scrollY", {
      value: 111,
      configurable: true,
    });
    fake1.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );

    Object.defineProperty(globalThis, "scrollY", {
      value: 222,
      configurable: true,
    });
    fake2.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    // Last write wins (222 overwrote 111 under the same key).
    expect(saved["home:{}"]).toBe(222);

    // Destroy in reverse order — history.scrollRestoration walks back
    // through snapshots (sr2.prev = "manual" → still "manual" after its destroy).
    sr2.destroy();

    expect(history.scrollRestoration).toBe("manual");

    sr1.destroy();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("destroy is idempotent", () => {
    history.scrollRestoration = "auto";

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(createScrollRestoration(fake.router));

    sr.destroy();

    expect(() => {
      sr.destroy();
    }).not.toThrow();
    expect(history.scrollRestoration).toBe("auto");
  });

  it("sessionStorage setItem throws → write is swallowed, no exception propagates", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    const fake = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 99,
      configurable: true,
    });
    const sr = track(createScrollRestoration(fake.router));

    expect(() => {
      fake.emit(
        makeState("about", {}, { navigation: { navigationType: "push" } }),
        makeState("home"),
      );
    }).not.toThrow();

    sr.destroy();
    setItemSpy.mockRestore();
  });

  it("sessionStorage JSON parse error → load returns empty object", () => {
    sessionStorage.setItem(STORAGE_KEY, "not-valid-json");

    const fake = makeFakeRouter(makeState("about"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "home",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("about"),
    );

    // Corrupted JSON → store treated as empty → restores to 0.
    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("single rAF: restoration deferred to next animation frame", () => {
    vi.unstubAllGlobals();
    const pending: FrameRequestCallback[] = [];

    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        pending.push(cb);

        return pending.length;
      },
    );

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    // After emit: 1 RAF scheduled, not yet resolved → no scroll yet.
    expect(pending).toHaveLength(1);
    expect(scrollSpy).not.toHaveBeenCalled();

    // Frame fires → scroll applied.
    pending.shift()?.(0);

    expect(scrollSpy).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("destroy() during pending rAF cancels restoration (race guard)", () => {
    vi.unstubAllGlobals();
    const pending: FrameRequestCallback[] = [];

    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        pending.push(cb);

        return pending.length;
      },
    );

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = createScrollRestoration(fake.router);

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    // Destroy BEFORE the pending frame fires.
    sr.destroy();

    // Now the frame fires — guard must bail out; no scroll.
    pending.shift()?.(0);

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("mode 'top' + navigationType 'replace' still scrolls to top", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router, { mode: "top" }));

    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "replace" } }),
      makeState("home"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("hash is decoded before getElementById lookup", () => {
    const anchor = document.createElement("div");

    anchor.id = "foo bar"; // real id with a space
    document.body.append(anchor);
    const scrollIntoViewSpy = vi.fn();

    anchor.scrollIntoView = scrollIntoViewSpy;
    globalThis.history.replaceState(null, "", "/#foo%20bar"); // percent-encoded

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "forward", navigationType: "push" } },
      ),
      makeState("home"),
    );

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    sr.destroy();
    globalThis.history.replaceState(null, "", "/");
  });

  it("malformed percent-escape falls back to raw hash (no throw)", () => {
    globalThis.history.replaceState(null, "", "/#foo%2"); // invalid escape

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    expect(() => {
      fake.emit(
        makeState(
          "about",
          {},
          { navigation: { direction: "forward", navigationType: "push" } },
        ),
        makeState("home"),
      );
    }).not.toThrow();

    // No element matches the raw "foo%2" id either → scroll to top.
    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
    globalThis.history.replaceState(null, "", "/");
  });

  it("pagehide without a current state (getState returns undefined) is safe", () => {
    const fake = makeFakeRouter();
    const sr = track(createScrollRestoration(fake.router));

    expect(() => {
      globalThis.dispatchEvent(new Event("pagehide"));
    }).not.toThrow();

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    sr.destroy();
  });

  it("pagehide listener is removed after destroy", () => {
    const fake = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 300,
      configurable: true,
    });
    const sr = track(createScrollRestoration(fake.router));

    sr.destroy();
    globalThis.dispatchEvent(new Event("pagehide"));

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  describe("unserializable params (#P0.2 audit)", () => {
    // `keyOf` defers to `canonicalJson` → `JSON.stringify`. Two realistic
    // inputs blow it up: BigInt values (TypeError) and cyclic structures
    // (stack overflow). Without the defensive wrapper, the subscribe
    // callback throws and scroll-restore goes silently offline for the
    // whole session. The wrapper drops capture/restore for the offending
    // route, warns once, and keeps the rest of the cache usable.

    it("BigInt params do NOT throw — capture is skipped, warning logged once", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      Object.defineProperty(globalThis, "scrollY", {
        value: 250,
        configurable: true,
      });

      const fake = makeFakeRouter(makeState("home"));
      const sr = track(createScrollRestoration(fake.router));

      const bad = makeState("bad", { id: 9_007_199_254_740_993n });
      const next = makeState("next", { id: "ok" });

      // Capture: previousRoute is `bad` (unserializable) — must NOT throw.
      expect(() => {
        fake.emit(next, bad);
      }).not.toThrow();

      // Nothing persisted for the unserializable key. Storage is either
      // null (never written) or an empty object — both prove the capture
      // was skipped. Read deterministically (no conditional expect).
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const stored =
        raw === null ? {} : (JSON.parse(raw) as Record<string, number>);

      expect(Object.keys(stored).some((k) => k.startsWith("bad:"))).toBe(false);

      // Warning was emitted; second hit must NOT spam.
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("bad"));

      const bad2 = makeState("bad", { id: 1n });

      fake.emit(makeState("again"), bad2);

      expect(consoleError).toHaveBeenCalledTimes(1);

      sr.destroy();
      consoleError.mockRestore();
    });

    it("cyclic params do NOT throw — capture is skipped, warning logged once", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const cyclic: Record<string, unknown> = { id: "x" };

      cyclic.self = cyclic;

      Object.defineProperty(globalThis, "scrollY", {
        value: 400,
        configurable: true,
      });

      const fake = makeFakeRouter(makeState("home"));
      const sr = track(createScrollRestoration(fake.router));

      const bad = makeState("loop", cyclic);
      const next = makeState("home");

      expect(() => {
        fake.emit(next, bad);
      }).not.toThrow();

      expect(consoleError).toHaveBeenCalledTimes(1);

      sr.destroy();
      consoleError.mockRestore();
    });

    it("pagehide with unserializable current state does NOT throw", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const fake = makeFakeRouter(makeState("bad", { id: 42n }));

      Object.defineProperty(globalThis, "scrollY", {
        value: 150,
        configurable: true,
      });

      const sr = track(createScrollRestoration(fake.router));

      expect(() => {
        globalThis.dispatchEvent(new Event("pagehide"));
      }).not.toThrow();

      // Nothing persisted for the bad key, but the dispatch itself was safe.
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

      sr.destroy();
      consoleError.mockRestore();
    });

    it("restore (back/traverse) with unserializable params writes 0 instead of throwing", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const scrollSpy = vi.fn();

      globalThis.scrollTo = scrollSpy;

      const fake = makeFakeRouter(makeState("home"));
      const sr = track(createScrollRestoration(fake.router));

      const target = makeState(
        "bad",
        { id: 7n },
        { navigation: { direction: "back", navigationType: "traverse" } },
      );

      expect(() => {
        fake.emit(target, makeState("prev"));
      }).not.toThrow();

      // Default-to-zero behavior: cannot look up a key we cannot compute.
      expect(scrollSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
      consoleError.mockRestore();
    });
  });

  describe("portable disambiguation via transition.replace / transition.reload (RFC)", () => {
    it("browser-plugin like (no context.navigation) + transition.replace=true → skip restore (no scrollTo)", () => {
      const fake = makeFakeRouter(makeState("home"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(
        makeState("about", {}, {}, { replace: true }),
        makeState("home"),
      );

      expect(scrollSpy).not.toHaveBeenCalled();

      sr.destroy();
    });

    it("browser-plugin like (no context.navigation) + transition.reload=true → restore from sessionStorage", () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "home:{}": 333 }));

      const fake = makeFakeRouter(makeState("about"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(
        makeState("home", {}, {}, { reload: true }),
        makeState("about"),
      );

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 333,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("browser-plugin like (no context.navigation) + plain push (no replace/reload) → scrollToHashOrTop", () => {
      const fake = makeFakeRouter(makeState("home"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(makeState("about"), makeState("home"));

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("browser-plugin like (no context.navigation) + navigateToNotFound-shaped state (transition.replace=true) → skip restore", () => {
      const fake = makeFakeRouter(makeState("home"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      // navigateToNotFound builds state with transition.replace=true inline;
      // browser-plugin doesn't write state.context.navigation. The portable
      // transition.replace flag is what drives the skip path now.
      fake.emit(
        makeState("@@router/UNKNOWN_ROUTE", {}, {}, { replace: true }),
        makeState("home"),
      );

      expect(scrollSpy).not.toHaveBeenCalled();

      sr.destroy();
    });

    it("browser-plugin F5 regression: no context.navigation AND no transition.reload → scrollToHashOrTop (browser-plugin can't disambiguate F5; out of scope)", () => {
      // F5 under browser-plugin: opts.reload is undefined on initial
      // transition, and there's no Navigation API getActivationType analogue
      // to prime nav.navigationType — neither signal fires. The behaviour
      // intentionally stays at the legacy "scroll to top / hash" — closing
      // this gap requires core-level F5 priming, out of scope for this RFC.
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "home:{}": 999 }));

      const fake = makeFakeRouter();
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(makeState("home"));

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("navigation-plugin F5 regression: context.navigation.navigationType='reload' + transition.reload=undefined (simulates #531 priming) → restore from sessionStorage", () => {
      // The plugin arm in the OR-condition is what preserves F5 scroll
      // restoration under navigation-plugin: getActivationType() primes
      // nav.navigationType="reload" but opts.reload stays undefined on the
      // initial transition, so transition.reload alone wouldn't trigger.
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "home:{}": 555 }));

      const fake = makeFakeRouter();
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(
        makeState("home", {}, { navigation: { navigationType: "reload" } }),
      );

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 555,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });
  });

  describe("#809 — owner edge-case coverage", () => {
    it("SSR — returns NOOP when window is undefined", () => {
      const realWindow = globalThis.window;

      vi.stubGlobal("window", undefined);

      try {
        const sr = createScrollRestoration(
          makeFakeRouter(makeState("home")).router,
        );

        expect(typeof sr.destroy).toBe("function");
        expect(() => {
          sr.destroy();
        }).not.toThrow();
      } finally {
        vi.stubGlobal("window", realWindow);
      }
    });

    it("uses the scroll container for read and write when scrollContainer returns an element", () => {
      const container = document.createElement("div");
      const scrollToSpy = vi.fn();

      container.scrollTo = scrollToSpy;
      Object.defineProperty(container, "scrollTop", {
        value: 42,
        configurable: true,
      });

      const fake = makeFakeRouter(makeState("home"));
      const sr = track(
        createScrollRestoration(fake.router, {
          scrollContainer: () => container,
        }),
      );

      fake.emit(
        makeState("about", {}, { navigation: { navigationType: "push" } }),
        makeState("home"),
      );

      // write side: scrollToHashOrTop → writePos(0) → container.scrollTo
      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      // read side: previous position captured from container.scrollTop
      const store = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) ?? "{}",
      ) as Record<string, number>;

      expect(store["home:{}"]).toBe(42);

      sr.destroy();
    });

    it("anchor scrolling: scrollIntoView on the element matching context.url.hash", () => {
      const target = document.createElement("div");
      const scrollIntoViewSpy = vi.fn();

      target.id = "sec";
      target.scrollIntoView = scrollIntoViewSpy;
      document.body.append(target);

      const fake = makeFakeRouter(makeState("home"));
      const sr = track(
        createScrollRestoration(fake.router, { anchorScrolling: true }),
      );

      fake.emit(
        makeState(
          "about",
          {},
          { url: { hash: "sec" }, navigation: { navigationType: "push" } },
        ),
        makeState("home"),
      );

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: "auto" });

      sr.destroy();
    });

    it("anchor scrolling: falls back to top when the hash element is missing", () => {
      const scrollToSpy = vi.spyOn(globalThis, "scrollTo");
      const fake = makeFakeRouter(makeState("home"));
      const sr = track(
        createScrollRestoration(fake.router, { anchorScrolling: true }),
      );

      fake.emit(
        makeState(
          "about",
          {},
          { url: { hash: "nope" }, navigation: { navigationType: "push" } },
        ),
        makeState("home"),
      );

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("anchor scrolling: empty context hash scrolls to top", () => {
      const scrollToSpy = vi.spyOn(globalThis, "scrollTo");
      const fake = makeFakeRouter(makeState("home"));
      const sr = track(
        createScrollRestoration(fake.router, { anchorScrolling: true }),
      );

      fake.emit(
        makeState(
          "about",
          {},
          { url: { hash: "" }, navigation: { navigationType: "push" } },
        ),
        makeState("home"),
      );

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("restores the saved position on nav.navigationType === 'reload' (F5 priming, #531)", () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 500 }));

      const scrollToSpy = vi.spyOn(globalThis, "scrollTo");
      const fake = makeFakeRouter(makeState("about"));
      const sr = track(createScrollRestoration(fake.router));

      // transition.reload is undefined; the plugin-primed nav arm drives restore.
      fake.emit(
        makeState("about", {}, { navigation: { navigationType: "reload" } }),
      );

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 500,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("restores the saved position on transition.reload (programmatic reload arm)", () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 300 }));

      const scrollToSpy = vi.spyOn(globalThis, "scrollTo");
      const fake = makeFakeRouter(makeState("about"));
      const sr = track(createScrollRestoration(fake.router));

      // The left arm of `route.transition.reload || nav?.navigationType`.
      fake.emit(makeState("about", {}, {}, { reload: true }));

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 300,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("restores position 0 on reload when the store has no entry for the route", () => {
      const scrollToSpy = vi.spyOn(globalThis, "scrollTo");
      // No sessionStorage seed: F5 on a route whose position was never
      // captured (fresh session / cleared storage) → `loadStore()[key]` is
      // undefined → the `?? 0` fallback scrolls to top.
      const fake = makeFakeRouter(makeState("about"));
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(makeState("about", {}, {}, { reload: true }));

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("restores position 0 on reload when safeKeyOf yields null (uncanonicalizable params)", () => {
      const scrollToSpy = vi.spyOn(globalThis, "scrollTo");
      // A cyclic params object makes canonicalJson throw → safeKeyOf returns
      // null → the reload restore falls back to position 0 (key === null arm).
      const cyclic: Record<string, unknown> = {};

      cyclic.self = cyclic;

      const fake = makeFakeRouter(makeState("about", cyclic));
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(makeState("about", cyclic, {}, { reload: true }));

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("safeKeyOf substitutes <fn>/<sym> sentinels for function/symbol param values", () => {
      Object.defineProperty(globalThis, "scrollY", {
        value: 10,
        configurable: true,
      });

      const fake = makeFakeRouter(makeState("home"));
      const sr = track(createScrollRestoration(fake.router));

      // Runtime type violation: Params forbids function/symbol values, but the
      // canonical replacer defends against a buggy caller smuggling them
      // (audit §5 MEDIUM — prevents silent scroll-key collisions).
      const prev = makeState("page", {
        fn: (() => undefined) as unknown as string,
        sym: Symbol("x") as unknown as string,
      });

      fake.emit(
        makeState("about", {}, { navigation: { navigationType: "push" } }),
        prev,
      );

      const store = sessionStorage.getItem(STORAGE_KEY) ?? "";

      expect(store).toContain("<fn>");
      expect(store).toContain("<sym>");

      sr.destroy();
    });
  });
});
