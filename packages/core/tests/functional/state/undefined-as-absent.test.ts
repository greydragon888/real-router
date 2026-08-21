import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params, SearchParams } from "@real-router/core";

/**
 * `undefined` ≡ absence, on BOTH sides of the default merge (#1550 / #1551).
 *
 * The path channel already behaved this way by accident — `normalizeParams`
 * strips the caller's `undefined`s before `makeState` merges the route default —
 * while the query channel had no such step, and NEITHER channel looked at the
 * DEFAULT side. So:
 *
 * - #1550: `navigate("x", {}, { page: undefined })` killed `defaultSearch` and
 *   left an own `page: undefined` key in the frozen `state.search`;
 * - #1551: a default that itself carries `undefined`
 *   (`defaultSearch: { q: undefined }` / `defaultParams: { extra: undefined }`)
 *   leaked that own key into the committed state through every producer.
 *
 * The rule now lives in the merge itself (`mergeDefined`, `src/helpers.ts`), so
 * it holds for every entry point and for a default and a caller value alike: a
 * key whose winning value is `undefined` simply does not exist.
 */
describe("core/state — undefined is absence in the default merge (#1550, #1551)", () => {
  const ROUTES = [
    { name: "home", path: "/home" },
    { name: "x", path: "/x?page", defaultSearch: { page: "1" } },
    { name: "plain", path: "/plain?zzz" },
    {
      name: "q",
      path: "/q?q",
      defaultSearch: { q: undefined } as SearchParams,
    },
    {
      name: "arb",
      path: "/arb",
      defaultParams: { extra: undefined } as Params,
    },
    {
      name: "req",
      path: "/req/:id",
      defaultParams: { id: undefined } as Params,
    },
    { name: "y", path: "/y/:id", defaultParams: { id: "7" } },
  ];

  const started = async () => {
    const router = createRouter(ROUTES);

    await router.start("/home");

    return router;
  };

  describe("caller side: an explicit undefined does not outrank the default (#1550)", () => {
    it("keeps defaultSearch when the query value is explicitly undefined", async () => {
      const router = await started();

      const state = await router.navigate("x", {}, { page: undefined });

      // Symmetric with the path channel, which already behaves this way.
      expect(state.search).toStrictEqual({ page: "1" });
      expect(state.path).toBe("/x?page=1");
    });

    it("keeps defaultParams when the path value is explicitly undefined (unchanged)", async () => {
      const router = await started();

      const state = await router.navigate("y", { id: undefined });

      expect(state.params).toStrictEqual({ id: "7" });
      expect(state.path).toBe("/y/7");
    });

    it("drops an explicitly-undefined query value when the route has no default", async () => {
      const router = await started();

      const state = await router.navigate("plain", {}, { zzz: undefined });

      expect(Object.hasOwn(state.search, "zzz")).toBe(false);
      expect(state.path).toBe("/plain");
    });
  });

  describe("default side: an undefined-valued default behaves like no entry (#1551)", () => {
    it("does not leak the key into state.search on navigate", async () => {
      const router = await started();

      const state = await router.navigate("q", {});

      expect(Object.hasOwn(state.search, "q")).toBe(false);
    });

    it("does not leak the key into state.search on the URL direction", async () => {
      const router = await started();

      const matched = getPluginApi(router).matchPath("/q");

      expect(matched).toBeDefined();
      expect(Object.hasOwn(matched!.search, "q")).toBe(false);
    });

    it("does not leak an arbitrary undefined default into state.params", async () => {
      const router = await started();

      const state = await router.navigate("arb");

      expect(Object.hasOwn(state.params, "extra")).toBe(false);
      expect(state.path).toBe("/arb");
    });

    it("does not leak through the makeState primitive", async () => {
      const router = await started();
      const api = getPluginApi(router);

      expect(Object.hasOwn(api.makeState("arb").params, "extra")).toBe(false);
      expect(Object.hasOwn(api.makeState("q").search, "q")).toBe(false);
    });

    it("keeps a caller value that shadows an undefined default", async () => {
      const router = await started();

      const state = await router.navigate("req", { id: "3" });

      expect(state.params).toStrictEqual({ id: "3" });
      expect(state.path).toBe("/req/3");
    });

    it("still reports a genuinely missing required param", async () => {
      const router = await started();

      // The default carries no value, so `id` really is absent — same error as
      // with no `defaultParams` entry at all, for the right reason.
      await expect(router.navigate("req")).rejects.toThrow(
        /Missing required param 'id'/,
      );
    });
  });

  describe("only own keys participate in the merge", () => {
    // Mirrors the `normalizeParams` contract ("ignores inherited (prototype-chain)
    // properties") on both sides of the merge — a prototype-borne key must not
    // reach the state, whether it rides on the caller bag or on the route default.
    const PROTO = { inherited: "INHERITED" };

    it("ignores an inherited key on the caller bag", async () => {
      const router = await started();
      const params = Object.create(PROTO) as Params;

      params.own = "own-value";

      expect(
        getPluginApi(router).makeState("arb", params).params,
      ).toStrictEqual({ own: "own-value" });

      const navigated = await router.navigate("arb", params);

      expect(navigated.params).toStrictEqual({ own: "own-value" });
    });

    it("ignores an inherited key on the caller's SEARCH bag", async () => {
      // The PATH channel is filtered twice — `normalizeParams` runs before the
      // merge for every producer since `makeState` joined the pipeline (Phase 4),
      // so the merge's own-key guard never sees an inherited path key any more.
      // The QUERY channel has no such entry guard: `canonicalize` hands the
      // caller's `search` to the merge verbatim, which makes the guard inside
      // `mergeDefined` the ONLY thing standing between a prototype-borne key and
      // `state.search`. Coverage pointed at that line the moment the path
      // channel stopped reaching it.
      //
      // Route `x` and not `arb`: `mergeDefined` short-circuits to
      // `stripUndefined(value)` when the route has NO default in that channel,
      // so only a route WITH a `defaultSearch` runs the merge loop the guard
      // lives in. Picking the wrong fixture here passes while testing nothing.
      const router = await started();
      const search = Object.create({ inheritedQ: "INHERITED" }) as SearchParams;

      search.ownQ = "own-value";

      expect(
        getPluginApi(router).makeState("x", {}, search).search,
      ).toStrictEqual({ page: "1", ownQ: "own-value" });

      const navigated = await router.navigate("x", {}, search);

      expect(navigated.search).toStrictEqual({ page: "1", ownQ: "own-value" });
    });

    it("ignores an inherited key on the route default", async () => {
      const defaultParams = Object.create(PROTO) as Params;

      defaultParams.own = "from-default";

      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "proto", path: "/proto", defaultParams },
      ]);

      await router.start("/home");

      const state = await router.navigate("proto");

      expect(state.params).toStrictEqual({ own: "from-default" });
    });
  });

  describe("a bag that grows a key after the walk has passed it", () => {
    it("an undefined defined MID-WALK still does not reach the frozen state", async () => {
      // The rule above is enforced by two steps that read the bag separately: a
      // walk that finds nothing to strip, and a copy that trusts that finding.
      // "Nothing was undefined" is then a fact about the walk, not about the
      // object — and a getter on a sibling key can define a NEW undefined-valued
      // key behind the walk, between the two. That is the same inference the
      // `__proto__` guard in the same function was written to stop relying on
      // (#1792); this cell is its `undefined` twin, and without the value test in
      // that copy the key arrives in a FROZEN `state.search` where no producer
      // can remove it.
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "q", path: "/q?keep&late" },
      ]);

      await router.start("/home");

      const bag: Record<string, unknown> = {};

      Object.defineProperty(bag, "keep", {
        enumerable: true,
        configurable: true,
        get(): string {
          Object.defineProperty(bag, "late", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined,
          });

          return "yes";
        },
      });

      await router
        .navigate("q", {}, bag as SearchParams)
        .catch(() => undefined);

      const committed = router.getState()!.search;

      expect(
        Object.hasOwn(committed, "late"),
        "the late key is absence, not an undefined-valued entry",
      ).toBe(false);
      expect(Object.getOwnPropertyNames(committed)).toStrictEqual(["keep"]);
      expect(
        Object.isFrozen(committed),
        "and it is frozen, so nothing can undo it",
      ).toBe(true);

      router.dispose();
    });

    it("and at the COMMIT DOOR, which is the only route left to that copy", async () => {
      // ⚠ The cell above no longer reaches `mergeWithDefault`'s unowned copy:
      // since #1812 the query channel is normalised before the merge sees it, so
      // `navigate` hands over an owned bag and takes the freeze-in-place branch.
      // The behaviour it asserts still holds — `normalizeChannel` drops the late
      // key one step earlier — but the loop it was written for is reached only by
      // the doors that copy a foreign `State` verbatim (#1792).
      //
      // Mutationally validated the same way: deleting the `entry !== undefined`
      // test in that loop reds THIS cell and nothing above it.
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "q", path: "/q?keep&late" },
      ]);

      await router.start("/home");

      const base = getPluginApi(router).makeState("q", {}, { keep: "yes" });

      const bag: Record<string, unknown> = {};

      Object.defineProperty(bag, "keep", {
        enumerable: true,
        configurable: true,
        get(): string {
          Object.defineProperty(bag, "late", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined,
          });

          return "yes";
        },
      });

      await getPluginApi(router)
        .navigateToState({ ...base, search: bag as SearchParams })
        .catch(() => undefined);

      const committed = router.getState()!.search;

      expect(
        Object.hasOwn(committed, "late"),
        "the key the getter grew behind the walk is absence, not undefined",
      ).toBe(false);
      expect(Object.getOwnPropertyNames(committed)).toStrictEqual(["keep"]);
      expect(Object.isFrozen(committed)).toBe(true);

      router.dispose();
    });
  });

  describe("the same rule, at the other two copies that enforce it", () => {
    it("the STRIP copy drops a key the walk grew behind it", async () => {
      // `mergeWithDefault`'s own loop has a cell above. `copyOwnStringKeys` — the
      // copy `stripUndefined` makes when it HAS something to strip — is a second
      // site with the identical job, and it had no test: removing its
      // `undefined` test left 4329 green while a getter that defines a key
      // behind the walk put that key into a frozen `state.search`.
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "q", path: "/q?a&keep&ghost" },
      ]);

      await router.start("/home");

      const bag: Record<string, unknown> = {};

      Object.defineProperty(bag, "a", {
        enumerable: true,
        configurable: true,
        get(): string {
          Object.defineProperty(bag, "ghost", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined,
          });

          return "1";
        },
      });

      // an honest `undefined` forces the strip copy, which is the path under test
      bag.keep = "y";
      bag.drop = undefined;

      await router
        .navigate("q", {}, bag as SearchParams)
        .catch(() => undefined);

      const committed = router.getState()!.search;

      expect(
        Object.hasOwn(committed, "ghost"),
        "the key the getter grew is absence, not an undefined-valued entry",
      ).toBe(false);
      expect(Object.getOwnPropertyNames(committed)).toStrictEqual([
        "a",
        "keep",
      ]);

      router.dispose();
    });

    it("a route DEFAULT that answers twice cannot land undefined either", async () => {
      // The third site: `mergeDefined`'s default loop. A route default is a bag
      // the application still holds and may back with an accessor, so asking and
      // then taking would be two reads — and a default that answers `"D"` and
      // then `undefined` put an `undefined`-valued own key into the frozen
      // channel while `state.path` showed nothing.
      const defaults: Record<string, unknown> = {};
      let reads = 0;

      Object.defineProperty(defaults, "other", {
        enumerable: true,
        configurable: true,
        get(): string | undefined {
          reads += 1;

          return reads === 1 ? "D" : undefined;
        },
      });

      const router = createRouter([
        { name: "home", path: "/home" },
        {
          name: "d",
          path: "/d?keep&other",
          defaultSearch: defaults as SearchParams,
        },
      ]);

      await router.start("/home");
      await router.navigate("d", {}, { keep: "y" }).catch(() => undefined);

      const committed = router.getState()!.search;

      expect(
        Object.hasOwn(committed, "other") &&
          (committed as Record<string, unknown>).other === undefined,
        "the default answered once, so the channel cannot hold its second answer",
      ).toBe(false);
      expect(
        router.getState()!.path,
        "and the URL agrees with the channel",
      ).toBe("/d?keep=y&other=D");

      router.dispose();
    });
  });

  describe("the rule holds on the sites that feed the URL and the plugins", () => {
    it("hides an undefined source default from the forwardState primitive", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        {
          name: "src",
          path: "/src",
          forwardTo: "dst",
          defaultParams: { z: undefined },
        },
        { name: "dst", path: "/dst" },
      ]);

      await router.start("/home");

      const forwarded = getPluginApi(router).forwardState("src", {});

      expect(forwarded.name).toBe("dst");
      expect(Object.hasOwn(forwarded.params, "z")).toBe(false);
    });

    it("hides undefined defaults from a route codec", async () => {
      const seen: { params: Params; search: SearchParams }[] = [];
      const router = createRouter([
        { name: "home", path: "/home" },
        {
          name: "c",
          path: "/c/:id?opt",
          defaultParams: { extra: undefined },
          defaultSearch: { opt: undefined },
          encodeParams: (channels) => {
            seen.push(channels);

            return channels;
          },
        },
      ]);

      await router.start("/home");
      router.buildPath("c", { id: "1" });

      expect(seen).toHaveLength(1);
      expect(Object.hasOwn(seen[0].params, "extra")).toBe(false);
      expect(Object.hasOwn(seen[0].search, "opt")).toBe(false);
    });

    it("an INHERITED key is not a supported input — the merge drops it", async () => {
      // ⚑ This pins the project's supported-input rule (own enumerable only) at
      // the one place that enforces it: `mergeDefined`'s `Object.hasOwn` guard.
      // A caller layering config with `Object.create(base)` gets the base's keys
      // ignored — deliberately, and now visibly.
      // ⚠ Through the forwardState SEAM, for the same reason as the cell below:
      // the seam folds a hop's defaults on the RAW bag, before the channel
      // normaliser runs. A direct `navigate` is filtered upstream and never
      // reaches this guard — a probe written that way passes without exercising
      // anything, which is what the coverage gate caught.
      const router = createRouter([
        {
          name: "src",
          path: "/src/:id",
          forwardTo: "dst",
          defaultParams: { id: "D" },
        },
        { name: "dst", path: "/dst/:id" },
        { name: "home", path: "/home" },
      ]);

      await router.start("/home");

      const layered = Object.create({ id: "inherited" }) as Record<
        string,
        string
      >;
      const state = await router.navigate("src", layered);

      // The inherited key never entered the bag, so the hop's own default won.
      expect(state.params).toStrictEqual({ id: "D" });
      expect(state.path).toBe("/dst/D");

      router.dispose();
    });

    it("the forwardState seam strips an undefined-valued key before the merge", async () => {
      // ⚑ The seam runs BEFORE the channel normaliser — `RoutesNamespace` folds a
      // hop's defaults with `mergeDefined` on the RAW caller bag — so this is the
      // one path on which `stripUndefined` still meets an `undefined` value.
      //
      // ⚠ It is reachable only through `navigate`. `buildPath` takes the LITERAL
      // form (`resolveForward: false`), which skips the seam entirely — a probe
      // written against `buildPath` reports zero and proves nothing. That is why
      // the cell exists: #1812 routed both channels through the normaliser, which
      // removed every OTHER path to this branch, and the coverage gate is what
      // said so.
      const router = createRouter([
        { name: "src", path: "/src?tab", forwardTo: "dst" },
        { name: "dst", path: "/dst?tab" },
        { name: "home", path: "/home" },
      ]);

      await router.start("/home");

      const state = await router.navigate("src", {}, {
        tab: undefined,
      } as never);

      expect(Object.hasOwn(state.search, "tab")).toBe(false);
      expect(state.path).toBe("/dst");

      router.dispose();
    });
  });
});
