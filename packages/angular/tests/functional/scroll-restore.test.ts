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
    context: context as State["context"],
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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 0);

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

    expect(scrollSpy).toHaveBeenLastCalledWith(0, 420);

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

  it("custom scrollContainer reads/writes .scrollTop", () => {
    const element = document.createElement("div");

    element.id = "scroller";
    document.body.append(element);
    Object.defineProperty(element, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });

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

    expect(element.scrollTop).toBe(200);

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

  it("mode 'manual' no-ops everything", () => {
    const fake = makeFakeRouter(makeState("home"));
    const scrollSpy = vi.spyOn(globalThis, "scrollTo");
    const sr = track(createScrollRestoration(fake.router, { mode: "manual" }));

    fake.emit(
      makeState("about", {}, { navigation: { navigationType: "push" } }),
      makeState("home"),
    );
    globalThis.dispatchEvent(new Event("pagehide"));

    expect(scrollSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    sr.destroy();
  });
});
