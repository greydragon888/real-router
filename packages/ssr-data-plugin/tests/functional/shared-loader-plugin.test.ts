/**
 * #809 — owner coverage for shared/ssr residuals.
 *
 * This package is the coverage owner of `shared/ssr` (see vitest.config.mts):
 * scenarios here exercise generic `createSsrLoaderPlugin` behaviour that the
 * ssr-data-plugin public API never reaches with its own configuration —
 * notably the rsc-server-plugin wiring (no deferred namespaces) — plus the
 * shared error classes.
 */

import { createRouter } from "@real-router/core";
import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { ssrDataPluginFactory } from "../../src";
import { LoaderNotFound, LoaderRedirect, withTimeout } from "../../src/errors";
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

  describe("shared error classes", () => {
    it("LoaderRedirect defaults to status 302 and carries the target", () => {
      const err = new LoaderRedirect("/login");

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("LOADER_REDIRECT");
      expect(err.name).toBe("LoaderRedirect");
      expect(err.target).toBe("/login");
      expect(err.status).toBe(302);
      expect(err.message).toBe("Redirect to /login");
    });

    it("LoaderRedirect accepts an explicit permanent-redirect status", () => {
      const err = new LoaderRedirect("/moved", 308);

      expect(err.status).toBe(308);
    });

    it("LoaderNotFound carries the missing resource and 404 code", () => {
      const err = new LoaderNotFound("product:42");

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("LOADER_NOT_FOUND");
      expect(err.name).toBe("LoaderNotFound");
      expect(err.resource).toBe("product:42");
      expect(err.message).toBe("Resource not found: product:42");
    });
  });

  describe("withTimeout upstream-signal edge", () => {
    it("falls back to a fresh AbortError when an aborted upstream has no reason", async () => {
      // `AbortSignal.reason` is writable in principle — a caller can hand us
      // an already-aborted signal whose reason was never populated. The
      // reject must then synthesize an AbortError instead of `undefined`.
      const bareAbortedSignal = {
        aborted: true,
        reason: undefined,
      } as unknown as AbortSignal;

      const loader = vi.fn();

      await expect(
        withTimeout("users", 50, loader, {
          upstreamSignal: bareAbortedSignal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(loader).not.toHaveBeenCalled();
    });
  });
});
