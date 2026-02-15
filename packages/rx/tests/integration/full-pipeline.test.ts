import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  state$,
  events$,
  map,
  filter,
  distinctUntilChanged,
  RxObservable,
} from "../../src";

import type { Router } from "@real-router/core";

describe("@real-router/rx - Integration Tests", () => {
  let router: Router;

  const routes = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "contact", path: "/contact" },
    { name: "admin", path: "/admin" },
  ];

  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  describe("Full operator pipeline", () => {
    it("should work with map, filter, distinctUntilChanged pipeline", async () => {
      const values: string[] = [];

      state$(router)
        .pipe(
          map(({ route }) => route.name),
          filter((name) => name !== "home"),
          distinctUntilChanged(),
        )
        .subscribe({ next: (v) => values.push(v) });

      await router.start("/");
      await router.navigate("about");
      await router.navigate("about").catch(() => {}); // SAME_STATES
      await router.navigate("contact");
      await router.navigate("contact").catch(() => {}); // SAME_STATES
      await router.navigate("about");

      expect(values).toStrictEqual(["about", "contact", "about"]);
    });

    it("should compose operators correctly with async navigation", async () => {
      const values: string[] = [];

      state$(router)
        .pipe(
          map(({ route }) => route.path),
          filter((path) => path !== "/"),
        )
        .subscribe({ next: (v) => values.push(v) });

      await router.start("/");
      await router.navigate("about");
      await router.navigate("contact");

      expect(values).toStrictEqual(["/about", "/contact"]);
    });

    it("should handle unsubscribe during pipeline", async () => {
      const values: string[] = [];

      const subscription = state$(router)
        .pipe(
          map(({ route }) => route.name),
          filter((name) => name !== "home"),
        )
        .subscribe({ next: (v) => values.push(v) });

      await router.start("/");
      await router.navigate("about");

      subscription.unsubscribe();

      await router.navigate("contact");

      expect(values).toStrictEqual(["about"]);
    });

    it("should isolate errors in operator functions", async () => {
      const errors: unknown[] = [];
      const values: string[] = [];

      state$(router)
        .pipe(
          map(({ route }) => {
            if (route.name === "contact") {
              throw new Error("map error");
            }

            return route.name;
          }),
        )
        .subscribe({
          next: (v) => values.push(v),
          error: (err) => errors.push(err),
        });

      await router.start("/");
      await router.navigate("about");
      await router.navigate("contact");

      expect(values).toStrictEqual(["home", "about"]);
      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("map error");
    });
  });

  describe("Event filtering", () => {
    it("should filter events by TRANSITION_ERROR type", async () => {
      const errors: any[] = [];

      router.addActivateGuard("admin", () => () => false);

      events$(router)
        .pipe(filter((e) => e.type === "TRANSITION_ERROR"))
        .subscribe({ next: (e) => errors.push(e) });

      await router.start("/");
      await router.navigate("about");

      try {
        await router.navigate("admin");
      } catch {
        // Expected: admin route blocked by guard
      }

      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe("TRANSITION_ERROR");
      expect(errors[0].toState.name).toBe("admin");
    });

    it("should filter events by TRANSITION_SUCCESS type", async () => {
      const successes: any[] = [];

      events$(router)
        .pipe(filter((e) => e.type === "TRANSITION_SUCCESS"))
        .subscribe({ next: (e) => successes.push(e) });

      await router.start("/");
      await router.navigate("about");
      await router.navigate("contact");

      expect(successes).toHaveLength(3);
      expect(successes[0].toState.name).toBe("home");
      expect(successes[1].toState.name).toBe("about");
      expect(successes[2].toState.name).toBe("contact");
    });

    it("should handle multiple event type filters", async () => {
      const events: string[] = [];

      events$(router)
        .pipe(
          filter((e) => e.type === "ROUTER_START" || e.type === "ROUTER_STOP"),
          map((e) => e.type),
        )
        .subscribe({ next: (type) => events.push(type) });

      await router.start("/");
      router.stop();

      expect(events).toStrictEqual(["ROUTER_START", "ROUTER_STOP"]);
    });

    it("should emit TRANSITION_CANCEL when navigation is cancelled", async () => {
      const cancelEvents: any[] = [];
      let resolveDelay: (() => void) | undefined;

      // Add a slow canActivate that can be cancelled
      router.addActivateGuard("about", () => async () => {
        await new Promise<void>((resolve) => {
          resolveDelay = resolve;
        });

        return true;
      });

      events$(router)
        .pipe(filter((e) => e.type === "TRANSITION_CANCEL"))
        .subscribe({ next: (e) => cancelEvents.push(e) });

      await router.start("/");

      // Start navigation to about (will be slow, don't await)
      router.navigate("about").catch(() => {});

      // Wait a bit then stop the router, cancelling the about navigation
      await new Promise((resolve) => setTimeout(resolve, 10));
      router.stop();

      // Resolve the delay so the guard completes and detects cancellation
      resolveDelay?.();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(cancelEvents).toHaveLength(1);
      expect(cancelEvents[0].type).toBe("TRANSITION_CANCEL");
      expect(cancelEvents[0].toState.name).toBe("about");
    });
  });

  describe("Async iteration", () => {
    it("should support async iteration with break", async () => {
      const values: string[] = [];

      const iteratorPromise = (async () => {
        for await (const state of state$(router)) {
          values.push(state.route.name);
          if (values.length === 2) {
            break;
          }
        }
      })();

      await router.start("/");
      await new Promise((resolve) => setTimeout(resolve, 10));
      await router.navigate("about");

      await iteratorPromise;

      expect(values).toHaveLength(2);
      expect(values[0]).toBe("home");
      expect(values[1]).toBe("about");
    });

    it("should use latest-value semantics in async iteration", async () => {
      const values: string[] = [];
      let iterationCount = 0;

      const iteratorPromise = (async () => {
        for await (const state of state$(router)) {
          iterationCount++;
          values.push(state.route.name);
          if (iterationCount >= 2) {
            break;
          }
        }
      })();

      await router.start("/");
      await new Promise((resolve) => setTimeout(resolve, 10));
      await router.navigate("about");
      await new Promise((resolve) => setTimeout(resolve, 10));

      await iteratorPromise;

      expect(values).toHaveLength(2);
      expect(values[0]).toBe("home");
      expect(values[1]).toBe("about");
    });

    it("should cleanup subscription on async iteration break", async () => {
      let teardownCalled = false;

      const observable = state$(router).pipe(
        map(({ route }) => {
          return route.name;
        }),
      );

      const wrapped = new RxObservable<string>((observer) => {
        const sub = observable.subscribe(observer);

        return () => {
          teardownCalled = true;
          sub.unsubscribe();
        };
      });

      const iteratorPromise = (async () => {
        // eslint-disable-next-line sonarjs/no-unused-vars
        for await (const _value of wrapped) {
          break;
        }
      })();

      await router.start("/");
      await iteratorPromise;

      expect(teardownCalled).toBe(true);
    });
  });

  describe("state$ options", () => {
    it("should not emit initial state when replay: false", async () => {
      const values: string[] = [];

      await router.start("/");

      state$(router, { replay: false })
        .pipe(map(({ route }) => route.name))
        .subscribe({ next: (v) => values.push(v) });

      // Wait to ensure no replay happens
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(values).toStrictEqual([]);

      await router.navigate("about");

      expect(values).toStrictEqual(["about"]);
    });

    it("should emit initial state when replay: true (default)", async () => {
      const values: string[] = [];

      await router.start("/");

      state$(router)
        .pipe(map(({ route }) => route.name))
        .subscribe({ next: (v) => values.push(v) });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(values).toStrictEqual(["home"]);
    });
  });

  describe("AbortSignal integration", () => {
    it("should auto-unsubscribe when AbortSignal aborts", async () => {
      const controller = new AbortController();
      const values: string[] = [];

      state$(router)
        .pipe(map(({ route }) => route.name))
        .subscribe(
          { next: (v) => values.push(v) },
          { signal: controller.signal },
        );

      await router.start("/");
      await router.navigate("about");

      controller.abort();

      await router.navigate("contact");

      expect(values).toStrictEqual(["home", "about"]);
    });

    it("should work with AbortSignal and operators", async () => {
      const controller = new AbortController();
      const values: string[] = [];

      state$(router)
        .pipe(
          map(({ route }) => route.name),
          filter((name) => name !== "home"),
          distinctUntilChanged(),
        )
        .subscribe(
          { next: (v) => values.push(v) },
          { signal: controller.signal },
        );

      await router.start("/");
      await router.navigate("about");
      await router.navigate("contact");

      controller.abort();

      await router.navigate("about");

      expect(values).toStrictEqual(["about", "contact"]);
    });

    it("should return closed subscription if signal is pre-aborted", async () => {
      const controller = new AbortController();

      controller.abort();

      const subscription = state$(router).subscribe(
        { next: () => {} },
        { signal: controller.signal },
      );

      expect(subscription.closed).toBe(true);

      await router.start("/");
    });

    it("should handle AbortSignal with events$", async () => {
      const controller = new AbortController();
      const events: string[] = [];

      events$(router)
        .pipe(map((e) => e.type))
        .subscribe(
          { next: (type) => events.push(type) },
          { signal: controller.signal },
        );

      await router.start("/");
      await router.navigate("about");

      controller.abort();

      await router.navigate("contact");

      expect(events).toContain("ROUTER_START");
      expect(events).toContain("TRANSITION_SUCCESS");
      expect(
        events.filter((e) => e === "TRANSITION_SUCCESS").length,
      ).toBeLessThan(3);
    });
  });

  describe("Export verification", () => {
    it("should export all required functions and types", async () => {
      const exports = await import("../../src/index.js");

      expect(exports.RxObservable).toBeDefined();
      expect(exports.state$).toBeDefined();
      expect(exports.events$).toBeDefined();
      expect(exports.observable).toBeDefined();
      expect(exports.map).toBeDefined();
      expect(exports.filter).toBeDefined();
      expect(exports.debounceTime).toBeDefined();
      expect(exports.distinctUntilChanged).toBeDefined();
      expect(exports.takeUntil).toBeDefined();
    });

    it("should have correct type exports available", () => {
      type Imports = typeof import("../../src/index");

      const typeCheck: Imports = {} as any;

      expect(typeCheck).toBeDefined();
    });
  });
});
