import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "../../src";

import type { ParamsSearch, Router } from "@real-router/core/types";

const probe = { seq: 0 };

/**
 * One router, one validator (#2349).
 *
 * ⚑ **The state this refuses is reachable without the guard, and the damage is
 * silent.** Measured on the released behaviour, three arms — two installs and
 * remove the first, remove the second, remove the middle of three — every one
 * leaves the router with a registered validation plugin and a validator that no
 * longer answers, against a single-install control that still validates.
 *
 * ⚠ **The refusal is the fix, not a counter.** A tally models an ownership the
 * slot does not grant: `validator` is one of two writable members on an
 * otherwise `readonly` `RouterInternals`, reachable by anyone importing
 * `@real-router/core/validation`. Refusing the second install makes the broken
 * state unrepresentable instead, so there is nothing here to keep in sync.
 * #2339 proposes replacing the slot with a `setValidator` door; the guard
 * belongs to whoever owns the write, and moves there with it.
 *
 * ⚠ **A CLONE is not a second install.** `cloneRouter` re-runs plugin factories
 * by contract, so a clone arrives with its own validator and needs no
 * `usePlugin` of its own — the last cell pins that, because a guard that broke
 * it would break every SSR request scope.
 */
describe("one router, one validator (#2349)", () => {
  const asyncDecode = async (channels: ParamsSearch): Promise<ParamsSearch> =>
    channels;

  const make = (): Router => createRouter([{ name: "home", path: "/home" }]);

  /**
   * The verdict is taken by driving a door only the plugin refuses, not by
   * reading the slot: the cell measures the CAPABILITY, not the bookkeeping.
   */
  const validationIsOn = (router: Router): boolean => {
    probe.seq += 1;

    try {
      getRoutesApi(router).add([
        {
          name: `probe${String(probe.seq)}`,
          path: `/probe${String(probe.seq)}`,
          decodeParams: asyncDecode,
        },
      ] as never);

      return false;
    } catch {
      return true;
    }
  };

  /** Returns the thrown error, so the assertion sits outside any catch. */
  const refusalFrom = (call: () => unknown): { code?: string } => {
    try {
      call();
    } catch (error) {
      return error as { code?: string };
    }

    throw new Error("expected a refusal, but the call returned");
  };

  it("refuses a second install on the same router", () => {
    const router = make();

    router.usePlugin(validationPlugin());

    expect(() => router.usePlugin(validationPlugin())).toThrow(
      "already installed",
    );
  });

  it("the refusal names its own code, not the after-start one", () => {
    const router = make();

    router.usePlugin(validationPlugin());

    expect(refusalFrom(() => router.usePlugin(validationPlugin())).code).toBe(
      "VALIDATION_PLUGIN_ALREADY_INSTALLED",
    );
  });

  it("the router that refused the second install still validates", () => {
    const router = make();

    router.usePlugin(validationPlugin());

    expect(() => router.usePlugin(validationPlugin())).toThrow();
    expect(validationIsOn(router)).toBe(true);
  });

  it("CONTROL — one install, removed, turns validation off", () => {
    const router = make();
    const remove = router.usePlugin(validationPlugin());

    expect(validationIsOn(router)).toBe(true);

    remove();

    expect(validationIsOn(router)).toBe(false);
  });

  it("a re-install after teardown is accepted — the refusal is not a lockout", () => {
    // ⚑ The arm the guard could plausibly break. `dropped-query-key` and
    // `undeclared-param-key` each run a teardown/re-register cycle, but their
    // subject is the de-dup cache leaving with its validator, so what they give
    // this arm is incidental. Measured: a guard keyed on "was ever installed"
    // rather than on the slot reds this cell and both of theirs, and only this
    // one names why.
    const router = make();
    const remove = router.usePlugin(validationPlugin());

    remove();

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    expect(validationIsOn(router)).toBe(true);
  });

  it("CONTROL — on a started router the after-start refusal answers first", async () => {
    // Both refusals apply here. The guard sits below the `isActive()` check, so
    // the caller hears the one that names the earlier mistake.
    const router = make();

    router.usePlugin(validationPlugin());
    await router.start("/home");

    expect(refusalFrom(() => router.usePlugin(validationPlugin())).code).toBe(
      "VALIDATION_PLUGIN_AFTER_START",
    );

    router.stop();
  });

  it("CONTROL — core still refuses the SAME factory twice, with its own message", () => {
    const router = make();
    const factory = validationPlugin();

    router.usePlugin(factory);

    expect(() => router.usePlugin(factory)).toThrow(
      "Plugin factory already registered",
    );
  });

  it("a FAILED install leaves the slot clear, so a corrected retry is accepted", () => {
    // ⚑ The sibling of the refusal: the retrospective pass clears the slot when
    // it throws. Without that clear the guard above would lock the router out of
    // the plugin for good, and the failure that did it is a config error the
    // caller is expected to correct and retry.
    const router = createRouter([
      { name: "a", path: "/a", forwardTo: "missing" },
    ]);

    expect(() => router.usePlugin(validationPlugin())).toThrow();

    getRoutesApi(router).add([{ name: "missing", path: "/missing" }]);

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    expect(validationIsOn(router)).toBe(true);
  });

  it("CONTROL — a clone validates without an install of its own", () => {
    const base = make();

    base.usePlugin(validationPlugin());

    const clone = cloneRouter(base);

    try {
      expect(
        validationIsOn(clone),
        "cloneRouter re-runs plugin factories, so the clone arrives validated",
      ).toBe(true);
      expect(() => clone.usePlugin(validationPlugin())).toThrow(
        "already installed",
      );
    } finally {
      clone.dispose();
    }
  });
});
