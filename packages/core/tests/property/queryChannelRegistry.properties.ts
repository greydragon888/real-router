import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { NUM_RUNS } from "./helpers";

import type { Params, SearchParams } from "@real-router/core";

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

        // ONE registry, two reactions, and the biconditional is still about
        // CLASSIFICATION — does the registry call this key a query name. What
        // changed is the seam's answer: it used to SEPARATE such a key out of
        // the params bag (stage ②), and now it REFUSES the bag. Same predicate,
        // opposite verb, so the property reads the refusal where it used to read
        // the separation.
        let refusedInPathBag = false;

        try {
          getPluginApi(router).forwardState("r", bag);
        } catch {
          refusedInPathBag = true;
        }

        const printedAsQuery = router
          .buildPath("r", {}, bag)
          .includes(`?${key}=V`);

        expect(refusedInPathBag).toBe(printedAsQuery);
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

      // Passed in the QUERY bag: a root declaration makes the key a query name
      // of EVERY route, so this is the channel-correct spelling.
      const state = await router.navigate("r", {}, { [key]: "V" });

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ [key]: "V" });
      expect(state.path).toBe(`/r?${key}=V`);

      // The same registry drives the always-on channel guard (#1572), so the
      // params-bag spelling — what this arm asserted before the guard shipped,
      // when stage ② rerouted it — is now rejected at the API boundary. Both
      // halves read `queryNames`, which is what keeps them from drifting apart.
      expect(() => router.navigate("r", { [key]: "V" })).toThrow(TypeError);

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

  /**
   * Class-guard for #1570: `params(①) ∩ queryNames(target) = ∅`.
   *
   * A forwarding hop can only spell a default in `defaultParams`, but the
   * channel belongs to the resolved TARGET. Stated over the RAW stage-① output
   * (what a `forwardState` interceptor sees via `next(...)`), because the seam's
   * channel repair used to move the key one line later, which would mask a
   * producer that classifies wrongly — the very masking that kept this defect
   * invisible. The repair is gone (the seam refuses instead), and stating the
   * property over the RAW stage-① output keeps it honest either way.
   *
   * The oracle is the FIXTURE, not the implementation: the property re-derives
   * the expected channel from the route path it just built, so it cannot agree
   * with a wrong `getQueryParams` by construction.
   */
  test.prop(
    [
      fc.uniqueArray(arbKey, { minLength: 1, maxLength: 3 }), // query-declared on the target
      fc.uniqueArray(arbKey, { minLength: 0, maxLength: 2 }), // path slots on the target
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "a forwarding hop's defaults keep the slot they were spelled in, and a query-declared name in the path slot is refused",
    async (rawQueryKeys, rawPathKeys) => {
      // Disjoint: a name occupying BOTH is the #843 carve-out, pinned above.
      const pathKeys = rawPathKeys.filter((k) => !rawQueryKeys.includes(k));
      const slots = pathKeys.map((k) => `/:${k}`).join("");
      const target = `/dst${slots}?${rawQueryKeys.join("&")}`;

      const queryDefaults = Object.fromEntries(
        rawQueryKeys.map((k) => [k, `D-${k}`]),
      );
      const pathDefaults = Object.fromEntries(
        pathKeys.map((k) => [k, `D-${k}`]),
      );

      const router = createRouter(
        [
          { name: "home", path: "/home" },
          { name: "dst", path: target },
          {
            name: "src",
            path: "/src",
            forwardTo: "dst",
            // Each half in the slot that names its channel. The router routes
            // nothing by the target's declaration any more, so this is the only
            // spelling that can work — and the refusal below proves the other
            // one does not silently work anyway.
            defaultParams: pathDefaults,
            defaultSearch: queryDefaults,
          },
        ],
        { queryParams: { booleanFormat: "none" } } as never,
      );

      let stageOne: { params: Params; search: SearchParams } | undefined;

      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, params, search) => {
          const result = next(name, params, search);

          stageOne = { params: result.params, search: result.search };

          return result;
        },
      );

      await router.start("/home");
      await router.navigate("src", {}, undefined, { reload: true });

      // The invariant itself.
      for (const key of rawQueryKeys) {
        expect(Object.hasOwn(stageOne!.params, key)).toBe(false);
      }

      // …and the value is ROUTED, not dropped — otherwise the invariant would
      // be satisfiable by throwing the default away.
      for (const key of rawQueryKeys) {
        expect(stageOne!.search[key]).toBe(`D-${key}`);
      }

      // Path-declared hop defaults stay where they were (discrimination: the
      // channel comes from the slot, not from a blanket move to `search`).
      for (const key of pathKeys) {
        expect(stageOne!.params[key]).toBe(`D-${key}`);
      }

      router.stop();

      // The other spelling is REFUSED, not silently re-channelled. Registration
      // cannot see it — only the resolved target declares these names — so the
      // refusal comes from the seam, at the first navigation.
      const misChannelled = createRouter([
        { name: "home", path: "/home" },
        { name: "dst", path: target },
        {
          name: "src",
          path: "/src",
          forwardTo: "dst",
          defaultParams: { ...pathDefaults, ...queryDefaults },
        },
      ]);

      await misChannelled.start("/home");

      await expect(
        misChannelled.navigate("src", {}, undefined, { reload: true }),
      ).rejects.toThrow(/declares `/);

      misChannelled.stop();
    },
  );
});
