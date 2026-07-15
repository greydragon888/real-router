import { Component, signal, effect } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { createActiveRouteSource } from "@real-router/sources";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { injectRouter } from "../../src/functions/injectRouter";
import { createStableParams } from "../../src/internal/createStableParams";
import { subscribeSourceToSignal } from "../../src/internal/subscribeSourceToSignal";
import { provideRealRouter } from "../../src/providers";

import type { Params } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
];

// `RealLink` / `RealLinkActive` create their active-route source inside a
// constructor `effect()` that reads `routeParams()`. Angular re-allocates an
// inline `[routeParams]="{ id: 1 }"` literal on every change detection, so a
// raw read changes identity each navigation even when the param CONTENT is
// unchanged — re-running the effect, re-creating the cached source
// (`canonicalJson` cache-key churn + sub/unsub). `createStableParams` collapses
// structurally-equal params to a reference-stable value so the effect bails.
//
// Signal inputs cannot be driven from JIT TestBed (the documented 94% coverage
// ceiling — `setInput` does not propagate to signal inputs), so these tests
// drive a plain `signal<Params>()`. The effect-re-run mechanism is identical
// for `input()` and `signal()` (#988 evidence).
describe("createStableParams", () => {
  describe("reference identity (pure)", () => {
    it("returns a reference-stable value while shallow content is unchanged", () => {
      const params = signal<Params>({ id: 1 });
      const stable = createStableParams(() => params());
      const first = stable();

      params.set({ id: 1 }); // fresh literal, same content

      expect(stable()).toBe(first);
    });

    it("returns the new reference when shallow content changes", () => {
      const params = signal<Params>({ id: 1 });
      const stable = createStableParams(() => params());
      const first = stable();
      const next: Params = { id: 2 };

      params.set(next);

      expect(stable()).toBe(next);
      expect(stable()).not.toBe(first);
    });

    it("is order-insensitive (mirrors shallowEqual contract)", () => {
      const params = signal<Params>({ a: 1, b: 2 });
      const stable = createStableParams(() => params());
      const first = stable();

      params.set({ b: 2, a: 1 }); // same content, different key order

      expect(stable()).toBe(first);
    });
  });

  describe("source re-creation (the #988 lever)", () => {
    let router: ReturnType<typeof createRouter>;

    // Single host shared by both cases: replicates the directives' exact
    // `effect()` + `createActiveRouteSource` pattern, but reads the stabilized
    // params signal. `recreations` counts source re-creations.
    @Component({ template: "" })
    class Host {
      readonly params = signal<Params>({ id: 1 });
      recreations = 0;
      private readonly router = injectRouter();
      private readonly stableParams = createStableParams(() => this.params());

      constructor() {
        effect((onCleanup) => {
          const source = createActiveRouteSource(
            this.router,
            "users",
            this.stableParams(),
            { strict: false, ignoreQueryParams: true },
          );

          this.recreations++;
          onCleanup(subscribeSourceToSignal(source, () => {}));
        });
      }
    }

    beforeEach(async () => {
      router = createRouter(routes);
      await router.start("/");
      TestBed.configureTestingModule({
        providers: [provideRealRouter(router)],
      });
    });

    afterEach(() => {
      router.stop();
    });

    it("does NOT re-create the active-route source for fresh-equal param literals", async () => {
      const fixture = TestBed.createComponent(Host);

      fixture.detectChanges(); // initial effect run

      for (let i = 0; i < 10; i++) {
        fixture.componentInstance.params.set({ id: 1 }); // fresh literal
        fixture.detectChanges();
        await fixture.whenStable();
      }

      expect(fixture.componentInstance.recreations).toBe(1);
    });

    it("re-creates the active-route source when param content actually changes", async () => {
      const fixture = TestBed.createComponent(Host);

      fixture.detectChanges(); // initial → 1
      fixture.componentInstance.params.set({ id: 2 }); // real change
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.componentInstance.recreations).toBe(2);
    });
  });
});
