import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouterProviderScrollReactivity from "../helpers/RouterProviderScrollReactivity.svelte";
import RouterProviderScrollTest from "../helpers/RouterProviderScrollTest.svelte";

import type { Router } from "@real-router/core";

const STORAGE_KEY = "real-router:scroll";

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
    render(RouterProviderScrollTest, { props: { router } });
    flushSync();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("scrollRestoration provided — flips history.scrollRestoration to 'manual'", () => {
    render(RouterProviderScrollTest, {
      props: { router, scrollRestoration: { mode: "restore" } },
    });
    flushSync();

    expect(history.scrollRestoration).toBe("manual");
  });

  it("unmount restores history.scrollRestoration", () => {
    const { unmount } = render(RouterProviderScrollTest, {
      props: { router, scrollRestoration: { mode: "restore" } },
    });

    flushSync();

    expect(history.scrollRestoration).toBe("manual");

    unmount();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("pagehide captures position when enabled", () => {
    Object.defineProperty(globalThis, "scrollY", {
      value: 420,
      configurable: true,
    });

    const { unmount } = render(RouterProviderScrollTest, {
      props: { router, scrollRestoration: { mode: "restore" } },
    });

    flushSync();

    globalThis.dispatchEvent(new Event("pagehide"));

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(Object.values(saved)).toContain(420);

    unmount();
  });

  // Reactivity regression — same as Vue's, but triggers the untrack-guarded
  // scrollContainer read. If the effect depended on `scrollRestoration` signal
  // (pre-untrack bug), replacing the ref with an identical-field object would
  // re-create the utility, and prev=auto would be lost after unmount.
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
});
