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

    // Sprint C.1 — explicit storage assertion. The previous version
    // used `?? "{}"` fallback which would silently coerce a missing
    // key into an empty object, and `Object.values().toContain(310)`
    // wasn't tied to a specific (route, params) key. Lock both: the
    // storage entry MUST exist, AND it MUST be keyed by the active
    // route's `keyOf` (= `${name}:{}` for empty params).
    const raw = sessionStorage.getItem(STORAGE_KEY);

    expect(raw).not.toBeNull();

    const saved = JSON.parse(raw!) as Record<string, number>;
    const currentName = router.getState()?.name;

    expect(currentName).toBeDefined();

    // Pin: stored under "${routeName}:{}" key (empty params → "{}").
    const expectedKey = `${currentName!}:{}`;

    expect(saved[expectedKey]).toBe(310);

    unmount();
  });
});
