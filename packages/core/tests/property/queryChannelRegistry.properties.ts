import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { NUM_RUNS } from "./helpers";

/**
 * ONE registry classifies and prints (#1556).
 *
 * Channel separation (which bag a key lands in) and the query-string build
 * (whether a key is printed into the URL) must read the SAME declaration
 * registry. When they drifted, a root-declared key (`setRootPath("?a&b")` — how
 * persistent-params declares its keys) printed as query but classified as a
 * path param: it landed in `state.params`, disappeared from `state.path` on the
 * intent side, and no `isActiveRoute` spelling matched a link to the page it
 * pointed at.
 *
 * The invariant is stated modulo path slots: a name that ALSO occupies a path
 * slot (`/items/:id?id`) is deliberately path-owned at separation (#843 /
 * #1549) while the build still prints an explicit query twin, so collisions are
 * excluded from the biconditional and pinned separately below.
 *
 * `queryParamsMode: "strict"` makes the build a clean oracle: it prints exactly
 * the declared query params and never an undeclared extra.
 */
describe("query-channel registry properties (#1556)", () => {
  /** Distinct key names, so a "declared" key can never collide with a control. */
  const arbKey = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);

  const arbKeys = fc.uniqueArray(arbKey, { minLength: 0, maxLength: 3 });

  test.prop(
    [
      arbKeys, // declared on the ROOT path
      arbKeys, // declared on the ROUTE itself
      arbKeys, // never declared anywhere (control)
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "a key is separated into the query channel iff the build prints it",
    (rootKeys, ownKeys, undeclaredKeys) => {
      const all = [...new Set([...rootKeys, ...ownKeys, ...undeclaredKeys])];

      // Keys declared in BOTH lists are fine (the registries union), but a key
      // used as a control must not be declared anywhere.
      const declared = new Set([...rootKeys, ...ownKeys]);
      const controls = undeclaredKeys.filter((k) => !declared.has(k));

      const ownSuffix = ownKeys.length > 0 ? `?${ownKeys.join("&")}` : "";
      const router = createRouter([{ name: "r", path: `/r${ownSuffix}` }], {
        queryParamsMode: "strict",
      });

      if (rootKeys.length > 0) {
        getPluginApi(router).setRootPath(`?${rootKeys.join("&")}`);
      }

      for (const key of all) {
        const bag = { [key]: "V" };

        const separatedToQuery = Object.hasOwn(
          getPluginApi(router).forwardState("r", bag).search ?? {},
          key,
        );
        const printedAsQuery = router.buildPath("r", bag).includes(`?${key}=V`);

        expect(separatedToQuery).toBe(printedAsQuery);
      }

      // The control keys must be on the "neither" side of the biconditional —
      // otherwise the property could pass vacuously on an all-declared draw.
      for (const key of controls) {
        expect(
          Object.hasOwn(
            getPluginApi(router).forwardState("r", { [key]: "V" }).search ?? {},
            key,
          ),
        ).toBe(false);
      }
    },
  );

  test.prop([arbKey], { numRuns: NUM_RUNS.standard })(
    "a root-declared key reaches state.search and the committed URL",
    async (key) => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "r", path: "/r" },
      ]);

      getPluginApi(router).setRootPath(`?${key}`);

      await router.start("/home");

      const state = await router.navigate("r", { [key]: "V" });

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ [key]: "V" });
      expect(state.path).toBe(`/r?${key}=V`);

      router.stop();
    },
  );

  test.prop([arbKey], { numRuns: NUM_RUNS.standard })(
    "a path-slot twin stays path-owned even when the name is also declared (#843 carve-out)",
    (key) => {
      const router = createRouter([
        { name: "i", path: `/items/:${key}?${key}` },
      ]);

      const forwarded = getPluginApi(router).forwardState("i", { [key]: "V" });

      expect(forwarded.params).toStrictEqual({ [key]: "V" });
      expect(forwarded.search).toStrictEqual({});
    },
  );
});
