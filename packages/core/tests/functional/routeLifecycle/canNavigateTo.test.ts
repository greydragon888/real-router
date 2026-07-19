import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import {
  createLifecycleTestRouter,
  createTestRouter,
  type Router,
} from "./setup";

import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;
let lifecycle: ReturnType<typeof getLifecycleApi>;

describe("core/route-lifecycle/canNavigateTo", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
    routesApi = getRoutesApi(router);
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should return true for route with no guards", () => {
    expect(router.canNavigateTo("home")).toBe(true);
    expect(router.canNavigateTo("users")).toBe(true);
    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false for route with blocking activation guard", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should return true for route with passing activation guard", async () => {
    lifecycle.addActivateGuard("admin", () => () => true);
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false for current route with blocking deactivation guard", async () => {
    lifecycle.addDeactivateGuard("users", () => () => false);
    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);
  });

  it("should return true for current route with passing deactivation guard", async () => {
    lifecycle.addDeactivateGuard("users", () => () => true);
    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should check nested route guards in correct order", async () => {
    routesApi.add({ name: "users", path: "/users" }, { parent: "admin" });

    const callOrder: string[] = [];
    const adminGuard = vi.fn(() => {
      callOrder.push("admin");

      return true;
    });
    const usersGuard = vi.fn(() => {
      callOrder.push("admin.users");

      return true;
    });

    lifecycle.addActivateGuard("admin", () => adminGuard);
    lifecycle.addActivateGuard("admin.users", () => usersGuard);

    await router.navigate("index");

    const result = router.canNavigateTo("admin.users");

    expect(result).toBe(true);
    // Activation runs outermost-first: parent `admin` before child `admin.users`.
    expect(callOrder).toStrictEqual(["admin", "admin.users"]);
  });

  it("should return false if any nested parent guard blocks", async () => {
    routesApi.add({ name: "users", path: "/users" }, { parent: "admin" });

    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.addActivateGuard("admin.users", () => () => true);

    await router.navigate("index");

    expect(router.canNavigateTo("admin.users")).toBe(false);
  });

  it("should return false for non-existent route", () => {
    expect(router.canNavigateTo("nonexistent")).toBe(false);
  });

  it("should return true when route has no guards (started with no default route)", () => {
    expect(router.canNavigateTo("home")).toBe(true);
    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should resolve forwarded route and check guards on target", async () => {
    routesApi.add({
      name: "old-admin",
      path: "/old-admin",
      forwardTo: "admin",
    });
    lifecycle.addActivateGuard("admin", () => () => false);

    await router.navigate("index");

    expect(router.canNavigateTo("old-admin")).toBe(false);
  });

  it("should return false if target route has async guard (sync check cannot validate)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    lifecycle.addActivateGuard("admin", () => async () => true);
    await router.navigate("index");

    const result = router.canNavigateTo("admin");

    expect(result).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("should return true for navigating to the same route (no transition needed)", async () => {
    await router.navigate("users");

    expect(router.canNavigateTo("users")).toBe(true);
  });

  it("should return false when overwritten deactivate guard blocks", async () => {
    lifecycle.addDeactivateGuard("users", () => () => true);
    lifecycle.addDeactivateGuard("users", () => () => false); // overwrites previous

    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);
  });

  it("should return false when overwritten activate guard blocks", async () => {
    lifecycle.addActivateGuard("admin", () => () => true);
    lifecycle.addActivateGuard("admin", () => () => false); // overwrites previous

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should return true when overwritten deactivate guard unblocks (last add wins)", async () => {
    lifecycle.addDeactivateGuard("users", () => () => false);
    lifecycle.addDeactivateGuard("users", () => () => true); // overwrites previous

    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should return true when overwritten activate guard unblocks (last add wins)", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.addActivateGuard("admin", () => () => true); // overwrites previous

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should handle complex nested transitions with mixed guards", async () => {
    routesApi.add({ name: "settings", path: "/settings" }, { parent: "admin" });

    lifecycle.addDeactivateGuard("users.list", () => () => true);
    lifecycle.addActivateGuard("admin", () => () => true);
    lifecycle.addActivateGuard("admin.settings", () => () => true);

    await router.navigate("users.list");

    expect(router.canNavigateTo("admin.settings")).toBe(true);
  });

  it("should check guards with params", async () => {
    lifecycle.addActivateGuard("users.view", () => (toState) => {
      const id = toState.params.id as string;

      return Number.parseInt(id, 10) > 0;
    });

    await router.navigate("index");

    expect(router.canNavigateTo("users.view", { id: "123" })).toBe(true);
    expect(router.canNavigateTo("users.view", { id: "0" })).toBe(false);
  });

  it("logs a warning and returns false when a sync guard throws (#959)", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    lifecycle.addActivateGuard("admin", () => () => {
      throw new Error("Guard error");
    });
    await router.navigate("index");

    const result = router.canNavigateTo("admin");

    expect(result).toBe(false);
    // #959: a throwing guard must NOT vanish silently. Without observability a
    // crashed guard is indistinguishable from one that legitimately blocked
    // (`false`). navigate() surfaces the same throw via TRANSITION_ERROR; the
    // sync predicate has no error channel, so core logs it directly.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("admin"),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it("should handle transition from deeply nested route", async () => {
    routesApi.add({ name: "settings", path: "/settings" }, { parent: "admin" });
    routesApi.add(
      { name: "profile", path: "/profile" },
      { parent: "admin.settings" },
    );

    lifecycle.addDeactivateGuard("admin.settings.profile", () => () => true);
    lifecycle.addDeactivateGuard("admin.settings", () => () => true);
    lifecycle.addDeactivateGuard("admin", () => () => true);
    lifecycle.addActivateGuard("users", () => () => true);

    await router.navigate("admin.settings.profile");

    expect(router.canNavigateTo("users")).toBe(true);
  });

  it("should return false if any guard in deeply nested path blocks", async () => {
    routesApi.add({ name: "settings", path: "/settings" }, { parent: "admin" });
    routesApi.add(
      { name: "profile", path: "/profile" },
      { parent: "admin.settings" },
    );

    lifecycle.addDeactivateGuard("admin.settings.profile", () => () => true);
    lifecycle.addDeactivateGuard("admin.settings", () => () => false);
    lifecycle.addDeactivateGuard("admin", () => () => true);

    await router.navigate("admin.settings.profile");

    expect(router.canNavigateTo("users")).toBe(false);
  });

  it("should return true when guard returns true", async () => {
    lifecycle.addActivateGuard("admin", () => (_toState, _fromState) => {
      return true;
    });
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false when guard returns false", async () => {
    lifecycle.addActivateGuard("admin", () => (_toState, _fromState) => {
      return false;
    });
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should return true when guard returns true (shorthand)", async () => {
    lifecycle.addActivateGuard("admin", () => () => true);
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should handle empty params object", async () => {
    lifecycle.addActivateGuard("admin", () => () => true);
    await router.navigate("index");

    expect(router.canNavigateTo("admin", {})).toBe(true);
  });

  it("returns false when a blocking activate guard is set, with a route committed", () => {
    // `router` is started at /home (beforeEach), so a current state IS present.
    // (The genuine before-start case is covered by the two tests below.)
    lifecycle.addActivateGuard("admin", () => () => false);

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should respect canDeactivate from route config", async () => {
    const guard = vi.fn().mockReturnValue(false);

    routesApi.add({
      name: "editor",
      path: "/editor",
      canDeactivate: () => guard,
    });

    await router.navigate("editor");

    expect(router.canNavigateTo("home")).toBe(false);
    expect(guard).toHaveBeenCalled();
  });

  it("returns false instead of throwing when a required path param is missing (#725)", () => {
    // `items` is "/items/:id" — :id is required to build the target path
    expect(() => router.canNavigateTo("items", {})).not.toThrow();
    expect(router.canNavigateTo("items", {})).toBe(false);
  });

  it("returns true once the required path param is supplied (#725)", () => {
    expect(router.canNavigateTo("items", { id: "1" })).toBe(true);
  });

  // ── #970: PARITY with navigate — shared-ancestor guards are trimmed ────────
  // `canNavigateTo` must mirror `navigate`'s guard set. `navigate` does not run
  // guards on the common ancestor of the current and target route (it stays
  // mounted across the transition); `canNavigateTo` must skip them too. Before
  // the fix it built `toState` WITHOUT route-meta, so `getTransitionPath` took
  // its meta-less fast path and (de)activated the WHOLE chain incl. the shared
  // ancestor — a false-negative ("Link disabled though the click would succeed").
  //
  // The committed `fromState` is established via `start(path)` ON PURPOSE: a
  // path-matched commit carries NO route-meta, so a meta-less `toState` makes
  // both sides meta-less and `getTransitionPath` takes FAST PATH 3 (the bug). A
  // `navigate(name, params)` commit would carry meta (buildNavigateState) → the
  // STANDARD PATH trims the shared ancestor and MASKS the false-negative, so the
  // `start()` commit is load-bearing, not incidental — see probe-04.

  it("mirrors navigate: a shared-ancestor activate guard does not block intra-subtree navigation (#970)", async () => {
    const r = createTestRouter();

    await r.start("/users/view/1"); // committed = users.view{id:1}, meta-less
    getLifecycleApi(r).addActivateGuard("users", () => () => false);

    // `users` is the common ancestor of users.view and users.list, so navigate
    // does not re-activate it → its guard never runs. The predicate must agree.
    expect(r.canNavigateTo("users.list")).toBe(true);
    await expect(r.navigate("users.list")).resolves.toBeDefined();

    r.stop();
  });

  it("mirrors navigate: a shared-ancestor deactivate guard does not block intra-subtree navigation (#970)", async () => {
    const r = createTestRouter();

    await r.start("/users/view/1"); // committed = users.view{id:1}, meta-less
    getLifecycleApi(r).addDeactivateGuard("users", () => () => false);

    // `users` stays mounted across users.view → users.list, so its deactivate
    // guard never runs in navigate. The predicate must mirror that.
    expect(r.canNavigateTo("users.list")).toBe(true);
    await expect(r.navigate("users.list")).resolves.toBeDefined();

    r.stop();
  });

  it("mirrors navigate from a meta-carrying state: a shared-ancestor guard is trimmed on the STANDARD path too (#970)", async () => {
    // Counterpart to the start()-commit cases above. Here `fromState` is built by
    // navigate() (buildNavigateState → carries route-meta), so even with a
    // meta-less `toState` (the param-less `users.list` target) getTransitionPath
    // takes its STANDARD PATH, not FAST PATH 3 — and the shared `users` ancestor
    // must STILL be trimmed, mirroring navigate. This is the other half of parity
    // (the meta-carrying `fromState` arm); the fix keeps it correct on both paths.
    await router.navigate("users.view", { id: "1" }); // committed users.view{id:1} — meta-carrying
    lifecycle.addActivateGuard("users", () => () => false);

    expect(router.canNavigateTo("users.list")).toBe(true);
    await expect(router.navigate("users.list")).resolves.toBeDefined();
  });

  // ── Side-effect / lifecycle invariants ────────────────────────────────────
  // `canNavigateTo` is a read-only predicate: it must not mutate state, move the
  // FSM, or fire subscriptions. Verified empirically in
  // benchmarks/audit-probes/can-navigate-to-2026-06-25/probe-01.

  it("does not mutate router state (getState() is reference-identical)", async () => {
    await router.navigate("users.list");
    const before = router.getState();

    router.canNavigateTo("admin");
    router.canNavigateTo("orders.pending");
    router.canNavigateTo("home");

    expect(router.getState()).toBe(before);
  });

  it("does not transition the FSM (isLeaveApproved stays false)", async () => {
    await router.navigate("users.list");

    expect(router.isLeaveApproved()).toBe(false);

    router.canNavigateTo("admin");

    expect(router.isLeaveApproved()).toBe(false);
  });

  it("does not fire subscribe or subscribeLeave listeners (no commit)", async () => {
    await router.navigate("users.list");

    const onSuccess = vi.fn();
    const onLeave = vi.fn();

    router.subscribe(onSuccess);
    router.subscribeLeave(onLeave);

    router.canNavigateTo("admin");
    router.canNavigateTo("home");

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("invokes guards with signal === undefined (no AbortController, unlike navigate)", () => {
    let received: unknown = "unset";

    lifecycle.addActivateGuard(
      "admin",
      () => (_toState, _fromState, signal) => {
        received = signal;

        return true;
      },
    );

    router.canNavigateTo("admin");

    expect(received).toBeUndefined();
  });

  it("before start(): enforces the target's activation guard", () => {
    const fresh = createTestRouter();

    getLifecycleApi(fresh).addActivateGuard("admin", () => () => false);

    // Not started — fromState is undefined, so the full activation path runs
    // the target's activate guard (only deactivation is skipped).
    expect(fresh.canNavigateTo("admin")).toBe(false);
  });

  it("before start(): does not consult a deactivation guard (nothing to leave)", () => {
    const fresh = createTestRouter();

    getLifecycleApi(fresh).addDeactivateGuard("admin", () => () => false);

    expect(fresh.canNavigateTo("admin")).toBe(true);
  });
});
