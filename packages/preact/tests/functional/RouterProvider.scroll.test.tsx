import { act, render } from "@testing-library/preact";
import { h } from "preact";
import { useState } from "preact/hooks";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/preact";

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

  it("pagehide captures position when enabled", () => {
    Object.defineProperty(globalThis, "scrollY", {
      value: 180,
      configurable: true,
    });

    const { unmount } = render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    globalThis.dispatchEvent(new Event("pagehide"));

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(Object.values(saved)).toContain(180);

    unmount();
  });

  // Reactivity regression — guards primitive-deps rewrite against inline
  // object thrash. If re-created on every render, prevScrollRestoration
  // captures "manual", and the final unmount fails to restore "auto".
  it("replacing the options ref with same fields — does NOT re-create the utility", async () => {
    let setOpts!: (o: { mode: "restore" | "top" | "manual" }) => void;

    function Harness() {
      const [opts, update] = useState<{
        mode: "restore" | "top" | "manual";
      }>({ mode: "restore" });

      setOpts = update;

      return h(RouterProvider, {
        router,
        scrollRestoration: opts,
        children: h("div", null),
      });
    }

    const { unmount } = render(h(Harness, null));

    expect(history.scrollRestoration).toBe("manual");

    await act(async () => {
      setOpts({ mode: "restore" });
    });

    unmount();

    expect(history.scrollRestoration).toBe("auto");
  });
});
