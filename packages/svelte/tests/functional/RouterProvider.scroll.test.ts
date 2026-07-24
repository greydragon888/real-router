import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouterProviderScrollReactivity from "../helpers/RouterProviderScrollReactivity.svelte";
import RouterProviderScrollTest from "../helpers/RouterProviderScrollTest.svelte";

import type { ScrollRestorationOptions } from "../../src/dom-utils";
import type { Router } from "@real-router/core";

// A router whose navigation metadata (`state.context.navigation`) is written by
// a minimal test plugin — exactly how navigation-plugin publishes direction /
// navigationType, but without the Navigation API that jsdom lacks. Lets the
// back/traverse restore branch run through real integration (real router + real
// plugin + real navigate), not a hand-built fake state.
function createNavRouter(nav: {
  direction?: "forward" | "back" | "unknown";
  navigationType?: "push" | "replace" | "traverse" | "reload";
}): Router {
  const r = createRouter(
    [
      { name: "test", path: "/" },
      { name: "about", path: "/about" },
    ],
    { defaultRoute: "test", queryParamsMode: "loose" },
  );

  r.usePlugin((rt) => {
    const claim = getPluginApi(rt).claimContextNamespace("navigation");

    return {
      onTransitionSuccess: (toState) => {
        claim.write(toState, nav);
      },
    };
  });

  return r;
}

// A router with NO URL plugin → `state.context.url` is undefined, so
// scrollToHashOrTop takes the DOM fallback path (reads `location.hash`).
function createPlainRouter(): Router {
  return createRouter(
    [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ],
    { defaultRoute: "home", queryParamsMode: "loose" },
  );
}

const STORAGE_KEY = "real-router:scroll";

function setScrollY(y: number): void {
  Object.defineProperty(globalThis, "scrollY", {
    value: y,
    configurable: true,
  });
}

// jsdom 29 wraps `sessionStorage` in a Proxy whose `getItem`/`setItem` are NOT
// the global `Storage.prototype` methods, so `vi.spyOn(Storage.prototype, …)`
// (and even `vi.spyOn(sessionStorage, …)` on the native object) silently no-op.
// A store-backed plain-object mock installed via `vi.stubGlobal` is spyable and
// controllable (make `setItem`/`getItem` throw for the failure-path tests).
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

// Render `<RouterProvider scrollRestoration>` through the host component — the
// svelte analogue of react's `render(<RouterProvider …/>)`. The host forwards
// the whole `scrollRestoration` object (mode / anchorScrolling / behavior /
// storageKey / scrollContainer), so no per-field host wiring is needed. Under
// exactOptionalPropertyTypes the "off" case must OMIT the prop rather than pass
// `undefined`, hence the branch. `@testing-library/svelte`'s render mounts and
// flushes the mount `$effect` (which wires createScrollRestoration + flips
// history.scrollRestoration) synchronously; the explicit flushSync is
// belt-and-suspenders so the subscribeLeave subscription is active before the
// first navigate — parity with react's `render(...)` returning after effects
// commit. With the synchronous rAF shim the capture / scrollTo spies then fire
// synchronously inside `router.navigate`, so there is no svelte reactivity to
// flush before asserting.
function renderScroll(
  routerInstance: Router,
  scrollRestoration?: ScrollRestorationOptions,
) {
  const result =
    scrollRestoration === undefined
      ? render(RouterProviderScrollTest, {
          props: { router: routerInstance },
        })
      : render(RouterProviderScrollTest, {
          props: { router: routerInstance, scrollRestoration },
        });

  flushSync();

  return result;
}

describe("RouterProvider — scrollRestoration", () => {
  let router: Router;

  beforeEach(async () => {
    vi.stubGlobal("sessionStorage", createMockStorage());
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("no scrollRestoration prop — history.scrollRestoration unchanged", () => {
    renderScroll(router);

    expect(history.scrollRestoration).toBe("auto");
  });

  it("scrollRestoration provided — flips history.scrollRestoration to 'manual'", () => {
    renderScroll(router, { mode: "restore" });

    expect(history.scrollRestoration).toBe("manual");
  });

  it("unmount restores history.scrollRestoration", () => {
    const { unmount } = renderScroll(router, { mode: "restore" });

    expect(history.scrollRestoration).toBe("manual");

    unmount();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("pagehide captures position when enabled", () => {
    setScrollY(250);

    renderScroll(router, { mode: "restore" });

    globalThis.dispatchEvent(new Event("pagehide"));

    const raw = sessionStorage.getItem(STORAGE_KEY);

    expect(raw).not.toBeNull(); // scroll position must have been saved

    const saved = JSON.parse(raw!) as Record<string, number>;

    expect(Object.values(saved)).toContain(250);
  });

  // Reactivity regression — guards primitive-deps rewrite against inline object
  // thrash. If re-created on every render, prevScrollRestoration captures
  // "manual", and the final unmount fails to restore "auto". Replacing the ref
  // with a NEW object of identical fields must NOT re-run the $effect (srMode
  // stays "restore" → $derived returns the same primitive → utility not
  // rebuilt), so the initially-captured prev="auto" survives to unmount.
  it("replacing the options ref with same fields — does NOT re-create the utility", () => {
    const { rerender, unmount } = render(RouterProviderScrollReactivity, {
      props: { router, scrollRestoration: { mode: "restore" } },
    });

    flushSync();

    expect(history.scrollRestoration).toBe("manual");

    void rerender({ router, scrollRestoration: { mode: "restore" } });
    flushSync();

    unmount();

    expect(history.scrollRestoration).toBe("auto");
  });

  // ── mode branches ─────────────────────────────────────────────────────────

  it("mode 'native' — no flip, no scroll on navigation", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    renderScroll(router, { mode: "native" });

    expect(history.scrollRestoration).toBe("auto");

    await router.navigate("about");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("mode 'top' — scrolls to top on navigation", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    renderScroll(router, { mode: "top" });

    await router.navigate("about");

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  // ── capture / restore ─────────────────────────────────────────────────────

  it("captures the previous route's position on navigation", async () => {
    setScrollY(250);

    renderScroll(router, { mode: "restore" });

    await router.navigate("about");

    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) as Record<
      string,
      number
    >;

    expect(Object.values(saved)).toContain(250);
  });

  it("in-place replace navigation leaves scroll untouched (restore skipped)", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    setScrollY(120);

    renderScroll(router, { mode: "restore" });

    await router.navigate("about", {}, undefined, { replace: true });

    // Capture still runs, but the restore arm is skipped for a genuine replace.
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("restores the saved position on a reload navigation", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    setScrollY(0);

    renderScroll(router, { mode: "restore" });

    await router.navigate("about");

    scrollTo.mockClear();
    setScrollY(180); // user scrolled within "about"

    await router.navigate("about", {}, undefined, { reload: true });

    // reload → capture about@180, then restore about@180.
    expect(scrollTo).toHaveBeenCalledWith({
      top: 180,
      left: 0,
      behavior: "auto",
    });
  });

  it("scrolls to the hash anchor on a push navigation", async () => {
    const anchor = document.createElement("div");

    anchor.id = "section-2";
    document.body.append(anchor);
    const scrollIntoView = vi.fn();

    anchor.scrollIntoView = scrollIntoView;

    renderScroll(router, { mode: "restore" });

    await router.navigate("about", {}, undefined, { hash: "section-2" });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto" });

    anchor.remove();
  });

  // ── scrollContainer ───────────────────────────────────────────────────────

  it("captures and restores through a scroll container (instant early-stop)", async () => {
    const container = document.createElement("div");

    document.body.append(container);

    let top = 0;

    Object.defineProperty(container, "scrollTop", {
      get: () => top,
      configurable: true,
    });
    // Reflect the write so restorePos' instant early-stop (|scrollTop-top|<=1)
    // triggers instead of running the whole retry budget.
    const containerScrollTo = vi.fn((opts: { top: number }) => {
      top = opts.top;
    });

    container.scrollTo =
      containerScrollTo as unknown as typeof container.scrollTo;

    renderScroll(router, {
      mode: "restore",
      scrollContainer: () => container,
    });

    top = 140; // user scrolled the container on "home"

    await router.navigate("about");

    // readPos read the container's scrollTop (140), not window.scrollY.
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) as Record<
      string,
      number
    >;

    expect(Object.values(saved)).toContain(140);

    // The push restore above reset the container to 0; now the user scrolls
    // "about" to 220 before reloading it.
    containerScrollTo.mockClear();
    top = 220;

    await router.navigate("about", {}, undefined, { reload: true });

    // reload → capture about@220, then restorePos through the container; the
    // reflected write makes the instant early-stop fire on the first frame.
    expect(containerScrollTo).toHaveBeenCalledWith({
      top: 220,
      left: 0,
      behavior: "auto",
    });

    container.remove();
  });

  it("restore falls back to window while the container is absent, then retries", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");
    const container: HTMLElement | null = null;

    renderScroll(router, {
      mode: "restore",
      scrollContainer: () => container,
    });

    setScrollY(60);

    await router.navigate("about");

    scrollTo.mockClear();

    await router.navigate("about", {}, undefined, { reload: true });

    // Container getter returns null → restorePos falls back to window across the
    // retry budget (harmless clamp) — window scrollTo is invoked.
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ left: 0, behavior: "auto" }),
    );
  });

  // ── options ───────────────────────────────────────────────────────────────

  it("anchorScrolling: false — hash navigation scrolls to top instead of the anchor", async () => {
    const anchor = document.createElement("div");

    anchor.id = "section-3";
    document.body.append(anchor);
    const scrollIntoView = vi.fn();

    anchor.scrollIntoView = scrollIntoView;
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    renderScroll(router, { mode: "restore", anchorScrolling: false });

    await router.navigate("about", {}, undefined, { hash: "section-3" });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    anchor.remove();
  });

  it("behavior: 'smooth' is forwarded to scrollTo", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    renderScroll(router, { mode: "top", behavior: "smooth" });

    await router.navigate("about");

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  });

  // ── hash fallback (no URL plugin → location.hash) ─────────────────────────

  it("scrolls to the location.hash anchor when no URL plugin is installed", async () => {
    const plain = createPlainRouter();

    await plain.start("/");

    const anchor = document.createElement("div");

    anchor.id = "frag";
    document.body.append(anchor);
    const scrollIntoView = vi.fn();

    anchor.scrollIntoView = scrollIntoView;
    globalThis.location.hash = "#frag";

    renderScroll(plain, { mode: "restore" });

    await plain.navigate("about");

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto" });

    anchor.remove();
    globalThis.location.hash = "";
    plain.stop();
  });

  it("tolerates a malformed location.hash (decode throws → raw slice)", async () => {
    const plain = createPlainRouter();

    await plain.start("/");

    // "%E0%A4%A" is an incomplete escape — decodeURIComponent throws, so the
    // code falls back to the raw slice "%E0%A4%A" as the id.
    const anchor = document.createElement("div");

    anchor.id = "%E0%A4%A";
    document.body.append(anchor);
    const scrollIntoView = vi.fn();

    anchor.scrollIntoView = scrollIntoView;
    globalThis.location.hash = "#%E0%A4%A";

    renderScroll(plain, { mode: "restore" });

    await plain.navigate("about");

    expect(scrollIntoView).toHaveBeenCalled();

    anchor.remove();
    globalThis.location.hash = "";
    plain.stop();
  });

  it("scrolls to top when the location.hash anchor is not found", async () => {
    const plain = createPlainRouter();

    await plain.start("/");
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    globalThis.location.hash = "#missing";

    renderScroll(plain, { mode: "restore" });

    await plain.navigate("about");

    // No matching element → writePos(0).
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    globalThis.location.hash = "";
    plain.stop();
  });

  // ── putPos skip-same-value ────────────────────────────────────────────────

  it("does not re-serialize when a route is left at its already-stored position", async () => {
    setScrollY(75);

    renderScroll(router, { mode: "restore" });

    // Router starts on "test" (path "/"). First leave captures test@75.
    await router.navigate("about");

    // Back to "test", still at scroll 75.
    await router.navigate("test");

    const setItem = vi.spyOn(sessionStorage, "setItem");

    setScrollY(75);

    // Leave "test" AGAIN at the same 75 → putPos sees cached[test] === 75 and
    // skips both the in-memory write and the setItem.
    await router.navigate("about");

    expect(setItem).not.toHaveBeenCalled();
  });

  it("tolerates a sessionStorage read failure (loadStore falls back to {})", async () => {
    vi.spyOn(sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    setScrollY(50);

    renderScroll(router, { mode: "restore" });

    // Capture → loadStore → getItem throws → store defaults to {}; no crash.
    await expect(router.navigate("about")).resolves.not.toThrow();
  });

  // ── back / traverse restore (navigation-plugin metadata) ──────────────────

  it("restores the saved position on a back navigation", async () => {
    const navRouter = createNavRouter({ direction: "back" });

    await navRouter.start("/");
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    setScrollY(200);

    renderScroll(navRouter, { mode: "restore" });

    // First leave captures test@200.
    await navRouter.navigate("about");

    scrollTo.mockClear();
    setScrollY(0);

    // Back to "test" → nav.direction === "back" → restore the saved test@200.
    await navRouter.navigate("test");

    expect(scrollTo).toHaveBeenCalledWith({
      top: 200,
      left: 0,
      behavior: "auto",
    });

    navRouter.stop();
  });

  it("restores the saved position on a traverse navigation", async () => {
    const navRouter = createNavRouter({ navigationType: "traverse" });

    await navRouter.start("/");
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    setScrollY(310);

    renderScroll(navRouter, { mode: "restore" });

    await navRouter.navigate("about");

    scrollTo.mockClear();
    setScrollY(0);

    // navigationType === "traverse" → restore the saved test@310.
    await navRouter.navigate("test");

    expect(scrollTo).toHaveBeenCalledWith({
      top: 310,
      left: 0,
      behavior: "auto",
    });

    navRouter.stop();
  });

  // ── param canonicalization (keyOf / canonicalReplacer) ────────────────────

  it("canonicalizes function / nested-object params on capture", async () => {
    const plain = createPlainRouter();

    await plain.start("/");
    setScrollY(140);

    renderScroll(plain, { mode: "restore" });

    // Land on a route carrying exotic param values (kept verbatim in
    // state.params — navigate does not coerce them).
    await plain.navigate("about", {
      fn: (() => 1) as unknown as string,
      obj: { b: 2, a: 1 } as unknown as string,
      str: "x",
    });

    const setItem = vi.spyOn(sessionStorage, "setItem");

    setScrollY(140);

    // Leaving it captures the route → keyOf runs canonicalReplacer over the
    // params (function → "<fn>", nested object → sorted keys, primitive → as-is).
    await plain.navigate("home");

    expect(setItem).toHaveBeenCalled(); // capture succeeded, no serializer crash

    plain.stop();
  });

  it("skips capture for a route with an unserializable (BigInt) param and warns", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const plain = createPlainRouter();

    await plain.start("/");
    setScrollY(90);

    renderScroll(plain, { mode: "restore" });

    await plain.navigate("about", { big: 1n as unknown as string });

    // Leaving the BigInt route → keyOf throws in JSON.stringify → safeKeyOf
    // returns null → capture skipped + one console.error.
    await plain.navigate("home");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("cannot be canonicalized"),
    );

    plain.stop();
  });

  // ── option / store / edge coverage ────────────────────────────────────────

  it("defaults to mode 'restore' when the mode field is omitted", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    renderScroll(router, {});

    // Default "restore" mode still flips history + drives scrollToHashOrTop.
    expect(history.scrollRestoration).toBe("manual");

    await router.navigate("about");

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  it("loads an existing scroll store from sessionStorage and merges into it", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "preexisting:{}": 300 }),
    );
    setScrollY(120);

    renderScroll(router, { mode: "restore" });

    // Capture → putPos → loadStore parses the pre-existing raw JSON.
    await router.navigate("about");

    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) as Record<
      string,
      number
    >;

    expect(saved["preexisting:{}"]).toBe(300); // pre-existing entry preserved
    expect(Object.values(saved)).toContain(120); // new capture merged in
  });

  it("smooth container restore runs the full retry budget (no early stop)", async () => {
    const container = document.createElement("div");

    document.body.append(container);
    Object.defineProperty(container, "scrollTop", {
      get: () => 0,
      configurable: true,
    });
    const containerScrollTo = vi.fn();

    container.scrollTo = containerScrollTo;

    renderScroll(router, {
      mode: "restore",
      behavior: "smooth",
      scrollContainer: () => container,
    });

    containerScrollTo.mockClear();

    // reload → restorePos; smooth never early-stops, so it re-applies every
    // frame across the retry budget.
    await router.navigate("test", {}, undefined, { reload: true });

    expect(containerScrollTo.mock.calls.length).toBeGreaterThan(1);

    container.remove();
  });

  it("warns only once across multiple unserializable routes", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const plain = createPlainRouter();

    await plain.start("/");

    renderScroll(plain, { mode: "restore" });

    await plain.navigate("about", { big: 1n as unknown as string });
    await plain.navigate("home"); // capture about{1n} → warn (first)
    await plain.navigate("about", { big: 2n as unknown as string });
    await plain.navigate("home"); // capture about{2n} → already warned → silent

    expect(errorSpy).toHaveBeenCalledTimes(1);

    plain.stop();
  });

  it("reload of an unserializable route restores to 0 (key null)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scrollTo = vi.spyOn(globalThis, "scrollTo");
    const plain = createPlainRouter();

    await plain.start("/");

    renderScroll(plain, { mode: "restore" });

    await plain.navigate("about", { big: 1n as unknown as string });

    scrollTo.mockClear();

    // reload → restore arm → safeKeyOf(route) is null → restorePos(0).
    await plain.navigate("about", { big: 1n as unknown as string }, undefined, {
      reload: true,
    });

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    plain.stop();
  });

  it("reload restores to 0 when the target has no stored position", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    setScrollY(50);

    renderScroll(router, { mode: "restore" });

    await router.navigate("about");

    scrollTo.mockClear();

    // reload-navigate to a never-visited route → loadStore()[key] is undefined
    // → the `?? 0` fallback restores to top.
    await router.navigate("home", {}, undefined, { reload: true });

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  it("back navigation to an unserializable route restores to 0 (key null)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scrollTo = vi.spyOn(globalThis, "scrollTo");
    const navRouter = createNavRouter({ direction: "back" });

    await navRouter.start("/");

    renderScroll(navRouter, { mode: "restore" });

    scrollTo.mockClear();

    // back arm → safeKeyOf(about{big}) is null → restorePos(0).
    await navRouter.navigate("about", { big: 1n as unknown as string });

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    navRouter.stop();
  });

  it("pagehide skips capture for an unserializable route", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const plain = createPlainRouter();

    await plain.start("/");

    renderScroll(plain, { mode: "restore" });

    await plain.navigate("about", { big: 1n as unknown as string });

    const setItem = vi.spyOn(sessionStorage, "setItem");

    globalThis.dispatchEvent(new Event("pagehide"));

    // onPageHide → safeKeyOf(current) is null → capture skipped.
    expect(setItem).not.toHaveBeenCalled();

    plain.stop();
  });

  it("pagehide is a no-op when the router has no active state", () => {
    renderScroll(router, { mode: "restore" });

    router.stop(); // getState() now returns undefined
    const setItem = vi.spyOn(sessionStorage, "setItem");

    globalThis.dispatchEvent(new Event("pagehide"));

    expect(setItem).not.toHaveBeenCalled();
  });
});

// A separate suite with a DEFERRED rAF (setTimeout-backed) so the navigation's
// scroll effect can be interrupted (provider destroyed) before its frame runs.
describe("RouterProvider — scrollRestoration (destroyed guard)", () => {
  let router: Router;

  beforeEach(async () => {
    vi.stubGlobal("sessionStorage", createMockStorage());
    sessionStorage.clear();
    history.scrollRestoration = "auto";
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
      /* cleared via vi.clearAllTimers */
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    router.stop();
    sessionStorage.clear();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("the navigation rAF bails when the provider is destroyed before the frame runs", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    const { unmount } = renderScroll(router, { mode: "restore" });

    // Capture runs synchronously; the restore is deferred into the rAF.
    await router.navigate("about");

    // Destroy before the deferred rAF fires → the callback sees `destroyed`
    // and returns without restoring.
    unmount();
    scrollTo.mockClear();

    vi.advanceTimersByTime(10);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("skips capture for a second navigation before the first frame settles (#782)", async () => {
    setScrollY(100);

    renderScroll(router, { mode: "restore" });

    // First navigation captures test@100 and leaves scrollSettled=false (its
    // restore rAF is still pending under the deferred shim).
    await router.navigate("about");

    const setItem = vi.spyOn(sessionStorage, "setItem");

    // Second navigation lands in the same unsettled window → capture is skipped
    // so it cannot store a foreign position under "about"'s key.
    await router.navigate("home");

    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10);
  });

  it("restorePos retry bails when the provider is destroyed mid-budget", async () => {
    const navRouter = createNavRouter({ direction: "back" });

    await navRouter.start("/");
    // Pre-store a non-zero position for "about" that the fixed-at-0 container
    // can never reach → restorePos keeps retrying instead of early-stopping.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "about:{}": 200 }));

    const container = document.createElement("div");

    document.body.append(container);
    Object.defineProperty(container, "scrollTop", {
      get: () => 0,
      configurable: true,
    });
    const containerScrollTo = vi.fn();

    container.scrollTo = containerScrollTo;

    const { unmount } = renderScroll(navRouter, {
      mode: "restore",
      scrollContainer: () => container,
    });

    // back → schedules the main restore rAF.
    await navRouter.navigate("about");

    // One frame: restorePos(200) first attempt writes 200, container stays 0 →
    // no early stop → schedules the next retry frame.
    vi.advanceTimersToNextTimer();

    const callsBeforeDestroy = containerScrollTo.mock.calls.length;

    unmount(); // destroy mid-budget

    // Next scheduled retry frame sees `destroyed` and returns without writing.
    vi.advanceTimersToNextTimer();

    expect(containerScrollTo).toHaveBeenCalledTimes(callsBeforeDestroy);

    container.remove();
    navRouter.stop();
  });
});
