/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { createRouter } from "@real-router/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

/**
 * Closes review-2026-05-16 §7.2 #10 (HIGH) and §7.4 Test 1 (multiple
 * RouterErrorBoundary instances sharing one router).
 *
 * Each `<router-error-boundary>` subscribes to `createDismissableError(router)`
 * from `@real-router/sources` — that factory is **per-router cached** in a
 * WeakMap, so three boundaries on the same router MUST observe the same
 * underlying snapshot. `resetError()` is a method on that snapshot; calling it
 * from one boundary flips the shared `dismissedVersion` and the next
 * `updateSnapshot` propagates `error === null` to every consumer.
 *
 * This test pins three properties that would silently break if any future
 * refactor split the cache or moved dismissal state into per-boundary
 * `signal`s:
 *
 *   1. All boundaries see the same `error.code` after a single failed nav.
 *   2. `resetError()` from one boundary clears the error on all of them.
 *   3. Mounting / unmounting one boundary mid-stream does not desynchronize
 *      the survivors.
 */
const routes = [
  { name: "home", path: "/" },
  { name: "valid", path: "/valid" },
];

describe("multiple RouterErrorBoundary instances share dismissable-error state (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("3 boundaries observe identical errorContext through 50 error cycles", async () => {
    @Component({
      template: `
        <router-error-boundary><span>A</span></router-error-boundary>
        <router-error-boundary><span>B</span></router-error-boundary>
        <router-error-boundary><span>C</span></router-error-boundary>
      `,
      imports: [RouterErrorBoundary],
    })
    class TriHost {}

    TestBed.configureTestingModule({
      imports: [TriHost],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(TriHost);

    fixture.detectChanges();

    const getBoundaries = (): RouterErrorBoundary[] =>
      fixture.debugElement
        .queryAll(By.directive(RouterErrorBoundary))
        .map((d) => d.componentInstance as RouterErrorBoundary);

    expect(getBoundaries()).toHaveLength(3);

    for (let i = 0; i < 50; i++) {
      await expect(router.navigate(`missing_${i}`)).rejects.toThrow();

      fixture.detectChanges();

      const ctxs = getBoundaries().map((b) => b.errorContext());

      for (const c of ctxs) {
        expect(c).not.toBeNull();
        expect(c!.$implicit.code).toBe("ROUTE_NOT_FOUND");
      }

      // Every snapshot is read from the same shared source — the resetError
      // reference must be identical across all three boundaries.
      const resetFns = new Set(ctxs.map((c) => c!.resetError));

      expect(resetFns.size).toBe(1);

      // Dismiss from boundary A — boundaries B and C must observe the clear.
      ctxs[0]!.resetError();
      fixture.detectChanges();

      const cleared = getBoundaries().map((b) => b.errorContext());

      for (const c of cleared) {
        expect(c).toBeNull();
      }
    }

    fixture.destroy();
  }, 60_000);

  it("unmounting one boundary mid-stream does not desync the survivors", async () => {
    @Component({
      template: `
        <router-error-boundary><span>A</span></router-error-boundary>
        @if (showAll()) {
          <router-error-boundary><span>B</span></router-error-boundary>
        }
        <router-error-boundary><span>C</span></router-error-boundary>
      `,
      imports: [RouterErrorBoundary],
    })
    class ToggleHost {
      readonly showAll = signal(true);
    }

    TestBed.configureTestingModule({
      imports: [ToggleHost],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(ToggleHost);

    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.directive(RouterErrorBoundary)),
    ).toHaveLength(3);

    await expect(router.navigate("missing_pre")).rejects.toThrow();

    fixture.detectChanges();

    // All three see the error.
    let boundaries = fixture.debugElement
      .queryAll(By.directive(RouterErrorBoundary))
      .map((d) => d.componentInstance as RouterErrorBoundary);

    for (const b of boundaries) {
      expect(b.errorContext()).not.toBeNull();
    }

    // Drop the middle boundary.
    fixture.componentInstance.showAll.set(false);
    fixture.detectChanges();

    boundaries = fixture.debugElement
      .queryAll(By.directive(RouterErrorBoundary))
      .map((d) => d.componentInstance as RouterErrorBoundary);

    expect(boundaries).toHaveLength(2);

    // Survivors still hold the cached error.
    for (const b of boundaries) {
      expect(b.errorContext()).not.toBeNull();
      expect(b.errorContext()!.$implicit.code).toBe("ROUTE_NOT_FOUND");
    }

    // Dismiss from a survivor — both should clear.
    boundaries[0].errorContext()!.resetError();
    fixture.detectChanges();

    for (const b of boundaries) {
      expect(b.errorContext()).toBeNull();
    }

    // Remount the third boundary, fire a new error — all three again coherent.
    fixture.componentInstance.showAll.set(true);
    fixture.detectChanges();

    await expect(router.navigate("missing_post")).rejects.toThrow();

    fixture.detectChanges();

    boundaries = fixture.debugElement
      .queryAll(By.directive(RouterErrorBoundary))
      .map((d) => d.componentInstance as RouterErrorBoundary);

    expect(boundaries).toHaveLength(3);

    for (const b of boundaries) {
      expect(b.errorContext()).not.toBeNull();
      expect(b.errorContext()!.$implicit.code).toBe("ROUTE_NOT_FOUND");
    }

    fixture.destroy();
  }, 30_000);

  it("100 boundary mount/unmount cycles share the same cached source — no allocation per cycle", async () => {
    @Component({
      template: `<router-error-boundary
        ><span>Content</span></router-error-boundary
      >`,
      imports: [RouterErrorBoundary],
    })
    class SoloHost {}

    // Capture the reference exposed by the cached snapshot in the first cycle;
    // subsequent cycles must produce the same function identity for
    // `resetError`, proving the WeakMap entry survived the boundary teardowns.
    let firstResetRef: (() => void) | undefined;

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [SoloHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(SoloHost);

      fixture.detectChanges();

      await expect(router.navigate(`gone_${i}`)).rejects.toThrow();

      fixture.detectChanges();

      const boundary = fixture.debugElement.query(
        By.directive(RouterErrorBoundary),
      ).componentInstance as RouterErrorBoundary;
      const ctx = boundary.errorContext();

      expect(ctx).not.toBeNull();

      if (firstResetRef === undefined) {
        firstResetRef = ctx!.resetError;
      } else {
        // Same router → same cached source → same resetError reference.
        // eslint-disable-next-line vitest/no-conditional-expect -- the conditional is the pin itself: branch 1 captures, branch 2 verifies identity stability across cycles
        expect(ctx!.resetError).toBe(firstResetRef);
      }

      // Clear so the next iteration's expect-not-null is meaningful.
      ctx!.resetError();
      fixture.detectChanges();
      fixture.destroy();
    }
  }, 60_000);
});
