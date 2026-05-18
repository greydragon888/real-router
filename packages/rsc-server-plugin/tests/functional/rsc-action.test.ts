import { createRouter } from "@real-router/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  rscActionPluginFactory,
  rscServerPluginFactory,
  type RscActionResult,
} from "../../src";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

const node = (kind: string): ReactNode =>
  ({
    type: kind,
    props: {},
    key: null,
    $$typeof: Symbol.for("react.element"),
  }) as unknown as ReactNode;

describe("@real-router/rsc-server-plugin — rscActionPluginFactory", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    router.stop();
  });

  describe("write semantics", () => {
    it("publishes the action result to state.context.rscAction", async () => {
      const result: RscActionResult = {
        returnValue: { ok: true, data: { saved: true } },
      };

      router.usePlugin(rscActionPluginFactory(() => result));

      const state = await router.start("/");

      expect(state.context.rscAction).toStrictEqual(result);
    });

    it("leaves state.context.rscAction undefined when getResult returns undefined", async () => {
      router.usePlugin(rscActionPluginFactory(() => undefined));

      const state = await router.start("/");

      expect(state.context.rscAction).toBeUndefined();
    });

    it("captures formState when set (progressive enhancement path)", async () => {
      // Use the canonical `react-dom/client.ReactFormState` shape
      // (`[stateKey: string, status: "ok" | "error"]`) rather than the
      // previous `unknown` blob. Structural assertion proves the plugin
      // passes the full tuple through — both elements and the order —
      // rather than only reference identity.
      type FormStatePair = readonly [string, "ok" | "error"];
      const formState: FormStatePair = ["form-key", "ok"];
      const result: RscActionResult<unknown, FormStatePair> = { formState };

      router.usePlugin(
        rscActionPluginFactory<unknown, FormStatePair>(() => result),
      );

      const state = await router.start("/");

      // toStrictEqual proves the tuple shape AND element order; reference
      // equality is implicit (same array literal threaded through). The
      // prior duplicate `toBe(formState)` was redundant — keep the
      // structural check that pins the contract (a regression that
      // re-wrapped the tuple would still hit `toBe` if the wrapper kept
      // identity, but would fail toStrictEqual on shape changes).
      expect(state.context.rscAction?.formState).toStrictEqual([
        "form-key",
        "ok",
      ]);
    });

    it("captures both returnValue and formState when set", async () => {
      const result: RscActionResult = {
        returnValue: { ok: true, data: 42 },
        formState: ["k", "ok"] as unknown,
      };

      router.usePlugin(rscActionPluginFactory(() => result));

      const state = await router.start("/users/1");

      expect(state.context.rscAction).toStrictEqual(result);
    });

    it("captures error returnValue (ok=false)", async () => {
      // Previously asserted only `ok` — that left the `data` channel
      // unverified for the error path. A passing test that doesn't read
      // `.data` would also pass under a regression that drops `.data`.
      // The error instance is preserved by reference (no JSON detour
      // happens here — `claim.write` stores the live object).
      const failure = new Error("validation failed");
      const result: RscActionResult<Error> = {
        returnValue: { ok: false, data: failure },
      };

      router.usePlugin(rscActionPluginFactory<Error>(() => result));

      const state = await router.start("/");

      expect(state.context.rscAction?.returnValue?.ok).toBe(false);
      expect(state.context.rscAction?.returnValue?.data).toBe(failure);
      expect(
        (state.context.rscAction?.returnValue?.data as Error).message,
      ).toBe("validation failed");
    });

    it("re-evaluates getResult on each start (closure captures live mutation)", async () => {
      let result: RscActionResult | undefined;

      router.usePlugin(rscActionPluginFactory(() => result));

      let state = await router.start("/");

      expect(state.context.rscAction).toBeUndefined();

      result = { returnValue: { ok: true, data: 1 } };
      router.stop();
      router = createRouter(routes, { defaultRoute: "home" });
      router.usePlugin(rscActionPluginFactory(() => result));

      state = await router.start("/");

      expect(state.context.rscAction).toStrictEqual(result);
    });

    it("on the SAME router, .stop() + .start() re-evaluates getResult and reflects the new closure value", async () => {
      // Original test exercised the closure via creating a fresh router
      // between starts — that masked the on-same-router contract. This
      // version keeps the router instance fixed so any cached result inside
      // the start interceptor would be exposed.
      let counter = 0;

      router.usePlugin(
        rscActionPluginFactory(
          (): RscActionResult => ({
            returnValue: { ok: true, data: ++counter },
          }),
        ),
      );

      const first = await router.start("/");

      expect(first.context.rscAction?.returnValue?.data).toBe(1);

      router.stop();

      const second = await router.start("/");

      expect(second.context.rscAction?.returnValue?.data).toBe(2);

      router.stop();

      const third = await router.start("/");

      expect(third.context.rscAction?.returnValue?.data).toBe(3);
      expect(counter).toBe(3);
    });
  });

  describe("Composition with rscServerPluginFactory", () => {
    it("rsc + rscAction namespaces coexist on the same router", async () => {
      const rscNode = node("HomePage");
      const actionResult: RscActionResult = {
        returnValue: { ok: true, data: "noop" },
      };

      router.usePlugin(
        rscServerPluginFactory({ home: () => () => rscNode }),
        rscActionPluginFactory(() => actionResult),
      );

      const state = await router.start("/");

      expect(state.context.rsc).toBe(rscNode);
      expect(state.context.rscAction).toStrictEqual(actionResult);
    });

    it("plugin order does not affect outcome (rscAction registered first)", async () => {
      const rscNode = node("ProfilePage");
      const actionResult: RscActionResult = {
        returnValue: { ok: true, data: 7 },
      };

      router.usePlugin(
        rscActionPluginFactory(() => actionResult),
        rscServerPluginFactory({
          "users.profile": () => () => rscNode,
        }),
      );

      const state = await router.start("/users/1");

      expect(state.context.rsc).toBe(rscNode);
      expect(state.context.rscAction).toStrictEqual(actionResult);
    });

    it("rejects double-registration of rscActionPluginFactory (namespace claim collision)", () => {
      router.usePlugin(rscActionPluginFactory(() => undefined));

      // Match the same `/already claimed/i` shape the rsc-loader test uses
      // so a cosmetic change to the core message can't slip through here
      // alone. The previous /rscAction|namespace|claim/i was loose enough
      // to match almost any TypeError message.
      expect(() => {
        router.usePlugin(rscActionPluginFactory(() => undefined));
      }).toThrow(/already claimed/i);
    });
  });

  describe("Validation", () => {
    it("rejects null getResult at factory time", () => {
      expect(() =>
        rscActionPluginFactory(null as unknown as () => undefined),
      ).toThrow(
        "[@real-router/rsc-server-plugin] getResult must be a function",
      );
    });

    it("rejects undefined getResult at factory time", () => {
      expect(() =>
        rscActionPluginFactory(undefined as unknown as () => undefined),
      ).toThrow(
        "[@real-router/rsc-server-plugin] getResult must be a function",
      );
    });

    it("rejects non-function getResult (string) at factory time", () => {
      expect(() =>
        rscActionPluginFactory("oops" as unknown as () => undefined),
      ).toThrow(TypeError);
    });

    it("rejects non-function getResult (object) at factory time", () => {
      expect(() =>
        rscActionPluginFactory({ ok: true } as unknown as () => undefined),
      ).toThrow(TypeError);
    });

    it("does NOT claim the rscAction namespace when getResult is invalid", () => {
      expect(() =>
        rscActionPluginFactory(null as unknown as () => undefined),
      ).toThrow();

      // Validation runs before the closure that claims the namespace, so the
      // namespace must still be available.
      expect(() =>
        router.usePlugin(rscActionPluginFactory(() => undefined)),
      ).not.toThrow();
    });

    it("accepts an arrow function returning undefined", () => {
      expect(() => rscActionPluginFactory(() => undefined)).not.toThrow();
    });
  });

  describe("Validation — getResult() return shape (per-start runtime)", () => {
    it("rejects a Promise return (typical async-getResult mistake)", async () => {
      router.usePlugin(
        rscActionPluginFactory(
          () =>
            Promise.resolve({
              returnValue: { ok: true, data: 1 },
            }) as unknown as RscActionResult,
        ),
      );

      await expect(router.start("/")).rejects.toThrow(
        /Promise\/thenable — wire your action result synchronously/,
      );
    });

    it("rejects a duck-typed thenable return", async () => {
      /* eslint-disable unicorn/no-thenable --
       * Intentional: this test exercises the duck-type branch of the runtime
       * guard. `unicorn/no-thenable` matches both object-literal `then` and
       * dynamic assignment of a function-valued `then` property. The whole
       * point of the test is to construct exactly that shape and assert
       * the guard rejects it. */
      const buildThenable = (): RscActionResult => {
        const target: Record<string, unknown> = {};
        const thenKey = ["t", "h", "e", "n"].join("");

        target[thenKey] = (): undefined => undefined;

        return target as unknown as RscActionResult;
      };
      /* eslint-enable unicorn/no-thenable */

      router.usePlugin(rscActionPluginFactory(buildThenable));

      await expect(router.start("/")).rejects.toThrow(/Promise\/thenable/);
    });

    it("rejects a string return", async () => {
      router.usePlugin(
        rscActionPluginFactory(() => "oops" as unknown as RscActionResult),
      );

      await expect(router.start("/")).rejects.toThrow(
        /getResult must return an RscActionResult object or undefined \(got string\)/,
      );
    });

    it("rejects a number return", async () => {
      router.usePlugin(
        rscActionPluginFactory(() => 42 as unknown as RscActionResult),
      );

      await expect(router.start("/")).rejects.toThrow(/got number/);
    });

    it("rejects a boolean return", async () => {
      router.usePlugin(
        rscActionPluginFactory(() => true as unknown as RscActionResult),
      );

      await expect(router.start("/")).rejects.toThrow(/got boolean/);
    });

    it("rejects a null return", async () => {
      router.usePlugin(
        rscActionPluginFactory(() => null as unknown as RscActionResult),
      );

      await expect(router.start("/")).rejects.toThrow(/got null/);
    });

    it("rejects an array return", async () => {
      router.usePlugin(
        rscActionPluginFactory(() => [1, 2, 3] as unknown as RscActionResult),
      );

      await expect(router.start("/")).rejects.toThrow(/got array/);
    });

    it("accepts an empty object (no fields set)", async () => {
      router.usePlugin(rscActionPluginFactory(() => ({}) as RscActionResult));

      const state = await router.start("/");

      expect(state.context.rscAction).toStrictEqual({});
    });

    it("preserves extra fields on the result object (caller must strip secrets via excludeContext)", async () => {
      // The runtime guard rejects non-objects, arrays, and thenables, but
      // it does NOT enforce the RscActionResult shape. Any extra fields
      // sneak through as-is — `state.context.rscAction` carries the full
      // object surface. Document the behaviour so callers know that:
      //   1. extending the result with auxiliary data works without
      //      runtime errors (forward-compatible — TS narrows what they
      //      can read, but the value survives),
      //   2. server-only fields (e.g. credentials, internal IDs) MUST be
      //      stripped at serialisation time via
      //      `serializeRouterState(state, { excludeContext: ["rscAction"] })`
      //      because they would otherwise reach the client.
      router.usePlugin(
        rscActionPluginFactory(
          () =>
            ({
              returnValue: { ok: true, data: { id: 1 } },
              formState: ["form", "ok"],
              // Extra fields that bypass the shape: forward-compat slot
              // + server-side secret leak risk.
              meta: { traceId: "abc-123" },
              secret: "internal-token",
            }) as unknown as RscActionResult,
        ),
      );

      const state = await router.start("/");
      const action = state.context.rscAction as unknown as {
        returnValue?: { ok: boolean; data: { id: number } };
        formState?: unknown;
        meta?: { traceId: string };
        secret?: string;
      };

      // Single toStrictEqual pins the EXACT key set — a regression that
      // silently filters out `meta` or `secret` would have passed under
      // the previous four-separate-expects pattern (missing keys give
      // `undefined.toStrictEqual(...)` which is a fragile failure
      // signature, plus there was no check that NO extra keys appeared).
      expect(action).toStrictEqual({
        returnValue: { ok: true, data: { id: 1 } },
        formState: ["form", "ok"],
        meta: { traceId: "abc-123" },
        secret: "internal-token",
      });
    });

    it("accepts an object with inherited non-function `then` getter (gotcha §5.12)", async () => {
      // §5.12: guard at actionFactory.ts:114 reads `.then` from the result
      // and checks `typeof === "function"`. An inherited getter that
      // returns a NON-function is NOT a thenable in JS semantics (await
      // wouldn't treat it as a Promise), so the guard correctly accepts
      // the object. Pin the current behaviour: downstream consumers see
      // an object with no own returnValue/formState — that's the caller's
      // contract violation, not a guard failure. Deliberately installs
      // a `.then` getter to verify the guard accepts non-function returns
      // (NOT a real thenable).
      // eslint-disable-next-line unicorn/no-thenable
      const proto = Object.defineProperty({}, "then", {
        get() {
          // Returns a number — typeof !== "function", so NOT thenable
          return 42;
        },
        enumerable: false,
        configurable: true,
      });
      const result = Object.create(proto) as RscActionResult;

      router.usePlugin(rscActionPluginFactory(() => result));

      const state = await router.start("/");

      // Reference identity: claim.write received the exact object.
      expect(state.context.rscAction).toBe(result);
      // No own data — caller passed an unconventional shape, plugin
      // surfaces it as-is.
      expect(state.context.rscAction?.returnValue).toBeUndefined();
      expect(state.context.rscAction?.formState).toBeUndefined();
    });

    it("rejects Object.create(Promise.prototype) — inherited .then is function (gotcha §5.13)", async () => {
      // §5.13: an object with Promise.prototype in its chain inherits
      // `Promise.prototype.then` which IS a function. The guard correctly
      // classifies this as thenable and rejects with the documented
      // "Promise/thenable" message — even though `instanceof Promise`
      // would also be true.
      const fakePromise = Object.create(Promise.prototype) as RscActionResult;

      router.usePlugin(rscActionPluginFactory(() => fakePromise));

      await expect(router.start("/")).rejects.toThrow(/Promise\/thenable/);
    });

    it("accepts Object.create(null) — null-prototype with no `.then` (gotcha §5.14)", async () => {
      // §5.14: null-prototype object — no inherited `.then` property,
      // `typeof === "object"`, not Array, not null. Guard accepts.
      const nullProto = Object.create(null) as Record<string, unknown>;

      nullProto.returnValue = { ok: true, data: "via-null-proto" };

      router.usePlugin(
        rscActionPluginFactory(() => nullProto as RscActionResult),
      );

      const state = await router.start("/");

      // The object writes through claim.write unchanged — including its
      // null prototype. Strict-equal compares own enumerable structure.
      expect(state.context.rscAction?.returnValue).toStrictEqual({
        ok: true,
        data: "via-null-proto",
      });
    });

    it("accepts a frozen result object (gotcha §5.15)", async () => {
      // §5.15: Object.freeze freezes property descriptors but doesn't
      // change typeof or prototype shape. Guard accepts; claim.write
      // stores the frozen reference on state.context.
      const frozen = Object.freeze({
        returnValue: Object.freeze({ ok: true, data: "frozen" }),
      });

      router.usePlugin(rscActionPluginFactory(() => frozen as RscActionResult));

      const state = await router.start("/");

      expect(state.context.rscAction).toBe(frozen);
      expect(Object.isFrozen(state.context.rscAction)).toBe(true);
    });

    it("accepts a payload whose returnValue.data has a `then` field (string, not function)", async () => {
      // Defensive: the duck-type guard rejects only when the *root* result
      // has `.then === function`. A user who legitimately needs a `then`
      // field nested somewhere inside data — e.g. modelling an event
      // schedule keyed by "then" — must not be rejected.
      const dataWithThenField = JSON.parse(
        '{"then":"ok-this-is-just-a-string"}',
      ) as { then: string };

      router.usePlugin(
        rscActionPluginFactory(() => ({
          returnValue: {
            ok: true,
            data: dataWithThenField,
          },
        })),
      );

      const state = await router.start("/");

      expect(
        (state.context.rscAction?.returnValue?.data as { then: string }).then,
      ).toBe("ok-this-is-just-a-string");
    });
  });

  describe("Teardown", () => {
    it("teardown releases the rscAction claim allowing re-registration", async () => {
      const teardown1 = router.usePlugin(
        rscActionPluginFactory(() => ({ returnValue: { ok: true, data: 1 } })),
      );

      teardown1();

      const teardown2 = router.usePlugin(
        rscActionPluginFactory(() => ({ returnValue: { ok: true, data: 2 } })),
      );

      const state = await router.start("/");

      expect(state.context.rscAction?.returnValue?.data).toBe(2);

      teardown2();
    });
  });
});
