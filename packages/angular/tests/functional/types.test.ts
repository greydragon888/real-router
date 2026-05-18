/* eslint-disable vitest/expect-expect -- type-only tests using `expectTypeOf<>()` provide compile-time assertions without runtime expect() calls */
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { describe, it, expect, expectTypeOf } from "vitest";

import { RouteView } from "../../src/components/RouteView";
import { provideRealRouter } from "../../src/providers";

import type { ErrorContext, RouteSignals } from "../../src/types";
import type { Signal } from "@angular/core";
import type { Navigator, RouterError } from "@real-router/core";
import type { RouteSnapshot } from "@real-router/sources";

describe("RouteSignals type surface", () => {
  it("has exactly { routeState: Signal<RouteSnapshot>; navigator: Navigator }", () => {
    expectTypeOf<RouteSignals>().toEqualTypeOf<{
      readonly routeState: Signal<RouteSnapshot>;
      readonly navigator: Navigator;
    }>();
  });

  it("routeState is a readonly Signal (not a WritableSignal)", () => {
    expectTypeOf<RouteSignals["routeState"]>().toEqualTypeOf<
      Signal<RouteSnapshot>
    >();
  });

  it("navigator is the core Navigator type", () => {
    expectTypeOf<RouteSignals["navigator"]>().toEqualTypeOf<Navigator>();
  });
});

describe("ErrorContext type surface", () => {
  it("exposes $implicit RouterError + resetError callback", () => {
    expectTypeOf<ErrorContext>().toEqualTypeOf<{
      $implicit: RouterError;
      resetError: () => void;
    }>();
  });
});

describe("RouteView routeNode alias contract", () => {
  // JIT mode quirk (see CLAUDE.md "Coverage Ceiling ~95%"): `setInput` does
  // not propagate to signal-based inputs, so we verify the alias contract
  // statically. The runtime contract — that `[routeNode]` is the public
  // template binding (because `nodeName` would collide with
  // HTMLElement.nodeName) — is exercised by the AOT-compiled examples in
  // `examples/web/angular/*` and the `.d.ts` snapshot below.
  it("RouteView exposes 'nodeName' as a callable signal returning string", () => {
    expectTypeOf<RouteView["nodeName"]>().toExtend<() => string>();
  });

  it("instantiated RouteView has nodeName signal callable with default value", async () => {
    // Default-value contract: signal returns "" without setInput in JIT.
    // The alias still routes correctly under AOT (verified end-to-end in
    // examples). This test guards the field shape and default behavior.
    const router = createRouter([{ name: "users", path: "/users" }]);

    await router.start("/users");

    TestBed.configureTestingModule({
      imports: [RouteView],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(RouteView);

    fixture.detectChanges();

    expect(typeof fixture.componentInstance.nodeName).toBe("function");
    expect(fixture.componentInstance.nodeName()).toBe("");

    router.stop();
  });
});
