import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

/**
 * The plugin is the DIAGNOSING layer for a non-string route name, and it has to
 * answer before the value is read.
 *
 * Core does not gate the name at most of its doors — see
 * `packages/core/ARCHITECTURE.md`, "Route-Name Type Gates": a door that merely
 * answers what the value's `toString` named degrades on purpose, and this
 * plugin is what turns that into an error. The rule only holds while the
 * validator seam sits ABOVE the first property-key read, so every cell here
 * pins BOTH halves: the throw, and `reads === 0`.
 *
 * A name reaches core's tables as a property key, so `ToPropertyKey` runs
 * `toString` on it — application code, called from inside a lookup. Bare core
 * coerces at most of these doors, `isActiveRoute` and `forwardState` many times
 * over, so a seam that moved below any of those reads would keep throwing and
 * stop being a diagnosis. The counts themselves live in core's
 * `tests/functional/canonical-name-read-once-1883.test.ts`.
 *
 * ⚠ Not at every door. `navigate(bag, …)` hands core an object TARGET, so core
 * takes `.name` off the bag rather than coercing the bag, and the seam is
 * handed `undefined` — that cell's `reads === 0` is free. The object form below
 * is the cell where the seam sees the caller's coercible value itself.
 */
const ROUTES = [
  { name: "home", path: "/home", defaultParams: { via: "a" } },
  { name: "fwd", path: "/fwd", forwardTo: "home" },
];

function counting(answer: string): {
  bag: object;
  readonly reads: number;
} {
  let reads = 0;

  return {
    bag: {
      toString: () => {
        reads += 1;

        return answer;
      },
    },
    get reads(): number {
      return reads;
    },
  };
}

function withPlugin(): Router {
  const router = createRouter(ROUTES, {});

  router.usePlugin(validationPlugin());

  return router;
}

describe("every route-name door is diagnosed at ZERO reads", () => {
  it("isActiveRoute", async () => {
    const probe = counting("fwd");
    const router = withPlugin();

    await router.start("/home");

    // CONTROL: the string form still answers, so the cell cannot pass by
    // making the door throw on everything.
    expect(router.isActiveRoute("fwd", {})).toBe(true);

    expect(() => router.isActiveRoute(probe.bag as never, {})).toThrow(
      TypeError,
    );
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("forwardState", () => {
    const probe = counting("fwd");
    const router = withPlugin();
    const api = getPluginApi(router);

    expect(api.forwardState("fwd", {}).name).toBe("home");

    expect(() => api.forwardState(probe.bag as never, {})).toThrow(TypeError);
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("buildNavigationState", () => {
    const probe = counting("fwd");
    const router = withPlugin();
    const api = getPluginApi(router);

    expect(api.buildNavigationState("fwd", {})?.name).toBe("home");

    expect(() => api.buildNavigationState(probe.bag as never, {})).toThrow(
      TypeError,
    );
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("buildPath — the door whose encoder runs on bare core", () => {
    const probe = counting("home");
    const router = withPlugin();

    expect(router.buildPath("home", {})).toBe("/home");

    expect(() => router.buildPath(probe.bag as never, {})).toThrow(TypeError);
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("makeState — the door that ANSWERS on bare core", () => {
    const probe = counting("home");
    const router = withPlugin();
    const api = getPluginApi(router);

    expect(api.makeState("home", {}, {}, "/home").name).toBe("home");

    // ⚑ The FOUR-argument form deliberately. With `path` supplied, bare core
    // returns a live State whose `name` is this object and whose `params` are
    // `home`'s defaults — the shape the validator exists to keep out of a
    // consumer's hands.
    expect(() => api.makeState(probe.bag as never, {}, {}, "/home")).toThrow(
      TypeError,
    );
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("navigate", async () => {
    const probe = counting("fwd");
    const router = withPlugin();

    await router.start("/home");

    // ⚑ SYNCHRONOUS, not a rejected promise: an argument-shape defect is
    // reported before a transition exists, so a `.catch()` written for
    // navigation failures cannot swallow it.
    expect(() => router.navigate(probe.bag as never, {})).toThrow(TypeError);
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("navigate — the object form, where the seam sees the bag itself", async () => {
    const probe = counting("fwd");
    const router = withPlugin();

    await router.start("/home");

    // ⚑ The cell the ⚠ above names. Bare core resolves this form and coerces
    // the name on the way, so here `reads === 0` is a claim about where the
    // seam sits; the message pins WHICH value reached it.
    expect(() => router.navigate({ name: probe.bag } as never)).toThrow(
      /expected string, got object/u,
    );
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("canNavigateTo — closed on bare core, and still diagnosed here", async () => {
    const probe = counting("fwd");
    const router = withPlugin();

    await router.start("/home");

    expect(router.canNavigateTo("fwd", {})).toBe(true);

    // ⚑ Bare core answers `false` at 0 reads, so this cell is the one place the
    // seam's presence is observable on this door at all.
    expect(() => router.canNavigateTo(probe.bag as never, {})).toThrow(
      TypeError,
    );
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("defaultRoute — core's own gate answers first, and it is not this plugin", async () => {
    const probe = counting("fwd");
    const router = createRouter(ROUTES, {
      // The literal form is refused at CONSTRUCTION by the retrospective
      // validator; only an `any`-typed CALLBACK can carry a non-string this far,
      // which is why core gates this door itself.
      defaultRoute: (() => probe.bag) as never,
    });

    router.usePlugin(validationPlugin());

    await router.start("/home");

    // ⚑ `ROUTE_NOT_FOUND`, NOT the plugin's `TypeError`: `navigateToDefault()`
    // takes no name argument, so the value only becomes visible INSIDE core,
    // and core's own gate refuses before it reaches the `navigate` seam this
    // plugin validates. Delete that gate and the assertion flips to a
    // `TypeError` — with the plugin. Without it, bare core NAVIGATES.
    await expect(router.navigateToDefault()).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
    });
    expect(probe.reads).toBe(0);

    router.dispose();
  });
});
