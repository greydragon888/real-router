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
