import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import { describe, it, expect } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

/**
 * The slot `RouterInternals.validator` has no owner: it is plain data on a
 * surface pinned `accessorNames === []`, so a second write cannot be refused
 * there. What teardown MUST NOT do is destroy a validator it no longer holds.
 *
 * #2349 closed the neighbouring half — a second `validationPlugin()` install is
 * refused — but that guard reads the slot, so a direct write still lands.
 */
describe("the validator slot's release half is owned (#2339 §4 1b)", () => {
  it("teardown leaves a validator it does not hold", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const remove = router.usePlugin(validationPlugin());

    expect(getInternals(router).validator).not.toBeNull();

    const foreign = { marker: "foreign" } as never;

    getInternals(router).validator = foreign;

    remove();

    // Before the fix this was `null` — the plugin destroyed a slot it had
    // already lost, leaving the second holder silently without a validator.
    expect(getInternals(router).validator).toBe(foreign);
  });

  it("CONTROL — teardown still nulls the validator it DOES hold", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const remove = router.usePlugin(validationPlugin());

    expect(getInternals(router).validator).not.toBeNull();

    remove();

    expect(getInternals(router).validator).toBeNull();
  });

  it("CONTROL — a re-install after an owned teardown still works", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const remove = router.usePlugin(validationPlugin());

    remove();
    router.usePlugin(validationPlugin());

    expect(getInternals(router).validator).not.toBeNull();
  });
});
