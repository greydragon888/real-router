import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { preloadPluginFactory } from "../../src";
import { isSlowConnection } from "../../src/network";
import {
  createAnchor,
  createTestRouter,
  fireMouseOver,
  fireTouchStart,
  setupMatchUrl,
  waitForTimer,
} from "../helpers/testUtils";

interface ConnectionShape {
  saveData?: boolean;
  effectiveType?: string;
}

function stubConnection(connection: ConnectionShape | undefined): void {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    get: () => connection,
  });
}

function restoreConnection(): void {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    get: () => undefined,
  });
}

describe("preload-plugin — network", () => {
  afterEach(() => {
    restoreConnection();
  });

  describe("isSlowConnection()", () => {
    it("returns false when navigator.connection is not available", () => {
      restoreConnection();

      expect(isSlowConnection()).toBe(false);
    });

    it("returns true when saveData is true", () => {
      stubConnection({ saveData: true });

      expect(isSlowConnection()).toBe(true);
    });

    it("returns true when effectiveType is '2g'", () => {
      stubConnection({ effectiveType: "2g" });

      expect(isSlowConnection()).toBe(true);
    });

    it("returns true when effectiveType is 'slow-2g'", () => {
      stubConnection({ effectiveType: "slow-2g" });

      expect(isSlowConnection()).toBe(true);
    });

    it("returns false when effectiveType is '4g'", () => {
      stubConnection({ effectiveType: "4g" });

      expect(isSlowConnection()).toBe(false);
    });

    it("returns false when effectiveType is '3g'", () => {
      stubConnection({ effectiveType: "3g" });

      expect(isSlowConnection()).toBe(false);
    });

    it("returns false when connection exists but has no recognized fields", () => {
      stubConnection({});

      expect(isSlowConnection()).toBe(false);
    });
  });

  describe("network-aware preloading", () => {
    let cleanup: (() => void) | undefined;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      cleanup?.();
      cleanup = undefined;
      document.body.innerHTML = "";
      vi.useRealTimers();
      restoreConnection();
    });

    it("does not preload on hover when saveData is true", async () => {
      stubConnection({ saveData: true });

      const preloadFn = vi.fn().mockResolvedValue(undefined);
      const { router } = createTestRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);

      setupMatchUrl(router);
      cleanup = router.usePlugin(preloadPluginFactory());
      await router.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await waitForTimer(65);

      expect(preloadFn).not.toHaveBeenCalled();

      router.stop();
    });

    it("does not preload on hover when effectiveType is '2g'", async () => {
      stubConnection({ effectiveType: "2g" });

      const preloadFn = vi.fn().mockResolvedValue(undefined);
      const { router } = createTestRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);

      setupMatchUrl(router);
      cleanup = router.usePlugin(preloadPluginFactory());
      await router.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await waitForTimer(65);

      expect(preloadFn).not.toHaveBeenCalled();

      router.stop();
    });

    it("does not preload on hover when effectiveType is 'slow-2g'", async () => {
      stubConnection({ effectiveType: "slow-2g" });

      const preloadFn = vi.fn().mockResolvedValue(undefined);
      const { router } = createTestRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);

      setupMatchUrl(router);
      cleanup = router.usePlugin(preloadPluginFactory());
      await router.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await waitForTimer(65);

      expect(preloadFn).not.toHaveBeenCalled();

      router.stop();
    });

    it("preloads on hover when no navigator.connection (good network assumed)", async () => {
      restoreConnection();

      const preloadFn = vi.fn().mockResolvedValue(undefined);
      const { router } = createTestRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);

      setupMatchUrl(router);
      cleanup = router.usePlugin(preloadPluginFactory());
      await router.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await waitForTimer(65);

      expect(preloadFn).toHaveBeenCalledTimes(1);

      router.stop();
    });

    it("preloads on hover when effectiveType is '4g'", async () => {
      stubConnection({ effectiveType: "4g" });

      const preloadFn = vi.fn().mockResolvedValue(undefined);
      const { router } = createTestRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);

      setupMatchUrl(router);
      cleanup = router.usePlugin(preloadPluginFactory());
      await router.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await waitForTimer(65);

      expect(preloadFn).toHaveBeenCalledTimes(1);

      router.stop();
    });

    it("preloads even on slow connection when networkAware is false", async () => {
      stubConnection({ saveData: true });

      const preloadFn = vi.fn().mockResolvedValue(undefined);
      const { router } = createTestRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);

      setupMatchUrl(router);
      cleanup = router.usePlugin(preloadPluginFactory({ networkAware: false }));
      await router.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await waitForTimer(65);

      expect(preloadFn).toHaveBeenCalledTimes(1);

      router.stop();
    });

    it("does not preload on touchstart when saveData is true", async () => {
      stubConnection({ saveData: true });

      const preloadFn = vi.fn().mockResolvedValue(undefined);
      const { router } = createTestRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);

      setupMatchUrl(router);
      cleanup = router.usePlugin(preloadPluginFactory());
      await router.start("/");

      const anchor = createAnchor("/");

      fireTouchStart(anchor);
      await waitForTimer(100);

      expect(preloadFn).not.toHaveBeenCalled();

      router.stop();
    });
  });
});
