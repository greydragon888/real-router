/**
 * #809 — owner coverage for shared/ssr residuals.
 *
 * This package is the coverage owner of `shared/ssr` (see vitest.config.mts):
 * scenarios here exercise generic `createSsrLoaderPlugin` behaviour that the
 * ssr-data-plugin public API never reaches with its own configuration —
 * notably the rsc-server-plugin wiring (no deferred namespaces).
 */

import { createRouter } from "@real-router/core";
import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { defer, ssrDataPluginFactory } from "../../src";
import { createSsrLoaderPlugin } from "../../src/shared-ssr";

import type { Router, State } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users/:id" },
];

const buildServerState = (context: Record<string, unknown>): State =>
  ({
    name: "users",
    params: { id: "42" },
    search: {},
    path: "/users/42",
    transition: {
      phase: "activating",
      reason: "success",
      segments: { deactivated: [], activated: [], intersection: "" },
    },
    context,
  }) as unknown as State;

describe("shared/ssr loader plugin (#809 owner coverage)", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    router.stop();
  });

  describe("hydration without deferred namespaces (rsc-server-plugin wiring)", () => {
    it("writes the hydrated value and skips deferred reconstruction", async () => {
      const loader = vi.fn().mockResolvedValue("client-render");

      // Mirror rscServerPluginFactory's config: no deferredNamespace /
      // deferredKeysNamespace → reconstructDeferredFromHydration must
      // early-return on its null deferredConfig instead of touching claims.
      router.usePlugin(
        createSsrLoaderPlugin<unknown>(
          { users: () => loader },
          {
            namespace: "rsc",
            modeNamespace: "ssrRscMode",
            errorPrefix: "[test-rsc]",
            allowedModes: ["full", "client-only"],
            registered: new WeakSet(),
          },
        ),
      );

      const json = serializeRouterState(
        buildServerState({ rsc: "server-render" }),
      );
      const state = await hydrateRouter(router, json);

      expect(loader).not.toHaveBeenCalled();
      expect((state.context as { rsc?: unknown }).rsc).toBe("server-render");
    });

    it("refuses a defer() payload instead of writing it to the value slot (#1917)", async () => {
      // Under this wiring the plugin has no deferred channel, so a `defer()`
      // payload is a configuration error rather than a value. Writing it whole
      // into `state.context.rsc` would be silent in every direction: the
      // promises are never awaited, and their rejections cannot surface because
      // `defer()` attaches a no-op `.catch()` to each one.
      const payload = defer({
        critical: "shell",
        deferred: { late: Promise.resolve("never-read") },
      });

      router.usePlugin(
        createSsrLoaderPlugin<unknown>(
          { users: () => () => payload },
          {
            namespace: "rsc",
            modeNamespace: "ssrRscMode",
            errorPrefix: "[test-rsc]",
            allowedModes: ["full", "client-only"],
            registered: new WeakSet(),
          },
        ),
      );

      await expect(router.start("/users/1")).rejects.toThrow(
        /defer\(\) payload, but this plugin has no deferred channel/u,
      );

      // The refusal happens before the write, so the slot stays clean.
      const context = router.getState()?.context as
        Record<string, unknown> | undefined;

      expect(context && Object.hasOwn(context, "rsc")).toBe(false);
    });

    it("CONTROL — a plain value under the same wiring still writes", async () => {
      router.usePlugin(
        createSsrLoaderPlugin<unknown>(
          { users: () => () => "plain" },
          {
            namespace: "rsc",
            modeNamespace: "ssrRscMode",
            errorPrefix: "[test-rsc]",
            allowedModes: ["full", "client-only"],
            registered: new WeakSet(),
          },
        ),
      );

      const state = await router.start("/users/1");

      expect((state.context as { rsc?: unknown }).rsc).toBe("plain");
    });
  });

  describe("loaders validator", () => {
    it("accepts an object entry with only a loader (no ssr key)", async () => {
      const loader = vi.fn().mockResolvedValue({ ok: true });

      router.usePlugin(
        ssrDataPluginFactory({
          users: { loader: () => loader },
        }),
      );

      const state = await router.start("/users/42");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toStrictEqual({ ok: true });
    });
  });
});
