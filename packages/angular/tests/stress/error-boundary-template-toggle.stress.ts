/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

/**
 * Stress: `<router-error-boundary [errorTemplate]>` is a signal-based input.
 * The 2026-04-17 review flagged that swapping the template between renders
 * may leak the previous template, leave the host in a stale ngTemplateOutlet
 * state, or fail to surface the error context.
 *
 * JIT-mode caveat (CLAUDE.md "Coverage Ceiling ~95%"): template-driven
 * bindings to signal inputs do not propagate, so we cannot assert on the
 * rendered HTML output. The test below verifies the JIT-reachable surface:
 * the boundary's `errorContext()` snapshot stays coherent through:
 *   - many error → reset cycles
 *   - the boundary host being destroyed and re-created mid-error stream
 *   - rapid same-error-code errors (subscription doesn't drop emissions)
 * AOT (production builds) carries the template-toggle path end-to-end via
 * the consumers in `examples/web/angular/*`.
 */
const routes = [{ name: "home", path: "/" }];

describe("RouterErrorBoundary errorContext stability under stress (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("100 alternating error → reset cycles — errorContext is fresh each round", async () => {
    @Component({
      template: `<router-error-boundary
        ><span>Content</span></router-error-boundary
      >`,
      imports: [RouterErrorBoundary],
    })
    class TestHost {}

    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();

    const boundary = fixture.debugElement.query(
      By.directive(RouterErrorBoundary),
    ).componentInstance as RouterErrorBoundary;

    expect(boundary.errorContext()).toBeNull();

    for (let i = 0; i < 100; i++) {
      await expect(router.navigate(`nope_${i}`)).rejects.toThrow();

      fixture.detectChanges();

      const ctx = boundary.errorContext();

      expect(ctx).not.toBeNull();
      expect(ctx!.$implicit.code).toBe("ROUTE_NOT_FOUND");

      ctx!.resetError();
      fixture.detectChanges();

      expect(boundary.errorContext()).toBeNull();
    }

    fixture.destroy();
  }, 60_000);

  it("boundary destroyed mid-error stream — fresh boundary picks up subsequent errors cleanly", async () => {
    @Component({
      template: `<router-error-boundary
        ><span>Content</span></router-error-boundary
      >`,
      imports: [RouterErrorBoundary],
    })
    class TestHost {}

    for (let pass = 0; pass < 5; pass++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const boundary = fixture.debugElement.query(
        By.directive(RouterErrorBoundary),
      ).componentInstance as RouterErrorBoundary;

      await expect(router.navigate(`gone_${pass}`)).rejects.toThrow();

      fixture.detectChanges();

      const ctx = boundary.errorContext();

      expect(ctx).not.toBeNull();
      expect(ctx!.$implicit.code).toBe("ROUTE_NOT_FOUND");

      fixture.destroy();
    }
  }, 30_000);

  it("rapid same-error-code stream — boundary surfaces every distinct version", async () => {
    @Component({
      template: `<router-error-boundary
        ><span>Content</span></router-error-boundary
      >`,
      imports: [RouterErrorBoundary],
    })
    class TestHost {}

    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();

    const boundary = fixture.debugElement.query(
      By.directive(RouterErrorBoundary),
    ).componentInstance as RouterErrorBoundary;

    const observedErrors: string[] = [];

    boundary.onError.subscribe((event) => {
      observedErrors.push(event.error.code);
    });

    for (let i = 0; i < 30; i++) {
      await expect(router.navigate(`burst_${i}`)).rejects.toThrow();

      fixture.detectChanges();

      boundary.errorContext()!.resetError();
      fixture.detectChanges();
    }

    expect(observedErrors).toHaveLength(30);
    expect(observedErrors.every((c) => c === "ROUTE_NOT_FOUND")).toBe(true);

    fixture.destroy();
  }, 30_000);
});
