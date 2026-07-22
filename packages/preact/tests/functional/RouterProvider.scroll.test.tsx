import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { act, render } from "@testing-library/preact";
import { useState, type FC } from "preact/compat";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

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

describe("RouterProvider — scrollRestoration", () => {
  let router: Router;

  beforeEach(async () => {
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
    vi.unstubAllGlobals();
  });

  it("no scrollRestoration prop — history.scrollRestoration unchanged", () => {
    render(
      <RouterProvider router={router}>
        <div />
      </RouterProvider>,
    );

    expect(history.scrollRestoration).toBe("auto");
  });

  it("scrollRestoration provided — flips history.scrollRestoration to 'manual'", () => {
    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    expect(history.scrollRestoration).toBe("manual");
  });

  it("unmount restores history.scrollRestoration", () => {
    const { unmount } = render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    expect(history.scrollRestoration).toBe("manual");

    unmount();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("pagehide captures position when enabled", async () => {
    Object.defineProperty(globalThis, "scrollY", {
      value: 250,
      configurable: true,
    });

    const { unmount } = render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    globalThis.dispatchEvent(new Event("pagehide"));

    const raw = sessionStorage.getItem(STORAGE_KEY);

    expect(raw).not.toBeNull(); // scroll position must have been saved

    const saved = JSON.parse(raw!) as Record<string, number>;

    expect(Object.values(saved)).toContain(250);

    unmount();
  });

  // Reactivity regression — guards primitive-deps rewrite against inline
  // object thrash. If re-created on every render, prevScrollRestoration
  // captures "manual", and the final unmount fails to restore "auto".
  it("replacing the options ref with same fields — does NOT re-create the utility", async () => {
    let setOpts!: (o: { mode: "restore" | "top" | "native" }) => void;

    const Harness: FC = () => {
      const [opts, update] = useState<{
        mode: "restore" | "top" | "native";
      }>({ mode: "restore" });

      setOpts = update;

      return (
        <RouterProvider router={router} scrollRestoration={opts}>
          <div />
        </RouterProvider>
      );
    };

    const { unmount } = render(<Harness />);

    expect(history.scrollRestoration).toBe("manual");

    await act(async () => {
      setOpts({ mode: "restore" });
    });

    unmount();

    expect(history.scrollRestoration).toBe("auto");
  });

  // ── mode branches ─────────────────────────────────────────────────────────

  it("mode 'native' — no flip, no scroll on navigation", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "native" }}>
        <div />
      </RouterProvider>,
    );

    expect(history.scrollRestoration).toBe("auto");

    await act(async () => {
      await router.navigate("about");
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("mode 'top' — scrolls to top on navigation", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "top" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  // ── capture / restore ─────────────────────────────────────────────────────

  it("captures the previous route's position on navigation", async () => {
    setScrollY(250);

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) as Record<
      string,
      number
    >;

    expect(Object.values(saved)).toContain(250);
  });

  it("in-place replace navigation leaves scroll untouched (restore skipped)", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    setScrollY(120);

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about", {}, undefined, { replace: true });
    });

    // Capture still runs, but the restore arm is skipped for a genuine replace.
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("restores the saved position on a reload navigation", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    setScrollY(0);

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    scrollTo.mockClear();
    setScrollY(180); // user scrolled within "about"

    await act(async () => {
      await router.navigate("about", {}, undefined, { reload: true });
    });

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

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about", {}, undefined, { hash: "section-2" });
    });

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

    render(
      <RouterProvider
        router={router}
        scrollRestoration={{
          mode: "restore",
          scrollContainer: () => container,
        }}
      >
        <div />
      </RouterProvider>,
    );

    top = 140; // user scrolled the container on "home"

    await act(async () => {
      await router.navigate("about");
    });

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

    await act(async () => {
      await router.navigate("about", {}, undefined, { reload: true });
    });

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
    let container: HTMLElement | null = null;

    render(
      <RouterProvider
        router={router}
        scrollRestoration={{
          mode: "restore",
          scrollContainer: () => container,
        }}
      >
        <div />
      </RouterProvider>,
    );

    setScrollY(60);

    await act(async () => {
      await router.navigate("about");
    });

    scrollTo.mockClear();

    await act(async () => {
      await router.navigate("about", {}, undefined, { reload: true });
    });

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

    render(
      <RouterProvider
        router={router}
        scrollRestoration={{ mode: "restore", anchorScrolling: false }}
      >
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about", {}, undefined, { hash: "section-3" });
    });

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

    render(
      <RouterProvider
        router={router}
        scrollRestoration={{ mode: "top", behavior: "smooth" }}
      >
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

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

    render(
      <RouterProvider router={plain} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await plain.navigate("about");
    });

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

    render(
      <RouterProvider router={plain} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await plain.navigate("about");
    });

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

    render(
      <RouterProvider router={plain} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await plain.navigate("about");
    });

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

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    // Router starts on "test" (path "/"). First leave captures test@75.
    await act(async () => {
      await router.navigate("about");
    });

    // Back to "test", still at scroll 75.
    await act(async () => {
      await router.navigate("test");
    });

    const setItem = vi.spyOn(Storage.prototype, "setItem");

    setScrollY(75);

    // Leave "test" AGAIN at the same 75 → putPos sees cached[test] === 75 and
    // skips both the in-memory write and the setItem.
    await act(async () => {
      await router.navigate("about");
    });

    expect(setItem).not.toHaveBeenCalled();
  });

  it("tolerates a sessionStorage read failure (loadStore falls back to {})", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    setScrollY(50);

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    // Capture → loadStore → getItem throws → store defaults to {}; no crash.
    await expect(
      act(async () => {
        await router.navigate("about");
      }),
    ).resolves.not.toThrow();
  });

  // ── back / traverse restore (navigation-plugin metadata) ──────────────────

  it("restores the saved position on a back navigation", async () => {
    const navRouter = createNavRouter({ direction: "back" });

    await navRouter.start("/");
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    setScrollY(200);

    render(
      <RouterProvider
        router={navRouter}
        scrollRestoration={{ mode: "restore" }}
      >
        <div />
      </RouterProvider>,
    );

    // First leave captures test@200.
    await act(async () => {
      await navRouter.navigate("about");
    });

    scrollTo.mockClear();
    setScrollY(0);

    // Back to "test" → nav.direction === "back" → restore the saved test@200.
    await act(async () => {
      await navRouter.navigate("test");
    });

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

    render(
      <RouterProvider
        router={navRouter}
        scrollRestoration={{ mode: "restore" }}
      >
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await navRouter.navigate("about");
    });

    scrollTo.mockClear();
    setScrollY(0);

    // navigationType === "traverse" → restore the saved test@310.
    await act(async () => {
      await navRouter.navigate("test");
    });

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

    render(
      <RouterProvider router={plain} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    // Land on a route carrying exotic param values (kept verbatim in
    // state.params — navigate does not coerce them). A Symbol value is NOT
    // navigable (the URL encoder throws on it), so it stays a shared-node-only
    // canonicalReplacer branch.
    await act(async () => {
      await plain.navigate("about", {
        fn: (() => 1) as unknown as string,
        obj: { b: 2, a: 1 } as unknown as string,
        str: "x",
      });
    });

    const setItem = vi.spyOn(Storage.prototype, "setItem");

    setScrollY(140);

    // Leaving it captures the route → keyOf runs canonicalReplacer over the
    // params (function → "<fn>", nested object → sorted keys, primitive → as-is).
    await act(async () => {
      await plain.navigate("home");
    });

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

    render(
      <RouterProvider router={plain} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await plain.navigate("about", { big: 1n as unknown as string });
    });

    // Leaving the BigInt route → keyOf throws in JSON.stringify → safeKeyOf
    // returns null → capture skipped + one console.error.
    await act(async () => {
      await plain.navigate("home");
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("cannot be canonicalized"),
    );

    plain.stop();
  });

  // ── option / store / edge coverage ────────────────────────────────────────

  it("defaults to mode 'restore' when the mode field is omitted", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    render(
      <RouterProvider router={router} scrollRestoration={{}}>
        <div />
      </RouterProvider>,
    );

    // Default "restore" mode still flips history + drives scrollToHashOrTop.
    expect(history.scrollRestoration).toBe("manual");

    await act(async () => {
      await router.navigate("about");
    });

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

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    // Capture → putPos → loadStore parses the pre-existing raw JSON.
    await act(async () => {
      await router.navigate("about");
    });

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

    render(
      <RouterProvider
        router={router}
        scrollRestoration={{
          mode: "restore",
          behavior: "smooth",
          scrollContainer: () => container,
        }}
      >
        <div />
      </RouterProvider>,
    );

    containerScrollTo.mockClear();

    // reload → restorePos; smooth never early-stops, so it re-applies every
    // frame across the retry budget.
    await act(async () => {
      await router.navigate("test", {}, undefined, { reload: true });
    });

    expect(containerScrollTo.mock.calls.length).toBeGreaterThan(1);

    container.remove();
  });

  it("warns only once across multiple unserializable routes", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const plain = createPlainRouter();

    await plain.start("/");

    render(
      <RouterProvider router={plain} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await plain.navigate("about", { big: 1n as unknown as string });
    });
    await act(async () => {
      await plain.navigate("home"); // capture about{1n} → warn (first)
    });
    await act(async () => {
      await plain.navigate("about", { big: 2n as unknown as string });
    });
    await act(async () => {
      await plain.navigate("home"); // capture about{2n} → already warned → silent
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);

    plain.stop();
  });

  it("reload of an unserializable route restores to 0 (key null)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scrollTo = vi.spyOn(globalThis, "scrollTo");
    const plain = createPlainRouter();

    await plain.start("/");

    render(
      <RouterProvider router={plain} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await plain.navigate("about", { big: 1n as unknown as string });
    });

    scrollTo.mockClear();

    // reload → restore arm → safeKeyOf(route) is null → restorePos(0).
    await act(async () => {
      await plain.navigate(
        "about",
        { big: 1n as unknown as string },
        undefined,
        { reload: true },
      );
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

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    scrollTo.mockClear();

    // reload-navigate to a never-visited route → loadStore()[key] is undefined
    // → the `?? 0` fallback restores to top.
    await act(async () => {
      await router.navigate("home", {}, undefined, { reload: true });
    });

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

    render(
      <RouterProvider
        router={navRouter}
        scrollRestoration={{ mode: "restore" }}
      >
        <div />
      </RouterProvider>,
    );

    scrollTo.mockClear();

    // back arm → safeKeyOf(about{big}) is null → restorePos(0).
    await act(async () => {
      await navRouter.navigate("about", { big: 1n as unknown as string });
    });

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

    render(
      <RouterProvider router={plain} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await plain.navigate("about", { big: 1n as unknown as string });
    });

    const setItem = vi.spyOn(Storage.prototype, "setItem");

    globalThis.dispatchEvent(new Event("pagehide"));

    // onPageHide → safeKeyOf(current) is null → capture skipped.
    expect(setItem).not.toHaveBeenCalled();

    plain.stop();
  });

  it("pagehide is a no-op when the router has no active state", () => {
    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    router.stop(); // getState() now returns undefined
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    globalThis.dispatchEvent(new Event("pagehide"));

    expect(setItem).not.toHaveBeenCalled();
  });
});

// A separate suite with a DEFERRED rAF (setTimeout-backed) so the navigation's
// scroll effect can be interrupted (provider destroyed) before its frame runs.
describe("RouterProvider — scrollRestoration (destroyed guard)", () => {
  let router: Router;

  beforeEach(async () => {
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
    vi.unstubAllGlobals();
  });

  it("the navigation rAF bails when the provider is destroyed before the frame runs", async () => {
    const scrollTo = vi.spyOn(globalThis, "scrollTo");

    const { unmount } = render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    // Capture runs synchronously; the restore is deferred into the rAF.
    await act(async () => {
      await router.navigate("about");
    });

    // Destroy before the deferred rAF fires → the callback sees `destroyed`
    // and returns without restoring.
    unmount();
    scrollTo.mockClear();

    void act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("skips capture for a second navigation before the first frame settles (#782)", async () => {
    setScrollY(100);

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    // First navigation captures test@100 and leaves scrollSettled=false (its
    // restore rAF is still pending under the deferred shim).
    await act(async () => {
      await router.navigate("about");
    });

    const setItem = vi.spyOn(Storage.prototype, "setItem");

    // Second navigation lands in the same unsettled window → capture is skipped
    // so it cannot store a foreign position under "about"'s key.
    await act(async () => {
      await router.navigate("home");
    });

    expect(setItem).not.toHaveBeenCalled();

    void act(() => {
      vi.advanceTimersByTime(10);
    });
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

    const { unmount } = render(
      <RouterProvider
        router={navRouter}
        scrollRestoration={{
          mode: "restore",
          scrollContainer: () => container,
        }}
      >
        <div />
      </RouterProvider>,
    );

    // back → schedules the main restore rAF.
    await act(async () => {
      await navRouter.navigate("about");
    });

    // One frame: restorePos(200) first attempt writes 200, container stays 0 →
    // no early stop → schedules the next retry frame.
    void act(() => {
      vi.advanceTimersToNextTimer();
    });

    const callsBeforeDestroy = containerScrollTo.mock.calls.length;

    unmount(); // destroy mid-budget

    // Next scheduled retry frame sees `destroyed` and returns without writing.
    void act(() => {
      vi.advanceTimersToNextTimer();
    });

    expect(containerScrollTo).toHaveBeenCalledTimes(callsBeforeDestroy);

    container.remove();
    navRouter.stop();
  });
});
