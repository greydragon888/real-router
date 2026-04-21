import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createScrollRestoration } from "../../src";

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
): State {
  return {
    name,
    params: params as State["params"],
    path: "/",
    context: context as State["context"],
    transition: {} as State["transition"],
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

  it("mode 'manual' returns noop — no history flip, no subscribe, no pagehide", () => {
    history.scrollRestoration = "auto";

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router, { mode: "manual" }));

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 420);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 77);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 200);

    sr.destroy();
  });

  it("no state.context.navigation → falls back to scrollToHashOrTop", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(makeState("about"), makeState("home"));

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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

  it("custom scrollContainer reads/writes .scrollTop, not window", () => {
    const element = document.createElement("div");

    element.id = "scroller";
    document.body.append(element);
    Object.defineProperty(element, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });

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

    expect(element.scrollTop).toBe(200);
    expect(windowScrollSpy).not.toHaveBeenCalled();

    sr.destroy();
  });

  it("scrollContainer resolved lazily — late-mounted element is used on next event", () => {
    let element: HTMLElement | null = null;
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

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 150 }));
    fake.emit(
      makeState(
        "about",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("home"),
    );

    // Lazy resolve picked up the newly-mounted container.
    expect(element.scrollTop).toBe(150);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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
    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 77);

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
    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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

    expect(scrollSpy).toHaveBeenCalledWith(0, 0);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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
    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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
});
