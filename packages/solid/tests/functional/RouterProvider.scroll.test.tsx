import { render } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

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
    render(() => (
      <RouterProvider router={router}>
        <div />
      </RouterProvider>
    ));

    expect(history.scrollRestoration).toBe("auto");
  });

  it("scrollRestoration provided — flips history.scrollRestoration to 'manual'", () => {
    render(() => (
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>
    ));

    expect(history.scrollRestoration).toBe("manual");
  });

  it("unmount restores history.scrollRestoration", () => {
    const { unmount } = render(() => (
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>
    ));

    expect(history.scrollRestoration).toBe("manual");

    unmount();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("pagehide captures position when enabled", () => {
    Object.defineProperty(globalThis, "scrollY", {
      value: 310,
      configurable: true,
    });

    const { unmount } = render(() => (
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>
    ));

    globalThis.dispatchEvent(new Event("pagehide"));

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(Object.values(saved)).toContain(310);

    unmount();
  });
});
