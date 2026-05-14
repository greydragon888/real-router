import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouterProviderViewTransitionsTest from "../helpers/RouterProviderViewTransitionsTest.svelte";

import type { Router } from "@real-router/core";

function stubStartViewTransition(): ReturnType<typeof vi.fn> {
  const startSpy = vi.fn((cb: () => void | Promise<void>) => {
    void cb();

    return { skipTransition: vi.fn() };
  });

  (
    document as Document & { startViewTransition?: unknown }
  ).startViewTransition =
    startSpy as unknown as Document["startViewTransition"];

  return startSpy;
}

describe("RouterProvider — viewTransitions", () => {
  let router: Router;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();

    Reflect.deleteProperty(document, "startViewTransition");
    vi.unstubAllGlobals();
  });

  it("no viewTransitions prop — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    render(RouterProviderViewTransitionsTest, { props: { router } });
    flushSync();

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("viewTransitions: true — startViewTransition called on navigate", async () => {
    const startSpy = stubStartViewTransition();

    render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: true },
    });
    flushSync();

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("viewTransitions: false — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: false },
    });
    flushSync();

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("unmount tears down the utility", async () => {
    const startSpy = stubStartViewTransition();

    const { unmount } = render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: true },
    });

    flushSync();

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);

    unmount();

    await router.navigate("home");

    expect(startSpy).toHaveBeenCalledTimes(1);
  });
});
