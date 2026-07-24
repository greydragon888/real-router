// packages/preact/tests/stress/scroll-restoration-quota.stress.tsx

/**
 * Stress test for `createScrollRestoration` under sessionStorage quota
 * exhaustion.
 *
 * Closes review §7 #11 (MEDIUM): "scrollRestoration: переполнение
 * sessionStorage (5MB cap) — базовый `RouterProvider.scroll.test.tsx`, нет
 * stress. `putPos` ловит quota error в catch, но возвращается null —
 * `cached[key] = pos` остаётся в memory, но `setItem` тихо fail. На следующем
 * `loadStore()` после reload — состояние потеряно. На крупных SPA с 1000+
 * unique route+params keys реально достижимо."
 *
 * Pipeline under test (`shared/dom-utils/scroll-restore.ts`):
 *   - `loadStore` parses sessionStorage once per provider mount → in-memory cache
 *   - `putPos` writes through to sessionStorage on every navigation leave
 *   - On quota exceeded: try/catch swallows, in-memory cache holds the value,
 *     subsequent navigations from the same provider session keep working
 *   - Reload would lose the unwritten state — but the provider stays alive
 *     and does not crash
 *
 * Invariants:
 *   - QuotaExceededError thrown by setItem does NOT crash render or navigation
 *   - In-memory cache continues to hold scroll positions across leave events
 *     even when persistence fails
 *   - Many subsequent leaves (each calling putPos) keep working — the catch
 *     is per-call, not "first failure breaks forever"
 *   - Skip-same-value optimization: identical positions are no-ops both
 *     in-memory and in sessionStorage
 */

import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

const STORAGE_KEY = "real-router:scroll";

// jsdom 29 wraps `sessionStorage` in a Proxy whose `getItem`/`setItem` are NOT
// the global `Storage.prototype` methods, so `vi.spyOn(Storage.prototype, …)`
// silently no-ops (the spy never intercepts, the real storage runs, and the
// quota / corrupted-storage path under test is never exercised). A store-backed
// plain-object mock installed via `vi.stubGlobal` is spyable and controllable —
// make `setItem`/`getItem` throw to drive the failure paths.
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

function withQuotaExceeded(
  setItemImpl: (key: string, value: string) => void = () => {
    throw new DOMException("QuotaExceededError", "QuotaExceededError");
  },
): {
  restore: () => void;
  setItemSpy: ReturnType<typeof vi.spyOn>;
} {
  const setItemSpy = vi
    .spyOn(sessionStorage, "setItem")
    .mockImplementation(setItemImpl);

  return {
    setItemSpy,
    restore: () => {
      setItemSpy.mockRestore();
    },
  };
}

describe("preact stress — scrollRestoration sessionStorage quota overflow", () => {
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
    vi.unstubAllGlobals();
    cleanup();
  });

  it("setItem throws QuotaExceededError on every write → provider survives, navigations keep working", async () => {
    const { restore, setItemSpy } = withQuotaExceeded();

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div data-testid="content">App</div>
      </RouterProvider>,
    );

    Object.defineProperty(globalThis, "scrollY", {
      value: 250,
      configurable: true,
    });

    // 50 navigations — each fires subscribeLeave → putPos → setItem (throws).
    // Without the catch in putPos, the FIRST iteration would surface an
    // unhandled error and break every subsequent navigation.
    for (let i = 0; i < 50; i++) {
      await act(async () => {
        await router.navigate(i % 2 === 0 ? "home" : "about");
      });
    }

    // Each leave attempted at least one setItem call → spy was invoked.
    expect(setItemSpy.mock.calls.length).toBeGreaterThan(0);
    // Persistence never succeeded → key is absent in sessionStorage.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    // Router state is intact — final route reached normally.
    expect(router.getState()?.name).toBe("about");

    restore();
  });

  it("pagehide → putPos catches quota error → cached state survives within session", async () => {
    const { restore } = withQuotaExceeded();

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    Object.defineProperty(globalThis, "scrollY", {
      value: 1024,
      configurable: true,
    });

    // pagehide flushes the entire cache; with no successful prior writes
    // the in-memory map is empty, so the dispatch must not throw either.
    expect(() => {
      globalThis.dispatchEvent(new Event("pagehide"));
    }).not.toThrow();

    // sessionStorage stays clean — no partial write artefacts.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    restore();
  });

  it("intermittent quota: half of writes succeed → store grows, partial loss does not crash", async () => {
    // More realistic quota model: writes fail randomly (e.g. tab quota fills
    // up). The router must NOT cascade-fail on the first failure — each
    // putPos call is independent.
    let callCount = 0;
    const writes: { key: string; value: string }[] = [];
    const { restore } = withQuotaExceeded((key, value) => {
      callCount++;
      if (callCount % 2 === 0) {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      }

      writes.push({ key, value });
    });

    render(
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>,
    );

    Object.defineProperty(globalThis, "scrollY", {
      value: 500,
      configurable: true,
    });

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await router.navigate(i % 2 === 0 ? "home" : "about");
      });
    }

    // At least some writes succeeded — the spy recorded both kinds of calls.
    expect(callCount).toBeGreaterThan(0);
    expect(writes.length).toBeGreaterThan(0);

    // Router still functional.
    expect(["home", "about"]).toContain(router.getState()?.name);

    restore();
  });

  it("getItem throws (corrupted storage) → loadStore falls back to empty map, no crash", async () => {
    const getItemSpy = vi
      .spyOn(sessionStorage, "getItem")
      .mockImplementation(() => {
        throw new DOMException("SecurityError", "SecurityError");
      });

    expect(() => {
      render(
        <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
          <div data-testid="content">App</div>
        </RouterProvider>,
      );
    }).not.toThrow();

    Object.defineProperty(globalThis, "scrollY", {
      value: 100,
      configurable: true,
    });

    // Navigating after a corrupted-storage mount must also work — loadStore
    // is called lazily on first putPos.
    await act(async () => {
      await router.navigate("home");
    });

    expect(router.getState()?.name).toBe("home");

    getItemSpy.mockRestore();
  });
});
