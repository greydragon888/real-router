import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

/**
 * Auto-cleanup of `canDeactivate` guards, tested through the PUBLIC API only.
 *
 * Behaviour, not bookkeeping: auto-cleanup removes a route's `canDeactivate`
 * guard once that route is deactivated. A guard can only be cleaned up on the
 * leave it permitted (a blocking guard never leaves), so "removed" is observed
 * via the guard's call count — it fires on the single leave that removes it and
 * does NOT fire on a later leave. A guard that should be RETAINED (route still
 * active, or a failed transition) keeps firing / keeps blocking. These spy/throw
 * assertions exercise the compiled guard the navigation pipeline actually runs
 * (`#canDeactivateFunctions`), not the internal factory record.
 */
describe("router.navigate() - auto cleanup", () => {
  let router: Router;
  let lifecycle: LifecycleApi;

  beforeEach(async () => {
    router = createRouter(
      [
        { name: "home", path: "/" },
        {
          name: "users",
          path: "/users",
          children: [
            { name: "list", path: "/list" },
            { name: "view", path: "/view/:id" },
          ],
        },
        {
          name: "orders",
          path: "/orders",
          children: [
            { name: "pending", path: "/pending" },
            { name: "completed", path: "/completed" },
          ],
        },
        { name: "profile", path: "/profile" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  describe("basic autoCleanUp functionality", () => {
    it("removes a canDeactivate guard when its route becomes inactive (does not fire on a later leave)", async () => {
      const usersGuard = vi.fn(() => true);

      await router.navigate("users");
      lifecycle.addDeactivateGuard("users", () => usersGuard);

      // Leave users → guard runs (permits), users is deactivated → cleaned up.
      await router.navigate("orders");

      expect(usersGuard).toHaveBeenCalledTimes(1);

      // Re-enter users (the cleaned external guard is NOT re-added) and leave
      // again — a removed guard must not run a second time.
      await router.navigate("users");
      await router.navigate("orders");

      expect(usersGuard).toHaveBeenCalledTimes(1); // still 1 ⇒ was removed
    });

    it("keeps a parent guard while only the inactive child segment is cleaned up (nested)", async () => {
      const usersGuard = vi.fn(() => true);
      const listGuard = vi.fn(() => true);

      await router.navigate("users.list");
      lifecycle.addDeactivateGuard("users", () => usersGuard);
      lifecycle.addDeactivateGuard("users.list", () => listGuard);

      // list → view: users.list deactivated (cleaned), users stays active.
      await router.navigate("users.view", { id: 1 });

      expect(listGuard).toHaveBeenCalledTimes(1); // users.list left ⇒ fired
      expect(usersGuard).not.toHaveBeenCalled(); // users still active ⇒ not left

      // users.list was removed: re-enter + leave does not re-run it.
      await router.navigate("users.list");
      await router.navigate("users.view", { id: 2 });

      expect(listGuard).toHaveBeenCalledTimes(1); // still 1 ⇒ removed

      // users was retained: leaving users entirely now runs its guard.
      await router.navigate("orders");

      expect(usersGuard).toHaveBeenCalledTimes(1); // fired on real leave ⇒ retained
    });

    it("retains the guard of a route REACTIVATED by its own param change (not cleaned)", async () => {
      const viewGuard = vi.fn(() => true);

      await router.navigate("users.view", { id: 1 });
      lifecycle.addDeactivateGuard("users.view", () => viewGuard);

      // id 1 → 2 re-mounts users.view (its own `:id` changed): the route is in
      // BOTH toDeactivate and toActivate (reactivated). Its guard fires on this
      // leave, but auto-cleanup must NOT remove it — the `!toActivate.includes(name)`
      // exclusion keeps a reactivated route's guard alive (kills the `&&`→`||` bug).
      await router.navigate("users.view", { id: 2 });

      expect(viewGuard).toHaveBeenCalledTimes(1); // fired on the re-mount leave

      // Because it was RETAINED, leaving view entirely fires it again. A guard
      // wrongly cleaned on the reactivation would stay at 1.
      await router.navigate("orders");

      expect(viewGuard).toHaveBeenCalledTimes(2);
    });
  });

  describe("autoCleanUp with transition errors (from-route guard retained)", () => {
    it("does not remove canDeactivate when an activation guard blocks the transition", async () => {
      await router.navigate("users");

      const usersGuard = vi.fn(() => true); // permits leaving (not the blocker)

      lifecycle.addDeactivateGuard("users", () => usersGuard);
      lifecycle.addActivateGuard("orders", () => () => false); // blocks activation

      await expect(router.navigate("orders")).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });
      expect(usersGuard).toHaveBeenCalledTimes(1); // ran during the failed attempt

      // Transition failed ⇒ users was NOT deactivated ⇒ guard retained ⇒ runs
      // again on a real leave.
      await router.navigate("profile");

      expect(usersGuard).toHaveBeenCalledTimes(2);
    });

    it("does not remove canDeactivate when the canDeactivate guard itself blocks the transition", async () => {
      // Previously parked as `it.todo` — the behaviour is correct, just untested.
      await router.navigate("users");

      const usersGuard = vi.fn(() => false); // blocks leaving users

      lifecycle.addDeactivateGuard("users", () => usersGuard);

      await expect(router.navigate("orders")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });
      expect(usersGuard).toHaveBeenCalledTimes(1);
      expect(router.getState()?.name).toBe("users"); // still on users

      // Guard not auto-removed (the block left users active) ⇒ still blocks.
      await expect(router.navigate("orders")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });
      expect(usersGuard).toHaveBeenCalledTimes(2);
    });
  });

  describe("autoCleanUp edge cases", () => {
    it("does not clean up the guard when navigating to the same route (force)", async () => {
      await router.navigate("users");

      const usersGuard = vi.fn(() => true);

      lifecycle.addDeactivateGuard("users", () => usersGuard);

      // Same-route force-nav: users never becomes inactive ⇒ guard retained.
      await router.navigate("users", {}, undefined, { force: true });

      await router.navigate("orders");

      expect(usersGuard).toHaveBeenCalledTimes(1); // fired on the real leave ⇒ retained
    });

    it("does not clean up a guard for a route that was never active", async () => {
      await router.navigate("users");

      const profileGuard = vi.fn(() => true);

      lifecycle.addDeactivateGuard("profile", () => profileGuard);

      // profile was never active, so this navigation must not clean it up.
      await router.navigate("orders");

      expect(profileGuard).not.toHaveBeenCalled();

      // Guard survived: it runs when we eventually visit and leave profile.
      await router.navigate("profile");
      await router.navigate("home");

      expect(profileGuard).toHaveBeenCalledTimes(1);
    });

    it("navigates fine when no canDeactivate guards are set", async () => {
      await router.navigate("users");
      await router.navigate("orders");

      expect(router.getState()?.name).toBe("orders");
    });
  });

  /**
   * A route-config (definition) `canDeactivate` is registered once at
   * construction and nothing re-registers it on re-entry — so auto-cleanup must
   * NOT erase it. It lives as long as the route is in the tree, symmetric with
   * definition `canActivate` (#1171). Only external, component-managed guards
   * (`addDeactivateGuard`) are auto-cleaned on leave.
   */
  describe("route-config (definition) canDeactivate is retained (#1171)", () => {
    it("fires again on re-entry — a config guard is not one-shot", async () => {
      const guard = vi.fn(() => true);
      const local = createRouter([
        { name: "a", path: "/a" },
        { name: "form", path: "/form", canDeactivate: () => guard },
      ]);

      await local.start("/a");

      await local.navigate("form");
      await local.navigate("a"); // leave #1 — permitted, guard fires

      expect(guard).toHaveBeenCalledTimes(1);

      await local.navigate("form"); // re-enter
      await local.navigate("a"); // leave #2 — guard must fire again

      expect(guard).toHaveBeenCalledTimes(2);

      local.stop();
    });
  });
});
