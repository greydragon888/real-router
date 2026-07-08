import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

interface TestDeps {
  token?: string;
}

describe("cloneRouter()", () => {
  it("should return a new Router instance", () => {
    const router = createTestRouter();
    const clone = cloneRouter(router);

    expect(clone).not.toBe(router);
  });

  it("should share the route tree with original", () => {
    const router = createTestRouter();
    const clone = cloneRouter(router);

    expect(router.buildPath("home")).toBe(clone.buildPath("home"));
  });

  it("should accept custom dependencies and make them accessible", () => {
    const router = createRouter<TestDeps>(
      [{ name: "home", path: "/home" }],
      {},
      { token: "original" },
    );
    const clone = cloneRouter(router, { token: "cloned" });
    const deps = getDependenciesApi(clone);

    expect(deps.get("token")).toBe("cloned");
  });

  it("carries over the original (non-overridden) dependencies to the clone", () => {
    const router = createRouter<TestDeps>(
      [{ name: "home", path: "/home" }],
      {},
      { token: "original" },
    );
    // No override passed — cloneRouter must copy the SOURCE dependencies onto the
    // clone (getCloneState().dependencies); the existing test above only proves overrides.
    const clone = cloneRouter(router);

    expect(getDependenciesApi(clone).get("token")).toBe("original");
  });

  it("should work without dependencies argument", () => {
    const router = createTestRouter();
    const clone = cloneRouter(router);

    expect(getRoutesApi(clone).has("home")).toBe(true);
  });

  it("carries the source rootPath to the clone (#1175)", async () => {
    const base = createRouter([{ name: "user", path: "/users/:id" }]);

    getPluginApi(base).setRootPath("/app");

    const clone = cloneRouter(base);

    // The clone must build and match under the same sub-path as the base —
    // an SSR sub-path deployment (one clone per request) otherwise 404s.
    expect(clone.buildPath("user", { id: "1" })).toBe("/app/users/1");

    await clone.start("/app/users/1");

    expect(clone.getState()?.name).toBe("user");
  });

  it("clone runs the same effective guard as the base — external wins over definition (#1174)", async () => {
    const base = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
    ]);

    // External guard BLOCKS, registered first; a definition guard that ALLOWS is
    // then added via update() (temporal order external → definition). Under the
    // external-wins policy (#1174) the EXTERNAL guard is effective on BOTH the
    // base and the clone — regardless of registration order — so the clone can
    // never run the other guard than the base (an SSR auth divergence otherwise).
    getLifecycleApi(base).addActivateGuard("admin", () => () => false);
    getRoutesApi(base).update("admin", { canActivate: () => () => true });

    await base.start("/");

    const clone = cloneRouter(base);

    await clone.start("/");

    const baseAllowed = await base.navigate("admin").then(
      () => true,
      () => false,
    );
    const cloneAllowed = await clone.navigate("admin").then(
      () => true,
      () => false,
    );

    // External wins → both block. The clone must not diverge from the base.
    expect(baseAllowed).toBe(false);
    expect(cloneAllowed).toBe(baseAllowed);
  });

  // cloneRouter re-registers DEFINITION guards (from route config) with
  // `isFromDefinition: true`, so they retain the same origin as on the original
  // and are cleared by the clone's own `replace()` (external guards survive). The
  // two tests below assert that fidelity through the public surface — they fail
  // if the clone tracks a cloned definition guard as external.
  it("preserves the DEFINITION origin of a cloned canActivate guard (cleared on the clone's replace)", async () => {
    const router = createRouter([
      { name: "home", path: "/home" },
      { name: "guarded", path: "/guarded", canActivate: () => () => false },
    ]);
    const clone = cloneRouter(router);

    await clone.start("/home");

    // The cloned definition guard fires on the clone.
    await expect(clone.navigate("guarded")).rejects.toThrow();

    // replace() clears DEFINITION guards — a clone that mis-tracked it as
    // external would keep blocking here.
    getRoutesApi(clone).replace([
      { name: "home", path: "/home" },
      { name: "guarded", path: "/guarded" }, // no guard
    ]);

    await clone.navigate("guarded");

    expect(clone.getState()?.name).toBe("guarded");

    clone.dispose();
  });

  it("preserves the DEFINITION origin of a cloned canDeactivate guard (cleared on the clone's replace)", async () => {
    const router = createRouter([
      { name: "home", path: "/home", canDeactivate: () => () => false },
      { name: "away", path: "/away" },
    ]);
    const clone = cloneRouter(router);

    await clone.start("/home");

    // The cloned definition canDeactivate blocks leaving home.
    await expect(clone.navigate("away")).rejects.toThrow();

    getRoutesApi(clone).replace([
      { name: "home", path: "/home" }, // no canDeactivate
      { name: "away", path: "/away" },
    ]);

    await clone.navigate("away");

    expect(clone.getState()?.name).toBe("away");

    clone.dispose();
  });
});
