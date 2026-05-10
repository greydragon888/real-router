import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi, cloneRouter } from "@real-router/core/api";

import {
  arbSimpleRouteName,
  arbParamValue,
  arbLoaderData,
  createSsrDataRouter,
  NUM_RUNS,
  ROUTES,
} from "./helpers";
import {
  defer,
  getSsrDataMode,
  invalidate,
  isDeferred,
  ssrDataPluginFactory,
} from "../../src";
import { clearStale, isStale, markStale } from "../../src/shared-ssr";
import { escapeForScript } from "../../src/shared-ssr/deferRegistry";

import type { DataLoaderFactoryMap, SsrMode } from "../../src";
import type { State } from "@real-router/core";

const arbSsrMode: fc.Arbitrary<SsrMode> = fc.constantFrom<SsrMode>(
  "full",
  "data-only",
  "client-only",
);

// =============================================================================
// Loader Invocation: called once per start()
// =============================================================================

describe("loader invocation: loader called exactly once per start()", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader fires once when route matches",
    async (id) => {
      let callCount = 0;

      const { router } = createSsrDataRouter({
        "users.profile": () => async () => {
          callCount++;

          return { id };
        },
      });

      await router.start(`/users/${id}`);

      expect(callCount).toBe(1);

      router.stop();
    },
  );

  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "loader not called when no route matches the loader key",
    async (routeName) => {
      let callCount = 0;

      const { router } = createSsrDataRouter({
        "users.profile": () => async () => {
          callCount++;

          return "data";
        },
      });

      const pathMap: Record<string, string> = {
        home: "/",
        "users.list": "/users",
      };
      const path = pathMap[routeName] ?? `/${routeName}`;

      await router.start(path);

      expect(callCount).toBe(0);

      router.stop();
    },
  );
});

// =============================================================================
// Loader Arguments: receives correct route params
// =============================================================================

describe("loader arguments: loader receives correct route params", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader params.id matches the navigated path param",
    async (id) => {
      let receivedParams: Record<string, unknown> = {};

      const { router } = createSsrDataRouter({
        "users.profile": () => async (params) => {
          receivedParams = { ...params };

          return null;
        },
      });

      await router.start(`/users/${id}`);

      expect(receivedParams.id).toBe(id);

      router.stop();
    },
  );
});

// =============================================================================
// Data Retrieval: state.context.data returns loader result
// =============================================================================

describe("data retrieval: state.context.data returns loader result after start()", () => {
  test.prop([arbLoaderData], { numRuns: NUM_RUNS.thorough })(
    "state.context.data returns exactly the loader resolved value",
    async (data) => {
      const { router } = createSsrDataRouter({
        home: () => async () => data,
      });

      const state = await router.start("/");

      expect(state.context.data).toStrictEqual(data);

      router.stop();
    },
  );

  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "state.context.data is undefined when route has no loader",
    async (routeName) => {
      // Register loader for a route we won't navigate to
      const { router } = createSsrDataRouter({
        "users.profile": () => async () => "should-not-load",
      });

      const pathMap: Record<string, string> = {
        home: "/",
        "users.list": "/users",
      };
      const path = pathMap[routeName] ?? `/${routeName}`;

      const state = await router.start(path);

      expect(state.context.data).toBeUndefined();

      router.stop();
    },
  );
});

// =============================================================================
// Teardown: unsubscribe releases claim
// =============================================================================

describe("teardown: unsubscribe completes without error", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "unsubscribe after start does not throw",
    async (id) => {
      const { router, unsubscribe } = createSsrDataRouter({
        "users.profile": () => async () => ({ id }),
      });

      const state = await router.start(`/users/${id}`);

      expect(state.context.data).toStrictEqual({ id });

      unsubscribe();

      router.stop();
    },
  );

  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "double unsubscribe does not throw",
    async (id) => {
      const { router, unsubscribe } = createSsrDataRouter({
        "users.profile": () => async () => ({ id }),
      });

      await router.start(`/users/${id}`);
      unsubscribe();

      expect(() => {
        unsubscribe();
      }).not.toThrow();

      router.stop();
    },
  );

  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "namespace claim is re-claimable after unsubscribe",
    async (id) => {
      const { router, unsubscribe } = createSsrDataRouter({
        "users.profile": () => async () => ({ id }),
      });

      await router.start(`/users/${id}`);
      unsubscribe();

      expect(() =>
        getPluginApi(router).claimContextNamespace("data"),
      ).not.toThrow();

      router.stop();
    },
  );
});

// =============================================================================
// Prototype safety: inherited properties ignored
// =============================================================================

describe("prototype safety: inherited loader keys are not compiled", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "prototype-inherited factory is never called",
    async (paramValue) => {
      let protoCalled = false;
      const proto = {
        "users.profile": () => {
          protoCalled = true;

          return () => Promise.resolve("hacked");
        },
      };
      const loaders = Object.create(proto) as DataLoaderFactoryMap;

      const { router } = createSsrDataRouter(loaders);
      const state = await router.start(`/users/${paramValue}`);

      expect(protoCalled).toBe(false);
      expect(state.context.data).toBeUndefined();

      router.stop();
    },
  );
});

// =============================================================================
// Per-instance isolation: independent data across clones
// =============================================================================

describe("isolation: cloned routers have independent data", () => {
  test.prop([arbParamValue, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "two clones with same factory produce independent data",
    async (id1, id2) => {
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const loaders: DataLoaderFactoryMap = {
        "users.profile": () => async (params) => ({ userId: params.id }),
      };

      const clone1 = cloneRouter(base);

      clone1.usePlugin(ssrDataPluginFactory(loaders));
      const state1 = await clone1.start(`/users/${id1}`);

      const clone2 = cloneRouter(base);

      clone2.usePlugin(ssrDataPluginFactory(loaders));
      const state2 = await clone2.start(`/users/${id2}`);

      expect(state1.context.data).toStrictEqual({ userId: id1 });
      expect(state2.context.data).toStrictEqual({ userId: id2 });

      clone1.dispose();
      clone2.dispose();
    },
  );
});

// =============================================================================
// Factory invocation: factory called once per usePlugin, not per start
// =============================================================================

describe("factory invocation: factory called exactly once per usePlugin", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "factory function executes once regardless of start count",
    async (id) => {
      let factoryCallCount = 0;

      const { router } = createSsrDataRouter({
        "users.profile": () => {
          factoryCallCount++;

          return async () => ({ id });
        },
      });

      await router.start(`/users/${id}`);

      expect(factoryCallCount).toBe(1);

      router.stop();
    },
  );
});

// =============================================================================
// Validation: rejects invalid loaders
// =============================================================================

describe("validation: non-object inputs rejected", () => {
  const arbNonObject = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.string(),
    fc.integer(),
    fc.boolean(),
  );

  test.prop([arbNonObject], { numRuns: NUM_RUNS.standard })(
    "non-object input throws TypeError",
    (input) => {
      expect(() =>
        ssrDataPluginFactory(input as unknown as DataLoaderFactoryMap),
      ).toThrow(TypeError);
    },
  );
});

describe("validation: non-function loader values rejected", () => {
  const arbNonFunctionValue = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  );

  test.prop([fc.string({ minLength: 1, maxLength: 10 }), arbNonFunctionValue], {
    numRuns: NUM_RUNS.standard,
  })("object with non-function value throws TypeError", (key, value) => {
    expect(() =>
      ssrDataPluginFactory({ [key]: value } as unknown as DataLoaderFactoryMap),
    ).toThrow(TypeError);
  });
});

// =============================================================================
// SSR Mode invariants
// =============================================================================

describe("ssr mode: getSsrDataMode reflects the resolved mode", () => {
  test.prop([arbSsrMode, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "string-form ssr → getSsrDataMode returns the same mode",
    async (mode, id) => {
      const { router } = createSsrDataRouter({
        "users.profile": { ssr: mode, loader: () => async () => ({ id }) },
      });

      const state = await router.start(`/users/${id}`);

      expect(getSsrDataMode(state)).toBe(mode);

      router.stop();
    },
  );
});

describe("ssr mode: client-only skips the loader", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader is never invoked when mode='client-only'",
    async (id) => {
      let callCount = 0;

      const { router } = createSsrDataRouter({
        "users.profile": {
          ssr: "client-only",
          loader: () => () => {
            callCount++;

            return null;
          },
        },
      });

      const state = await router.start(`/users/${id}`);

      expect(callCount).toBe(0);
      expect(state.context.data).toBeUndefined();
      expect(getSsrDataMode(state)).toBe("client-only");

      router.stop();
    },
  );
});

describe("ssr mode: function-form resolver runs once per start()", () => {
  test.prop([arbSsrMode, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "resolver invoked exactly once with the resolved state",
    async (mode, id) => {
      let resolverCalls = 0;

      const { router } = createSsrDataRouter({
        "users.profile": {
          ssr: () => {
            resolverCalls++;

            return mode;
          },
          loader: () => async () => ({ id }),
        },
      });

      await router.start(`/users/${id}`);

      expect(resolverCalls).toBe(1);

      router.stop();
    },
  );
});

describe("ssr mode: short form === { loader }", () => {
  test.prop([arbLoaderData, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "short-form factory and { loader: factory } produce identical data + mode='full'",
    async (data, id) => {
      const baseShort = createRouter(ROUTES, { defaultRoute: "home" });
      const baseObject = createRouter(ROUTES, { defaultRoute: "home" });

      baseShort.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => async () => data,
        }),
      );

      baseObject.usePlugin(
        ssrDataPluginFactory({
          "users.profile": { loader: () => async () => data },
        }),
      );

      const stateShort = await baseShort.start(`/users/${id}`);
      const stateObject = await baseObject.start(`/users/${id}`);

      expect(stateShort.context.data).toStrictEqual(stateObject.context.data);
      expect(getSsrDataMode(stateShort)).toBe("full");
      expect(getSsrDataMode(stateObject)).toBe("full");

      baseShort.stop();
      baseObject.stop();
    },
  );
});

// =============================================================================
// escapeForScript: roundtrip + HTML safety (security-critical pure function)
// =============================================================================
//
// `escapeForScript(s)` is the bedrock of the inline-settle wire format —
// every deferred key and value goes through it before landing in
// `<script>__rrDefer__("key","value")</script>`. Two invariants must hold
// for *any* string input:
//
//   1. Roundtrip: JSON.parse(escapeForScript(s)) === s
//      (the JS string literal must decode back to the original string)
//
//   2. HTML safety: the result contains no character sequence that the
//      raw HTML parser would interpret as a script-tag terminator,
//      script-tag opener, comment-opener, or U+2028/U+2029 line-terminator
//      that legacy JS parsers treat as line breaks inside string literals.
//
// fast-check shrinks aggressively here — `numRuns: 1000` because this is a
// security-critical surface and the cost is <100ms on a pure string fn.

describe("escapeForScript: pure-function security invariants", () => {
  test.prop([fc.string()], { numRuns: 1000 })(
    "roundtrip: JSON.parse(escapeForScript(s)) === s",
    (s) => {
      expect(JSON.parse(escapeForScript(s))).toBe(s);
    },
  );

  test.prop([fc.string()], { numRuns: 1000 })(
    "HTML safety: result contains no </script> in any case",
    (s) => {
      expect(escapeForScript(s)).not.toMatch(/<\/script/i);
    },
  );

  test.prop([fc.string()], { numRuns: 1000 })(
    "HTML safety: result contains no `<` (any tag opener)",
    (s) => {
      expect(escapeForScript(s)).not.toMatch(/</);
    },
  );

  test.prop([fc.string()], { numRuns: 1000 })(
    "HTML safety: result contains no U+2028 / U+2029 (legacy JS line-terminator escape)",
    (s) => {
      const result = escapeForScript(s);

      // The codepoints must be encoded as `\u2028` / `\u2029` text, not the
      // raw characters that legacy JS parsers treat as line breaks inside
      // string literals.
      expect(result).not.toMatch(/[\u2028\u2029]/);
    },
  );

  // Note: `fc.string()` already covers the full Unicode range — fast-check
  // 4.x removed the dedicated `fc.unicodeString()`. The roundtrip
  // invariant above (numRuns: 1000) exercises the same surface.

  test.prop([
    fc.oneof(fc.constant(undefined), fc.integer(), fc.boolean(), fc.bigInt()),
  ])(
    "null fallback: any non-string input that JSON.stringify can't handle returns the literal 'null'",
    (badInput) => {
      // The cast is intentional: the runtime is permitted to bypass TS via
      // `as`-cast, and the function must collapse to 'null' rather than
      // throw. Covers JSON.stringify returning undefined (undefined),
      // returning a non-string-but-quoted value (number, boolean), and
      // throwing (BigInt).
      const result = escapeForScript(badInput as unknown as string);

      // Boolean and integer are stringified as their JSON literal form
      // (which IS a valid JSON literal); only undefined and BigInt
      // collapse to "null". Document both branches explicitly.
      if (typeof badInput === "boolean" || typeof badInput === "number") {
        expect(result).toBe(JSON.stringify(badInput));
      } else {
        expect(result).toBe("null");
      }
    },
  );
});

// =============================================================================
// defer(): roundtrip + reserved-keys reject + isolation
// =============================================================================

describe("defer(): roundtrip + reserved-keys reject", () => {
  // Use a single shared promise per test — defer() validates that values
  // are thenable but otherwise treats them opaquely. Generating arbitrary
  // promises (with random rejection, etc.) would also test JS Promise
  // behaviour, which is not the contract.
  const arbPromise = fc.constant(Promise.resolve(0));

  // Safe deferred-key strings: non-empty, ASCII printable, no reserved
  // names. Defer's reserved-key set: __proto__ / constructor / prototype.
  const arbSafeKey = fc
    .stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/)
    .filter((k) => k !== "constructor" && k !== "prototype");

  test.prop([fc.anything(), fc.dictionary(arbSafeKey, arbPromise)], {
    numRuns: 200,
  })(
    "roundtrip: isDeferred(defer({ critical, deferred })) === true",
    (critical, deferred) => {
      // Defer rejects empty deferred? No — empty `{}` is allowed.
      const payload = defer({ critical, deferred });

      expect(isDeferred(payload)).toBe(true);
      expect(payload.critical).toBe(critical);
    },
  );

  test.prop([
    fc.constantFrom("__proto__", "constructor", "prototype"),
    arbPromise,
  ])(
    "reserved keys (__proto__/constructor/prototype) always reject",
    (reservedKey, promise) => {
      // Object literal computed-key form so the reserved name lands as
      // an OWN property (not via Object.prototype lookup). Without this,
      // `{ __proto__: x }` would silently set the prototype instead of
      // the own property — and `defer()`'s reserved-key check would
      // never see it.
      const map: Record<string, Promise<unknown>> = Object.create(null);

      map[reservedKey] = promise;

      expect(() => defer({ critical: null, deferred: map })).toThrow(
        /is reserved/,
      );
    },
  );

  test.prop([fc.dictionary(arbSafeKey, arbPromise)], { numRuns: 100 })(
    "freeze: defer() output is frozen at top level AND inner deferred map",
    (deferred) => {
      const payload = defer({ critical: 0, deferred });

      expect(Object.isFrozen(payload)).toBe(true);
      expect(Object.isFrozen(payload.deferred)).toBe(true);
    },
  );

  test.prop([fc.dictionary(arbSafeKey, arbPromise)], { numRuns: 100 })(
    "isolation: post-defer mutations to the caller's map do not leak into the payload",
    (deferred) => {
      const userMap: Record<string, Promise<unknown>> = { ...deferred };
      const payload = defer({ critical: 0, deferred: userMap });
      const before = Object.keys(payload.deferred).toSorted((a, b) =>
        a.localeCompare(b),
      );

      // Late mutation by the caller — defer() works on a shallow clone,
      // so the payload must not see this addition.
      const lateAdd = Promise.reject(new Error("late"));

      lateAdd.catch(() => {
        /* prevent unhandledRejection in this property test */
      });
      userMap.evil = lateAdd;

      const after = Object.keys(payload.deferred).toSorted((a, b) =>
        a.localeCompare(b),
      );

      expect(after).toStrictEqual(before);
      expect("evil" in payload.deferred).toBe(false);
    },
  );

  test.prop([fc.anything()])(
    "isDeferred is false for any value that is NOT a defer() output",
    (value) => {
      // Generated values are arbitrary — including primitives, plain
      // objects with random keys, nested dicts, arrays. None should
      // accidentally be brand-marked as a defer payload.
      expect(isDeferred(value)).toBe(false);
    },
  );
});

// =============================================================================
// markStale + isStale + clearStale: stale-registry algebra
// =============================================================================
//
// The stale registry is a `WeakMap<Router, Set<string>>` keyed by router
// instance. Three operations:
//   - markStale(router, ns)  — add `ns` to the router's set (idempotent)
//   - isStale(router, ns)    — peek (no mutation)
//   - clearStale(router, ns) — remove `ns` from the set (idempotent)
//
// Algebraic invariants the implementation must hold:
//   1. Idempotency: N marks ⟺ 1 mark; isStale stays true after N peeks.
//   2. Mark-then-clear ⟹ isStale === false (round trip).
//   3. Per-router isolation: marks on router A never visible on router B.
//   4. Per-namespace isolation: mark "data" doesn't leak to mark "rsc".

const arbNamespace = fc.stringMatching(/^[a-z]{1,8}$/);

describe("stale registry: idempotency + isolation invariants", () => {
  test.prop([arbNamespace, fc.integer({ min: 1, max: 10 })], {
    numRuns: NUM_RUNS.standard,
  })("idempotency: markStale × N is the same as markStale × 1", (ns, n) => {
    const router = createRouter(ROUTES, { defaultRoute: "home" });

    for (let i = 0; i < n; i++) {
      markStale(router, ns);
    }

    expect(isStale(router, ns)).toBe(true);

    clearStale(router, ns);

    expect(isStale(router, ns)).toBe(false);
  });

  test.prop([arbNamespace], { numRuns: NUM_RUNS.standard })(
    "round trip: markStale → isStale=true → clearStale → isStale=false",
    (ns) => {
      const router = createRouter(ROUTES, { defaultRoute: "home" });

      expect(isStale(router, ns)).toBe(false);

      markStale(router, ns);

      expect(isStale(router, ns)).toBe(true);

      clearStale(router, ns);

      expect(isStale(router, ns)).toBe(false);
    },
  );

  test.prop([arbNamespace, fc.integer({ min: 1, max: 5 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "clearStale is idempotent: N≥1 clears collapse to a single clear",
    (ns, n) => {
      const router = createRouter(ROUTES, { defaultRoute: "home" });

      markStale(router, ns);
      for (let i = 0; i < n; i++) {
        clearStale(router, ns);
      }

      expect(isStale(router, ns)).toBe(false);
    },
  );

  test.prop([arbNamespace], { numRuns: NUM_RUNS.standard })(
    "per-router isolation: markStale(A, ns) never affects isStale(B, ns)",
    (ns) => {
      const routerA = createRouter(ROUTES, { defaultRoute: "home" });
      const routerB = createRouter(ROUTES, { defaultRoute: "home" });

      markStale(routerA, ns);

      expect(isStale(routerA, ns)).toBe(true);
      expect(isStale(routerB, ns)).toBe(false);
    },
  );

  test.prop([arbNamespace, arbNamespace], { numRuns: NUM_RUNS.standard })(
    "per-namespace isolation: markStale(r, A) never affects isStale(r, B)",
    (nsA, nsB) => {
      // Skip degenerate equal-namespace draws — same-ns is the trivial
      // "marking ns leaves ns marked" property already covered.
      fc.pre(nsA !== nsB);

      const router = createRouter(ROUTES, { defaultRoute: "home" });

      markStale(router, nsA);

      expect(isStale(router, nsA)).toBe(true);
      expect(isStale(router, nsB)).toBe(false);
    },
  );
});

// =============================================================================
// getSsrDataMode: pure-function transparency + foreign-value collapse
// =============================================================================

describe("getSsrDataMode: pure read-side guard", () => {
  // Build a minimal `State` with arbitrary `ssrDataMode` in context.
  // No router involvement — getSsrDataMode only reads `state.context`.
  const stateWith = (ssrDataMode: unknown): State => ({
    name: "any",
    params: {},
    path: "/",
    transition: {
      phase: "activating",
      reason: "success",
      segments: { deactivated: [], activated: [], intersection: "" },
    },
    context: { ssrDataMode } as Record<string, unknown>,
  });

  test.prop([fc.constantFrom<SsrMode>("full", "data-only", "client-only")], {
    numRuns: NUM_RUNS.standard,
  })(
    "transparency: for any allowed mode m, getSsrDataMode(state{ssrDataMode:m}) === m",
    (m) => {
      expect(getSsrDataMode(stateWith(m))).toBe(m);
    },
  );

  // Anything that is NOT in ALL_SSR_MODES — including foreign strings,
  // falsy non-nullish values, null, objects, numbers — must collapse to
  // "full". Without this guard, downstream `mode === "full"` branches
  // silently misbehave on cast-bypassed garbage.
  const arbForeignMode = fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(0),
    fc.constant(""),
    fc.constant(false),
    fc
      .string()
      .filter((s) => s !== "full" && s !== "data-only" && s !== "client-only"),
    fc.integer(),
    fc.boolean(),
    fc.object(),
  );

  test.prop([arbForeignMode], { numRuns: NUM_RUNS.thorough })(
    "guard: any non-allowed value collapses to 'full'",
    (foreign) => {
      expect(getSsrDataMode(stateWith(foreign))).toBe("full");
    },
  );
});

// =============================================================================
// invalidate: per-router cloneRouter() isolation under the WeakMap key contract
// =============================================================================

describe("invalidate: per-router isolation across cloneRouter() boundaries", () => {
  test.prop([arbParamValue, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "invalidate(childA, 'data') never triggers childB loader",
    async (idA, idB) => {
      // The stale registry is `WeakMap<Router, Set<string>>`, so per-router
      // isolation should come free from the WeakMap key identity. Verify
      // that `invalidate(childA)` is consumed only by childA's leave
      // handler — childB navigation stays cold even on the same base.
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const childA = cloneRouter(base);
      const childB = cloneRouter(base);

      let aCalls = 0;
      let bCalls = 0;

      childA.usePlugin(
        ssrDataPluginFactory({
          home: () => () => {
            aCalls += 1;

            return Promise.resolve({ id: idA });
          },
        }),
      );
      childB.usePlugin(
        ssrDataPluginFactory({
          home: () => () => {
            bCalls += 1;

            return Promise.resolve({ id: idB });
          },
        }),
      );

      await childA.start("/");
      await childB.start("/");

      // After start: each loader called once for its own router.
      expect(aCalls).toBe(1);
      expect(bCalls).toBe(1);

      invalidate(childA, "data");

      // childB navigation reloads — its own stale flag is clean,
      // so the leave handler must no-op.
      await childB.navigate("home", {}, { reload: true });

      expect(bCalls).toBe(1);

      // childA navigation reloads — flag is set, leave handler runs.
      await childA.navigate("home", {}, { reload: true });

      expect(aCalls).toBe(2);

      childA.dispose();
      childB.dispose();
    },
  );
});
