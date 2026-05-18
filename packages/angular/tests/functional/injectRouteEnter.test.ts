// Angular injectRouteEnter tests
//
// Test scope vs React reference (`packages/react/tests/functional/useRouteEnter.test.tsx`):
//
//   - **Excluded**: "uses the latest handler reference without resubscribing".
//     Angular `inject*` functions run **once** during component
//     construction; the handler is captured in closure. The common
//     Angular pattern is a class method (stable identity).
//   - StrictMode test is React-only — Angular has no equivalent.
//
// All other tests mirror the React suite 1:1, but driven via TestBed
// `runInInjectionContext` instead of `render(<RouterProvider>...)`.

import { Component, Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { injectRouteEnter } from "../../src/functions/injectRouteEnter";
import { provideRealRouter } from "../../src/providers";

import type {
  RouteEnterHandler,
  UseRouteEnterOptions,
} from "../../src/functions/injectRouteEnter";
import type { Router } from "@real-router/core";

const routes = [
  { name: "test", path: "/" },
  { name: "home", path: "/home" },
  { name: "about", path: "/about" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/list" },
      { name: "view", path: "/:id" },
    ],
  },
];

describe("injectRouteEnter", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes, {
      defaultRoute: "test",
      trailingSlash: "never",
      queryParamsMode: "loose",
    });
    await router.start("/");

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
  });

  afterEach(() => {
    router.stop();
  });

  function setup(handler: RouteEnterHandler, options?: UseRouteEnterOptions) {
    const injector = TestBed.inject(Injector);

    runInInjectionContext(injector, () => {
      injectRouteEnter(handler, options);
    });
  }

  it("does not fire on initial mount when there is no previousRoute", () => {
    const handler = vi.fn();

    setup(handler);
    TestBed.tick();

    expect(handler).not.toHaveBeenCalled();
  });

  it("fires once after a navigation when component is already mounted", async () => {
    const handler = vi.fn();

    setup(handler);

    await router.navigate("about");
    TestBed.tick();

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("about");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("fires again on each subsequent navigation", async () => {
    const handler = vi.fn();

    setup(handler);

    await router.navigate("about");
    TestBed.tick();
    await router.navigate("home");
    TestBed.tick();
    await router.navigate("users.list");
    TestBed.tick();

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[0][0].route.name).toBe("about");
    expect(handler.mock.calls[1][0].route.name).toBe("home");
    expect(handler.mock.calls[2][0].route.name).toBe("users.list");
  });

  it("provides previousRoute and route at mount time", async () => {
    const handler = vi.fn();

    setup(handler);

    await router.navigate("users.view", { id: "42" });
    TestBed.tick();

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("users.view");
    expect(ctx.route.params.id).toBe("42");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    setup(handler);

    await router.navigate("users.view", { id: "1" });
    TestBed.tick();

    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });
    TestBed.tick();

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();

    setup(handler, { skipSameRoute: false });

    await router.navigate("users.view", { id: "1" });
    TestBed.tick();
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });
    TestBed.tick();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // Gotcha #1 from CLAUDE.md ("injectRouteExit / injectRouteEnter Handler Is
  // Captured At Injection Time") — pins the contract for `injectRouteEnter`:
  // handler ref captured once at injection time, swapping it later has no
  // effect. Closes review-2026-05-10 §4 #1 ⚠️ Partial gap (sister test).
  it("captures handler at injection time — swapping a ref after init has no effect", async () => {
    const originalHandler = vi.fn();
    const swappedHandler = vi.fn();

    @Component({ template: "" })
    class HostComponent {
      handler: () => void = originalHandler;

      readonly attached = (() => {
        injectRouteEnter(this.handler);

        return true;
      })();
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [HostComponent],
    });
    const fixture = TestBed.createComponent(HostComponent);

    fixture.detectChanges();
    fixture.componentInstance.handler = swappedHandler;

    await router.navigate("about");
    TestBed.tick();

    expect(originalHandler).toHaveBeenCalledTimes(1);
    expect(swappedHandler).not.toHaveBeenCalled();
  });

  // Sister test for the escape hatch: read class state INSIDE the handler.
  it("captured handler reads latest instance state inside its body across navigations", async () => {
    const observed: (string | null)[] = [];

    @Component({ template: "" })
    class HostComponent {
      readonly attached = (() => {
        injectRouteEnter(() => {
          observed.push(this.state);
        });

        return true;
      })();

      private state: string | null = "initial";

      setState(value: string | null): void {
        this.state = value;
      }
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [HostComponent],
    });
    const fixture = TestBed.createComponent(HostComponent);

    fixture.detectChanges();

    await router.navigate("about");
    TestBed.tick();
    fixture.componentInstance.setState("changed");
    await router.navigate("home");
    TestBed.tick();
    fixture.componentInstance.setState("changed-again");
    await router.navigate("users.list");
    TestBed.tick();

    expect(observed).toStrictEqual(["initial", "changed", "changed-again"]);
  });

  it("does not fire on injection context destroy", async () => {
    const handler = vi.fn();

    @Component({ template: "" })
    class HostComponent {
      readonly attached = (() => {
        injectRouteEnter(handler);

        return true;
      })();
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [HostComponent],
    });
    const fixture = TestBed.createComponent(HostComponent);

    fixture.detectChanges();
    fixture.destroy();

    await router.navigate("about");

    expect(handler).not.toHaveBeenCalled();
  });
});
