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
  // The path is DERIVED, not a constant (#1923). The scroll key is the printed
  // location now, so a factory handing every fake the same "/" collapses every
  // route into one bucket and the suite measures the harness rather than the
  // code. Sorted, so the key stays order-insensitive as the printed form is.
  const query = Object.keys(params)
    .toSorted((a, b) => a.localeCompare(b))
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");

  return {
    name,
    params: params as State["params"],
    search: {},
    path: query ? `/${name}?${query}` : `/${name}`,
    context: context,
    transition: transition as State["transition"],
  };
}

// What browser-plugin writes: every popstate is `{ source: "popstate",
// direction: "back" }`, a Forward included (#2912).
function browserContext(
  source: "popstate" | "navigate",
  hash = "",
): Record<string, unknown> {
  return {
    url: { hash, hashChanged: hash !== "" },
    browser: {
      source,
      direction: source === "popstate" ? "back" : "forward",
    },
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

// Plain-object `sessionStorage` mock — the real global is not spyable under
// vitest+jsdom, so a `Storage.prototype` spy silently observes nothing. Why, in
// full: IMPLEMENTATION_NOTES.md § "Adapter scroll tests mock `sessionStorage`".
function createMockStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("createScrollRestoration", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createMockStorage());
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

    expect(storeA["/home"]).toBe(333);
    expect(storeB["/home"]).toBe(333);
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 420 }));

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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 77 }));

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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 640 }));

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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 200 }));

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

    expect(saved["/home"]).toBe(350);

    sr.destroy();
  });

  // Angular's `provideRealRouterFactory` installs the utility in an environment
  // initializer, before the app initializer starts the router; `start()`
  // commits a replace with no previous route.
  it("the start commit, a replace with no previous route, keeps the next capture", () => {
    const fake = makeFakeRouter();
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(makeState("home", {}, {}, { replace: true }));
    Object.defineProperty(globalThis, "scrollY", {
      value: 350,
      configurable: true,
    });
    fake.emit(makeState("about"), makeState("home"));

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(saved["/home"]).toBe(350);

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

      expect(store["/a"]).toBe(500);
      expect(store["/b"]).toBe(0);
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

      expect(store["/a"]).toBe(500); // a's honest position survives
      expect(store["/b"]).toBeUndefined(); // b's foreign 500 must not be written
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

    expect(saved["/home"]).toBe(500);

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

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 200 }));
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 150 }));

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

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 350 }));
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

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 420 }));

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

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 500 }));
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

  it("restore: an instant container restore stops once the container can hold the position", () => {
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

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 1200 }));
    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    expect(element.scrollTop).toBe(1200);
    // The container can hold 1200, so the first apply ends the loop.
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    sr.destroy();
  });

  it.each([
    // A smooth scroll has not moved when the loop samples it, so the loop
    // stops on the content's height, not on the position (#2912).
    ["applies once when the content holds the position", 5000, 1],
    // Initial attempt + RESTORE_RETRY_FRAMES retries.
    ["re-applies across the budget while the content is too short", 800, 11],
  ])(
    "restore: a smooth container restore %s",
    (_label, scrollHeight, calls) => {
      const element = document.createElement("div");

      element.id = "smooth-scroller";
      Object.defineProperty(element, "scrollHeight", {
        value: scrollHeight,
        configurable: true,
      });
      Object.defineProperty(element, "clientHeight", {
        value: 500,
        configurable: true,
      });
      // An animating scroll: the position moves after the call, not in it.
      const scrollToSpy = vi.fn();

      element.scrollTo = scrollToSpy;

      const fake = makeFakeRouter(makeState("home"));
      const sr = track(
        createScrollRestoration(fake.router, {
          scrollContainer: () => element,
          behavior: "smooth",
        }),
      );

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 1200 }));
      fake.emit(
        makeState(
          "about",
          {},
          { navigation: { direction: "back", navigationType: "traverse" } },
        ),
        makeState("home"),
      );

      expect(scrollToSpy).toHaveBeenCalledTimes(calls);
      expect(scrollToSpy).toHaveBeenLastCalledWith({
        top: 1200,
        left: 0,
        behavior: "smooth",
      });

      sr.destroy();
    },
  );

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
    // Both orderings normalize to the same key: the printed location.
    const keys = Object.keys(saved);

    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe("/list?a=1&b=2");

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

    expect(saved["/home"]).toBe(100);
    expect(saved["/dashboard"]).toBe(100);

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
    expect(after["/dashboard"]).toBeDefined();

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
    expect(saved["/home"]).toBe(222);

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
      .spyOn(sessionStorage, "setItem")
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
    // `keyOf` reads `state.path` — a string property. The inputs that used
    // to blow a serializer up (BigInt values, cyclic structures) never reach
    // one from here, so the failure mode these cells guard is structural
    // rather than defended: the wrapper and its warn-once are gone with it.

    it("BigInt params do NOT throw, and the capture is ordinary", () => {
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

      // ⚠ Inverted by #1923. The key is the printed location, so a `BigInt`
      // never reaches a serializer and the capture is ORDINARY — where this
      // used to assert a skipped capture plus a one-shot warning, the failure
      // mode it guarded no longer exists.
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const stored =
        raw === null ? {} : (JSON.parse(raw) as Record<string, number>);

      expect(Object.keys(stored).some((k) => k.startsWith("/bad"))).toBe(true);
      expect(consoleError).not.toHaveBeenCalled();

      const bad2 = makeState("bad", { id: 1n });

      fake.emit(makeState("again"), bad2);

      expect(consoleError).not.toHaveBeenCalled();

      sr.destroy();
      consoleError.mockRestore();
    });

    it("cyclic params do NOT throw, and no warning is needed", () => {
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

      // ⚠ Inverted by #1923: a cycle cannot reach a serializer from the key.
      expect(consoleError).not.toHaveBeenCalled();

      sr.destroy();
      consoleError.mockRestore();
    });

    it("pagehide with an unserializable param captures like any other", () => {
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
      // ⚠ Inverted by #1923: the key is the path, so pagehide persists the
      // position instead of skipping it.
      expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

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

    it("a committed state with NO transition at all does not throw (#1976)", () => {
      // Core's commit door commits a foreign State's ABSENT `transition` rather
      // than fabricating one (#1792), so `subscribe` can hand this callback a
      // state without the field. The flat reads at both arms threw.
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 333 }));

      const fake = makeFakeRouter(makeState("about"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));
      const noTransition = {
        name: "home",
        params: {},
        search: {},
        path: "/",
        context: {},
      };

      expect(() => {
        fake.emit(noTransition as unknown as State, makeState("about"));
      }).not.toThrow();

      // Absent falls through to the ordinary forward arm — scroll to top —
      // which is the answer a state carrying no meta got before #1976.
      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("browser-plugin like (no context.navigation) + transition.reload=true → restore from sessionStorage", () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 333 }));

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

    // Core commits both flags as a JS caller passed them, non-booleans
    // included, and the arms read them for truthiness.
    it("a truthy transition.reload that is not a boolean restores", () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 333 }));

      const fake = makeFakeRouter(makeState("about"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(
        makeState("home", {}, {}, { reload: "yes" as unknown as boolean }),
        makeState("about"),
      );

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 333,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("a truthy transition.replace that is not a boolean leaves the scroll untouched", () => {
      const fake = makeFakeRouter(makeState("home"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(
        makeState("about", {}, {}, { replace: 1 as unknown as boolean }),
        makeState("home"),
      );

      expect(scrollSpy).not.toHaveBeenCalled();

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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 999 }));

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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 555 }));

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

      expect(store["/home"]).toBe(42);

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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 500 }));

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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/about": 300 }));

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

    it("restores position 0 on reload for a route with cyclic params", () => {
      const scrollToSpy = vi.spyOn(globalThis, "scrollTo");
      // The cycle never reaches a serializer — the key is the path — so the
      // reload restore runs ordinarily and finds nothing saved.
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

    // ⚠ Inverted by #1923. A serializer's sentinels used to stop two routes
    // differing only in a function value from sharing a scroll bucket. The key
    // is the printed location now, so such a pair IS one location and DOES
    // share a bucket — the named cost of the location key.
    it("two states differing only in a function value share one bucket", () => {
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

      // One location, one bucket — and no throw, no warning on the way.
      // One bucket. Its literal text embeds however the engine prints a
      // function, which is not this file's contract — the count is.
      expect(
        Object.keys(JSON.parse(store) as Record<string, number>),
      ).toHaveLength(1);

      sr.destroy();
    });
  });

  // ===========================================================================
  // #2912 — browser-plugin and memory-plugin publish a traversal in namespaces
  // of their own, and a traversal under either carries `transition.replace`.
  // The cells hand the utility the context each plugin writes;
  // `scroll-restore-history-plugins-2912.test.ts` has the real plugins write it.
  // ===========================================================================
  describe("#2912 — traversals published outside context.navigation", () => {
    it.each([
      [
        "a browser-plugin popstate onto another location",
        browserContext("popstate"),
      ],
      ["memory-plugin back()", { memory: { direction: "back" } }],
      ["memory-plugin forward()", { memory: { direction: "forward" } }],
    ])("%s restores the saved position", (_label, context) => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 640 }));

      const fake = makeFakeRouter(makeState("about"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(
        makeState("home", {}, context, { replace: true }),
        makeState("about"),
      );

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 640,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it.each([
      // A fragment navigation (an in-page anchor, `location.hash = …`) fires
      // popstate too, and keeps the location.
      [
        "a browser-plugin popstate that keeps the location",
        browserContext("popstate", "part"),
        "home",
      ],
      [
        "a programmatic replace under browser-plugin",
        browserContext("navigate"),
        "about",
      ],
      [
        "a programmatic replace under memory-plugin",
        { memory: { direction: "navigate" } },
        "about",
      ],
    ])("%s leaves the scroll untouched", (_label, context, from) => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 640 }));

      const fake = makeFakeRouter(makeState(from));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(
        makeState("home", {}, context, { replace: true }),
        makeState(from),
      );

      expect(scrollSpy).not.toHaveBeenCalled();

      sr.destroy();
    });

    // `replaceHistoryState` moved the URL to `?page=3` without a commit, so the
    // router still holds the bare location and the popstate seems to change it.
    function popstateFromStaleLocation(state: unknown): {
      scrollSpy: ReturnType<typeof vi.spyOn>;
      sr: { destroy: () => void };
    } {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ "/home?page=3": 640 }),
      );

      const fake = makeFakeRouter(makeState("home"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state }));
      fake.emit(
        makeState("home", { page: 3 }, browserContext("popstate", "part"), {
          replace: true,
        }),
        makeState("home"),
      );

      return { scrollSpy, sr };
    }

    it("a popstate onto a new entry, which carries no state, leaves the scroll untouched", () => {
      const { scrollSpy, sr } = popstateFromStaleLocation(null);

      expect(scrollSpy).not.toHaveBeenCalled();

      sr.destroy();
    });

    it("a popstate onto an entry carrying state restores, from the same stale location", () => {
      const { scrollSpy, sr } = popstateFromStaleLocation({ name: "home" });

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 640,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    // navigation-plugin writes no history state, and WebKit dispatches the
    // traversal's popstate before the restore frame.
    it("a navigation-plugin traversal restores although its popstate carries no state", () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 640 }));

      const fake = makeFakeRouter(makeState("about"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      fake.emit(
        makeState(
          "home",
          {},
          { navigation: { navigationType: "traverse", direction: "back" } },
          { replace: true },
        ),
        makeState("about"),
      );

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 640,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    // Two quick Backs, across an anchor's entry, while the landing route's
    // guard is pending: the plugin replays the second once the first commits,
    // and both commit before a frame. The page still shows the offset of the
    // route left before them.
    it("a popstate keeping the location of a commit whose frame has not run restores", () => {
      const frames: FrameRequestCallback[] = [];

      vi.stubGlobal(
        "requestAnimationFrame",
        (cb: FrameRequestCallback): number => frames.push(cb),
      );
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 640 }));

      const fake = makeFakeRouter(makeState("about"));
      const scrollSpy = vi.spyOn(globalThis, "scrollTo");
      const sr = track(createScrollRestoration(fake.router));
      const anchorEntry = makeState(
        "home",
        {},
        browserContext("popstate", "part"),
        { replace: true },
      );

      fake.emit(anchorEntry, makeState("about"));
      fake.emit(
        makeState("home", {}, browserContext("popstate"), { replace: true }),
        anchorEntry,
      );

      for (const cb of frames.splice(0)) {
        cb(0);
      }

      expect(scrollSpy).toHaveBeenLastCalledWith({
        top: 640,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });
  });

  // ===========================================================================
  // #2912 — a restore onto `window` outlasts a page that is still growing: the
  // target route can be laid out frames after the restore frame, and one
  // `scrollTo` clamps to the page as it is at that moment.
  // ===========================================================================
  describe("#2912 — a window restore re-applies while the page grows", () => {
    const traversal = { navigation: { direction: "back" } };

    // A page whose scroll range is `max`: scrollTo lands clamped to it at once.
    // The root reports the range as its `scrollHeight` less a `clientHeight`
    // of `viewport`.
    function makeWindow(initialMax: number, viewport = 0) {
      let y = 0;
      let max = initialMax;
      const queue: FrameRequestCallback[] = [];
      const scrollTo = vi.fn((opts: ScrollToOptions) => {
        y = Math.min(opts.top ?? 0, max);
      });

      Object.defineProperty(globalThis, "scrollY", {
        get: () => y,
        configurable: true,
      });
      Object.defineProperty(document.documentElement, "scrollHeight", {
        get: () => max + viewport,
        configurable: true,
      });
      Object.defineProperty(document.documentElement, "clientHeight", {
        get: () => viewport,
        configurable: true,
      });
      vi.stubGlobal("scrollTo", scrollTo);
      vi.stubGlobal(
        "requestAnimationFrame",
        (cb: FrameRequestCallback): number => {
          queue.push(cb);

          return queue.length;
        },
      );

      return {
        scrollTo,
        grow: (next: number) => {
          max = next;
        },
        frame: () => {
          for (const cb of queue.splice(0)) {
            cb(0);
          }
        },
        pending: () => queue.length,
      };
    }

    afterEach(() => {
      Object.defineProperty(globalThis, "scrollY", {
        value: 0,
        configurable: true,
        writable: true,
      });
      Reflect.deleteProperty(document.documentElement, "scrollHeight");
      Reflect.deleteProperty(document.documentElement, "clientHeight");
      Reflect.deleteProperty(document, "scrollingElement");
    });

    it.each([
      ["shorter than the position", 300, 0],
      // Content still loading: taller than 1200, yet 800 of it is the viewport.
      ["taller than the position by less than the viewport", 700, 800],
      // Past the pixel of tolerance.
      ["short of the position by two pixels", 1198, 0],
    ])(
      "re-applies while the page is %s, then stops",
      (_label, initialMax, viewport) => {
        const win = makeWindow(initialMax, viewport);

        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 1200 }));

        const fake = makeFakeRouter(makeState("about"));
        const sr = track(createScrollRestoration(fake.router));

        fake.emit(makeState("home", {}, traversal), makeState("about"));
        win.frame();

        expect(globalThis.scrollY, "the first attempt clamps").toBe(initialMax);

        win.grow(5000);
        win.frame();

        expect(globalThis.scrollY).toBe(1200);
        expect(win.pending(), "landed, so no further frame").toBe(0);

        sr.destroy();
      },
    );

    it.each([
      ["taller than the position", 5000, 1200],
      // A position read at a fractional scroll offset, against an integer range.
      ["holding a fractional position to the pixel", 1200, 1200.5],
      ["short of the position by a pixel", 1200, 1201],
    ])(
      "an instant restore onto a page %s schedules no retry",
      (_label, initialMax, top) => {
        const win = makeWindow(initialMax);

        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": top }));

        const fake = makeFakeRouter(makeState("about"));
        const sr = track(createScrollRestoration(fake.router));

        fake.emit(makeState("home", {}, traversal), makeState("about"));
        win.frame();

        expect(globalThis.scrollY).toBe(1200);
        expect(win.scrollTo).toHaveBeenCalledTimes(1);
        expect(win.pending()).toBe(0);

        sr.destroy();
      },
    );

    it("reads the page's range off the document's scrolling element", () => {
      const win = makeWindow(5000);
      const scroller = document.createElement("div");

      // The root reports no range of its own, as in quirks mode.
      Object.defineProperty(document.documentElement, "scrollHeight", {
        value: 0,
        configurable: true,
      });
      Object.defineProperty(scroller, "scrollHeight", { value: 5000 });
      Object.defineProperty(document, "scrollingElement", {
        value: scroller,
        configurable: true,
      });
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 1200 }));

      const fake = makeFakeRouter(makeState("about"));
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(makeState("home", {}, traversal), makeState("about"));
      win.frame();

      expect(win.scrollTo).toHaveBeenCalledTimes(1);
      expect(win.pending()).toBe(0);

      sr.destroy();
    });

    it("a container getter that resolves nothing yet keeps retrying on a page that holds the position", () => {
      const win = makeWindow(5000);
      const element = document.createElement("div");
      const elementScrollTo = vi.fn();
      let mounted = false;

      element.scrollTo = elementScrollTo;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 1200 }));

      const fake = makeFakeRouter(makeState("about"));
      const sr = track(
        createScrollRestoration(fake.router, {
          scrollContainer: () => (mounted ? element : null),
        }),
      );

      fake.emit(makeState("home", {}, traversal), makeState("about"));
      win.frame();

      expect(
        win.scrollTo,
        "the window stands in for the container",
      ).toHaveBeenCalledTimes(1);
      expect(win.pending(), "the page holds 1200, yet it retries").toBe(1);

      mounted = true;
      win.frame();

      expect(elementScrollTo).toHaveBeenLastCalledWith({
        top: 1200,
        left: 0,
        behavior: "auto",
      });

      sr.destroy();
    });

    it("an unreachable position stops at the frame budget", () => {
      const win = makeWindow(300);

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 1200 }));

      const fake = makeFakeRouter(makeState("about"));
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(makeState("home", {}, traversal), makeState("about"));

      for (let i = 0; i < 50 && (i === 0 || win.pending() > 0); i++) {
        win.frame();
      }

      // The initial attempt + RESTORE_RETRY_FRAMES retries, as for a container.
      expect(win.scrollTo).toHaveBeenCalledTimes(11);
      expect(win.pending()).toBe(0);
      expect(globalThis.scrollY).toBe(300);

      sr.destroy();
    });

    it("a smooth restore stops once the page can hold the position", () => {
      const win = makeWindow(300);

      // An animating scroll: the page has not moved by the next frame.
      win.scrollTo.mockImplementation(() => undefined);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 1200 }));

      const fake = makeFakeRouter(makeState("about"));
      const sr = track(
        createScrollRestoration(fake.router, { behavior: "smooth" }),
      );

      fake.emit(makeState("home", {}, traversal), makeState("about"));
      win.frame();

      expect(win.pending(), "too short, so it re-applies").toBe(1);

      win.grow(5000);
      win.frame();

      // One more apply ends the loop before the animation lands: WebKit delays
      // a smooth scroll that is re-applied on every frame.
      expect(win.scrollTo).toHaveBeenCalledTimes(2);
      expect(win.scrollTo).toHaveBeenLastCalledWith({
        top: 1200,
        left: 0,
        behavior: "smooth",
      });
      expect(win.pending()).toBe(0);

      sr.destroy();
    });

    it.each([
      ["a push onto another route", makeState("other")],
      ["a push onto the same route", makeState("home", { page: 2 })],
      [
        "a reload that replaces onto another location of the route",
        makeState("home", { page: 2 }, {}, { reload: true, replace: true }),
      ],
    ])("%s retires the retry of the previous restore", (_label, next) => {
      const win = makeWindow(300);

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 1200 }));

      const fake = makeFakeRouter(makeState("about"));
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(makeState("home", {}, traversal), makeState("about"));
      win.frame();

      expect(win.pending(), "the clamped restore keeps retrying").toBe(1);

      fake.emit(next, makeState("home"));
      win.frame();
      win.grow(5000);
      win.frame();

      expect(globalThis.scrollY, "the newer navigation's own position").toBe(0);
      expect(win.pending()).toBe(0);

      sr.destroy();
    });

    // A restore still retrying, on a page 300 tall that holds 1200 later.
    function retryingRestore() {
      const win = makeWindow(300);

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 1200 }));

      const fake = makeFakeRouter(makeState("about"));
      const sr = track(createScrollRestoration(fake.router));

      fake.emit(makeState("home", {}, traversal), makeState("about"));
      win.frame();

      expect(win.pending(), "the clamped restore keeps retrying").toBe(1);

      return { fake, sr, win };
    }

    it.each([
      [
        "a query synced into the URL",
        makeState("home", { page: 2 }, {}, { replace: true }),
      ],
      [
        "a scroll-spy hash update",
        makeState(
          "home",
          {},
          { url: { hash: "part", hashChanged: true } },
          { replace: true },
        ),
      ],
    ])("%s on the same route leaves the restore running", (_label, update) => {
      const { fake, sr, win } = retryingRestore();

      fake.emit(update, makeState("home"));
      win.grow(5000);
      win.frame();

      expect(globalThis.scrollY).toBe(1200);
      expect(win.pending()).toBe(0);

      sr.destroy();
    });

    it.each([
      [
        "a replace onto another route",
        makeState("other", {}, {}, { replace: true }),
      ],
      // The browser's scroll to the fragment has to stand.
      [
        "a fragment navigation on the same route",
        makeState("home", {}, browserContext("popstate", "part"), {
          replace: true,
        }),
      ],
    ])("%s retires the restore", (_label, next) => {
      const { fake, sr, win } = retryingRestore();

      fake.emit(next, makeState("home"));
      win.frame();
      win.grow(5000);
      win.frame();

      expect(globalThis.scrollY, "where the clamped restore left it").toBe(300);
      expect(
        win.scrollTo,
        "the newer commit writes nothing",
      ).toHaveBeenCalledTimes(1);
      expect(win.pending()).toBe(0);

      sr.destroy();
    });

    it("a commit in the same frame retires the restore before its first write", () => {
      const win = makeWindow(5000);

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/home": 1200 }));

      const fake = makeFakeRouter(makeState("about"));
      const sr = track(createScrollRestoration(fake.router));

      // A redirect on landing: the replace commits before the traversal's frame.
      fake.emit(makeState("home", {}, traversal), makeState("about"));
      fake.emit(
        makeState("other", {}, {}, { replace: true }),
        makeState("home"),
      );
      win.frame();

      expect(win.scrollTo).not.toHaveBeenCalled();

      sr.destroy();
    });

    it("a push retires a container restore that is still retrying", () => {
      let limit = 120;
      let scrollTop = 0;
      const queue: FrameRequestCallback[] = [];
      const element = document.createElement("div");

      vi.stubGlobal(
        "requestAnimationFrame",
        (cb: FrameRequestCallback): number => {
          queue.push(cb);

          return queue.length;
        },
      );
      vi.stubGlobal("scrollTo", vi.fn());
      Object.defineProperty(element, "scrollTop", {
        get: () => scrollTop,
        set: (v: number) => {
          scrollTop = Math.min(v, limit);
        },
        configurable: true,
      });
      // jsdom's `clientHeight` is 0, so the scroll range is the height.
      Object.defineProperty(element, "scrollHeight", {
        get: () => limit,
        configurable: true,
      });
      element.scrollTo = ((o: ScrollToOptions) => {
        element.scrollTop = o.top ?? 0;
      }) as typeof element.scrollTo;

      const flush = (): void => {
        for (const cb of queue.splice(0)) {
          cb(0);
        }
      };

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/a": 900 }));

      const fake = makeFakeRouter(makeState("home"));
      const sr = track(
        createScrollRestoration(fake.router, {
          scrollContainer: () => element,
        }),
      );

      fake.emit(makeState("a", {}, traversal), makeState("home"));
      flush();

      expect(element.scrollTop, "clamped").toBe(120);
      expect(queue, "so the loop keeps retrying").toHaveLength(1);

      fake.emit(makeState("b"), makeState("a"));
      flush();
      limit = 2000;
      flush();

      expect(element.scrollTop, "the push lands at the top").toBe(0);
      expect(queue).toHaveLength(0);

      sr.destroy();
    });
  });
});
