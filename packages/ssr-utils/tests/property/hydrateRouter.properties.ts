import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect } from "vitest";

import {
  getHydrationState,
  hydrateRouter,
  serializeRouterState,
} from "@real-router/ssr-utils";

import { NUM_RUNS } from "./helpers";

import type { Route, State } from "@real-router/core";
import type { SerializedRouterState } from "@real-router/ssr-utils";

/**
 * The hydration scratchpad is single-shot, whatever path the server rendered.
 *
 * `hydrateRouter` parks the server state where core's start can read it, and
 * clears it in a `finally`. Both halves matter: a start driven by hydration has
 * to SEE it, and the next start — an ordinary CSR one — must not. The scratchpad
 * is this package's, so the property is asserted here; it sat in core's
 * lifecycle property suite until #2426, from before this package existed.
 *
 * The router is a fixture of static leaves, because the property is about the
 * scratchpad's lifetime rather than about path building: the path only has to
 * round-trip through `serializeRouterState`.
 */
const ROUTES: Route[] = [
  { name: "home", path: "/home" },
  { name: "about", path: "/about" },
  { name: "users", path: "/users" },
  { name: "settings", path: "/settings" },
];

const arbStartPath = fc.constantFrom(
  ...(ROUTES.map((route) => route.path) as [string, ...string[]]),
);

const nameOf = (path: string): string =>
  ROUTES.find((route) => route.path === path)!.name;

describe("hydrateRouter scratchpad properties", () => {
  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "hydration scratchpad is single-shot: first start consumes it, a later start sees null",
    async (path) => {
      const router = createRouter(ROUTES);

      const serverState: State = {
        name: nameOf(path),
        params: {},
        search: {},
        path,
        context: { data: { hydrated: true } },
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
      };

      // Capture exactly what the start interceptor saw on each invocation. The
      // scratchpad is a per-call snapshot, so we record one entry per start
      // rather than relying on a post-hoc read (avoids ordering ambiguity).
      const seenInScratchpad: (SerializedRouterState | null)[] = [];

      const removeInterceptor = getPluginApi(router).addInterceptor(
        "start",
        async (next, startPath) => {
          seenInScratchpad.push(getHydrationState(router));

          return next(startPath);
        },
      );

      // (1) First start is driven by hydrateRouter — the scratchpad must be
      // populated and observable from inside the start interceptor.
      await hydrateRouter(router, serializeRouterState(serverState));

      expect(seenInScratchpad).toHaveLength(1);
      expect(seenInScratchpad[0]).not.toBeNull();
      expect(seenInScratchpad[0]).toMatchObject({ path });

      // After hydrateRouter resolves, its `finally` must have cleared the
      // scratchpad — single-shot, no leakage past the awaited start.
      expect(getHydrationState(router)).toBeNull();

      router.stop();

      // (2) Second start is a plain CSR start — because the scratchpad was
      // already consumed, the interceptor must observe null this time.
      await router.start(path);

      expect(seenInScratchpad).toHaveLength(2);
      expect(seenInScratchpad[1]).toBeNull();
      expect(getHydrationState(router)).toBeNull();

      removeInterceptor();
      router.stop();
    },
  );
});
