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
import { LoaderTimeout, withTimeout } from "../../src/errors";
import { clearStale, isStale, markStale } from "../../src/shared-ssr";
import { DEFER_BRAND } from "../../src/shared-ssr/defer";
import {
  escapeForScript,
  formatSettleScript,
  getDeferBootstrapScript,
} from "../../src/shared-ssr/deferWireFormat";

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

  // -----------------------------------------------------------------------
  // Pure-function algebra: determinism, non-shrinking, injectivity.
  //
  // These are *necessary* properties for a security-critical encoder that
  // doubles as a JSON-roundtrip transport. Lose injectivity and two distinct
  // inputs collide in the wire-format (a silent corruption vector for
  // deferred-map keys); lose determinism and cache layers break subtly.
  // Non-shrinking is the cheapest sanity check that no transformation pass
  // strips characters silently (e.g. a regression that drops U+2028).
  // -----------------------------------------------------------------------

  test.prop([fc.string()], { numRuns: 1000 })(
    "deterministic: escapeForScript(s) === escapeForScript(s)",
    (s) => {
      expect(escapeForScript(s)).toBe(escapeForScript(s));
    },
  );

  test.prop([fc.string()], { numRuns: 1000 })(
    "non-shrinking: |escapeForScript(s)| >= |s|",
    (s) => {
      // JSON.stringify wraps the string in two surrounding quotes (+2);
      // every encoded char is replaced with a length-6 unicode-escape
      // sequence (strictly longer than the source codepoint's UTF-16 size).
      // So the output is never shorter than the input. A regression that
      // silently drops chars would shrink the length — this property catches
      // it without enumerating which chars the encoder must preserve.
      expect(escapeForScript(s).length).toBeGreaterThanOrEqual(s.length);
    },
  );

  test.prop([fc.string(), fc.string()], { numRuns: 1000 })(
    "injective: escape(a) === escape(b) implies a === b",
    (a, b) => {
      // Implied by roundtrip + JSON.parse being a function, but pinned
      // explicitly to catch a regression where the roundtrip stays valid
      // for individual inputs but two distinct inputs encode to the same
      // string — e.g. a future "compaction" pass that normalises whitespace.
      // No wire-format collisions for deferred-map keys.
      if (escapeForScript(a) === escapeForScript(b)) {
        expect(a).toBe(b);
      }
    },
  );

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
      // `fc.anything()` can produce NaN. `toBe` rejects NaN === NaN (false),
      // so wrap in `Object.is` to make the identity-preservation invariant
      // NaN-safe.
      expect(Object.is(payload.critical, critical)).toBe(true);
    },
  );

  test.prop(
    [fc.constantFrom("__proto__", "constructor", "prototype"), arbPromise],
    { numRuns: 500 },
  )(
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

  // -----------------------------------------------------------------------
  // Wire-format integrity: shallow clone must preserve identity + order.
  //
  // The functional anchor (`defer.test.ts:79-86`) pins promise identity for
  // two fixed keys. Lifting to a PBT extends the contract across arbitrary
  // key sets — a regression that swaps `{ ...userMap }` for a deep-clone
  // (e.g. JSON parse/stringify roundtrip) would still pass the existing
  // anchor for primitive payloads, but fail for any non-cloneable thenable.
  // -----------------------------------------------------------------------

  test.prop([fc.dictionary(arbSafeKey, arbPromise)], { numRuns: 100 })(
    "promise identity preserved: payload.deferred[k] === input.deferred[k] for every own key",
    (deferred) => {
      const payload = defer({ critical: 0, deferred });

      for (const key of Object.keys(deferred)) {
        // Reference identity, not structural — the settle pipeline depends
        // on observing the same Promise instance that `.catch()` was
        // attached to in the validator loop.
        expect(payload.deferred[key]).toBe(deferred[key]);
      }
    },
  );

  test.prop([fc.dictionary(arbSafeKey, arbPromise)], { numRuns: 100 })(
    "key order preserved: Object.keys(payload.deferred) === Object.keys(input)",
    (deferred) => {
      const payload = defer({ critical: 0, deferred });

      // Insertion order matters for streamed settle scripts: the server
      // emits `<script>__rrDefer__("k", json)</script>` in the order the
      // promises settle, but consumers reading `state.context.ssrDataDeferredKeys`
      // expect the declared order to match for `useDeferred()` lookups.
      expect(Object.keys(payload.deferred)).toStrictEqual(
        Object.keys(deferred),
      );
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

  test.prop([fc.anything()], { numRuns: 500 })(
    "isDeferred is false for any value that is NOT a defer() output",
    (value) => {
      // Generated values are arbitrary — including primitives, plain
      // objects with random keys, nested dicts, arrays. None should
      // accidentally be brand-marked as a defer payload. Bumped to 500
      // runs because the brand symbol uses `Symbol.for(...)` and a future
      // regression that swaps `Object.hasOwn` for a plain property read
      // would only fail on the small subset of inputs that happen to
      // inherit the brand symbol — coverage-grade default 100 is too thin.
      expect(isDeferred(value)).toBe(false);
    },
  );

  // -----------------------------------------------------------------------
  // isDeferred anti-bypass: prototype-chain inheritance must NOT brand
  // an object as a defer payload, while a plain object that owns the
  // brand symbol AS AN OWN PROPERTY is currently considered branded.
  //
  // The first invariant is security-critical (cross-realm prototype
  // pollution); the second pins the current contract — change-detector
  // for any future refactor that decides brand-only objects need to also
  // carry `critical`/`deferred` fields to count as deferred payloads.
  // -----------------------------------------------------------------------

  it("rejects inherited brand: Object.create({ [DEFER_BRAND]: true }) ⇒ false", () => {
    // Without `Object.hasOwn` guarding the brand check, a prototype-chain
    // bypass would mark every object inheriting from a brand-carrying
    // proto as a defer payload — and `processLoaderResult`'s slow path
    // would then crash reading `critical`/`deferred` off undefined.
    const inheritedBrand = Object.create({ [DEFER_BRAND]: true }) as object;

    expect(isDeferred(inheritedBrand)).toBe(false);
  });

  it("documents the brand-only-plain contract: own brand without critical/deferred ⇒ true", () => {
    // Locks the current narrow contract: `isDeferred` is a brand check,
    // not a structural check. Downstream `processLoaderResult` then
    // either fails fast or treats the missing fields as `undefined`.
    // If a future refactor decides to require structural fields too,
    // this test will fail and force a doc update — that failure IS the
    // contract-change signal.
    const brandOnly = { [DEFER_BRAND]: true } as object;

    expect(isDeferred(brandOnly)).toBe(true);
  });
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

// Widened from `[a-z]{1,8}` to cover real plugin namespaces — the actual
// stale-registry keys in this codebase are camelCase (`ssrDataMode`,
// `ssrDataDeferred`, `ssrDataDeferredKeys`) and include digits/underscores
// in third-party plugins. Letters-only with bounded length missed the
// upper-case + digit + separator surface entirely.
const arbNamespace = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/);

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
    search: {},
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
  // silently misbehave on cast-bypassed garbage. Extended with `BigInt`,
  // `Symbol`, arrays, and functions because `state.context` is typed
  // `Record<string, unknown>` and any of these can land via cast-bypass.
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
    fc.bigInt(),
    fc.constantFrom(Symbol("ssr"), Symbol.for("ssr-foreign")),
    fc.array(fc.string()),
    fc.constant(() => "full"),
  );

  test.prop([arbForeignMode], { numRuns: NUM_RUNS.thorough })(
    "guard: any non-allowed value collapses to 'full'",
    (foreign) => {
      expect(getSsrDataMode(stateWith(foreign))).toBe("full");
    },
  );

  // -----------------------------------------------------------------------
  // Totality + idempotency: the read-side guard is a pure projection over
  // `state.context.ssrDataMode`, so every call must terminate, every output
  // must inhabit `SsrMode`, and N reads of the same state must agree.
  // These are necessary preconditions for the foreign-collapse invariant
  // above — if the function diverges or throws on some input class, the
  // collapse property doesn't even get a chance to fail.
  // -----------------------------------------------------------------------

  test.prop([fc.anything()], { numRuns: NUM_RUNS.thorough })(
    "totality: getSsrDataMode returns a string in ALL_SSR_MODES for ANY input",
    (anyValue) => {
      const result = getSsrDataMode(stateWith(anyValue));

      // The function must not throw, and the output must be one of the
      // three allowed modes — no `undefined`, no foreign string slipping
      // through, no exception bubble.
      expect(["full", "data-only", "client-only"]).toContain(result);
    },
  );

  test.prop([fc.anything()], { numRuns: NUM_RUNS.standard })(
    "idempotency: two reads of the same state return strictly equal modes",
    (anyValue) => {
      const state = stateWith(anyValue);

      expect(getSsrDataMode(state)).toBe(getSsrDataMode(state));
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
      await childB.navigate("home", {}, undefined, { reload: true });

      expect(bCalls).toBe(1);

      // childA navigation reloads — flag is set, leave handler runs.
      await childA.navigate("home", {}, undefined, { reload: true });

      expect(aCalls).toBe(2);

      childA.dispose();
      childB.dispose();
    },
  );
});

// =============================================================================
// withTimeout: race semantics (#598)
// =============================================================================
//
// Hot-path contract for cancellation-aware loaders. Properties pinned:
//
//   1. Fast-path: when the loader resolves before the deadline, the
//      returned value is the loader's resolved value (any T).
//   2. Deadline-path: when the loader never settles, the rejection is a
//      `LoaderTimeout` carrying the supplied `route` + `ms` for HTTP
//      mapping at the consumer layer.
//   3. Pre-aborted upstream short-circuit: when `upstreamSignal` is already
//      aborted, the loader is NEVER invoked — regardless of route name,
//      timeout, or arbitrary `signal.reason`. Locks the "no work after
//      client disconnect" guarantee that `withTimeout` documents.
//
// PBT (vs functional) because regressions land in subtle generic interaction:
// e.g. a refactor that swaps `Promise.race` for `Promise.any` would pass the
// canonical functional fast-path test for `{ ok }` but fail the property
// test for boolean / null / undefined / nested-object loader returns.

describe("withTimeout: race semantics", () => {
  const arbRouteName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9._-]{0,20}$/);

  // `fc.anything()` here is the loader's resolved value, NOT a foreign
  // input — withTimeout is parametric over T, so any value must pass
  // through to the consumer unmolested.
  test.prop([arbRouteName, fc.integer({ min: 50, max: 500 }), fc.anything()], {
    numRuns: NUM_RUNS.standard,
  })(
    "fast-path: loader resolving before deadline returns the resolved value",
    async (route, ms, value) => {
      const result = await withTimeout(route, ms, () => Promise.resolve(value));

      // `toStrictEqual` (not `toBe`) — `fc.anything()` produces objects,
      // arrays, NaN. Structural equality is the right contract: the
      // function returns the loader value, identity isn't guaranteed
      // across the `Promise.race` wrapper. (Functional anchor at
      // `data-loader.test.ts:1037` pins reference identity for the
      // single canonical case.)
      expect(result).toStrictEqual(value);
    },
  );

  test.prop([arbRouteName, fc.integer({ min: 1, max: 20 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "deadline-path: rejects with LoaderTimeout carrying route + ms",
    async (route, ms) => {
      // Loader that never settles — only the deadline can resolve the
      // race. `route` and `ms` flow through to the error fields so HTTP
      // middleware can render a 504 with the right context.
      const promise = withTimeout(
        route,
        ms,
        () => new Promise<never>(() => {}),
      );

      await expect(promise).rejects.toBeInstanceOf(LoaderTimeout);
      await expect(promise).rejects.toMatchObject({
        name: "LoaderTimeout",
        code: "LOADER_TIMEOUT",
        route,
        ms,
      });
    },
  );

  test.prop([arbRouteName, fc.integer({ min: 50, max: 1000 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "pre-aborted upstream: loader is NEVER invoked, regardless of route + ms",
    async (route, ms) => {
      const upstream = new AbortController();
      const reason = new Error("client-disconnected");

      upstream.abort(reason);

      const loaderSpy = vi.fn();

      await expect(
        withTimeout(route, ms, loaderSpy, { upstreamSignal: upstream.signal }),
      ).rejects.toBe(reason);

      expect(loaderSpy).not.toHaveBeenCalled();
    },
  );
});

// =============================================================================
// validateLoaders: structural acceptance + rejection
// =============================================================================
//
// `validateLoaders` is the public-facing gatekeeper run at `ssrDataPluginFactory`
// time — its rejections raise `TypeError` *before* `usePlugin()` mounts the
// interceptor, so misconfiguration fails fast at app boot rather than at the
// first navigation. Three classes of properties:
//
//   - acceptance: shapes the validator must let through (empty `{}`,
//     short-form factory, full object form with valid mode strings);
//   - structural rejection: shapes that must throw (unknown top-level keys,
//     unknown mode strings);
//   - idempotency: validation is a pure check, calling it N times must not
//     accumulate state (it currently throws or returns void — no state to
//     accumulate — but pinning it prevents a future refactor from sneaking
//     in factory-time side effects).

describe("validateLoaders: structural acceptance + rejection", () => {
  const arbValidMode = fc.constantFrom<SsrMode>(
    "full",
    "data-only",
    "client-only",
  );

  // Keys that real route trees use — keep generation small and readable.
  const arbRouteKey = fc.stringMatching(/^[a-z][a-zA-Z0-9._]{0,15}$/);

  it("accepts the empty `{}` loader map (no routes registered)", () => {
    expect(() => ssrDataPluginFactory({})).not.toThrow();
  });

  test.prop([fc.dictionary(arbRouteKey, fc.constant(undefined))], {
    numRuns: NUM_RUNS.standard,
  })("accepts any map of valid short-form factories", (keys) => {
    // Build an object whose values are valid short-form factories. The
    // arbitrary controls the *keys*, the values are constant — so the
    // generator focuses shrinking on the structural axis we care about.
    const loaders: DataLoaderFactoryMap = Object.fromEntries(
      Object.keys(keys).map((k) => [k, () => () => Promise.resolve(0)]),
    );

    expect(() => ssrDataPluginFactory(loaders)).not.toThrow();
  });

  test.prop([arbValidMode], { numRuns: NUM_RUNS.standard })(
    "accepts object-form { ssr, loader } with every allowed mode string",
    (mode) => {
      expect(() =>
        ssrDataPluginFactory({
          home: { ssr: mode, loader: () => () => Promise.resolve(0) },
        }),
      ).not.toThrow();
    },
  );

  test.prop(
    [
      fc
        .string({ minLength: 1, maxLength: 12 })
        .filter((k) => k !== "ssr" && k !== "loader"),
    ],
    { numRuns: NUM_RUNS.standard },
  )("rejects unknown top-level keys in object-form entries", (unknownKey) => {
    expect(() =>
      ssrDataPluginFactory({
        home: { [unknownKey]: 1 },
      }),
    ).toThrow(/unexpected key/);
  });

  test.prop(
    [
      fc
        .string({ minLength: 1, maxLength: 16 })
        .filter(
          (s) => s !== "full" && s !== "data-only" && s !== "client-only",
        ),
    ],
    { numRuns: NUM_RUNS.standard },
  )("rejects string-form ssr mode outside ALL_SSR_MODES", (bogusMode) => {
    expect(() =>
      ssrDataPluginFactory({
        home: { ssr: bogusMode } as unknown as DataLoaderFactoryMap[string],
      }),
    ).toThrow(/is not allowed/);
  });

  test.prop([fc.integer({ min: 2, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "idempotency: validating the same loader map N times never throws (or always throws)",
    (n) => {
      // Validation is a pure check — calling the factory N times with the
      // same input must behave identically each time. Pinning this guards
      // against a refactor that introduces factory-time state (e.g. a
      // Map of "already validated" routes that could let a second call
      // accept what the first rejected).
      const loaders: DataLoaderFactoryMap = {
        home: () => () => Promise.resolve(0),
      };

      for (let i = 0; i < n; i++) {
        expect(() => ssrDataPluginFactory(loaders)).not.toThrow();
      }
    },
  );
});

// =============================================================================
// formatSettleScript + getDeferBootstrapScript: HTML safety
// =============================================================================
//
// Both functions emit `<script>...</script>` text that lands directly in the
// HTML response stream. The contents are user-controlled at the boundary
// (`formatSettleScript` gets deferred-map keys + JSON values; the bootstrap
// is constant but the security guarantees depend on its character set).
// Two properties:
//
//   1. The script body never contains a literal `</script` (case-insensitive)
//      — the raw HTML parser would honour it and close the tag early.
//   2. The script body never contains raw U+2028 / U+2029 — legacy JS
//      parsers treat those as line terminators inside string literals.
//
// `formatSettleScript` delegates to `escapeForScript` for both fields, so
// these properties are *redundant given* the escapeForScript invariants
// above — but the composition point is exactly where a future refactor
// could silently bypass the encoder (e.g. concatenating a user value
// without re-escaping). PBT here pins the composition contract.

// Built via String.fromCodePoint so the test file itself contains no
// raw line-terminator codepoints (those terminate JS comments at parse
// time per ECMAScript spec). Mirrors the source pattern in
// deferRegistry.ts where the replacement table is built the same way.
const RAW_LINE_TERMINATOR_REGEX = new RegExp(
  `[${String.fromCodePoint(0x20_28)}${String.fromCodePoint(0x20_29)}]`,
);

describe("formatSettleScript + getDeferBootstrapScript: HTML safety", () => {
  test.prop([fc.string(), fc.string(), fc.boolean()], { numRuns: 500 })(
    "formatSettleScript output never contains </script (any case)",
    (key, value, isError) => {
      const script = formatSettleScript(key, value, isError);

      // Strip outer `<script>` / `</script>` so the test asserts about the
      // *body* — the trailing closer is legitimate and expected.
      const body = script.slice(
        "<script>".length,
        script.length - "</script>".length,
      );

      expect(body).not.toMatch(/<\/script/i);
    },
  );

  test.prop([fc.string(), fc.string(), fc.boolean()], { numRuns: 500 })(
    "formatSettleScript body never contains raw U+2028 / U+2029",
    (key, value, isError) => {
      const script = formatSettleScript(key, value, isError);

      expect(script).not.toMatch(RAW_LINE_TERMINATOR_REGEX);
    },
  );

  test.prop([fc.string(), fc.string(), fc.boolean()], { numRuns: 500 })(
    "isError routes the settle script to __rrDeferError__ / __rrDefer__ correctly",
    (key, value, isError) => {
      // Wire-format contract: the server stream may emit either a resolve
      // call (`__rrDefer__("k", json)`) or a reject call (`__rrDeferError__("k", json)`).
      // The two are mutually exclusive — one routes through the bootstrap's
      // resolve closure, the other through its reject closure. A regression
      // that flips the routing would silently turn errors into successful
      // resolutions on the client (and vice versa) without breaking any
      // single-input functional test that only checks one branch.
      const script = formatSettleScript(key, value, isError);

      if (isError) {
        expect(script).toContain("__rrDeferError__(");
        expect(script).not.toContain("__rrDefer__(");
      } else {
        expect(script).toContain("__rrDefer__(");
        expect(script).not.toContain("__rrDeferError__(");
      }
    },
  );

  it("getDeferBootstrapScript is deterministic", () => {
    // The bootstrap is a constant string. Determinism here is a smoke test:
    // a regression that adds environment-dependent code (Date.now stamps,
    // module-init counters) would surface immediately. Cheap to assert.
    expect(getDeferBootstrapScript()).toBe(getDeferBootstrapScript());
  });

  it("getDeferBootstrapScript body is HTML-safe (no </script, no U+2028/2029)", () => {
    const body = getDeferBootstrapScript();

    expect(body).not.toMatch(/<\/script/i);
    expect(body).not.toMatch(RAW_LINE_TERMINATOR_REGEX);
  });
});
