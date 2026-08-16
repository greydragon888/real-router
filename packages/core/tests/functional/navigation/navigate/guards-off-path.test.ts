import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * A guard registered ANYWHERE used to arm the cancellation machinery for EVERY
 * navigation: `hasGuards` read the router-wide guard Maps, not the guards of the
 * segments this transition actually walks. So one `canActivate` on an admin page
 * made every public navigation allocate an `AbortController`, build the liveness
 * closure and walk the interpreter — to find no guard on any of its steps.
 *
 * Pinned by COUNTING controllers rather than by timing: the two branches are
 * behaviourally equivalent (that is exactly why the waste was invisible), so a
 * behavioural assertion cannot see the difference. The count can.
 */

const RealAbortController = AbortController;

let created: number;

class CountingAbortController extends RealAbortController {
  constructor() {
    super();
    created++;
  }
}

function makeRouter(): Router {
  return createRouter([
    { name: "home", path: "/" },
    { name: "page", path: "/page" },
    {
      name: "admin",
      path: "/admin",
      children: [{ name: "users", path: "/users" }],
    },
  ]);
}

describe("guards off the transition path do not arm the machinery", () => {
  beforeEach(() => {
    created = 0;
    vi.stubGlobal("AbortController", CountingAbortController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allocates no controller when the guard sits on a route the transition does not walk", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addActivateGuard("admin", () => () => true);

    await router.start("/");
    created = 0;

    await router.navigate("page");

    expect(router.getState()?.name).toBe("page");
    expect(created).toBe(0);
  });

  it("positive control: a guard ON the walked path still arms it", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addActivateGuard("page", () => () => true);

    await router.start("/");
    created = 0;

    await router.navigate("page");

    expect(router.getState()?.name).toBe("page");
    expect(created).toBe(1);
  });

  it("positive control: a deactivate guard on the route being LEFT arms it", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addDeactivateGuard("page", () => () => true);

    await router.start("/page");
    created = 0;

    await router.navigate("home");

    expect(router.getState()?.name).toBe("home");
    expect(created).toBe(1);
  });

  it("an ancestor's guard counts as on-path for a descendant activation", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addActivateGuard("admin", () => () => true);

    await router.start("/");
    created = 0;

    await router.navigate("admin.users");

    expect(router.getState()?.name).toBe("admin.users");
    expect(created).toBe(1);
  });

  it("the off-path guard still runs — and still blocks — once the transition reaches it", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addActivateGuard("admin", () => () => false);

    await router.start("/");

    await expect(router.navigate("page")).resolves.toBeDefined();
    await expect(router.navigate("admin")).rejects.toMatchObject({
      code: "CANNOT_ACTIVATE",
    });
    expect(router.getState()?.name).toBe("page");
  });

  it("a leave listener still gets a live signal when the guard is off-path", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addActivateGuard("admin", () => () => true);

    await router.start("/");

    let seen: AbortSignal | undefined;

    router.subscribeLeave(({ signal }) => {
      seen = signal;
    });

    created = 0;

    await router.navigate("page");

    // The leave listener makes the navigation suspendable, so the controller is
    // allocated for the signal — one, from the no-guards leave arc.
    expect(created).toBe(1);
    expect(seen).toBeDefined();
    expect(seen?.aborted).toBe(false);
  });

  it("forceDeactivate skips the deactivate phase, so its guard does not arm it", async () => {
    const router = makeRouter();

    getLifecycleApi(router).addDeactivateGuard("page", () => () => true);

    await router.start("/page");
    created = 0;

    await router.navigate("home", {}, undefined, { forceDeactivate: true });

    expect(router.getState()?.name).toBe("home");
    expect(created).toBe(0);
  });
});
