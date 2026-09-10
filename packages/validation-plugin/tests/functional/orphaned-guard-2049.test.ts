import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { validationPlugin } from "../../src";

import type { Route, Router } from "@real-router/core";

/**
 * A guard registered under a name the tree does not carry says so at `start()`
 * (#2049).
 *
 * ⚑ **The door cannot answer this, and that is the whole reason the check lives
 * at `start()`.** Registering a guard BEFORE its route exists is a declared,
 * working capability — `addActivateGuard.test.ts` names it, and it runs end to
 * end: register for `"later"`, add the route, navigate, and the guard fires. So
 * at the door a typo and a not-yet-added route are indistinguishable, and a
 * reject there would retire a real capability.
 *
 * By `start()` the tree is built, which is the first moment the two are
 * distinguishable at all.
 *
 * ⚠ **A WARNING, not a throw, and the asymmetry with `defaultRoute` is
 * deliberate.** `validateResolvedDefaultRoute` throws one door over, because a
 * `defaultRoute` naming nothing is unusable. A guard for a route the application
 * adds after `start()` is unusual but legitimate — the capability above is not
 * scoped to before-start — so this reports and steps aside.
 *
 * ⚠ **Only EXTERNAL guards.** Definition guards arrive attached to a route in
 * the config, so their name cannot be a typo by construction; reporting them
 * would be noise no caller can act on.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "admin", path: "/admin" },
];

const denyGuard = () => () => false;

/** Warning lines that name `needle`, flattened across the logger's arguments. */
function reportedFor(
  warn: { mock: { calls: unknown[][] } },
  needle: string,
): string[] {
  return warn.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((line) => line.includes(needle));
}

function withPlugin(): Router {
  const router = createRouter([...ROUTES]);

  router.usePlugin(validationPlugin());

  return router;
}

describe("a guard bound to a name the tree does not carry (#2049)", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("reports the typo at start(), naming the guard's route", async () => {
    const router = withPlugin();

    getLifecycleApi(router).addActivateGuard("admn", denyGuard);
    await router.start("/home");

    expect(reportedFor(warn, "admn")).toHaveLength(1);

    router.stop();
  });

  it("reports a deactivate guard the same way", async () => {
    const router = withPlugin();

    getLifecycleApi(router).addDeactivateGuard("hoem", denyGuard);
    await router.start("/home");

    expect(reportedFor(warn, "hoem")).toHaveLength(1);

    router.stop();
  });

  it("says nothing when every guard names a route that exists", async () => {
    const router = withPlugin();

    getLifecycleApi(router).addActivateGuard("admin", denyGuard);
    getLifecycleApi(router).addDeactivateGuard("home", denyGuard);
    await router.start("/home");

    expect(warn).not.toHaveBeenCalled();

    router.stop();
  });

  it("does NOT retire the register-before-the-route capability", async () => {
    // The control that keeps the diagnostic honest: the guard still WORKS once
    // the route arrives, so what ships is a report and not a refusal. Without
    // this cell, turning the warning into a throw would look like a passing
    // change.
    const router = withPlugin();

    getLifecycleApi(router).addActivateGuard("later", denyGuard);
    await router.start("/home");
    getRoutesApi(router).add({ name: "later", path: "/later" });

    await expect(router.navigate("later")).rejects.toThrow();

    router.stop();
  });
});
