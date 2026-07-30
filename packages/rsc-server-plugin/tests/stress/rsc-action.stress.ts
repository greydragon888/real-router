import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  rscActionPluginFactory,
  rscServerPluginFactory,
  type RscActionResult,
  type RscLoaderFactoryMap,
} from "../../src";

import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";
import type { ReactNode } from "react";

const noop = (): void => undefined;

const node = (kind: string, props: Record<string, unknown> = {}): ReactNode =>
  ({
    type: kind,
    props,
    key: null,
    $$typeof: Symbol.for("react.element"),
  }) as unknown as ReactNode;

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

describe("RSC Action Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("500 concurrent clone+rscActionPluginFactory+start+dispose: per-request closure isolation preserved", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    const results = await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        const clone = cloneRouter(base);

        // Each request synthesises its own action result via a closure that
        // captures `i`. If the plugin's start interceptor smeared closures
        // across requests, we'd see ids out of order.
        clone.usePlugin(
          rscActionPluginFactory((): RscActionResult => ({
            returnValue: { ok: true, data: { reqId: i } },
          })),
        );

        const state = await clone.start("/");
        const action = state.context.rscAction as
          { returnValue?: { data: { reqId: number } } } | undefined;

        clone.dispose();

        return action?.returnValue?.data.reqId;
      }),
    );

    for (let i = 0; i < 500; i++) {
      expect(results[i]).toBe(i);
    }
  });

  it("500 concurrent rscAction + rscServer composition: both namespaces populate independently", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const rscLoaders: RscLoaderFactoryMap = {
      "users.profile":
        () =>
        ({ params }) =>
          Promise.resolve(node("Profile", { userId: params.id })),
    };

    const results = await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(
          rscServerPluginFactory(rscLoaders),
          rscActionPluginFactory((): RscActionResult => ({
            returnValue: { ok: true, data: { reqId: i } },
          })),
        );

        const state = await clone.start(`/users/${i}`);
        const rsc = state.context.rsc;
        const action = state.context.rscAction as
          { returnValue?: { data: { reqId: number } } } | undefined;

        clone.dispose();

        return { rsc, reqId: action?.returnValue?.data.reqId };
      }),
    );

    for (let i = 0; i < 500; i++) {
      expect(results[i].rsc).toStrictEqual(
        node("Profile", { userId: String(i) }),
      );
      expect(results[i].reqId).toBe(i);
    }
  });

  it("200 sequential register+start+unsubscribe cycles: claim released cleanly each time", async () => {
    const router = createRouter(routes, { defaultRoute: "home" });

    for (let i = 0; i < 200; i++) {
      const unsub = router.usePlugin(
        rscActionPluginFactory((): RscActionResult => ({
          returnValue: { ok: true, data: i },
        })),
      );

      const state = await router.start("/");
      const action = state.context.rscAction as
        { returnValue?: { data: number } } | undefined;

      expect(action?.returnValue?.data).toBe(i);

      router.stop();
      unsub();
    }
  });

  it("100 starts where getResult throws: error propagates, claim survives next registration", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    let errorCount = 0;

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);
      const unsub = clone.usePlugin(
        rscActionPluginFactory(() => {
          throw new Error(`getResult crash ${i}`);
        }),
      );

      await expect(clone.start("/")).rejects.toThrow(`getResult crash ${i}`);

      errorCount++;

      unsub();
      clone.dispose();
    }

    expect(errorCount).toBe(100);
  });

  it("100 mixed defined/undefined results: rscAction populates only when defined", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(
          rscActionPluginFactory((): RscActionResult | undefined =>
            i % 2 === 0 ? { returnValue: { ok: true, data: i } } : undefined,
          ),
        );

        const state = await clone.start("/");
        const action = state.context.rscAction;

        clone.dispose();

        return { i, action };
      }),
    );

    // Build the expected projection in one pass and compare in one assertion
    // (vitest/no-conditional-expect forbids `expect()` inside if/else).
    const projected = results.map(({ i, action }) => ({ i, action }));
    const expected = results.map(({ i }) => ({
      i,
      action: i % 2 === 0 ? { returnValue: { ok: true, data: i } } : undefined,
    }));

    expect(projected).toStrictEqual(expected);
  });

  it("500 concurrent three-plugin composition (rsc + ssr-data + rscAction): all namespaces populate, no cross-leak", async () => {
    // The canonical RSC + SSR + Server Action shape is three plugins on
    // the same router, all populating distinct namespaces during a
    // single `start()` call. The previous suite only stressed two-plugin
    // (`rsc-server-plugin` + `rscActionPluginFactory`). This case
    // verifies the full triplet under the same per-request-isolation
    // contract: each clone owns its own action closure and its own data
    // loader payload — no smearing of `data`, `rsc`, or `rscAction`
    // across 500 simultaneous requests.
    const base = createRouter(routes, { defaultRoute: "home" });

    const rscLoaders: RscLoaderFactoryMap = {
      "users.profile":
        () =>
        ({ params }) =>
          Promise.resolve(node("Profile", { userId: params.id })),
    };
    const dataLoaders: DataLoaderFactoryMap = {
      "users.profile":
        () =>
        async ({ params }) => ({
          prefsId: params.id,
          marker: "ssr-data",
        }),
    };

    const results = await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(
          rscServerPluginFactory(rscLoaders),
          ssrDataPluginFactory(dataLoaders),
          rscActionPluginFactory((): RscActionResult => ({
            returnValue: { ok: true, data: { reqId: i } },
          })),
        );

        const state = await clone.start(`/users/${i}`);
        const rsc = state.context.rsc;
        const data = state.context.data;
        const action = state.context.rscAction as
          { returnValue?: { data: { reqId: number } } } | undefined;

        clone.dispose();

        return { rsc, data, reqId: action?.returnValue?.data.reqId };
      }),
    );

    for (let i = 0; i < 500; i++) {
      expect(results[i].rsc).toStrictEqual(
        node("Profile", { userId: String(i) }),
      );
      expect(results[i].data).toStrictEqual({
        prefsId: String(i),
        marker: "ssr-data",
      });
      expect(results[i].reqId).toBe(i);
    }
  });

  it("200 concurrent throwing getResult: each rejects, no cross-clone contamination (§7.G4)", async () => {
    // §7.G4: concurrent clones each with a throwing getResult. The
    // existing sequential test (`100 starts where getResult throws`)
    // covers the happy-error path but doesn't stress the concurrent
    // closure-isolation contract — each clone must reject with its
    // own captured error message, no cross-pollination.
    const base = createRouter(routes, { defaultRoute: "home" });
    const N = 200;

    const results = await Promise.allSettled(
      Array.from({ length: N }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(
          rscActionPluginFactory(() => {
            throw new Error(`crash-${i}`);
          }),
        );

        try {
          await clone.start("/");

          // start() should NOT resolve — the throwing getResult must
          // surface as a rejection.
          throw new Error("unreachable-resolve");
        } finally {
          clone.dispose();
        }
      }),
    );

    // Every clone must reject with ITS OWN error number. A regression
    // that leaked a shared closure across clones would surface as
    // mismatched indices (e.g. all rejecting with the same message).
    expect(results).toHaveLength(N);

    // Pre-narrow into rejected reasons so the inner expect has no
    // conditional. A regression that produced any "fulfilled" entry
    // (silent swallow of the throw) would shrink this array — caught
    // by the toHaveLength guard below before message-by-message check.
    const rejectedReasons = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason as Error).message);

    expect(rejectedReasons).toHaveLength(N);
    expect(rejectedReasons).toStrictEqual(
      Array.from({ length: N }, (_, i) => `crash-${i}`),
    );
  });
});
