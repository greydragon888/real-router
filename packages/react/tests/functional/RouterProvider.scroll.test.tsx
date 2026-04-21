import { act, render } from "@testing-library/react";
import { useState, type FC } from "react";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/react";

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

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(Object.values(saved)).toContain(250);

    unmount();
  });

  // Reactivity regression — guards primitive-deps rewrite against inline
  // object thrash. If re-created on every render, prevScrollRestoration
  // captures "manual", and the final unmount fails to restore "auto".
  it("replacing the options ref with same fields — does NOT re-create the utility", async () => {
    let setOpts!: (o: { mode: "restore" | "top" | "manual" }) => void;

    const Harness: FC = () => {
      const [opts, update] = useState<{
        mode: "restore" | "top" | "manual";
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
});
