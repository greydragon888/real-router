import { afterEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

/**
 * `Object.freeze` is captured, so what core freezes at RUNTIME stays frozen
 * (#2073).
 *
 * ⚑ **The capture already existed in the file that needed it.** `Router.ts`
 * binds `freeze` at module load and froze `snapshotQueryParams`' and
 * `deriveMatcherOptions`' results through the raw call fifteen hundred lines
 * below — the shape #1971 measured for `Object.entries` in `utils/ingest.ts`.
 *
 * ⚑ The freeze is not decoration at either site. `deriveMatcherOptions`' own
 * docblock states what it buys: `matcherOptions` is reachable through
 * `getInternals(router).routeGetStore()`, and `createMatcher` re-reads it on
 * EVERY matcher rebuild, so an unfrozen container lets the `queryParams` slot be
 * replaced and the next rebuild throws — with the write itself long past.
 *
 * ⚠ Not a security boundary — re-pointing `Object.freeze` already requires
 * script execution. It does NOT close a shim evaluated BEFORE core loads
 * (`guards.ts:17-21`, #1798).
 */
describe("core's BUILD intrinsic Object.freeze is captured — behaviour (#2073)", () => {
  const realFreeze = Object.freeze;

  const stopFreezing = (): void => {
    Object.freeze = (o: object) => o;
  };

  afterEach(() => {
    Object.freeze = realFreeze;
  });

  const mk = (): ReturnType<typeof createRouter> =>
    createRouter(
      [{ name: "u", path: "/u/:id?flag" }] as never,
      {
        queryParams: { booleanFormat: "empty-true" },
      } as never,
    );

  const matcherOptions = (router: ReturnType<typeof createRouter>): object =>
    (
      getInternals(router).routeGetStore() as unknown as {
        matcherOptions: object;
      }
    ).matcherOptions;

  it("CONTROL — the shim is genuinely installed and does leave an object writable", () => {
    // Without this every cell below passes when the shim quietly fails to take
    // effect, which is indistinguishable from a capture that works.
    stopFreezing();

    expect(Object.isFrozen(Object.freeze({ a: 1 }))).toBe(false);
  });

  it("matcherOptions stays frozen, so its queryParams slot cannot be replaced", () => {
    // CONTROL — frozen before any shim, so the cell below measures the intrinsic
    // and not a container that was never sealed.
    const healthy = mk();

    expect(Object.isFrozen(matcherOptions(healthy))).toBe(true);

    healthy.dispose();

    stopFreezing();

    const shimmed = mk();

    Object.freeze = realFreeze;

    const opts = matcherOptions(shimmed) as Record<string, unknown>;

    // The write the docblock says must fail AT THE WRITE SITE. Measured before
    // the capture: it landed silently, and the next matcher rebuild — here an
    // ordinary `add()` — threw `Invalid "queryParams.arrayFormat"`, which is the
    // #1839 defect restored.
    let wrote = true;

    try {
      opts.queryParams = { arrayFormat: "bogusTypo" };
    } catch {
      wrote = false;
    }

    let addThrew = "";

    try {
      getRoutesApi(shimmed).add([{ name: "v", path: "/v" }] as never);
    } catch (error) {
      addThrew = String(error).slice(0, 60);
    }

    expect({ frozen: Object.isFrozen(opts), wrote, addThrew }).toStrictEqual({
      frozen: true,
      wrote: false,
      addThrew: "",
    });

    shimmed.dispose();
  });

  it("the published route tree comes back frozen", () => {
    // CONTROL — frozen on the native intrinsic, so the cell below is a swap.
    const healthy = mk();

    expect(Object.isFrozen(getInternals(healthy).getTree())).toBe(true);

    healthy.dispose();

    stopFreezing();

    const shimmed = mk();

    Object.freeze = realFreeze;

    // `engine/builder/computeCaches.ts` freezes the node, its children map, its
    // param metadata and its param-type map — seven runtime freezes in a file
    // that captured nothing.
    expect(Object.isFrozen(getInternals(shimmed).getTree())).toBe(true);

    shimmed.dispose();
  });
});
