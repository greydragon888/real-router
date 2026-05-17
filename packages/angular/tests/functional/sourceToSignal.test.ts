import { Component, Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { provideRealRouter } from "../../src/providers";
import { sourceToSignal } from "../../src/sourceToSignal.js";

import type { Router } from "@real-router/core";
import type { RouterSource } from "@real-router/sources";

function createMockSource<T>(initial: T): RouterSource<T> & {
  emit: (value: T) => void;
  readonly _destroyed: boolean;
} {
  let current = initial;
  let listener: (() => void) | null = null;
  let destroyed = false;

  return {
    getSnapshot: () => current,
    subscribe: (fn: () => void) => {
      listener = fn;

      return () => {
        listener = null;
      };
    },
    destroy: () => {
      destroyed = true;
    },
    emit: (value: T) => {
      current = value;
      listener?.();
    },
    get _destroyed() {
      return destroyed;
    },
  } as RouterSource<T> & {
    emit: (value: T) => void;
    readonly _destroyed: boolean;
  };
}

describe("sourceToSignal", () => {
  it("throws when called outside injection context", () => {
    const source = createMockSource(42);

    expect(() => sourceToSignal(source)).toThrow(/injection context/);
  });

  it("reads initial snapshot", () => {
    TestBed.configureTestingModule({});
    const injector = TestBed.inject(Injector);

    const source = createMockSource(42);

    let sig: ReturnType<typeof sourceToSignal<number>> | undefined;

    runInInjectionContext(injector, () => {
      sig = sourceToSignal(source);
    });

    expect(sig!()).toBe(42);
  });

  it("updates signal when source emits", () => {
    TestBed.configureTestingModule({});
    const injector = TestBed.inject(Injector);
    const source = createMockSource("hello");

    let sig: ReturnType<typeof sourceToSignal<string>> | undefined;

    runInInjectionContext(injector, () => {
      sig = sourceToSignal(source);
    });

    expect(sig!()).toBe("hello");

    source.emit("world");

    expect(sig!()).toBe("world");
  });

  it("handles rapid sequential emissions", () => {
    TestBed.configureTestingModule({});
    const injector = TestBed.inject(Injector);
    const source = createMockSource(0);

    let sig: ReturnType<typeof sourceToSignal<number>> | undefined;

    runInInjectionContext(injector, () => {
      sig = sourceToSignal(source);
    });

    for (let i = 1; i <= 100; i++) {
      source.emit(i);
    }

    expect(sig!()).toBe(100);
  });

  it("does not update signal after destroy", () => {
    @Component({ template: "" })
    class TestDestroyComponent {
      source = createMockSource(0);
      sig = sourceToSignal(this.source);
    }

    TestBed.configureTestingModule({ imports: [TestDestroyComponent] });
    const fixture = TestBed.createComponent(TestDestroyComponent);
    const component = fixture.componentInstance;

    expect(component.sig()).toBe(0);

    component.source.emit(1);

    expect(component.sig()).toBe(1);

    fixture.destroy();

    component.source.emit(999);

    expect(component.sig()).toBe(1);
  });

  it("cleans up on DestroyRef destruction", () => {
    @Component({ template: "" })
    class TestComponent {
      source = createMockSource(0);
      sig = sourceToSignal(this.source);
    }

    TestBed.configureTestingModule({ imports: [TestComponent] });
    const fixture = TestBed.createComponent(TestComponent);
    const component = fixture.componentInstance;

    expect(component.sig()).toBe(0);

    component.source.emit(1);

    expect(component.sig()).toBe(1);

    fixture.destroy();

    expect(component.source._destroyed).toBe(true);
  });

  // Closes review-2026-05-10 §5.6 ⛔ edge-cases (4 tests: 1 MED + 3 LOW).

  // MED: Source emits during signal.set() (reentrancy). The bridge calls
  // `sig.set(source.getSnapshot())` inside the subscribe callback. If
  // getSnapshot itself emits synchronously (rare, but possible via custom
  // sources), it could trigger `signal.set()` while a previous set is in
  // flight — Angular throws `NG0600: WriteToSignalsNotAllowedError` when
  // a signal is written inside a computed. The bridge writes from a
  // top-level subscribe callback, NOT a computed; reentrancy here is
  // benign because each `set` completes synchronously before returning.
  // This test pins that safety contract.
  it("source re-emits synchronously during signal update → no WriteToSignalsNotAllowedError", () => {
    let listener: (() => void) | null = null;
    let value = 0;
    let reentered = false;

    const source = {
      getSnapshot: () => value,
      subscribe: (fn: () => void) => {
        listener = fn;

        return () => {
          listener = null;
        };
      },
      destroy: () => {},
    } as unknown as RouterSource<number>;

    @Component({ template: "" })
    class Reentrant {
      sig = sourceToSignal(source);
    }

    TestBed.configureTestingModule({ imports: [Reentrant] });
    const fixture = TestBed.createComponent(Reentrant);

    expect(fixture.componentInstance.sig()).toBe(0);

    // Simulate a synchronous emit during another emit: first emit's
    // subscribe callback re-emits while still on the call stack.
    expect(() => {
      value = 1;
      // Trigger first emit; from inside listener, re-emit (which calls
      // listener again). Guard against infinite recursion via `reentered`.
      const wrapped = listener!;

      listener = () => {
        wrapped();
        if (!reentered) {
          reentered = true;
          value = 2;
          wrapped();
        }
      };

      listener();
    }).not.toThrow();

    // Final signal value reflects the deepest synchronous emit (2).
    expect(fixture.componentInstance.sig()).toBe(2);
    expect(reentered).toBe(true);

    fixture.destroy();
  });

  // LOW: source subscribe callback fires synchronously DURING the
  // `source.subscribe(...)` call inside `sourceToSignal`. Verify no
  // ordering issue: even if the source synchronously triggers its
  // listener as part of subscription wiring, the signal is already
  // initialised with `source.getSnapshot()` so the second snapshot read
  // succeeds.
  it("source synchronously fires listener during subscribe() call → signal updates safely", () => {
    let value = 100;
    let listener: (() => void) | null = null;

    const source = {
      getSnapshot: () => value,
      subscribe: (fn: () => void) => {
        listener = fn;
        // Sync re-emit during subscribe wiring.
        value = 200;
        fn();

        return () => {
          listener = null;
        };
      },
      destroy: () => {},
    } as unknown as RouterSource<number>;

    @Component({ template: "" })
    class Sync {
      sig = sourceToSignal(source);
    }

    TestBed.configureTestingModule({ imports: [Sync] });
    const fixture = TestBed.createComponent(Sync);

    // Initial snapshot was 100, but subscribe's sync re-emit jumped it
    // to 200 before the consumer can read.
    expect(fixture.componentInstance.sig()).toBe(200);
    expect(listener).not.toBeNull();

    fixture.destroy();
  });

  // LOW: Initial value `undefined` — generic `<T>` allows `undefined` as
  // a valid signal value. Verify signal()/sig.set(undefined) works.
  it("initial snapshot === undefined → signal returns undefined (no error)", () => {
    const source = createMockSource<string | undefined>(undefined);

    @Component({ template: "" })
    class UndefinedHost {
      sig = sourceToSignal(source);
    }

    TestBed.configureTestingModule({ imports: [UndefinedHost] });
    const fixture = TestBed.createComponent(UndefinedHost);

    expect(fixture.componentInstance.sig()).toBeUndefined();

    source.emit("now-defined");

    expect(fixture.componentInstance.sig()).toBe("now-defined");

    source.emit(undefined);

    expect(fixture.componentInstance.sig()).toBeUndefined();

    fixture.destroy();
  });

  // LOW: Destroy invoked twice — Angular's DestroyRef is one-shot
  // (onDestroy callbacks fire exactly once). Verify the bridge's
  // try/finally cleanup (added in §8.1 sourceToSignal change) is
  // idempotent.
  it("DestroyRef fires once even if fixture.destroy() called twice (one-shot semantics)", () => {
    const source = createMockSource(0);

    @Component({ template: "" })
    class Host {
      sig = sourceToSignal(source);
    }

    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);

    expect(source._destroyed).toBe(false);

    fixture.destroy();

    expect(source._destroyed).toBe(true);

    // Second destroy is a no-op — DestroyRef hooks already fired.
    expect(() => {
      fixture.destroy();
    }).not.toThrow();
  });
});

// Gotcha #7 from CLAUDE.md ("`sourceToSignal.destroy()` is safe for shared
// cached sources") — closes review-2026-05-10 §4 #7 ⚠️ Partial gap.
//
// The unit test already asserts that mock-source `destroy()` is invoked on
// teardown; the documented contract however covers the OPPOSITE behaviour
// when the source is a CACHED instance from `@real-router/sources`: such a
// source's `destroy()` is a no-op so multiple consumers share one router
// subscription safely. This integration suite exercises that pact with the
// real `createRouteNodeSource` cache via `sourceToSignal` in two consumers.
describe("sourceToSignal — shared cached sources (gotcha #7 integration)", () => {
  const routes = [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        { name: "view", path: "/:id" },
      ],
    },
  ];
  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes, { defaultRoute: "home" });
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("two consumers of the same cached source share one router subscription", () => {
    // First call seeds the WeakMap entry; the second must return the same
    // wrapper. If the cache regressed (e.g. `WeakMap` key changed), the two
    // refs would diverge.
    const a = createRouteNodeSource(router, "users");
    const b = createRouteNodeSource(router, "users");

    expect(a).toBe(b);
  });

  it("destroying one consumer keeps the cached source alive for the other", async () => {
    @Component({ template: "" })
    class ConsumerA {
      sig = sourceToSignal(createRouteNodeSource(router, "users"));
    }

    @Component({ template: "" })
    class ConsumerB {
      sig = sourceToSignal(createRouteNodeSource(router, "users"));
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [ConsumerA, ConsumerB],
    });

    const fixtureA = TestBed.createComponent(ConsumerA);
    const fixtureB = TestBed.createComponent(ConsumerB);

    fixtureA.detectChanges();
    fixtureB.detectChanges();

    // Initial snapshot — neither consumer is on `users.*`, so route is
    // undefined (RouteNodeSnapshot.route is nullable when the node is
    // inactive; the snapshot uses `undefined`, not `null`).
    expect(fixtureA.componentInstance.sig().route).toBeUndefined();
    expect(fixtureB.componentInstance.sig().route).toBeUndefined();

    // Navigate INTO the node — both consumers observe the same snapshot.
    await router.navigate("users.list");

    expect(fixtureA.componentInstance.sig().route?.name).toBe("users.list");
    expect(fixtureB.componentInstance.sig().route?.name).toBe("users.list");

    // Destroy consumer A — the cached source's `destroy()` is no-op, so the
    // shared router subscription survives for consumer B.
    fixtureA.destroy();

    await router.navigate("users.view", { id: "42" });

    // Consumer B still updates after A's teardown.
    expect(fixtureB.componentInstance.sig().route?.name).toBe("users.view");
    expect(fixtureB.componentInstance.sig().route?.params).toStrictEqual({
      id: "42",
    });

    fixtureB.destroy();

    // After the last consumer leaves, the source instance survives (lazy
    // disconnect inside BaseSource — re-using it from a fresh consumer
    // simply re-subscribes). Verify that retrieving the source again
    // returns the SAME wrapper from cache — the WeakMap entry persists for
    // the lifetime of the router.
    const after = createRouteNodeSource(router, "users");

    expect(after).toBe(createRouteNodeSource(router, "users"));
  });

  it("destroy() on the cached source wrapper is a no-op (does not break other consumers)", async () => {
    const source = createRouteNodeSource(router, "users");

    @Component({ template: "" })
    class Consumer {
      sig = sourceToSignal(createRouteNodeSource(router, "users"));
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [Consumer],
    });

    const fixture = TestBed.createComponent(Consumer);

    fixture.detectChanges();

    // Manual destroy on the cached wrapper — must NOT impact downstream
    // consumers. Per `@real-router/sources` contract: the wrapper's
    // `destroy()` is a no-op, the underlying source lives with the router.
    source.destroy();

    await router.navigate("users.list");

    expect(fixture.componentInstance.sig().route?.name).toBe("users.list");

    fixture.destroy();
  });

  it("fresh consumer after all previous consumers tore down still sees current state", async () => {
    @Component({ template: "" })
    class FirstConsumer {
      sig = sourceToSignal(createRouteNodeSource(router, "users"));
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [FirstConsumer],
    });

    const first = TestBed.createComponent(FirstConsumer);

    first.detectChanges();

    await router.navigate("users.list");

    expect(first.componentInstance.sig().route?.name).toBe("users.list");

    // Teardown the only consumer. The cached source's `BaseSource` enters
    // its disconnect path (last-listener removed), but the wrapper stays
    // in the WeakMap → future consumers reuse the same wrapper.
    first.destroy();

    // Navigate while no consumer is mounted. The cached source's underlying
    // listener was disconnected from the router (lazy-connect pattern), so
    // the next snapshot must still be read from the router on subscribe.
    await router.navigate("users.view", { id: "99" });

    TestBed.resetTestingModule();

    @Component({ template: "" })
    class SecondConsumer {
      sig = sourceToSignal(createRouteNodeSource(router, "users"));
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [SecondConsumer],
    });

    const second = TestBed.createComponent(SecondConsumer);

    second.detectChanges();

    // The fresh consumer sees the CURRENT router state, even though no
    // consumer was subscribed during the intermediate navigation.
    expect(second.componentInstance.sig().route?.name).toBe("users.view");
    expect(second.componentInstance.sig().route?.params).toStrictEqual({
      id: "99",
    });

    second.destroy();
  });
});
