import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

import { captureUnhandledRejections, createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

/**
 * #721 fire-and-forget safety, POSITIVE half: navigation methods called without
 * `await` must internally suppress EXPECTED rejections (a suppressed RouterError
 * code) so no process-level `unhandledRejection` leaks
 * and no spurious "Unexpected navigation error" is logged for them. (A genuinely
 * unexpected navigate rejection — e.g. a subscribeLeave listener that throws —
 * is NOT suppressed and DOES log under "router.navigate"; start failures log
 * under "router.start", #931.)
 *
 * These tests also pin the `lastSyncRejected` bookkeeping: that flag is the only
 * signal that the returned promise is a pre-suppressed cached rejection, and —
 * unlike `lastSyncResolved` — it is reset ONLY in the facade routing. A mutant
 * that drops that reset leaves it stale-true, so a later async fire-and-forget
 * navigation skips suppression and leaks.
 */
let router: Router;

describe("#721 fire-and-forget — no unhandledRejection leaks", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("a cached sync rejection (route not found) does not leak", async () => {
    const leaked = await captureUnhandledRejections(() => {
      void router.navigate("does-not-exist");
    });

    expect(leaked).toStrictEqual([]);
  });

  it("a sync SAME_STATES rejection does not leak", async () => {
    const leaked = await captureUnhandledRejections(() => {
      void router.navigate("home");
    });

    expect(leaked).toStrictEqual([]);
  });

  it("an async guard block (CANNOT_ACTIVATE) does not leak", async () => {
    getLifecycleApi(router).addActivateGuard(
      "users",
      () => () => Promise.resolve(false),
    );

    const leaked = await captureUnhandledRejections(() => {
      void router.navigate("users");
    });

    expect(leaked).toStrictEqual([]);
  });

  it("a cached sync rejection followed by an async rejection does not leak (no stale lastSyncRejected)", async () => {
    // call 1 sets lastSyncRejected=true via the cached ROUTE_NOT_FOUND path;
    // the facade routing must reset it. If the reset is dropped, the stale flag
    // makes call 2's async rejection skip suppression and leak.
    getLifecycleApi(router).addActivateGuard(
      "users",
      () => () => Promise.resolve(false),
    );

    const leaked = await captureUnhandledRejections(() => {
      void router.navigate("does-not-exist"); // cached sync reject
      void router.navigate("users"); // async reject (CANNOT_ACTIVATE)
    });

    expect(leaked).toStrictEqual([]);
  });
});
