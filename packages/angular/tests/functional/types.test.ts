import { describe, it, expect, expectTypeOf } from "vitest";

import type { RouteSignals } from "../../src/types";
import type { Signal } from "@angular/core";
import type { Navigator } from "@real-router/core";
import type { RouteSnapshot } from "@real-router/sources";

describe("RouteSignals type surface", () => {
  it("has exactly { routeState: Signal<RouteSnapshot>; navigator: Navigator }", () => {
    expectTypeOf<RouteSignals>().toEqualTypeOf<{
      readonly routeState: Signal<RouteSnapshot>;
      readonly navigator: Navigator;
    }>();

    expect(true).toBe(true);
  });

  it("routeState is a readonly Signal (not a WritableSignal)", () => {
    expectTypeOf<RouteSignals["routeState"]>().toEqualTypeOf<
      Signal<RouteSnapshot>
    >();

    expect(true).toBe(true);
  });

  it("navigator is the core Navigator type", () => {
    expectTypeOf<RouteSignals["navigator"]>().toEqualTypeOf<Navigator>();

    expect(true).toBe(true);
  });
});
