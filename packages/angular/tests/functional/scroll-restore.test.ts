import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createScrollRestoration } from "../../src/dom-utils";

import type { Router, State } from "@real-router/core";

const STORAGE_KEY = "real-router:scroll";

type Listener = (s: { route: State; previousRoute?: State }) => void;

function makeState(
  name: string,
  params: Record<string, unknown> = {},
  context: Record<string, unknown> = {},
): State {
  return {
    name,
    params: params as State["params"],
    path: "/",
    context: context,
    transition: {} as State["transition"],
  };
}

interface FakeRouter {
  emit: (route: State, previousRoute?: State) => void;
  router: Router;
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

describe("createScrollRestoration (Angular dom-utils copy)", () => {
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

  it("flips history.scrollRestoration to 'manual' and restores on destroy", () => {
    const fake = makeFakeRouter();
    const sr = createScrollRestoration(fake.router);

    expect(history.scrollRestoration).toBe("manual");

    sr.destroy();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("mode 'top' scrolls to 0 on every transition", () => {
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

  it("mode 'restore' + direction 'back' restores saved position", () => {
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

  it("navigationType 'replace' → no-op", () => {
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

  it("push + hash with existing id → scrollIntoView", () => {
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

  it("push + state.context.url.hash with existing id → scrollIntoView (#532)", () => {
    const anchor = document.createElement("div");

    anchor.id = "ctxAnchor";
    document.body.append(anchor);
    const scrollIntoViewSpy = vi.fn();

    anchor.scrollIntoView = scrollIntoViewSpy;

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        {
          navigation: { direction: "forward", navigationType: "push" },
          url: { hash: "ctxAnchor", hashChanged: true },
        },
      ),
      makeState("home"),
    );

    // Plugin path: read from state.context.url.hash, no DOM fallback.
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    sr.destroy();
  });

  it("state.context.url.hash empty string → scroll to top (#532)", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        {
          navigation: { direction: "forward", navigationType: "push" },
          url: { hash: "", hashChanged: false },
        },
      ),
      makeState("home"),
    );

    // ctxHash !== undefined branch entered, but ctxHash.length === 0 → top.
    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  it("state.context.url.hash with missing element → scroll to top (#532)", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        {},
        {
          navigation: { direction: "forward", navigationType: "push" },
          url: { hash: "doesNotExist", hashChanged: true },
        },
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

  it("pagehide saves current position", () => {
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

  it("custom scrollContainer reads/writes via element.scrollTo", () => {
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
    const sr = track(
      createScrollRestoration(fake.router, { scrollContainer: () => element }),
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

    sr.destroy();
  });

  it("anchorScrolling=false ignores hash", () => {
    const anchor = document.createElement("div");

    anchor.id = "target";
    document.body.append(anchor);
    const scrollIntoViewSpy = vi.fn();

    anchor.scrollIntoView = scrollIntoViewSpy;
    globalThis.history.replaceState(null, "", "/#target");

    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(
      createScrollRestoration(fake.router, { anchorScrolling: false }),
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

    expect(Object.keys(saved)).toHaveLength(1);
    expect(Object.keys(saved)[0]).toBe('list:{"a":1,"b":2}');

    sr.destroy();
  });

  it("destroy is idempotent", () => {
    const fake = makeFakeRouter(makeState("home"));
    const sr = track(createScrollRestoration(fake.router));

    sr.destroy();

    expect(() => {
      sr.destroy();
    }).not.toThrow();
  });

  it("mode 'native' no-ops everything", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router, { mode: "native" }));

    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );
    globalThis.dispatchEvent(new Event("pagehide"));

    expect(scrollSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    sr.destroy();
  });

  // ===========================================================================
  // Closes review-2026-05-10 §5.3 ⛔ edge-cases (12 gaps).
  // ===========================================================================

  // MED #1: SSR (window undefined) — utility's line-49 guard returns
  // NOOP_INSTANCE. JSDOM always has `window`, so we override via
  // `vi.stubGlobal` to verify the guard short-circuits.
  it("SSR guard: returns NOOP when typeof window === 'undefined'", () => {
    vi.stubGlobal("window", undefined);
    try {
      const fake = makeFakeRouter(makeState("home"));
      const sr = createScrollRestoration(fake.router);

      // NOOP_INSTANCE has a no-op destroy() and frozen. Verify no
      // side effects: history.scrollRestoration NOT flipped, no event
      // listeners attached. We can detect "no-op" by confirming
      // sessionStorage stays untouched after emit.
      Object.defineProperty(globalThis, "scrollY", {
        value: 999,
        configurable: true,
      });

      fake.emit(
        makeState("about", {}, { navigation: { navigationType: "push" } }),
        makeState("home"),
      );

      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

      // Idempotent destroy on NOOP_INSTANCE.
      expect(() => {
        sr.destroy();
      }).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // MED #2: pagehide after destroy → no writes. The destroy() path
  // unregisters the listener; ensure no leak. Stress-test
  // (`scroll-restoration-rapid.stress.ts`) covers this at scale; this
  // pins a single dispatch as a regression sentinel.
  it("pagehide event after destroy → no write to sessionStorage (listener removed)", () => {
    const fake = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 600,
      configurable: true,
    });
    const sr = createScrollRestoration(fake.router);

    sr.destroy();

    // Pre-destroy state: nothing in storage.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    // Dispatch pagehide after destroy — handler must be unregistered.
    globalThis.dispatchEvent(new Event("pagehide"));

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // LOW: reload navigationType → restores saved position (branch line 224).
  it("navigationType 'reload' → restores saved position (same branch as 'back'/'traverse')", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "home:{}": 777 }));

    const fake = makeFakeRouter(makeState("about"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "home",
        {},
        { navigation: { direction: "forward", navigationType: "reload" } },
      ),
      makeState("about"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 777,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  // LOW: decodeURIComponent throws on bare `%` → raw-slice fallback
  // (line 172-175). When `location.hash` contains a malformed
  // percent-escape sequence, decodeURIComponent throws URIError;
  // the catch falls back to `hash.slice(1)` raw. Test by setting
  // location.hash to a literal `%` (no valid escape).
  it("decodeURIComponent throws on malformed % → falls back to raw slice for id lookup", () => {
    // Add an anchor with id that matches the raw hash slice.
    const anchor = document.createElement("div");

    anchor.id = "%bad";
    document.body.append(anchor);
    const scrollIntoViewSpy = vi.fn();

    anchor.scrollIntoView = scrollIntoViewSpy;

    // `%bad` is a malformed escape — decodeURIComponent("%bad") throws.
    globalThis.history.replaceState(null, "", "/#%bad");

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(createScrollRestoration(fake.router));

    // No state.context.url → fallback path triggered. The try/catch
    // in resolveText catches URIError and uses raw `%bad` to look up
    // the anchor by id.
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

  // LOW: scrollContainer getter returns null → falls back to window.scrollY
  // / globalThis.scrollTo (lines 122-126, 128-135).
  it("scrollContainer returns null → falls back to window scroll API", () => {
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");

    Object.defineProperty(globalThis, "scrollY", {
      value: 250,
      configurable: true,
    });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "home:{}": 250 }));

    const fake = makeFakeRouter(makeState("about"));
    const sr = track(
      createScrollRestoration(fake.router, {
        // getter returns null (e.g. element not yet mounted)
        scrollContainer: () => null,
      }),
    );

    fake.emit(
      makeState(
        "home",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("about"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 250,
      left: 0,
      behavior: "auto",
    });

    sr.destroy();
  });

  // LOW: sessionStorage.setItem throws (quota / security) → silent ignore
  // (catch at line 106-108). Verify subscriber path doesn't propagate.
  it("sessionStorage.setItem throws (quota) → silently ignored, no exception escapes", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });

    const fake = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 100,
      configurable: true,
    });
    const sr = track(createScrollRestoration(fake.router));

    // Emit a navigation that triggers putPos → setItem throws → catch.
    expect(() => {
      fake.emit(
        makeState("about", {}, { navigation: { navigationType: "push" } }),
        makeState("home"),
      );
    }).not.toThrow();

    expect(setItemSpy).toHaveBeenCalled();

    sr.destroy();
    setItemSpy.mockRestore();
  });

  // LOW: sessionStorage.getItem throws (Safari incognito SecurityError) →
  // graceful fallback to empty store (catch at line 84-86).
  it("sessionStorage.getItem throws (SecurityError) → fallback to empty store", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Storage disabled", "SecurityError");
      });

    const fake = makeFakeRouter(makeState("home"));
    const sr = track(createScrollRestoration(fake.router));

    // The first emit that touches storage triggers loadStore → catch
    // initialises store to {}. The subsequent putPos succeeds because
    // setItem still works (only getItem stubbed).
    expect(() => {
      fake.emit(
        makeState("about", {}, { navigation: { navigationType: "push" } }),
        makeState("home"),
      );
    }).not.toThrow();

    expect(getItemSpy).toHaveBeenCalled();

    sr.destroy();
    getItemSpy.mockRestore();
  });

  // LOW: Malformed JSON in storage → catch initialises empty store
  // (line 80-86). User may have legacy keys, browser corruption, or
  // hand-edited storage.
  it("malformed JSON in storage → graceful fallback to empty store", () => {
    sessionStorage.setItem(STORAGE_KEY, "{not valid JSON]");

    const fake = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 50,
      configurable: true,
    });
    const sr = track(createScrollRestoration(fake.router));

    expect(() => {
      fake.emit(
        makeState("about", {}, { navigation: { navigationType: "push" } }),
        makeState("home"),
      );
    }).not.toThrow();

    // After emit, the store is in-memory only with home:{}=50; the
    // setItem call OVERWROTE the malformed entry with valid JSON.
    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(saved["home:{}"]).toBe(50);

    sr.destroy();
  });

  // LOW: Custom storageKey isolates storage between providers.
  it("custom storageKey → writes go to that key, default key remains untouched", () => {
    const fake = makeFakeRouter(makeState("home"));

    Object.defineProperty(globalThis, "scrollY", {
      value: 333,
      configurable: true,
    });
    const sr = track(
      createScrollRestoration(fake.router, { storageKey: "custom:scroll" }),
    );

    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    const saved = JSON.parse(
      sessionStorage.getItem("custom:scroll") ?? "{}",
    ) as Record<string, number>;

    expect(saved["home:{}"]).toBe(333);

    sr.destroy();
    sessionStorage.removeItem("custom:scroll");
  });

  // LOW: Custom behavior ("smooth"/"instant") forwarded to scrollTo.
  it("custom behavior 'smooth' → forwarded to scrollTo on hash anchor restore", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "home:{}": 100 }));

    const fake = makeFakeRouter(makeState("about"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(
      createScrollRestoration(fake.router, { behavior: "smooth" }),
    );

    fake.emit(
      makeState(
        "home",
        {},
        { navigation: { direction: "back", navigationType: "traverse" } },
      ),
      makeState("about"),
    );

    expect(scrollSpy).toHaveBeenLastCalledWith({
      top: 100,
      left: 0,
      behavior: "smooth",
    });

    sr.destroy();
  });

  // LOW: canonicalReplacer normalises key order for nested objects and
  // preserves arrays as-is (lines 272-287).
  it("canonicalReplacer: nested objects sort keys recursively, arrays preserved verbatim", () => {
    const fake = makeFakeRouter(makeState("home", { z: 1, a: { b: 2, a: 3 } }));

    Object.defineProperty(globalThis, "scrollY", {
      value: 1,
      configurable: true,
    });
    const sr = track(createScrollRestoration(fake.router));

    fake.emit(
      makeState(
        "about",
        { tags: ["c", "a", "b"], nested: { z: 1, a: 2 } },
        { navigation: { navigationType: "push" } },
      ),
      makeState("home", { z: 1, a: { b: 2, a: 3 } }),
    );

    const stored = sessionStorage.getItem(STORAGE_KEY);

    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!) as Record<string, number>;
    const keys = Object.keys(parsed);

    // Keys are canonicalized: top-level params sorted, nested object
    // sorted recursively. Array elements preserved in original order.
    expect(keys).toHaveLength(1);
    // home key: { a: { a: 3, b: 2 }, z: 1 } sorted, nested also sorted.
    expect(keys[0]).toBe('home:{"a":{"a":3,"b":2},"z":1}');

    sr.destroy();
  });

  // LOW: history.scrollRestoration assignment throws (some embedded /
  // restricted contexts) → caught at line 113-117 + 255-259, utility
  // continues without crashing.
  it("history.scrollRestoration assignment throws → caught, utility still functional", () => {
    const desc = Object.getOwnPropertyDescriptor(
      History.prototype,
      "scrollRestoration",
    );

    Object.defineProperty(History.prototype, "scrollRestoration", {
      configurable: true,
      get: () => "auto",
      set: () => {
        throw new Error("scrollRestoration is read-only in this context");
      },
    });

    try {
      const fake = makeFakeRouter(makeState("home"));

      // Construct utility — internal try/catch swallows the setter throw.
      const sr = createScrollRestoration(fake.router);

      // Verify subsequent operations continue to work — emit causes
      // captures + restores via scrollTo, no exception.
      Object.defineProperty(globalThis, "scrollY", {
        value: 42,
        configurable: true,
      });

      expect(() => {
        fake.emit(
          makeState("about", {}, { navigation: { navigationType: "push" } }),
          makeState("home"),
        );
      }).not.toThrow();

      // Verify position was saved despite the setter throw at construct.
      const saved = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) ?? "{}",
      ) as Record<string, number>;

      expect(saved["home:{}"]).toBe(42);

      // destroy() also triggers the throwing setter — catch must swallow.
      expect(() => {
        sr.destroy();
      }).not.toThrow();
    } finally {
      if (desc) {
        Object.defineProperty(History.prototype, "scrollRestoration", desc);
      }
    }
  });
});
