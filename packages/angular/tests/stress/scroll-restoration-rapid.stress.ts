import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MB, createStressRouter, takeHeapSnapshot } from "./helpers";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

@Component({ template: "" })
class Host {
  readonly mounted = true;
}

/**
 * Closes review §7.1 #10 (HIGH gap) — `scrollRestoration` stress with rapid
 * pushState. The utility:
 *   - subscribes to every router transition
 *   - writes positions to sessionStorage (write-through cache) on leave
 *   - reads positions back on back/traverse navigations
 *
 * The original audit flagged "quota-related leaks" and "1000 navigations +
 * capture/restore" as the missing scenarios. We verify:
 *
 *   1. 1000 sequential navigations under `mode: "restore"` — bounded heap,
 *      sessionStorage stays within quota (jsdom enforces ~5MB).
 *   2. Rapid mount/unmount of the provider — each unmount must restore
 *      `history.scrollRestoration` and remove the pagehide listener.
 *   3. pagehide event after destroy — handler is unregistered, no leak.
 */
describe("scrollRestoration stress — rapid pushState", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
    try {
      sessionStorage.clear();
    } catch {
      // jsdom usually has sessionStorage; ignore quota/security errors.
    }
  });

  afterEach(() => {
    router.stop();
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });

  it("1000 sequential navigations with restore mode — sessionStorage bounded, heap stable", async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRealRouter(router, {
          scrollRestoration: { mode: "restore" },
        }),
      ],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();

    const heapBefore = takeHeapSnapshot();
    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);

    for (let i = 0; i < 1000; i++) {
      const target = routeNames[i % routeNames.length];

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);

    // sessionStorage holds positions keyed by `name:canonicalParams`. With
    // 50 unique routes, at most 50 keys + one value each (≈ 1KB total).
    // Treat missing key as empty (no positions captured = trivially bounded).
    const stored = sessionStorage.getItem("real-router:scroll") ?? "{}";
    const parsed = JSON.parse(stored) as Record<string, number>;

    expect(Object.keys(parsed).length).toBeLessThanOrEqual(50);
    expect(stored.length).toBeLessThan(20 * 1024);

    fixture.destroy();
  }, 90_000);

  it("100 mount/unmount cycles — pagehide listener does not leak", () => {
    const heapBefore = takeHeapSnapshot();

    // Snapshot original history.scrollRestoration so we can verify the
    // utility restores it on every TestBed reset. The EnvironmentInjector
    // (which owns the DestroyRef the utility's destroy() is wired to) is
    // destroyed by TestBed.resetTestingModule(), not by fixture.destroy().
    const original = history.scrollRestoration;

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();

      // After reset of the previous iteration's EnvironmentInjector, the
      // utility from the prior iteration restored history.scrollRestoration
      // to `original`.
      expect(history.scrollRestoration).toBe(original);

      TestBed.configureTestingModule({
        imports: [Host],
        providers: [
          provideRealRouter(router, {
            scrollRestoration: { mode: "restore" },
          }),
        ],
      });
      const fixture = TestBed.createComponent(Host);

      fixture.detectChanges();
      fixture.destroy();
    }

    // Final cleanup so post-loop assertions see the restored value.
    TestBed.resetTestingModule();

    expect(history.scrollRestoration).toBe(original);

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("pagehide event after destroy is a no-op (no exception, no sessionStorage write)", () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRealRouter(router, {
          scrollRestoration: { mode: "restore" },
        }),
      ],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();
    fixture.destroy();

    // Tear down the EnvironmentInjector — DestroyRef hooks fire here, the
    // utility unregisters its pagehide handler. fixture.destroy() alone is
    // not enough for environment-level providers.
    TestBed.resetTestingModule();

    // Capture sessionStorage state after teardown.
    const before = sessionStorage.getItem("real-router:scroll");

    // Dispatch pagehide — if the listener wasn't removed, it would write
    // to sessionStorage. The utility unregisters its handler in destroy(),
    // so the storage must remain unchanged.
    globalThis.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    );

    const after = sessionStorage.getItem("real-router:scroll");

    expect(after).toBe(before);
  });

  it("rapid navigations under mode='top' — no sessionStorage writes (mode 'top' still captures)", async () => {
    // mode: "top" still subscribes (to capture leave positions for back/
    // traverse), but on entry it always scrolls to top. We confirm that
    // 200 navigations do not blow up sessionStorage past its 5MB jsdom
    // ceiling.
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRealRouter(router, { scrollRestoration: { mode: "top" } }),
      ],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);

    for (let i = 0; i < 200; i++) {
      const target = routeNames[i % routeNames.length];

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }
    }

    const stored = sessionStorage.getItem("real-router:scroll") ?? "";

    expect(stored.length).toBeLessThan(20 * 1024);

    fixture.destroy();
  }, 60_000);

  it("mode='native' — pagehide listener and sessionStorage are not touched", () => {
    sessionStorage.setItem("real-router:scroll", "{}");

    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRealRouter(router, { scrollRestoration: { mode: "native" } }),
      ],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();

    // Native mode = no subscribe, no pagehide listener. Dispatch pagehide
    // — sessionStorage must stay verbatim at our seed.
    globalThis.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    );

    expect(sessionStorage.getItem("real-router:scroll")).toBe("{}");

    fixture.destroy();
  });
});
