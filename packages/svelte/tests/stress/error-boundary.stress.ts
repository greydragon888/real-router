import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { forceGC, getHeapUsedBytes, MB } from "./helpers";
import ErrorBoundaryWithOnError from "../helpers/ErrorBoundaryWithOnError.svelte";

import type { Router } from "@real-router/core";

describe("Stress: RouterErrorBoundary", () => {
  let router: Router;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "alt", path: "/alt" },
      { name: "guarded", path: "/g" },
    ]);
    getLifecycleApi(router).addActivateGuard("guarded", () => () => false);
    await router.start("/");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    router.stop();
    consoleError.mockRestore();
  });

  it("10.1 50 trigger→recover cycles with a throwing onError — boundary stays alive", async () => {
    const onError = vi.fn(() => {
      throw new Error("kaboom");
    });

    render(ErrorBoundaryWithOnError, { props: { router, onError } });

    // Alternate destinations between "home" and "alt" so the recovery
    // navigation never collapses into SAME_STATES (which would also fire onError).
    for (let i = 0; i < 50; i++) {
      await router.navigate("guarded").catch(() => {});
      flushSync();
      const recovery = i % 2 === 0 ? "alt" : "home";

      await router.navigate(recovery).catch(() => {});
      flushSync();
    }

    expect(onError).toHaveBeenCalledTimes(50);
    // Each throw was caught and reported via console.error — never propagated.
    expect(consoleError).toHaveBeenCalled();

    // Verify every console.error was OUR boundary's wrapper, not Svelte's
    // unhandled-error sink (which would mean a throw escaped).
    const ourMessages = consoleError.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("RouterErrorBoundary onError handler threw"),
    );

    expect(ourMessages).toHaveLength(50);
  });

  it("10.2 200 mount/unmount cycles — bounded heap, no error subscription leak", async () => {
    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 200; i++) {
      const onError = vi.fn();
      const { unmount } = render(ErrorBoundaryWithOnError, {
        props: { router, onError },
      });

      await router.navigate("guarded").catch(() => {});
      flushSync();
      unmount();
    }

    forceGC();
    const final = getHeapUsedBytes();

    expect(final - baseline).toBeLessThan(50 * MB);
  });

  it("10.3 throwing onError does not break subsequent successful navigation reactivity", async () => {
    const onError = vi.fn(() => {
      throw new Error("kaboom");
    });

    render(ErrorBoundaryWithOnError, { props: { router, onError } });

    await router.navigate("guarded").catch(() => {});
    flushSync();

    // Even though onError just threw, a subsequent successful navigation
    // must still drive the boundary to its non-error state.
    await router.navigate("alt").catch(() => {});
    flushSync();

    await router.navigate("guarded").catch(() => {});
    flushSync();

    // The boundary processed the second error too.
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
