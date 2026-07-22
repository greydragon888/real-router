import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi, cloneRouter } from "@real-router/core/api";
import {
  invalidate as invalidateData,
  ssrDataPluginFactory,
} from "@real-router/ssr-data-plugin";

import {
  arbRscAction,
  arbSimpleRouteName,
  arbParamValue,
  arbReactNode,
  createRscRouter,
  node,
  NUM_RUNS,
  ROUTES,
  stateWith,
} from "./helpers";
import {
  buildRscPayload,
  getSsrRscMode,
  invalidate,
  rscActionPluginFactory,
  rscServerPluginFactory,
} from "../../src";
import { ALLOWED_RSC_MODES } from "../../src/constants";
import {
  clearStale,
  isStale,
  markStale,
} from "../../src/shared-ssr/staleRegistry";

import type {
  RscActionResult,
  RscLoaderFactoryMap,
  RscSsrMode,
} from "../../src";
import type { State } from "@real-router/core";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

const arbRscSsrMode: fc.Arbitrary<RscSsrMode> = fc.constantFrom<RscSsrMode>(
  "full",
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

      const { router } = createRscRouter({
        "users.profile": () => async () => {
          callCount++;

          return node("Profile", { id });
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

      const { router } = createRscRouter({
        "users.profile": () => async () => {
          callCount++;

          return node("Profile");
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

      const { router } = createRscRouter({
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
// Data Retrieval: state.context.rsc returns loader result
// =============================================================================

describe("data retrieval: state.context.rsc returns loader result after start()", () => {
  test.prop([arbReactNode], { numRuns: NUM_RUNS.thorough })(
    "state.context.rsc returns exactly the loader resolved value",
    async (rsc) => {
      const { router } = createRscRouter({
        home: () => async () => rsc,
      });

      const state = await router.start("/");

      expect(state.context.rsc).toStrictEqual(rsc);

      router.stop();
    },
  );

  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "state.context.rsc is undefined when route has no loader",
    async (routeName) => {
      const { router } = createRscRouter({
        "users.profile": () => async () => node("Should-not-load"),
      });

      const pathMap: Record<string, string> = {
        home: "/",
        "users.list": "/users",
      };
      const path = pathMap[routeName] ?? `/${routeName}`;

      const state = await router.start(path);

      expect(state.context.rsc).toBeUndefined();

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
      const { router, unsubscribe } = createRscRouter({
        "users.profile": () => async () => node("Profile", { id }),
      });

      const state = await router.start(`/users/${id}`);

      expect(state.context.rsc).toStrictEqual(node("Profile", { id }));

      unsubscribe();

      router.stop();
    },
  );

  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "double unsubscribe does not throw",
    async (id) => {
      const { router, unsubscribe } = createRscRouter({
        "users.profile": () => async () => node("Profile", { id }),
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
      const { router, unsubscribe } = createRscRouter({
        "users.profile": () => async () => node("Profile", { id }),
      });

      await router.start(`/users/${id}`);
      unsubscribe();

      expect(() =>
        getPluginApi(router).claimContextNamespace("rsc"),
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

          return () => Promise.resolve(node("Hacked"));
        },
      };
      const loaders = Object.create(proto) as RscLoaderFactoryMap;

      const { router } = createRscRouter(loaders);
      const state = await router.start(`/users/${paramValue}`);

      expect(protoCalled).toBe(false);
      expect(state.context.rsc).toBeUndefined();

      router.stop();
    },
  );
});

// =============================================================================
// Per-instance isolation: independent rsc across clones
// =============================================================================

describe("isolation: cloned routers have independent rsc payloads", () => {
  test.prop([arbParamValue, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "two clones with same factory produce independent rsc",
    async (id1, id2) => {
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const loaders: RscLoaderFactoryMap = {
        "users.profile": () => async (params) =>
          node("Profile", { userId: params.id }),
      };

      const clone1 = cloneRouter(base);

      clone1.usePlugin(rscServerPluginFactory(loaders));
      const state1 = await clone1.start(`/users/${id1}`);

      const clone2 = cloneRouter(base);

      clone2.usePlugin(rscServerPluginFactory(loaders));
      const state2 = await clone2.start(`/users/${id2}`);

      expect(state1.context.rsc).toStrictEqual(
        node("Profile", { userId: id1 }),
      );
      expect(state2.context.rsc).toStrictEqual(
        node("Profile", { userId: id2 }),
      );

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

      const { router } = createRscRouter({
        "users.profile": () => {
          factoryCallCount++;

          return async () => node("Profile", { id });
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
        rscServerPluginFactory(input as unknown as RscLoaderFactoryMap),
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
      rscServerPluginFactory({
        [key]: value,
      } as unknown as RscLoaderFactoryMap),
    ).toThrow(TypeError);
  });
});

// =============================================================================
// Invariant 13 — Factory compilation error releases claim (PBT coverage)
// =============================================================================
//
// The functional suite covers this with a single hand-crafted Error; PBT
// generalises across arbitrary error shapes so a regression that only
// releases the claim on certain message lengths or error subclasses
// surfaces here. Property: for ANY throw inside the loader factory,
// `usePlugin()` rethrows AND the `"rsc"` namespace is re-claimable after.

describe("teardown: factory throw releases claim (Inv 13)", () => {
  // Strings and Errors hit the two common throw shapes in JS code. The
  // factory's try/catch is shape-blind — what matters is that the
  // exception propagates and the claim is released regardless.
  const arbThrowValue = fc.oneof(
    fc.string({ minLength: 1, maxLength: 32 }).map((m) => new Error(m)),
    fc.string({ minLength: 1, maxLength: 32 }).map((m) => new TypeError(m)),
    fc.string({ minLength: 1, maxLength: 32 }),
  );

  test.prop([arbThrowValue], { numRuns: NUM_RUNS.standard })(
    "factory that throws → usePlugin rethrows + namespace re-claimable",
    (thrown) => {
      const router = createRouter(ROUTES, { defaultRoute: "home" });
      const factory = rscServerPluginFactory({
        home: () => {
          // The point of this test is to exercise the claim-release path
          // for arbitrary thrown shapes — including plain strings, which
          // are valid JS throws but flagged by `only-throw-error`. The
          // factory's try/catch is shape-blind; refusing to test string
          // throws would shrink the property's range without changing
          // what the invariant guarantees.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw thrown;
        },
      });

      // Rethrow is shape-preserving — fast-check shrinking would give us
      // the minimal reproducer if a regression broke this.
      expect(() => router.usePlugin(factory)).toThrow();

      // Same-namespace re-claim must succeed AFTER the rethrow — proves
      // the factory released the claim on its way out (Inv 13).
      expect(() =>
        getPluginApi(router).claimContextNamespace("rsc"),
      ).not.toThrow();
    },
  );
});

// =============================================================================
// Composition: rsc-server-plugin + ssr-data-plugin coexist on the same router
// =============================================================================
//
// Invariant 14: registering both plugins on a single router populates
// `state.context.rsc` (ReactNode) and `state.context.data` (JSON) independently
// for the same `start()` call. The two namespace claims are distinct (`"rsc"` vs
// `"data"`) so the core's `claimContextNamespace` collision detector permits
// concurrent ownership. Verifies that:
//
//   - rsc loader runs and writes `state.context.rsc`
//   - data loader runs and writes `state.context.data`
//   - neither loader sees the other's namespace mutation
//   - neither plugin's teardown affects the other's claim
//
// This is the canonical use-case for SSR + RSC apps that ship both
// HTML-bound JSON state (e.g. user preferences) AND a Server Component tree.

describe("composition: rsc-server-plugin + ssr-data-plugin coexist", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "both namespaces populate independently for the same start()",
    async (id) => {
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const router = cloneRouter(base);

      const rscLoaders: RscLoaderFactoryMap = {
        "users.profile": () => async (params) =>
          node("Profile", { userId: params.id }),
      };
      const dataLoaders: DataLoaderFactoryMap = {
        "users.profile": () => async (params) => ({
          jsonId: params.id,
          source: "ssr-data",
        }),
      };

      const unsubRsc = router.usePlugin(rscServerPluginFactory(rscLoaders));
      const unsubData = router.usePlugin(ssrDataPluginFactory(dataLoaders));

      const state = await router.start(`/users/${id}`);

      expect(state.context.rsc).toStrictEqual(node("Profile", { userId: id }));
      expect(state.context.data).toStrictEqual({
        jsonId: id,
        source: "ssr-data",
      });

      unsubRsc();
      unsubData();
      router.dispose();
    },
  );

  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "tearing down one plugin leaves the other's namespace re-claimable but does not break it",
    async (id) => {
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const router = cloneRouter(base);

      const rscLoaders: RscLoaderFactoryMap = {
        "users.profile": () => async (params) =>
          node("Profile", { userId: params.id }),
      };
      const dataLoaders: DataLoaderFactoryMap = {
        "users.profile": () => async (params) => ({ jsonId: params.id }),
      };

      const unsubRsc = router.usePlugin(rscServerPluginFactory(rscLoaders));

      router.usePlugin(ssrDataPluginFactory(dataLoaders));

      // Tear down the rsc plugin only.
      unsubRsc();

      // ssr-data-plugin's "data" claim must remain held — confirm by
      // (a) running a fresh start() and seeing data populate
      // (b) verifying that re-claiming "rsc" is allowed (rsc plugin teardown freed it),
      //     while re-claiming "data" still throws (ssr-data-plugin still holds it).
      const state = await router.start(`/users/${id}`);

      expect(state.context.rsc).toBeUndefined();
      expect(state.context.data).toStrictEqual({ jsonId: id });

      const api = getPluginApi(router);

      expect(() => api.claimContextNamespace("rsc")).not.toThrow();
      expect(() => api.claimContextNamespace("data")).toThrow();

      router.dispose();
    },
  );
});

// =============================================================================
// Invariant 20 — per-namespace orthogonality of `invalidate(...)`.
//
// `invalidate(router, "rsc")` and `invalidate(router, "data")` are
// namespace-scoped: each plugin's `subscribeLeave` listener gates on
// `isStale(router, <own-namespace>)`. Marking one namespace must never
// trigger the other plugin's loader.
//
// The randomised sequence below exercises arbitrary interleavings of
// `"rsc"` and `"data"` marks across N navigations. Invariants asserted
// per run:
//
//   • when only data-plugin's namespace is invalidated, the rsc loader
//     fires exactly the count of navigations where it was either the
//     initial start() or a real `"rsc"` invalidate had been queued.
//   • the data loader symmetrically fires only for `"data"` marks.
//   • cross-namespace marks (e.g. `invalidate(router, "rsc")` while
//     watching the data plugin) are silently ignored — no spurious
//     loader call.
//
// The audit specifies a single-direction test ("marking 'data' never
// triggers rsc"); we cover both directions for symmetry, because the
// cost of the second case is a few more lines and the alternative
// (asymmetric coverage) would invite a future regression where one
// direction silently misbehaves.
// =============================================================================

describe("invalidate: per-namespace orthogonality", () => {
  type Mark = "rsc" | "data";

  // 1..10 marks, one navigation per mark — the audit's suggested shape.
  const arbMarkSequence = fc.array(fc.constantFrom<Mark>("rsc", "data"), {
    minLength: 1,
    maxLength: 10,
  });

  // Use `thorough` (100) rather than `standard` (50): with sequences up to
  // length 10, 50 runs gives statistically reliable coverage only to
  // sequence-length ~4 (per the audit's §1 numRuns analysis). 100 runs
  // covers the full length range with margin.
  test.prop([arbMarkSequence], { numRuns: NUM_RUNS.thorough })(
    "marking 'data' never triggers the rsc loader (and vice versa)",
    async (sequence) => {
      let rscCalls = 0;
      let dataCalls = 0;

      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const router = cloneRouter(base);

      router.usePlugin(
        rscServerPluginFactory({
          "users.profile": () => () => {
            rscCalls++;

            return node("Profile");
          },
        }),
        ssrDataPluginFactory({
          "users.profile": () => () => {
            dataCalls++;

            return { sentinel: true };
          },
        }),
      );

      // Initial start() fires both interceptors exactly once — both
      // plugins claim distinct namespaces and both `start` interceptors
      // run on the awaited next(path).
      await router.start("/users/seed");

      expect(rscCalls).toBe(1);
      expect(dataCalls).toBe(1);

      const rscBaseline = rscCalls;
      const dataBaseline = dataCalls;

      let nav = 0;
      let expectedRscDelta = 0;
      let expectedDataDelta = 0;

      for (const mark of sequence) {
        if (mark === "rsc") {
          invalidate(router, "rsc");
          // Each invalidate(rsc) + navigation = exactly one rsc loader
          // re-run (idempotent within one transition).
          expectedRscDelta += 1;
        } else {
          invalidateData(router, "data");
          expectedDataDelta += 1;
        }

        nav += 1;
        // Reload to the same route — guarantees the leave handler fires
        // (a same-state guard would otherwise short-circuit).
        await router.navigate("users.profile", { id: `n${nav}` }, undefined, {
          reload: true,
        });
      }

      expect(rscCalls - rscBaseline).toBe(expectedRscDelta);
      expect(dataCalls - dataBaseline).toBe(expectedDataDelta);

      // Conservation cross-check: per the orthogonality contract each
      // navigation triggers EXACTLY ONE plugin re-run (whichever was
      // invalidated). Sum of post-baseline deltas must equal the number
      // of navigations. Without this, a regression where both plugins
      // re-fire on a single invalidate would pass the per-delta check
      // (each rscDelta could "accidentally" equal expectedRscDelta if
      // both plugins inflate together) — symmetric inflation is invisible
      // to delta-vs-expected math at N=10 but caught here.
      expect(rscCalls + dataCalls - rscBaseline - dataBaseline).toBe(
        sequence.length,
      );

      router.dispose();
    },
  );
});

// =============================================================================
// SSR Mode invariants (RSC: only "full" | "client-only" allowed)
// =============================================================================

describe("ssr mode: getSsrRscMode reflects the resolved mode", () => {
  test.prop([arbRscSsrMode, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "string-form ssr → getSsrRscMode returns the same mode",
    async (mode, id) => {
      const { router } = createRscRouter({
        "users.profile": {
          ssr: mode,
          loader: () => () => node("Profile", { id }),
        },
      });

      const state = await router.start(`/users/${id}`);

      expect(getSsrRscMode(state)).toBe(mode);

      router.stop();
    },
  );
});

describe("ssr mode: client-only skips the loader", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader is never invoked when mode='client-only'",
    async (id) => {
      let callCount = 0;

      const { router } = createRscRouter({
        "users.profile": {
          ssr: "client-only",
          loader: () => () => {
            callCount++;

            return node("WontRun");
          },
        },
      });

      const state = await router.start(`/users/${id}`);

      expect(callCount).toBe(0);
      expect(state.context.rsc).toBeUndefined();
      expect(getSsrRscMode(state)).toBe("client-only");

      router.stop();
    },
  );
});

describe("ssr mode: function-form resolver runs once per start()", () => {
  test.prop([arbRscSsrMode, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "resolver invoked exactly once with the resolved state",
    async (mode, id) => {
      let resolverCalls = 0;

      const { router } = createRscRouter({
        "users.profile": {
          ssr: () => {
            resolverCalls++;

            return mode;
          },
          loader: () => () => node("Profile", { id }),
        },
      });

      await router.start(`/users/${id}`);

      expect(resolverCalls).toBe(1);

      router.stop();
    },
  );
});

describe("ssr mode: getSsrRscMode is a pure read-side guard", () => {
  // Narrow wrapper around the shared `stateWith` helper — `getSsrRscMode`
  // reads only `state.context.ssrRscMode`, so a single-field State is the
  // minimal fixture. Keeping the wrapper local to this describe block
  // lets the foreign-mode and idempotency tests share the same builder.
  const stateWithMode = (ssrRscMode: unknown): State =>
    stateWith({ ssrRscMode });

  test.prop([fc.constantFrom<RscSsrMode>("full", "client-only")], {
    numRuns: NUM_RUNS.standard,
  })(
    "transparency: for any allowed mode m, getSsrRscMode(state{ssrRscMode:m}) === m",
    (m) => {
      expect(getSsrRscMode(stateWithMode(m))).toBe(m);
    },
  );

  // Anything that is NOT in ALLOWED_RSC_MODES — including "data-only", random
  // strings, falsy non-nullish values, null, objects, numbers — must collapse
  // to "full". Without this guard, downstream `mode === "full"` branches
  // silently misbehave on cast-bypassed garbage.
  const arbForeignMode = fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(0),
    fc.constant(""),
    fc.constant(false),
    fc.constant("data-only"),
    fc.string().filter((s) => s !== "full" && s !== "client-only"),
    fc.integer(),
    fc.boolean(),
    fc.object(),
  );

  // `arbForeignMode` has 10 branches via `fc.oneof` — `thorough` (100)
  // gives each branch only ~10 expected hits, which is too few to reliably
  // cover regressions limited to one specific branch shape. `exhaustive`
  // (200) raises the per-branch expectation to ~20 — twice the prior
  // coverage at twice the runtime, still well under the property suite's
  // sub-second budget.
  test.prop([arbForeignMode], { numRuns: NUM_RUNS.exhaustive })(
    "guard: any non-allowed value collapses to 'full'",
    (foreign) => {
      expect(getSsrRscMode(stateWithMode(foreign))).toBe("full");
    },
  );

  // Inv (NEW) — Idempotency of getSsrRscMode. The function maps any input
  // into ALLOWED_RSC_MODES, then returns it as-is on subsequent reads.
  // Two consecutive reads of a state whose `ssrRscMode` is already the
  // resolved mode must give the same result — protects against a
  // regression that double-validates (e.g. wraps the read in a fallback
  // chain that shifts state under read after a `set ssrRscMode` from a
  // foreign writer).
  test.prop([arbForeignMode], { numRuns: NUM_RUNS.exhaustive })(
    "idempotency: getSsrRscMode(state{ssrRscMode: getSsrRscMode(s)}) === getSsrRscMode(s)",
    (foreign) => {
      const once = getSsrRscMode(stateWithMode(foreign));
      const twice = getSsrRscMode(stateWithMode(once));

      expect(twice).toBe(once);
    },
  );
});

// =============================================================================
// rscActionPluginFactory invocation count
// =============================================================================

describe("rscAction: getResult invoked exactly N times for N start() calls", () => {
  test.prop([arbParamValue, fc.integer({ min: 1, max: 5 })], {
    numRuns: NUM_RUNS.standard,
  })("on the same router: counter increments per start", async (id, n) => {
    let calls = 0;
    const router = createRouter(ROUTES, { defaultRoute: "home" });

    router.usePlugin(
      rscActionPluginFactory((): RscActionResult => ({
        returnValue: { ok: true, data: { id, call: ++calls } },
      })),
    );

    for (let i = 0; i < n; i++) {
      const state = await router.start("/");

      expect(
        (state.context.rscAction?.returnValue?.data as { call: number }).call,
      ).toBe(i + 1);

      router.stop();
    }

    expect(calls).toBe(n);
  });

  test.prop([fc.integer({ min: 1, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "skip semantics: undefined return leaves rscAction undefined for that start",
    async (n) => {
      let calls = 0;
      const router = createRouter(ROUTES, { defaultRoute: "home" });

      router.usePlugin(
        rscActionPluginFactory((): RscActionResult | undefined => {
          calls += 1;

          // Return undefined on every other call.
          return calls % 2 === 0
            ? { returnValue: { ok: true, data: calls } }
            : undefined;
        }),
      );

      for (let i = 1; i <= n; i++) {
        const state = await router.start("/");

        if (i % 2 === 0) {
          expect(state.context.rscAction?.returnValue?.data).toBe(i);
        } else {
          expect(state.context.rscAction).toBeUndefined();
        }

        router.stop();
      }

      expect(calls).toBe(n);
    },
  );
});

describe("ssr mode: short form === { loader }", () => {
  test.prop([arbReactNode, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "short-form factory and { loader: factory } produce identical rsc + mode='full'",
    async (payload, id) => {
      const baseShort = createRouter(ROUTES, { defaultRoute: "home" });
      const baseObject = createRouter(ROUTES, { defaultRoute: "home" });

      baseShort.usePlugin(
        rscServerPluginFactory({
          "users.profile": () => () => payload,
        }),
      );

      baseObject.usePlugin(
        rscServerPluginFactory({
          "users.profile": { loader: () => () => payload },
        }),
      );

      const stateShort = await baseShort.start(`/users/${id}`);
      const stateObject = await baseObject.start(`/users/${id}`);

      expect(stateShort.context.rsc).toStrictEqual(stateObject.context.rsc);
      expect(getSsrRscMode(stateShort)).toBe("full");
      expect(getSsrRscMode(stateObject)).toBe("full");

      baseShort.stop();
      baseObject.stop();
    },
  );
});

// =============================================================================
// buildRscPayload — wire-format helper invariants
// =============================================================================
//
// The audit (§6) calls out six invariants of `buildRscPayload` that are
// reachable from the function's signature but absent from INVARIANTS.md
// and untested via PBT. Documenting + property-testing them is cheap and
// catches refactor-time regressions that would otherwise only surface in
// integration tests inside the SSR demo apps.
//
// The function reads `state.context.rsc` and `state.context.rscAction`
// and is otherwise side-effect-free — no router, no claim machinery —
// so the property tests work on hand-built State objects.

describe("buildRscPayload: identity / override / null preservation", () => {
  test.prop([arbReactNode], { numRuns: NUM_RUNS.thorough })(
    "identity: buildRscPayload(state).root === state.context.rsc",
    (rsc) => {
      const payload = buildRscPayload(stateWith({ rsc }));

      // toBe (===) — the contract is reference passthrough, not deep
      // copy. A regression that wrapped rsc in a new object would still
      // pass toStrictEqual but fail here.
      expect(payload.root).toBe(rsc);
    },
  );

  test.prop([arbReactNode, arbReactNode], { numRuns: NUM_RUNS.thorough })(
    "override winning: any defined override replaces state.context.rsc",
    (rsc, override) => {
      // arbReactNode emits `null` as a valid ReactNode and `undefined` is
      // NOT in the arbitrary's range — so `override` is always defined.
      // The audit's separate `null preservation` property below covers
      // the `null` override case.
      const payload = buildRscPayload(stateWith({ rsc }), override);

      expect(payload.root).toBe(override);
    },
  );

  test.prop([arbReactNode], { numRuns: NUM_RUNS.standard })(
    "null preservation: explicit null override is preserved, not collapsed to default",
    (rsc) => {
      // The function uses `=== undefined`, not `??`, to distinguish
      // "render nothing" (null) from "use the default" (undefined).
      // Loss of this distinction would silently fall back to rsc, which
      // is the bug this invariant guards against.
      const payload = buildRscPayload(stateWith({ rsc }), null);

      expect(payload.root).toBeNull();
    },
  );
});

describe("buildRscPayload: rscAction passthrough + omit semantics", () => {
  test.prop([arbReactNode], { numRuns: NUM_RUNS.standard })(
    "absent action: returnValue and formState keys are OMITTED, not undefined",
    (rsc) => {
      const payload = buildRscPayload(stateWith({ rsc }));

      // `in` distinguishes "key absent" from "key present with undefined"
      // — `exactOptionalPropertyTypes: true` consumers rely on this.
      expect("returnValue" in payload).toBe(false);
      expect("formState" in payload).toBe(false);
    },
  );

  test.prop([arbReactNode, arbRscAction], { numRuns: NUM_RUNS.thorough })(
    "passthrough by reference: payload.returnValue/formState === action.<field>",
    (rsc, action) => {
      const payload = buildRscPayload(stateWith({ rsc, rscAction: action }));

      // Reference identity (toBe) — the function publishes the existing
      // object graph, not a copy. A regression that deep-cloned the
      // action result would inflate Flight payload size and break
      // identity-based memoization downstream.
      if (action.returnValue === undefined) {
        expect("returnValue" in payload).toBe(false);
      } else {
        expect(payload.returnValue).toBe(action.returnValue);
      }

      if (action.formState === undefined) {
        expect("formState" in payload).toBe(false);
      } else {
        expect(payload.formState).toBe(action.formState);
      }
    },
  );

  test.prop([arbReactNode], { numRuns: NUM_RUNS.standard })(
    "fixpoint: feeding the output's root back as override yields the same root",
    (rsc) => {
      // buildRscPayload(state, buildRscPayload(state).root) — applying
      // the function to its own output. The expected post-condition is
      // that .root tracks state.context.rsc (or the override, which
      // here IS state.context.rsc by construction). Catches a regression
      // where override handling diverges from default handling.
      const inner = buildRscPayload(stateWith({ rsc }));
      const outer = buildRscPayload(stateWith({ rsc }), inner.root);

      expect(outer.root).toBe(rsc);
    },
  );
});

// =============================================================================
// getSsrRscMode — closed-set membership (Inv 28)
// =============================================================================
//
// §6.8: for ANY input, `getSsrRscMode` returns a value ∈ ALLOWED_RSC_MODES.
// The defensive-read contract — never leak a value outside the allowed set
// downstream, regardless of how the context got populated (typed write,
// TS-cast bypass, foreign writer). Complements Inv 16 (reflects valid
// input) and Inv 21 (idempotency under double-application).

describe("getSsrRscMode: closed-set membership (Inv 28)", () => {
  const stateWithMode = (ssrRscMode: unknown): State =>
    stateWith({ ssrRscMode });

  const arbAnyInput = fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.double(),
    fc.string(),
    fc.constant("full"),
    fc.constant("client-only"),
    fc.constant("data-only"),
    fc.array(fc.anything()),
    fc.object(),
  );

  test.prop([arbAnyInput], { numRuns: NUM_RUNS.exhaustive })(
    "result ∈ ALLOWED_RSC_MODES for any input",
    (input) => {
      const result = getSsrRscMode(stateWithMode(input));

      // toContain on a readonly array — Inv 28 is "result is one of the
      // documented set members". A regression that returned a foreign
      // string (e.g. the raw value when validation slips) would fail
      // here, even if downstream branches still functioned.
      expect(ALLOWED_RSC_MODES).toContain(result);
    },
  );
});

// =============================================================================
// rscActionPluginFactory — runtime guard invariants (Inv 29-30)
// =============================================================================
//
// §6.9-6.11: the per-start guard at `actionFactory.ts:110-119` rejects
// Promise/thenable, array, and null. PBT generalises the existing
// functional coverage:
//
// - Inv 29: any plain object (typeof === "object", non-null, non-array,
//   non-thenable) passes the guard and survives `claim.write`.
// - Inv 30: any thenable result raises a "Promise/thenable …" TypeError
//   with the documented prefix.
//
// §6.10 (determinism of `describeBadResult`) is trivially true in JS —
// no PBT, but documented as Inv 29's pre-condition.

describe("rscActionPluginFactory: guard accepts plain objects (Inv 29)", () => {
  // arbPlainAcceptedResult — values that ALL of: typeof === "object",
  // not null, not array, no own/inherited `.then === function`. The
  // factory must accept these without throwing during start().
  //
  // We use `fc.dictionary(string, primitive)` to guarantee plain-object
  // shape without ever generating a `.then` field — a thenable shape
  // would land in Inv 30's territory, not here.
  const arbPlainAcceptedResult = fc
    .dictionary(
      fc
        .string({ minLength: 1, maxLength: 8 })
        // Hard-exclude `then`/`Symbol.toStringTag`-class collisions —
        // we only test the non-thenable branch here.
        .filter((k) => k !== "then"),
      fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
      { minKeys: 0, maxKeys: 4 },
    )
    .map((dict) => dict as unknown as RscActionResult);

  test.prop([arbPlainAcceptedResult], { numRuns: NUM_RUNS.thorough })(
    "any plain object payload flows through claim.write without throwing",
    async (result) => {
      const router = createRouter(ROUTES, { defaultRoute: "home" });

      router.usePlugin(rscActionPluginFactory(() => result));

      // The contract: if guard accepts (typeof === "object" && !null &&
      // !Array && !.then), `claim.write` succeeds. A regression that
      // tightened the guard (e.g. required exact `RscActionResult`
      // shape) would fail here on random extras.
      const state = await router.start("/");

      expect(state.context.rscAction).toBe(result);

      router.stop();
    },
  );
});

describe("rscActionPluginFactory: Promise/thenable detection (Inv 30)", () => {
  // arbThenableResult — any object with `.then === function`. The
  // guard at actionFactory.ts:114 must reject these with a
  // "Promise/thenable" prefix. This catches the common consumer
  // mistake of wiring an `async getResult`. We DELIBERATELY build
  // thenable POJOs here — that's the regression class under test —
  // so the unicorn lint rule is disabled inline.
  const arbThenableResult = fc.oneof(
    // Real Promises.
    fc.anything().map((v) => Promise.resolve(v)),
    // POJO thenable — `.then` returning various callables. Built via
    // Object.defineProperty to avoid the literal-`then`-key linter
    // trigger while still exposing the same own-property shape.
    fc
      .constantFrom<() => unknown>(
        () => undefined,
        () => null,
        () => {
          throw new Error("ignored");
        },
      )
      .map((thenFn) => {
        const obj: Record<string, unknown> = {};

        // Deliberately constructs a thenable POJO to exercise the
        // Promise-detection guard at actionFactory.ts:114.
        // eslint-disable-next-line unicorn/no-thenable
        Object.defineProperty(obj, "then", {
          value: thenFn,
          enumerable: true,
          writable: true,
          configurable: true,
        });

        return obj;
      }),
  );

  test.prop([arbThenableResult], { numRuns: NUM_RUNS.thorough })(
    "any thenable result raises TypeError with the Promise/thenable prefix",
    async (result) => {
      const router = createRouter(ROUTES, { defaultRoute: "home" });

      router.usePlugin(rscActionPluginFactory(() => result as RscActionResult));

      await expect(router.start("/")).rejects.toThrow(/Promise\/thenable/);

      router.stop();
    },
  );
});

// =============================================================================
// staleRegistry — Set-based registry invariants (Inv 31-33)
// =============================================================================
//
// §6.12-6.14: the registry is a WeakMap<Router, Set<string>>, so the
// expected algebra is:
//
// - Inv 31 (idempotent mark): markStale(r, ns); markStale(r, ns) leaves
//   the registry in the same state as a single mark — verified by
//   `isStale === true` after either count, and a single `clearStale`
//   restoring `isStale === false` (no residual marks from the
//   duplicated call).
// - Inv 32 (inverse): mark/clear restores isStale to false.
// - Inv 33 (per-router isolation): marking one router does not affect
//   another. Verifies the WeakMap key isolation contract.
//
// All tests use fresh router instances per fast-check trial — the
// module-level WeakMap survives across trials, so cross-talk would
// quickly poison a shared router. Fresh-per-trial == clean baseline.

describe("staleRegistry: markStale is idempotent (Inv 31)", () => {
  test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
    numRuns: NUM_RUNS.standard,
  })("double markStale collapses to a single Set entry", (namespace) => {
    const router = createRouter(ROUTES, { defaultRoute: "home" });

    markStale(router, namespace);
    markStale(router, namespace);

    // Both reads must observe the flag.
    expect(isStale(router, namespace)).toBe(true);

    // A single clearStale must restore the false state — if markStale
    // were counting, two clears would be needed.
    clearStale(router, namespace);

    expect(isStale(router, namespace)).toBe(false);
  });
});

describe("staleRegistry: markStale / clearStale is an inverse pair (Inv 32)", () => {
  test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
    numRuns: NUM_RUNS.standard,
  })("mark; clear; isStale === false", (namespace) => {
    const router = createRouter(ROUTES, { defaultRoute: "home" });

    expect(isStale(router, namespace)).toBe(false);

    markStale(router, namespace);

    expect(isStale(router, namespace)).toBe(true);

    clearStale(router, namespace);

    expect(isStale(router, namespace)).toBe(false);
  });
});

describe("staleRegistry: per-router isolation (Inv 33)", () => {
  test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "markStale on one router leaves another router unaffected",
    (namespace) => {
      const r1 = createRouter(ROUTES, { defaultRoute: "home" });
      const r2 = createRouter(ROUTES, { defaultRoute: "home" });

      markStale(r1, namespace);

      expect(isStale(r1, namespace)).toBe(true);
      expect(isStale(r2, namespace)).toBe(false);

      // Symmetric: marking r2 doesn't retroactively affect r1's flag.
      markStale(r2, "another-namespace");

      expect(isStale(r1, namespace)).toBe(true);
      expect(isStale(r1, "another-namespace")).toBe(false);
    },
  );
});
