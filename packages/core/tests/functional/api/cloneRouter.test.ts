import { describe, it, expect, vi } from "vitest";

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

  it("re-runs plugin factories against the fully-copied config on the clone (#1176)", () => {
    const base = createRouter([
      { name: "user", path: "/users/:id", defaultParams: { page: "1" } },
    ]);

    // The factory snapshots what it can observe about the config at execution
    // time (defaultParams surface through buildPath). It runs once on the base
    // and re-runs when cloneRouter re-registers it — both snapshots must match,
    // i.e. the clone's factory must NOT observe an empty-config window (#1176:
    // cloneRouter copies config BEFORE re-running plugin factories, fixed by
    // #1338). A regression here would silently blind init-scanning plugins on
    // every clone (empty defaultParams/decoders/forwardMap).
    const snapshots: string[] = [];

    base.usePlugin((router) => {
      snapshots.push(router.buildPath("user", { id: "1" }));

      return {};
    });

    // Base factory sees the defaultParams (page=1 folded into the query).
    expect(snapshots).toStrictEqual(["/users/1?page=1"]);

    cloneRouter(base);

    // The clone re-ran the factory against the SAME full config — not "/users/1".
    expect(snapshots).toStrictEqual(["/users/1?page=1", "/users/1?page=1"]);
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

  it("preserves a definition canDeactivate on a clone created AFTER the source left the route (#1171)", async () => {
    const guard = vi.fn(() => true); // permits, so the source leave completes
    const router = createRouter([
      { name: "home", path: "/home", canDeactivate: () => guard },
      { name: "away", path: "/away" },
    ]);

    await router.start("/home");

    // Source PERMITS the leave before the clone is taken. On the buggy path this
    // permitted leave auto-erased the config guard from the source Maps, so the
    // clone (which replays from those Maps) would never receive it — breaking
    // cloneRouter invariant #6 (guards preserved in the clone).
    await router.navigate("away");

    const clone = cloneRouter(router);

    guard.mockClear(); // isolate the clone's own invocation from the source's

    await clone.start("/home");
    await clone.navigate("away"); // clone leaves home — its config guard must fire

    expect(guard).toHaveBeenCalledTimes(1);

    router.dispose();
    clone.dispose();
  });
});

describe("cloneRouter() — logger inheritance", () => {
  const routes = [{ name: "home", path: "/home" }];

  it("clone inherits the base router's logger config (regression: M1 per-instance drop)", () => {
    const baseCallback = vi.fn();
    const base = createRouter(routes, {
      logger: {
        level: "none",
        callback: baseCallback,
        callbackIgnoresLevel: true,
      },
    });
    const clone = cloneRouter(base);

    // Empty-string isActiveRoute warns through the router's OWN logger; the clone
    // must have inherited the base's callback (the singleton used to mask this).
    clone.isActiveRoute("");

    expect(baseCallback).toHaveBeenCalledWith(
      "warn",
      "real-router",
      expect.stringContaining("empty string"),
    );
  });

  it("opts.logger overrides the callback per clone (per-request traceId); level inherited", () => {
    const baseCallback = vi.fn();
    const traceCallback = vi.fn();
    const base = createRouter(routes, {
      logger: {
        level: "none",
        callback: baseCallback,
        callbackIgnoresLevel: true,
      },
    });
    const clone = cloneRouter(base, undefined, {
      logger: { callback: traceCallback },
    });

    clone.isActiveRoute("");

    // Override callback receives the log; the base callback is unused on this clone.
    expect(traceCallback).toHaveBeenCalledWith(
      "warn",
      "real-router",
      expect.stringContaining("empty string"),
    );
    expect(baseCallback).not.toHaveBeenCalled();
  });
});
