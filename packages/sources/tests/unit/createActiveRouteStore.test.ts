import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createActiveRouteSource } from "../../src";

import type { Router } from "@real-router/core";

describe("createActiveRouteSources", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id" }],
      },
      { name: "admin", path: "/admin" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("initial value: true when route currently active", () => {
    const source = createActiveRouteSource(router, "home");

    expect(source.getSnapshot()).toBe(true);
  });

  it("initial value: false when route not active", () => {
    const source = createActiveRouteSource(router, "admin");

    expect(source.getSnapshot()).toBe(false);
  });

  it("before router.start(): false", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);
    const source = createActiveRouteSource(freshRouter, "home");

    expect(source.getSnapshot()).toBe(false);

    freshRouter.stop();
  });

  it("listener called when route becomes active", async () => {
    const source = createActiveRouteSource(router, "admin");
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("admin");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot()).toBe(true);
  });

  it("listener called when route becomes inactive", async () => {
    await router.navigate("admin");
    const source = createActiveRouteSource(router, "admin");
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("home");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot()).toBe(false);
  });

  it("areRoutesRelated filter: listener NOT called for unrelated navigations", async () => {
    const source = createActiveRouteSource(router, "users");
    const spy = vi.spyOn(router, "isActiveRoute");
    const listener = vi.fn();

    source.subscribe(listener);

    // Ignore the reconcile-on-subscribe isActiveRoute call (#766 lazy connect).
    spy.mockClear();

    // Navigate home → admin (unrelated to users)
    await router.navigate("admin");

    // isActiveRoute should NOT be called inside subscriber (filtered by areRoutesRelated)
    expect(spy).not.toHaveBeenCalled();
    // Subscriber should also receive zero notifications — the early-return
    // path skips updateSnapshot entirely.
    expect(listener).not.toHaveBeenCalled();
    expect(source.getSnapshot()).toBe(false);
  });

  it("strict=false: ancestor match (users active when on users.view)", async () => {
    const source = createActiveRouteSource(router, "users", undefined, {
      strict: false,
    });

    // Lazy source tracks navigations only while subscribed (#766).
    source.subscribe(() => {});

    await router.navigate("users.view", { id: "1" });

    expect(source.getSnapshot()).toBe(true);
  });

  it("strict=true: exact match only (users NOT active when on users.view)", async () => {
    const source = createActiveRouteSource(router, "users", undefined, {
      strict: true,
    });

    await router.navigate("users.view", { id: "1" });

    expect(source.getSnapshot()).toBe(false);
  });

  it("ignoreQueryParams=true (default): isActiveRoute called with ignoreQueryParams=true", async () => {
    const spy = vi.spyOn(router, "isActiveRoute");

    const source = createActiveRouteSource(router, "users");

    // Lazy: connect so the subscribe handler runs on navigation (#766).
    source.subscribe(() => {});

    spy.mockClear();

    await router.navigate("users");

    // Slot-shift (RFC-4 M2 / #1548): search channel at position 3 (undefined here).
    expect(spy).toHaveBeenCalledWith(
      "users",
      undefined,
      undefined,
      false,
      true,
    );
  });

  it("ignoreQueryParams=false: isActiveRoute called with ignoreQueryParams=false", async () => {
    const spy = vi.spyOn(router, "isActiveRoute");

    const source = createActiveRouteSource(router, "users", undefined, {
      ignoreQueryParams: false,
    });

    // Lazy: connect so the subscribe handler runs on navigation (#766).
    source.subscribe(() => {});

    spy.mockClear();

    await router.navigate("users");

    // Slot-shift (RFC-4 M2 / #1548): search channel at position 3 (undefined here).
    expect(spy).toHaveBeenCalledWith(
      "users",
      undefined,
      undefined,
      false,
      false,
    );
  });

  it("boolean dedup: listener NOT called if value unchanged (both active)", async () => {
    // Navigate to users first so users source starts active
    await router.navigate("users");
    const source = createActiveRouteSource(router, "users");

    expect(source.getSnapshot()).toBe(true);

    const listener = vi.fn();

    source.subscribe(listener);

    // Navigate users → users.view: users is still active (strict=false)
    // areRoutesRelated("users", "users.view") is true → enters subscriber
    // isActiveRoute("users") still returns true → Object.is(true, true) → no update
    await router.navigate("users.view", { id: "1" });

    expect(listener).not.toHaveBeenCalled();
    expect(source.getSnapshot()).toBe(true);
  });

  it("boolean dedup: listener NOT called if value unchanged (both inactive)", async () => {
    const source = createActiveRouteSource(router, "admin");

    expect(source.getSnapshot()).toBe(false);

    const listener = vi.fn();

    source.subscribe(listener);

    // Navigate home → users: admin not involved → areRoutesRelated filter fires
    // Even if we somehow enter subscriber, isActiveRoute("admin") is still false
    await router.navigate("users");

    // admin is still false, listener should not be called
    expect(listener).not.toHaveBeenCalled();
  });

  it("boolean dedup: listener NOT called when navigation is related but boolean unchanged", async () => {
    // Same-subtree navigation that hits the related-route fast-path AND
    // exercises the Object.is dedup: both source and target are inside the
    // users subtree, so areRoutesRelated returns true; isActiveRoute("users")
    // returns true on both sides → updateSnapshot skipped.
    await router.navigate("users.view", { id: "1" });

    const source = createActiveRouteSource(router, "users");

    expect(source.getSnapshot()).toBe(true);

    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("users.view", { id: "2" });

    expect(source.getSnapshot()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy: is a no-op on shared cached source (listener still receives updates)", async () => {
    const source = createActiveRouteSource(router, "admin");
    const listener = vi.fn();

    source.subscribe(listener);

    source.destroy();
    await router.navigate("admin");

    // Shared cached source ignores external destroy() — updates still flow.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("destroy: idempotent — snapshot value stable across N destroys (cached no-op)", () => {
    const source = createActiveRouteSource(router, "admin");
    const beforeDestroy = source.getSnapshot();

    source.destroy();

    expect(source.getSnapshot()).toBe(beforeDestroy);

    expect(() => {
      source.destroy();
      source.destroy();
    }).not.toThrow();

    expect(source.getSnapshot()).toBe(beforeDestroy);
  });

  it("previousRoute is undefined on first navigation: isPrevRelated is falsy", async () => {
    // Create source BEFORE starting — so the first nav event has previousRoute=undefined
    // This tests: isPrevRelated = undefined && areRoutesRelated(...) → undefined (falsy)
    const freshRouter = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
    ]);

    // Sources for "home", created before start. Initial value: false (no state yet)
    const source = createActiveRouteSource(freshRouter, "home");
    const listener = vi.fn();

    source.subscribe(listener);

    // Start at home — fires next = { route: home-state, previousRoute: undefined }
    // isNewRelated = areRoutesRelated("home", "home") = true → enters subscriber
    // isPrevRelated = undefined && ... = undefined (falsy) → tests short-circuit branch
    // !isNewRelated && !isPrevRelated = false → doesn't return early
    // isActiveRoute("home") = true → updates source from false to true
    await freshRouter.start("/");

    expect(source.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    freshRouter.stop();
  });

  it("post-destroy: getSnapshot still returns last value", async () => {
    await router.navigate("admin");
    const source = createActiveRouteSource(router, "admin");

    expect(source.getSnapshot()).toBe(true);

    source.destroy();

    expect(source.getSnapshot()).toBe(true);
  });

  it("post-destroy: subscribe still works (shared source survives external teardown)", async () => {
    const source = createActiveRouteSource(router, "admin");

    source.destroy();

    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    await router.navigate("admin");

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("reconnect: active state changed while disconnected is reconciled on re-subscribe (#766)", async () => {
    const source = createActiveRouteSource(router, "users");

    // Connect at "home" (users inactive), then drop the last listener so the
    // lazy source disconnects from the router.
    const unsub1 = source.subscribe(() => {});

    expect(source.getSnapshot()).toBe(false);

    unsub1();

    // Navigate into the "users" subtree while the source has ZERO listeners.
    await router.navigate("users.view", { id: "1" });

    // Re-subscribe: onFirstSubscribe reconciles the boolean to the current
    // router state (true) instead of replaying the stale `false`, and notifies
    // the just-added listener.
    const listener = vi.fn();
    const unsub2 = source.subscribe(listener);

    expect(source.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub2();
  });

  describe("hash-aware active state (#532)", () => {
    function makeRouterWithUrlContext(initialHash = ""): Router {
      const r = createRouter([
        { name: "home", path: "/" },
        { name: "settings", path: "/settings" },
      ]);

      // Tiny stand-in for browser-plugin's onTransitionSuccess: write the
      // requested hash to state.context.url after every navigation.
      // Cast to any keeps the test isolated from the URL-plugin module
      // augmentations of NavigationOptions / StateContext.
      r.usePlugin(((): unknown => ({
        onTransitionSuccess: (
          toState: unknown,
          _from: unknown,
          opts: unknown,
        ) => {
          const optsAny = opts as
            { hash?: string; hashChange?: boolean } | undefined;
          const ctx = (toState as { context: Record<string, unknown> }).context;
          const prevUrl = ctx.url as { hash?: string } | undefined;
          const prevHash = prevUrl?.hash ?? initialHash;
          const next = optsAny?.hash ?? prevHash;

          ctx.url = Object.freeze({
            hash: next,
            hashChanged: optsAny?.hashChange ?? next !== prevHash,
          });
        },
      })) as Parameters<typeof r.usePlugin>[0]);

      return r;
    }

    it("initial value: true when route AND hash both match", async () => {
      const r = makeRouterWithUrlContext("billing");

      await r.start("/settings");

      const source = createActiveRouteSource(r, "settings", undefined, {
        hash: "billing",
      });

      expect(source.getSnapshot()).toBe(true);

      r.stop();
    });

    it("initial value: false when route matches but hash differs", async () => {
      const r = makeRouterWithUrlContext("profile");

      await r.start("/settings");

      const source = createActiveRouteSource(r, "settings", undefined, {
        hash: "billing",
      });

      expect(source.getSnapshot()).toBe(false);

      r.stop();
    });

    it("initial value: false when hash is empty-string sentinel and current is non-empty", async () => {
      const r = makeRouterWithUrlContext("anchor");

      await r.start("/settings");

      const source = createActiveRouteSource(r, "settings", undefined, {
        hash: "",
      });

      expect(source.getSnapshot()).toBe(false);

      r.stop();
    });

    it("flips on same-route hash change (hashFlip via context.url.hashChanged)", async () => {
      const r = makeRouterWithUrlContext("profile");

      await r.start("/settings");

      const source = createActiveRouteSource(r, "settings", undefined, {
        hash: "billing",
      });

      expect(source.getSnapshot()).toBe(false);

      const listener = vi.fn();

      source.subscribe(listener);

      await r
        .navigate(
          "settings",
          {},
          // Cast keeps this test independent of URL-plugin augmentations.
          undefined,
          { hash: "billing", force: true, hashChange: true } as Parameters<
            typeof r.navigate
          >[2],
        )
        .catch(() => {});

      expect(source.getSnapshot()).toBe(true);
      expect(listener).toHaveBeenCalled();

      r.stop();
    });

    it("hash-undefined source ignores hash (legacy semantics preserved)", async () => {
      const r = makeRouterWithUrlContext("billing");

      await r.start("/settings");

      const source = createActiveRouteSource(r, "settings");

      // Lazy source tracks navigations only while subscribed (#766).
      source.subscribe(() => {});

      expect(source.getSnapshot()).toBe(true);

      // Navigate to ensure subscribe path runs with hash === undefined —
      // exercises the early hashFlip short-circuit branch.
      await r.navigate("home").catch(() => {});

      expect(source.getSnapshot()).toBe(false);

      r.stop();
    });

    it("hash-aware source returns false on hash-plugin runtime (no state.context.url)", async () => {
      const r = createRouter([
        { name: "home", path: "/" },
        { name: "settings", path: "/settings" },
      ]);

      await r.start("/settings");

      const source = createActiveRouteSource(r, "settings", undefined, {
        hash: "billing",
      });

      // Lazy: subscribe so the handler runs on navigation and exercises the
      // hashFlip branch with a missing state.context.url (#766).
      source.subscribe(() => {});

      // No URL plugin → state.context.url undefined → readContextHash returns ""
      // → does not equal "billing" → not active.
      expect(source.getSnapshot()).toBe(false);

      // Navigate with hash-aware source on a no-plugin router exercises the
      // hashFlip branch where `hash !== undefined` but state.context.url is
      // missing — `?? false` short-circuits hashFlip to false. Combined with
      // route-match this still re-evaluates correctly.
      await r.navigate("home").catch(() => {});

      expect(source.getSnapshot()).toBe(false);

      await r.navigate("settings").catch(() => {});

      expect(source.getSnapshot()).toBe(false);

      r.stop();
    });

    it("cache key separates hash variants", async () => {
      const r = makeRouterWithUrlContext("billing");

      await r.start("/settings");

      const a = createActiveRouteSource(r, "settings", undefined, {
        hash: "profile",
      });
      const b = createActiveRouteSource(r, "settings", undefined, {
        hash: "billing",
      });
      const c = createActiveRouteSource(r, "settings", undefined, {
        hash: "profile",
      });

      // a and b are distinct (different hash), a and c are same (cache hit)
      expect(a).toBe(c);
      expect(a).not.toBe(b);
      expect(a.getSnapshot()).toBe(false); // hash differs from "billing"
      expect(b.getSnapshot()).toBe(true);

      r.stop();
    });
  });
});
