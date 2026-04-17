/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { createErrorSource } from "@real-router/sources";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "valid", path: "/valid" },
];

describe("error boundary storm (Angular)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("50 consecutive navigation errors — error boundary handles all", async () => {
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

    const errorSource = createErrorSource(router);

    for (let i = 0; i < 50; i++) {
      await expect(router.navigate(`nonexistent_${i}`)).rejects.toThrow();
    }

    const snap = errorSource.getSnapshot();

    expect(snap.error).not.toBeNull();
    expect(snap.error!.code).toBe("ROUTE_NOT_FOUND");
    expect(snap.version).toBeGreaterThanOrEqual(50);

    fixture.destroy();
    errorSource.destroy();
  });

  it("error storm interleaved with successful navigations — version increments", async () => {
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

    const errorSource = createErrorSource(router);
    const versions: number[] = [];

    for (let i = 0; i < 25; i++) {
      await expect(router.navigate("nonexistent")).rejects.toThrow();

      versions.push(errorSource.getSnapshot().version);

      await router.navigate(i % 2 === 0 ? "valid" : "home");
    }

    expect(versions).toHaveLength(25);
    expect(versions.at(-1)).toBeGreaterThan(versions[0]);

    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThanOrEqual(versions[i - 1]);
    }

    fixture.destroy();
    errorSource.destroy();
  });

  it("error boundary survives 100 mount/unmount cycles with errors", async () => {
    @Component({
      template: `<router-error-boundary
        ><span>Content</span></router-error-boundary
      >`,
      imports: [RouterErrorBoundary],
    })
    class TestHost {}

    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      await expect(router.navigate("nonexistent")).rejects.toThrow();

      fixture.destroy();
    }

    expect(router.getState()?.name).toBe("home");
  });
});
