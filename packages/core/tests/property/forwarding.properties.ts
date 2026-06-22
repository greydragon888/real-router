import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { createFixtureRouter, createStartedRouter, NUM_RUNS } from "./helpers";

import type { Route, Router } from "@real-router/core";

describe("forwardState + Navigate Forwarding Properties", () => {
  it("terminality: forwardState result has no further forwardTo", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);
    const routesApi = getRoutesApi(router);

    const result = pluginApi.forwardState("oldUsers", {});
    const targetRoute = routesApi.get(result.name);

    expect(targetRoute).toBeDefined();
    expect(targetRoute!.forwardTo).toBeUndefined();
  });

  it("idempotency: forwardState(forwardState(name).name) === forwardState(name)", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const first = pluginApi.forwardState("oldUsers", {});
    const second = pluginApi.forwardState(first.name, first.params);

    expect(second.name).toBe(first.name);
  });

  it("navigate follows forward: navigate('oldUsers') resolves to 'users'", async () => {
    const router = await createStartedRouter();

    const state = await router.navigate("oldUsers");

    expect(state.name).not.toBe("oldUsers");
    expect(state.name).toBe("users");

    router.stop();
  });

  it("params preserved through forwarding", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const result = pluginApi.forwardState("oldUsers", { extra: "value" });

    expect(result.params.extra).toBe("value");
  });
});

// =============================================================================
// Generative dynamic + mixed forwardTo chains (#916, LP1)
//
// The example tests above exercise only the static `forwardTo` chain in the
// fixture (`oldUsers → users`). Dynamic (`forwardFnMap`) and mixed
// `static → dynamic → static` chains had no generative coverage, so a subtle
// regression in `#resolveDynamicForward` — e.g. dropping its trailing-static
// follow (`forwardMap[current]`) — would survive this suite and only fail a
// hand-written functional fixture. These properties close that gap.
// =============================================================================

/** One hop in a generated forward chain: a static string or a dynamic callback. */
type Hop = "static" | "dynamic";

/**
 * Chain shape: 1–6 hops, each independently static or dynamic. Across runs this
 * yields pure-static, pure-dynamic, and every mixed ordering — notably
 * `static → dynamic → static` — so `#resolveDynamicForward` is driven through
 * both its dynamic walk (`forwardFnMap`) and its trailing-static follow
 * (`forwardMap[current]`) hop by hop.
 */
const arbForwardChainShape = fc.array(
  fc.constantFrom<Hop>("static", "dynamic"),
  { minLength: 1, maxLength: 6 },
);

/**
 * Build a router whose routes form one acyclic forward chain
 * `c0 → c1 → … → c{hops.length}`, terminating at a forwardTo-free route.
 * Hop `i` forwards to `c{i+1}` statically (`forwardTo: "c{i+1}"`) or dynamically
 * (`forwardTo: () => "c{i+1}"`) per `hops[i]`. The dynamic callbacks are
 * deterministic (ignore deps/params), as required by terminality/idempotency.
 */
function createChainRouter(hops: Hop[]): Router {
  const routes: Route[] = hops.map((hop, i) => {
    const next = `c${i + 1}`;

    return {
      name: `c${i}`,
      path: `/c${i}`,
      forwardTo: hop === "static" ? next : () => next,
    };
  });

  routes.push({ name: `c${hops.length}`, path: `/c${hops.length}` });

  return createRouter(routes);
}

describe("forwardState over generative dynamic + mixed chains (#916)", () => {
  test.prop([arbForwardChainShape], { numRuns: NUM_RUNS.standard })(
    "terminality (#1): any dynamic/mixed chain resolves to the forwardTo-free terminal",
    (hops) => {
      const router = createChainRouter(hops);
      const result = getPluginApi(router).forwardState("c0", {});
      const target = getRoutesApi(router).get(result.name);

      // Resolved to the terminal route, and that route has no further forwardTo.
      expect(result.name).toBe(`c${hops.length}`);
      expect(target).toBeDefined();
      expect(target!.forwardTo).toBeUndefined();
    },
  );

  test.prop([arbForwardChainShape], { numRuns: NUM_RUNS.standard })(
    "idempotency (#2): forwardState(forwardState(c0).name) === forwardState(c0)",
    (hops) => {
      const pluginApi = getPluginApi(createChainRouter(hops));

      const first = pluginApi.forwardState("c0", {});
      const second = pluginApi.forwardState(first.name, first.params);

      expect(second.name).toBe(first.name);
    },
  );
});
