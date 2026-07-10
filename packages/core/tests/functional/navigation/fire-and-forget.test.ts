import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { errorCodes } from "@real-router/core";
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

// #1184: the zero-allocation cached-rejection fast path
// (CACHED_SAME_STATES_REJECTION / CACHED_NOT_STARTED_REJECTION /
// CACHED_ROUTE_NOT_FOUND_REJECTION, NavigationNamespace/constants.ts) returns a
// SHARED singleton promise + error per rejection class. Every other test compares
// by VALUE (.rejects.toMatchObject({ code })), so silently replacing a singleton
// with a per-call `Promise.reject(new RouterError(...))` — losing BOTH the
// optimization AND the #721 pre-suppression contract (lastSyncRejected → the
// facade skips its .catch()) — passes the whole suite. Pin IDENTITY through the
// public API: two triggering navigations return the SAME promise + error ref.
describe("cached-rejection identity (#1184 — zero-alloc fast path)", () => {
  it("SAME_STATES: two same-state navigations return the SAME promise + error instance", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const r1 = router.navigate("home");
    const r2 = router.navigate("home");

    expect(r1).toBe(r2); // CACHED_SAME_STATES_REJECTION singleton

    const [error1, error2] = await Promise.all([
      r1.catch((error: unknown) => error),
      r2.catch((error: unknown) => error),
    ]);

    expect(error1).toBe(error2); // CACHED_SAME_STATES_ERROR singleton
    expect((error1 as { code?: string }).code).toBe(errorCodes.SAME_STATES);

    router.stop();
  });

  it("ROUTER_NOT_STARTED: two pre-start navigations return the SAME promise + error instance", async () => {
    const router = createTestRouter();

    const r1 = router.navigate("users");
    const r2 = router.navigate("users");

    expect(r1).toBe(r2); // CACHED_NOT_STARTED_REJECTION singleton

    const [error1, error2] = await Promise.all([
      r1.catch((error: unknown) => error),
      r2.catch((error: unknown) => error),
    ]);

    expect(error1).toBe(error2); // CACHED_NOT_STARTED_ERROR singleton
    expect((error1 as { code?: string }).code).toBe(
      errorCodes.ROUTER_NOT_STARTED,
    );

    router.dispose();
  });

  it("ROUTE_NOT_FOUND: two unknown-route navigations return the SAME promise + error instance", async () => {
    const router = createTestRouter({ allowNotFound: false });

    await router.start("/home");

    const r1 = router.navigate("nonexistent.route");
    const r2 = router.navigate("nonexistent.route");

    expect(r1).toBe(r2); // CACHED_ROUTE_NOT_FOUND_REJECTION singleton

    const [error1, error2] = await Promise.all([
      r1.catch((error: unknown) => error),
      r2.catch((error: unknown) => error),
    ]);

    expect(error1).toBe(error2); // CACHED_ROUTE_NOT_FOUND_ERROR singleton
    expect((error1 as { code?: string }).code).toBe(errorCodes.ROUTE_NOT_FOUND);

    router.stop();
  });
});
