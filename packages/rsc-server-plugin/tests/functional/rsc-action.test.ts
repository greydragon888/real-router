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
      const formState = ["form-key", "ok"] as unknown;
      const result: RscActionResult = { formState };

      router.usePlugin(rscActionPluginFactory(() => result));

      const state = await router.start("/");

      expect(state.context.rscAction?.formState).toBe(formState);
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
      const result: RscActionResult = {
        returnValue: { ok: false, data: new Error("validation failed") },
      };

      router.usePlugin(rscActionPluginFactory(() => result));

      const state = await router.start("/");

      expect(state.context.rscAction?.returnValue?.ok).toBe(false);
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

      expect(() => {
        router.usePlugin(rscActionPluginFactory(() => undefined));
      }).toThrow(/rscAction|namespace|claim/i);
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
