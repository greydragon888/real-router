// @vitest-environment node
import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import {
  getDirectiveRouter,
  setDirectiveRouter,
} from "../../src/directives/vLink";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router } from "@real-router/core";

// This file runs under `node` (see the @vitest-environment docblock above), so
// `document`/`window` are undefined — exactly like a real SSR process. The rest
// of the vue suite runs in jsdom, where the CLIENT push/release path is
// exercised (vLink.test.ts "nested provider isolation" mounts + unmounts a real
// RouterProvider; RouterProvider.test.ts "should call unsubscribe on unmount").
const ssrHost = (router: Router) =>
  createSSRApp({ render: () => h(RouterProvider, { router }) });

describe("RouterProvider — SSR v-link directive-stack leak (#779)", () => {
  beforeEach(() => {
    // The directive stack is module-level state; start each test from empty.
    setDirectiveRouter(null);
  });

  it("does not retain per-request routers on the v-link stack across SSR renders", async () => {
    // Confirms we are genuinely on the server path the fix guards.
    expect(typeof document).toBe("undefined");

    const r1 = createRouter([{ name: "home", path: "/" }]);
    const r2 = createRouter([{ name: "home", path: "/" }]);

    // Canonical per-request SSR: a fresh app per request, renderToString, and
    // NO app.unmount() — so onScopeDispose (the directive-stack release hook)
    // never fires. Before the fix, setup() pushed unconditionally: the
    // module-level stack grew +1 per request, strong-referenced every
    // per-request router (route tree, plugins, subscriptions), and
    // getDirectiveRouter() returned the last one instead of throwing.
    await renderToString(ssrHost(r1));
    await renderToString(ssrHost(r2));

    // Fixed: the server never pushes, so the stack stays empty and the
    // directive's "no RouterProvider ancestor" guard still fires.
    expect(() => getDirectiveRouter()).toThrow(
      /requires a RouterProvider ancestor/,
    );

    // router.dispose() cannot clear a module-level array (the issue's core
    // point). The fix sidesteps that entirely by never growing the stack, so
    // disposal is irrelevant — the stack was already empty.
    r1.dispose();
    r2.dispose();

    expect(() => getDirectiveRouter()).toThrow(
      /requires a RouterProvider ancestor/,
    );
  });
});
