// #1837, found by attacking the fix rather than by the issue — the entry that
// is VALIDATED must be the entry that is COMMITTED.
//
// `getRouteFromEvent` read each member of `history.state` TWICE: once through
// `isState`, and once again when building the arguments for `makeState`.
// Measured before the fix, with a payload answering differently on the second
// read of each key:
//
//     reads per member: { name: 2, params: 2, path: 2 }
//     guard approved  : users.view  /users/view/1
//     committed       : home        /TOTALLY/OTHER   { id: "SECOND" }
//
// The guard's verdict described one entry and the router committed another.
//
// ⚠ **Reachability, stated honestly.** A real browser runs
// StructuredSerializeForStorage on `history.pushState`, so a `history.state`
// that comes back from a genuine popstate is a plain deserialized object with
// no accessors — drift is impossible there. It is reachable from a SYNTHETIC
// `PopStateEvent` (app code, or a test harness) and under jsdom, which stores
// `history.state` by identity.
//
// ⚑ That is exactly the reachability of the accessor defect one commit earlier,
// and this is its sibling: both follow from "the entry may not be a plain
// object". Fixing the throw and leaving the drift would be the false-completeness
// shape — a fix whose sibling is one line away.
import { createRouter } from "@real-router/core";
import { describe, expect, it, vi } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import {
  createMockedBrowser,
  routerConfig,
  noop,
} from "../../helpers/testUtils";

import type { Router } from "@real-router/core";

/** Answers `first` on read 1 of each key and `then` on every later read. */
function driftingEntry(
  first: Record<string, unknown>,
  then: Record<string, unknown>,
): { entry: Record<string, unknown>; reads: Record<string, number> } {
  const reads: Record<string, number> = {};
  const entry: Record<string, unknown> = {};

  for (const key of Object.keys(first)) {
    reads[key] = 0;

    Object.defineProperty(entry, key, {
      get(): unknown {
        reads[key] += 1;

        return reads[key] === 1 ? first[key] : (then[key] ?? first[key]);
      },
      enumerable: true,
      configurable: true,
    });
  }

  return { entry, reads };
}

describe("#1837 — a restored entry is read ONCE per member", () => {
  it("commits what the guard validated, not a later read", async () => {
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);

    const browser = createMockedBrowser(noop);
    const router: Router = createRouter(routerConfig, {
      defaultRoute: "home",
    });

    router.usePlugin(browserPluginFactory({}, browser));
    await router.start("/users/list");

    const { entry, reads } = driftingEntry(
      { name: "users.view", params: { id: "1" }, path: "/users/view/1" },
      { name: "home", params: { id: "SECOND" }, path: "/TOTALLY/OTHER" },
    );

    globalThis.history.replaceState({}, "", "/users/view/1");
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state: entry }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // ⚑ ONE read per member is the property; the committed state is the
    // consequence. Both are asserted, because the count alone would pass if the
    // single read happened to be the wrong one.
    expect(reads).toStrictEqual({ name: 1, params: 1, path: 1 });
    expect({
      name: router.getState()?.name,
      path: router.getState()?.path,
    }).toStrictEqual({ name: "users.view", path: "/users/view/1" });

    router.stop();
  });

  it("CONTROL — a stable entry restores exactly as before", async () => {
    // The snapshot must not change what a normal entry does; without this the
    // cell above passes if the restore stopped working altogether.
    const browser = createMockedBrowser(noop);
    const router: Router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "loose",
    });

    router.usePlugin(browserPluginFactory({}, browser));
    await router.start("/users/list");

    globalThis.history.replaceState({}, "", "/users/view/9");
    globalThis.dispatchEvent(
      new PopStateEvent("popstate", {
        state: {
          name: "users.view",
          params: { id: "9" },
          search: { tab: "a" },
          path: "/users/view/9",
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(router.getState()?.name).toBe("users.view");
    expect(router.getState()?.params).toStrictEqual({ id: "9" });
    expect(router.getState()?.search).toStrictEqual({ tab: "a" });

    router.stop();
  });

  it("CONTROL — a THROWING member still falls back rather than escaping", async () => {
    // The snapshot is a read too, so it inherits the boundary question. It must
    // not reintroduce the escape the previous commit closed.
    vi.spyOn(console, "error").mockImplementation(noop);

    const browser = createMockedBrowser(noop);
    const router: Router = createRouter(routerConfig, {
      defaultRoute: "home",
    });

    router.usePlugin(browserPluginFactory({}, browser));
    await router.start("/users/list");

    const entry = { params: {}, path: "/home" };

    Object.defineProperty(entry, "name", {
      get(): never {
        throw new Error("from the entry");
      },
      enumerable: true,
    });

    globalThis.history.replaceState({}, "", "/home");
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state: entry }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Falls back to `matchPath("/home")`, which is the `home` route.
    expect(router.getState()?.name).toBe("home");

    router.stop();
  });
});
