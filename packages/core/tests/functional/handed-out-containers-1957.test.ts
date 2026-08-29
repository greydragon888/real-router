// #1957 — what core HANDS OUT may not be a prototype-swap primitive.
//
// The discriminator, and it is about the CONSUMER's merge rather than core's own
// write: an own `"__proto__"` on a container is inert while it sits there, and
// becomes a swap the moment anyone merges it with `Object.assign` or a `for…in`
// copy — both `[[Set]]` that name on the TARGET, where `Object.prototype`'s
// accessor replaces the target's prototype instead of adding an entry.
//
// ⚠ A SPREAD is NOT one of them, and an earlier revision of this header said it
// was. `{ ...container }` performs `CreateDataProperty`, so it can never swap —
// measured on three carrier shapes. #1823's pin had the list right and this
// widened it; the hazard is real and narrower. `swapsOnMerge` below is
// `Object.assign` only for exactly that reason.
//
// The SOURCE's own prototype decides nothing either (measured: a null-prototype
// source swaps the target exactly the same), so the only two fixes are removing
// the key or removing it from ENUMERATION.
//
// ⚑ Which of the two, per door, is decided by ONE question: does core read that
// key back off the very object it published?
//
//   • No  → DROP it (`getAll`'s shape, #1823): the copy exists only to be handed
//     out, so the key carries nothing. Unconditional, because a `hasOwn` gate in
//     front of the one line that neutralises the hazard is an intrinsic read an
//     application can re-point.
//   • Yes → CONCEAL it (non-enumerable own property): the meta record IS core's
//     working table, read by key on every navigation. Dropping is not a milder
//     fix there, it is a WRONG one — measured below.
//
// ⚠ FIVE doors are listed as CARVE-OUTS rather than fixed, each with its
// measured reason, in the last block. Two are prior owner decisions
// (`state.context` #1191, `getRouteConfig` #1788); two are PASS-THROUGHS, where
// the container is the caller's own object and core minted nothing; one is the
// internals handle, which exists to hand out core's live stores. They are
// recorded so each exemption is a statement someone can disagree with, not a
// door nobody looked at.
//
// ⚠ The issue named FOUR doors. A deep walk of every door's object graph found
// seven containers that swap, so three of the carve-outs below are additions to
// its list — which is the argument for deriving the set rather than listing it.
import { describe, expect, it } from "vitest";

import { createRouter, getNavigator, RouterError } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { CONTAINER_SHAPES } from "../helpers/hostileBags";

import type { Router } from "@real-router/core/types";

/**
 * The property every row is measured on: merging this container into a fresh
 * object replaces THAT object's prototype.
 *
 * Deliberately not `Object.hasOwn(container, "__proto__")`. The own key is the
 * mechanism, the swap is the harm — and the two part company at exactly the door
 * the conceal fixes, where the key stays and the swap goes.
 */
function swapsOnMerge(container: unknown): boolean {
  if (container === null || typeof container !== "object") {
    return false;
  }

  // ⚠ `Object.assign`, and ONLY `Object.assign`. It uses `[[Set]]`, which is the
  // mechanism under test; a spread performs `CreateDataProperty`, i.e.
  // `[[DefineOwnProperty]]`, which cannot reach the inherited accessor at all.
  //
  // ⚑ This carried a second `{ ...container }` arm OR-ed onto the result, added
  // for symmetry with the doors' own spreads. It is an equivalent mutant:
  // measured on the poisoned bag, on a null-prototype carrier and through a
  // pass-through Proxy, the spread arm reports `false` in all three — it can
  // never fire. #1823's own pin already warns about this axis from the other
  // side (`eslint --fix` once rewrote its `Object.assign` into a spread and
  // silently removed the point of the cell); the "instrument" block below is
  // what would red if that happened here.
  return (
    Object.getPrototypeOf(Object.assign({}, container)) !== Object.prototype
  );
}

const parse = (json: string): Record<string, unknown> =>
  JSON.parse(json) as Record<string, unknown>;

/** `JSON.parse` mints the own key. No adversarial construction is involved. */
const POISON = '{"kept":1,"__proto__":{"pwned":"YES"}}';
const POISONED_OPTIONS = '{"defaultRoute":"home","__proto__":{"pwned":"YES"}}';

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "away", path: "/away" },
];

describe("#1957 — no door hands out a container that swaps a merge target", () => {
  describe("the instrument", () => {
    it("swapsOnMerge fires on the shape, and on nothing else", () => {
      // Without this the whole table can pass by measuring nothing.
      expect(swapsOnMerge(parse(POISON))).toBe(true);
      expect(swapsOnMerge({ kept: 1 })).toBe(false);
      expect(swapsOnMerge({ __proto__: { pwned: "YES" } })).toBe(false);
      expect(swapsOnMerge(undefined)).toBe(false);
    });

    it("a null-prototype source swaps the target just the same", () => {
      // The reason `Object.create(null)` is not a fix at a hand-out door, and
      // the reason `getAll` deletes rather than relying on its own store.
      const source: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >;

      source.__proto__ = { pwned: "YES" };

      expect(Object.getPrototypeOf(source)).toBeNull();
      expect(swapsOnMerge(source)).toBe(true);
    });
  });

  describe("options — `getOptions()` and the clone transport read one object", () => {
    it("neither door swaps a merge target", () => {
      const router = createRouter(ROUTES, parse(POISONED_OPTIONS));

      expect({
        getOptions: swapsOnMerge(getPluginApi(router).getOptions()),
        cloneState: swapsOnMerge(getInternals(router).getCloneState().options),
      }).toStrictEqual({ getOptions: false, cloneState: false });
    });

    it("a CLONE's options are clean too, because the fix is ABOVE both doors", () => {
      // The issue's own line: "It survives cloneRouter — the clone's
      // getOptions() is polluted too."
      //
      // ⚠ NOT because the two doors share an object — measured, they do not:
      // `getCloneState()` returns `{ ...this.#options.get() }`, a fresh and
      // (unlike `getOptions()`'s) UNFROZEN spread, identity `false`. An earlier
      // revision of this comment, of `CLAUDE.md` and of the commit message all
      // said "the same object"; the fix covers both for a stronger reason —
      // it is applied at the SOURCE, in the `OptionsNamespace` constructor, so
      // every door downstream spreads an object that never had the key.
      const router = createRouter(ROUTES, parse(POISONED_OPTIONS));

      expect(getInternals(router).getCloneState().options as unknown).not.toBe(
        getPluginApi(router).getOptions(),
      );

      const clone = cloneRouter(router);

      expect(swapsOnMerge(getPluginApi(clone).getOptions())).toBe(false);
      expect(
        (getPluginApi(clone).getOptions() as unknown as Record<string, unknown>)
          .defaultRoute,
      ).toBe("home");

      clone.dispose();
      router.dispose();
    });

    it("POSITIVE CONTROL — the rest of the poisoned bag is still the router's options", () => {
      // The drop must not be a refusal: `createRouter` accepts an options bag
      // with unknown keys, and every other key on this one still lands.
      const router = createRouter(ROUTES, parse(POISONED_OPTIONS));
      const options = getPluginApi(router).getOptions() as unknown as Record<
        string,
        unknown
      >;

      expect(options.defaultRoute).toBe("home");
      expect(options.trailingSlash).toBeDefined();
    });
  });

  describe("dependencies — the clone transport, beside the door #1823 already closed", () => {
    it("neither door swaps a merge target", () => {
      const router = createRouter(ROUTES);

      getDependenciesApi(router).setAll(parse(POISON));

      expect({
        getAll: swapsOnMerge(getDependenciesApi(router).getAll()),
        cloneState: swapsOnMerge(
          getInternals(router).getCloneState().dependencies,
        ),
      }).toStrictEqual({ getAll: false, cloneState: false });
    });

    it("POSITIVE CONTROL — the store still HOLDS the name, and a single read answers", () => {
      // The asymmetry #1823 recorded and this extends: a single read hands back
      // a VALUE, a door hands back a CONTAINER someone will merge. Only the
      // second is withheld.
      const router = createRouter(ROUTES);

      getDependenciesApi(router).setAll(parse(POISON));

      const deps = getDependenciesApi(router) as unknown as {
        has: (name: string) => boolean;
        get: (name: string) => unknown;
      };

      expect(deps.has("__proto__")).toBe(true);
      expect(deps.get("__proto__")).toStrictEqual({ pwned: "YES" });
      expect(getDependenciesApi(router).getAll()).toStrictEqual({ kept: 1 });
    });
  });

  describe("route meta — the one door where DROPPING is the wrong fix", () => {
    const metaRouter = (): Router =>
      createRouter([{ name: "__proto__", path: "/p/:id" }]);

    it("the published record does not swap a merge target", () => {
      const router = metaRouter();

      expect(
        swapsOnMerge(getInternals(router).getMetaForState("__proto__")),
      ).toBe(false);
    });

    it("an ORDINARY route's meta gains no own `__proto__` at all", () => {
      // Found by mutation: deleting the conceal's `hasOwn` gate reds NOTHING
      // otherwise. Ungated, the read `record[UNSAFE_KEY]` reaches the inherited
      // accessor and answers `Object.prototype`, which then gets DEFINED as an
      // own (non-enumerable) key on every parameterised route's meta — a
      // descriptor write per route at registration, for a name nobody used.
      // Invisible to the swap rows above and to `toStrictEqual`, which does not
      // compare non-enumerable properties.
      const router = createRouter([{ name: "plain", path: "/plain/:id" }]);
      const meta = getInternals(router).getMetaForState("plain");

      expect(Object.getOwnPropertyNames(meta!)).toStrictEqual(["plain"]);
    });

    it("DISCRIMINATOR — the entry is still there, and still read by key", () => {
      // A `delete`-shaped fix passes the row above and reds this one. Core reads
      // `meta[segmentName]` on every navigation, so with the entry gone the read
      // reaches the INHERITED accessor and answers `Object.prototype` — an
      // object, whose `Object.keys` is `[]`, so `segmentParamsEqual` reports the
      // segment unchanged. Measured, both halves.
      const router = metaRouter();
      const meta = getInternals(router).getMetaForState("__proto__");

      expect(meta?.__proto__).toStrictEqual({ id: "url" });
    });

    it("DISCRIMINATOR — a param change still re-activates the segment", async () => {
      // The end-to-end consequence of the same read. On the drop this is `[]`.
      const router = metaRouter();

      await router.start("/p/1");

      const state = await router.navigate("__proto__", { id: "2" });

      expect(state.transition?.segments.activated).toStrictEqual(["__proto__"]);
    });
  });

  describe("NavigationOptions — the object a plugin hook receives", () => {
    const opts = async (
      boot: string,
      allowNotFound: boolean,
      withSignal: boolean,
    ): Promise<{ seen: unknown; passedIn: Record<string, unknown> }> => {
      const router = createRouter(ROUTES, { allowNotFound });
      let seen: unknown;

      router.usePlugin(() => ({
        onTransitionSuccess(_toState, _fromState, received) {
          if (received !== undefined) {
            seen = received;
          }
        },
      }));

      await router.start(boot);

      const passedIn = parse(POISON);

      if (withSignal) {
        passedIn.signal = new AbortController().signal;
      }

      seen = undefined;
      await router.navigate("away", {}, {}, passedIn);

      return { seen, passedIn };
    };

    it("the two arcs where CORE mints the container do not swap", async () => {
      // THREE arcs, and they differ in who OWNS the object — which the issue got
      // wrong (it recorded `=== false`, "core mints it", for all three; measured,
      // the plain arc's identity is `true`). Only two of them are core's to fix:
      // `stripSignal`'s rest-destructuring and the forced-replace substitution
      // each mint a fresh object by spread, and a spread `[[Define]]`s, so the
      // caller's own `"__proto__"` rides into every hook on a container core
      // built.
      const signalled = await opts("/home", false, true);
      const forced = await opts("/nope", true, false);

      expect({
        signalled: swapsOnMerge(signalled.seen),
        forced: swapsOnMerge(forced.seen),
      }).toStrictEqual({ signalled: false, forced: false });
    });

    it("CARVE-OUT — the plain arc hands back the caller's own object, poison and all", async () => {
      // ⚠ Recorded, not fixed, and the reason is a COLLISION with a pin rather
      // than an oversight. Core neither mints nor copies here: the hook receives
      // the very object the application passed to `navigate`, identity intact.
      // Sanitising it means COPYING it — and copying reads every key, i.e.
      // invokes the caller's accessors a second time below the read that already
      // decided. `opts-read-once-1817.test.ts` counts exactly those reads and
      // pins them at one; the copy takes `reload` and `replace` to two (measured,
      // both cells red).
      //
      // So the trade is: an extra invocation of application code on every
      // navigation carrying the key, against a container the application itself
      // authored and handed in. The pin wins.
      const plain = await opts("/home", false, false);

      expect(plain.seen).toBe(plain.passedIn);
      expect(swapsOnMerge(plain.seen)).toBe(true);
    });

    it("POSITIVE CONTROL — the hook still receives the caller's other options", async () => {
      const { seen } = await opts("/home", false, false);

      expect((seen as Record<string, unknown>).kept).toBe(1);
    });

    it("an ordinary navigation still hands the hook the caller's own object", async () => {
      // The withholding must not allocate on the common path: with the key
      // absent the container is returned untouched, identity and all.
      const router = createRouter(ROUTES);
      let seen: unknown;

      router.usePlugin(() => ({
        onTransitionSuccess(_toState, _fromState, received) {
          if (received !== undefined) {
            seen = received;
          }
        },
      }));

      await router.start("/home");

      const passedIn = { replace: true };

      await router.navigate("away", {}, {}, passedIn);

      expect(seen).toBe(passedIn);
    });
  });

  describe("doors that were already safe — the controls for the table", () => {
    it("nothing else in the sweep swaps", async () => {
      const router = createRouter(
        [
          parse(
            '{"name":"__proto__","path":"/p/:__proto__","__proto__":{"pwned":"YES"}}',
          ) as never,
          { name: "away", path: "/away" },
        ],
        { queryParamsMode: "loose" },
      );
      const internals = getInternals(router);

      await router.start("/p/1");

      const matched = internals.matchPath(
        "/p/9?__proto__=1",
        getPluginApi(router).getOptions(),
      );

      expect({
        getTree: swapsOnMerge(getPluginApi(router).getTree()),
        routeConfig: swapsOnMerge(getRoutesApi(router).get("__proto__")),
        matchedParams: swapsOnMerge(matched?.params),
        matchedSearch: swapsOnMerge(matched?.search),
        stateParams: swapsOnMerge(router.getState()?.params),
        stateSearch: swapsOnMerge(router.getState()?.search),
        transition: swapsOnMerge(router.getState()?.transition),
        navigator: swapsOnMerge(getNavigator(router)),
        lifecycleApi: swapsOnMerge(getLifecycleApi(router)),
        routesApi: swapsOnMerge(getRoutesApi(router)),
        error: swapsOnMerge(
          new RouterError("ROUTE_NOT_FOUND", parse(POISON) as never),
        ),
        errorJson: swapsOnMerge(
          new RouterError("ROUTE_NOT_FOUND", parse(POISON) as never).toJSON(),
        ),
      }).toStrictEqual({
        getTree: false,
        routeConfig: false,
        matchedParams: false,
        matchedSearch: false,
        stateParams: false,
        stateSearch: false,
        transition: false,
        navigator: false,
        lifecycleApi: false,
        routesApi: false,
        error: false,
        errorJson: false,
      });
    });
  });

  describe("the CARVE-OUTS, measured rather than skipped", () => {
    // ⚑ Found by a DEEP walk of every door's object graph, not from the issue's
    // list — which named four doors and missed three of the five below. The
    // walk is what makes "every container-returning door" a derivation instead
    // of an enumeration, and the three it added split cleanly into the two
    // shapes core does not owe a copy for:
    //
    //   PASS-THROUGH — the container is the CALLER's own object, identity
    //     intact, so core minted no swap primitive and sanitising it would mean
    //     copying a bag on the render path (`forwardState`, and the plain arc of
    //     `NavigationOptions` above).
    //   LIVE STORE — the container IS core's mutable state, handed out through
    //     the internals handle whose entire purpose is that (`routeGetStore`,
    //     `dependenciesGetStore`). Withholding a key there withholds it from the
    //     router, not from a consumer.
    //
    // Both are stated so a later reader can disagree with the reason rather
    // than rediscover the door.

    it("`forwardState` hands the CALLER's own bags back, poison and all", () => {
      // Its siblings normalise (`makeState().params` is clean, measured), and
      // the URL direction is scrubbed one layer up by `withoutUnsafeKey`
      // (#1904). What is left is the fast path, where the seam has no default to
      // layer and returns exactly what it was given.
      const router = createRouter(ROUTES);
      const bag = parse(POISON);
      const out = getPluginApi(router).forwardState(
        "home",
        bag as never,
        bag as never,
      );

      expect(out.params).toBe(bag);
      expect(swapsOnMerge(out.params)).toBe(true);

      // The CONTROL that says this is a pass-through and not a leak in the
      // merge: give the route a default and the copy drops the key.
      const withDefault = createRouter([
        parse(
          '{"name":"home","path":"/home","defaultParams":{"__proto__":{"pwned":"YES"}}}',
        ) as never,
      ]);

      expect(
        swapsOnMerge(
          getPluginApi(withDefault).forwardState(
            "home",
            {} as never,
            {} as never,
          ).params,
        ),
      ).toBe(false);
    });

    it("the internals handle hands out the LIVE stores", () => {
      // `dependenciesGetStore()` / `routeGetStore()` return core's own mutable
      // objects — writing to them corrupts the router outright, which is a
      // larger licence than merging them. They are not copies made for a
      // caller, so there is nothing here to withhold from.
      const router = createRouter(ROUTES);

      getDependenciesApi(router).setAll(parse(POISON));

      const internals = getInternals(router);

      expect(swapsOnMerge(internals.dependenciesGetStore().dependencies)).toBe(
        true,
      );

      // ...and the COPY door beside it is the one that was fixed.
      expect(swapsOnMerge(getDependenciesApi(router).getAll())).toBe(false);
    });

    it("`getRouteConfig` still carries a route's `__proto__` custom field", () => {
      // #1788's carve-out, and its premise is "the record does not escape to a
      // MERGING consumer" — re-measured in the issue against all three shipped
      // consumers (`lifecycle-plugin`, `preload-plugin`, `search-schema-plugin`),
      // which read by key. That is a statement about in-repo plugins, not a
      // structural fact about third-party ones.
      const router = createRouter([
        parse('{"name":"home","path":"/home","__proto__":{"pwned":"YES"}}'),
      ] as never);

      expect(swapsOnMerge(getPluginApi(router).getRouteConfig("home"))).toBe(
        true,
      );
    });

    it("`state.context` still carries a plugin's `__proto__` namespace", async () => {
      // #1191 stores every namespace name as ordinary data, deliberately: the
      // record is a plugin's own and core does not merge it.
      //
      // ⚠ What this cell records is that the premise has a TRANSPORT.
      // `JSON.stringify(getState())` emits the name, a client `JSON.parse`
      // re-creates the own key, and the merge on the far side swaps — so "not a
      // container a consumer merges" is true of core and not of SSR. Left as it
      // stands because reversing #1191 is a decision about `claimContextNamespace`,
      // not about this door; the cell exists so the exemption cannot be mistaken
      // for a door nobody measured.
      const router = createRouter(ROUTES);
      const claim = getPluginApi(router).claimContextNamespace("__proto__");

      await router.start("/home");
      claim.write(router.getState()!, { pwned: "YES" });

      expect(swapsOnMerge(router.getState()?.context)).toBe(true);

      // The JSON hop is the point: `structuredClone` preserves the own key
      // without going through a string, so it does not model the SSR transport
      // this cell measures (serialize on the server, `JSON.parse` on the
      // client).
      const serialized = JSON.stringify(router.getState()?.context);
      const roundTripped = JSON.parse(serialized) as object;

      expect(swapsOnMerge(roundTripped)).toBe(true);
    });
  });

  describe("the LEVEL this closes, and the one above it", () => {
    it("the fix reaches the TOP level of a container and no further", () => {
      // ⚑ The recurring failure this cell exists to prevent is not "the fix is
      // wrong" but "the fix is one level below the hole". So: the level closed
      // is the container a door RETURNS. One level down are the caller's own
      // objects, handed back by reference — core's documented one-level copy
      // model (#1958, `config-aliasing-authority-1958.test.ts`) — and they are
      // NOT cleaned, measured on four doors at once.
      //
      // That is the same answer the pass-through carve-outs get, for the same
      // reason: core owns no copy there. Stated here so the boundary is a
      // measurement rather than an absence.
      const nested = parse('{"__proto__":{"pwned":"YES"},"id":"1"}');
      const router = createRouter(
        [{ name: "home", path: "/home", defaultParams: nested }] as never,
        { defaultParams: nested } as never,
        { svc: nested },
      );
      const options = getPluginApi(router).getOptions() as unknown as Record<
        string,
        unknown
      >;
      const routeConfig = getRoutesApi(router).get("home") as unknown as Record<
        string,
        unknown
      >;
      const all = getDependenciesApi(router).getAll() as Record<
        string,
        unknown
      >;

      expect({
        optionsTop: swapsOnMerge(options),
        dependenciesTop: swapsOnMerge(all),
        optionsDefaultParams: swapsOnMerge(options.defaultParams),
        routeDefaultParams: swapsOnMerge(routeConfig.defaultParams),
        dependencyValue: swapsOnMerge(all.svc),
      }).toStrictEqual({
        optionsTop: false,
        dependenciesTop: false,
        // One level down: the caller's own object, by reference.
        optionsDefaultParams: true,
        routeDefaultParams: true,
        dependencyValue: true,
      });

      // ...and it IS the caller's object, not a copy core made and left dirty.
      expect(options.defaultParams).toBe(nested);
    });
  });

  describe("VECTOR 0 — the adversarial container battery, at the fixed doors", () => {
    // `hostileBags.ts`'s six shapes are the forms a caller-supplied bag
    // legitimately arrives in. The fix reads and copies caller-supplied objects,
    // so the battery belongs in the same commit rather than in a transcript.
    it("every shape passes the fixed doors clean, and none of them throws", () => {
      // ⚑ ONE assertion over a signature per shape, the form
      // `hostile-bags-battery.test.ts` argues for: an `it.each` branching on the
      // label puts a conditional inside a test, and a shape that silently
      // stopped being constructed would then pass by running nothing.
      const signature = CONTAINER_SHAPES.map(([label, wrap]) => {
        const bag = wrap({ kept: 1 });

        const optionsRouter = createRouter(
          [{ name: "home", path: "/home" }],
          bag as never,
        );
        const depsRouter = createRouter(
          [{ name: "home", path: "/home" }],
          {},
          bag,
        );

        const row = [
          label,
          swapsOnMerge(getPluginApi(optionsRouter).getOptions()),
          swapsOnMerge(getInternals(optionsRouter).getCloneState().options),
          swapsOnMerge(getInternals(depsRouter).getCloneState().dependencies),
          swapsOnMerge(getDependenciesApi(depsRouter).getAll()),
        ];

        optionsRouter.dispose();
        depsRouter.dispose();

        return row;
      });

      expect(signature).toStrictEqual(
        CONTAINER_SHAPES.map(([label]) => [label, false, false, false, false]),
      );
      // The battery must not have quietly emptied — a zero-row table compares
      // equal to a zero-row expectation.
      expect(signature.length).toBeGreaterThan(5);
    });

    it("a `__proto__` whose VALUE is a string is dropped too, though it never swapped", () => {
      // The battery's own poison shape carries `"from-the-wire"`, a STRING — and
      // the inherited setter ignores primitives, so that form was never a swap
      // primitive. The withholding is value-blind, exactly as `getAll`'s
      // unconditional delete is, and this cell says so rather than leaving a
      // reader to assume the drop is conditioned on the hazard.
      const router = createRouter(
        [{ name: "home", path: "/home" }],
        parse('{"kept":1,"__proto__":"from-the-wire"}') as never,
      );
      const options = getPluginApi(router).getOptions() as unknown as Record<
        string,
        unknown
      >;

      expect(Object.hasOwn(options, "__proto__")).toBe(false);
      expect(options.kept).toBe(1);
    });
  });

  describe("a NEW door cannot ship unclassified", () => {
    it("every public surface has exactly the members this table walked", () => {
      // The table above is a list, and a list cannot notice a fifth door. This
      // cell is what makes one answer the question: add a member to any surface
      // and it reds, so the author has to classify it — fixed, or carve-out with
      // a reason.
      const router = createRouter(ROUTES);
      const members = (surface: object): string[] =>
        Object.keys(surface).toSorted((a, b) => a.localeCompare(b));

      expect({
        routes: members(getRoutesApi(router)),
        dependencies: members(getDependenciesApi(router)),
        lifecycle: members(getLifecycleApi(router)),
        plugin: members(getPluginApi(router)),
        navigator: members(getNavigator(router)),
        internals: members(getInternals(router) as unknown as object),
      }).toStrictEqual({
        routes: [
          "add",
          "clear",
          "get",
          "has",
          "remove",
          "replace",
          "subscribeChanges",
          "update",
        ],
        dependencies: [
          "get",
          "getAll",
          "has",
          "remove",
          "reset",
          "set",
          "setAll",
        ],
        lifecycle: [
          "addActivateGuard",
          "addDeactivateGuard",
          "removeActivateGuard",
          "removeDeactivateGuard",
        ],
        plugin: [
          "addEventListener",
          "addInterceptor",
          "buildNavigationState",
          "claimContextNamespace",
          "emitTransitionError",
          "extendRouter",
          "forwardState",
          "getOptions",
          "getRootPath",
          "getRouteConfig",
          "getTree",
          "makeState",
          "matchPath",
          "navigateToState",
          "setRootPath",
        ],
        navigator: [
          "canNavigateTo",
          "getState",
          "isActiveRoute",
          "isLeaveApproved",
          "navigate",
          "subscribe",
          "subscribeLeave",
        ],
        internals: [
          "addEventListener",
          "buildPath",
          "buildStateResolved",
          "contextClaimRecords",
          "dependenciesGetStore",
          "emitTransitionError",
          "forwardState",
          "getCloneState",
          "getMetaForState",
          "getOptions",
          "getQueryParams",
          "getRootPath",
          "getStateName",
          "getTree",
          "hydrationState",
          "interceptors",
          "isDisposed",
          "isTransitioning",
          "logger",
          "makeState",
          "matchPath",
          "navigateToNotFound",
          "navigateToState",
          "port",
          "routeGetStore",
          "routerExtensions",
          "setRootPath",
          "start",
          "systemCommit",
          "treeChanged",
          "validator",
        ],
      });
    });
  });
});
