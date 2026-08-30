import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import {
  CONTAINER_SHAPES,
  NON_OBJECT_CONTAINERS,
} from "../../helpers/hostileBags";

import type {
  NavigationOptions,
  PluginFactory,
  Route,
  Router,
} from "@real-router/core";

/**
 * Core copies a caller's `NavigationOptions` ONCE, at the entry door (#1962).
 *
 * The defect these cells pin is not the aliasing on its own — either answer is
 * defensible — it is that the two answers were chosen by an unrelated detail of
 * the call. Measured before the fix, across the five arcs below:
 *
 *     arc                        hook received the caller's object
 *     positional, no signal      YES        <- and a write reached the app
 *     positional, WITH signal    no
 *     descriptor form            YES        <- and a write reached the app
 *     navigateToDefault          YES        <- and a write reached the app
 *     forced replace (from 404)  no
 *
 * The discriminator is a `signal` the plugin never sees, so a plugin author
 * cannot tell which one they hold. The cells therefore assert UNIFORMITY over
 * the arcs rather than a value per arc: whatever the answer is, every arc gives
 * the same one.
 *
 * ⚑ The copy keeps every own enumerable key — owner decision, 2026-08-30,
 * recorded in `packages/core/CLAUDE.md` "Supported Input Shapes". A key core does
 * not recognise (`hash`, declared by three URL plugins through module
 * augmentation) survives to the hook; that is what `<Link hash>` rides.
 */
describe("the entry door copies the caller's NavigationOptions (#1962)", () => {
  const ROUTES = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ] as unknown as Route[];

  interface Arc {
    readonly name: string;
    readonly make: () => Router;
    readonly boot: string;
    readonly run: (r: Router, bag: NavigationOptions) => Promise<unknown>;
    readonly bag: () => NavigationOptions;
  }

  const ARCS: readonly Arc[] = [
    {
      name: "positional, no signal",
      make: () => createRouter(ROUTES),
      boot: "/a",
      run: (r, bag) => r.navigate("b", {}, undefined, bag),
      bag: () => ({ replace: true }),
    },
    {
      name: "positional, WITH signal",
      make: () => createRouter(ROUTES),
      boot: "/a",
      run: (r, bag) => r.navigate("b", {}, undefined, bag),
      bag: () => ({ replace: true, signal: AbortSignal.timeout(5000) }),
    },
    {
      name: "descriptor form",
      make: () => createRouter(ROUTES),
      boot: "/a",
      run: (r, bag) => r.navigate({ name: "b" }, bag),
      bag: () => ({ replace: true }),
    },
    {
      name: "navigateToDefault",
      make: () => createRouter(ROUTES, { defaultRoute: "b" }),
      boot: "/a",
      run: (r, bag) => r.navigateToDefault(bag),
      bag: () => ({ replace: true }),
    },
    {
      name: "forced replace out of UNKNOWN_ROUTE",
      make: () => createRouter(ROUTES, { allowNotFound: true }),
      boot: "/nowhere",
      run: (r, bag) => r.navigate("b", {}, undefined, bag),
      bag: () => ({ reload: true }),
    },
    {
      // ⚑ The PLUGIN's door, and the one an application never calls: browser-plugin
      // restores a popstate entry through it. It shares the funnel with the four
      // above, which is exactly why it belongs in the table — "same funnel" is the
      // claim, and a table that omits the arc cannot check it.
      name: "getPluginApi().navigateToState",
      make: () => createRouter(ROUTES),
      boot: "/a",
      run: async (r, bag) => {
        const target = await r.navigate("b");

        await r.navigate("a");

        return getPluginApi(r).navigateToState(target, bag);
      },
      bag: () => ({ replace: true }),
    },
  ];

  interface Observed {
    readonly arc: string;
    /**
     * ⚑ Every other field is VACUOUSLY satisfied by an arc that never reaches the
     * hook, and the failure mode is silent in both directions: `received === bag`
     * is `false` when `received` is `undefined`, and `Object.isFrozen(undefined)`
     * answers **true** — a primitive is frozen by definition. So an arc that
     * quietly stopped announcing would report "not the caller's object, frozen"
     * and pass every cell below. This field is what makes the table a
     * measurement.
     */
    readonly reachedTheHook: boolean;
    readonly isCallersObject: boolean;
    readonly frozen: boolean;
    readonly writeRefused: boolean;
    readonly callerBagUntouched: boolean;
  }

  const observe = async (arc: Arc): Promise<Observed> => {
    const router = arc.make();
    const bag = arc.bag();
    let received: NavigationOptions | undefined;
    let writeRefused = false;

    const plugin: PluginFactory = () => ({
      onTransitionSuccess: (_toState, _fromState, opts) => {
        received = opts;

        try {
          (opts as Record<string, unknown>).TAG = "MUTATED";
        } catch {
          writeRefused = true;
        }
      },
    });

    router.usePlugin(plugin);
    await router.start(arc.boot);

    // ⚠ CLEARED after boot, and without this the table measures the wrong
    // navigation. `start()` announces a success of its own, so `received` is
    // already a core-minted frozen record before the arc runs — and every field
    // below would then report the BOOT's object. Verified by neutralising an
    // arc's `run`: with the reset the table reds, without it all seven cells
    // stayed green.
    received = undefined;
    writeRefused = false;

    await arc.run(router, bag);

    const observed: Observed = {
      arc: arc.name,
      reachedTheHook: typeof received === "object" && received !== null,
      isCallersObject: received === bag,
      frozen: Object.isFrozen(received),
      writeRefused,
      callerBagUntouched: (bag as Record<string, unknown>).TAG === undefined,
    };

    router.dispose();

    return observed;
  };

  it("hands every arc a container that is NOT the caller's object", async () => {
    const rows = await Promise.all(ARCS.map((a) => observe(a)));

    // Guards the table itself, in both directions an empty measurement can hide
    // in: an ARCS list that shrank, and an arc that stopped announcing.
    expect(rows).toHaveLength(ARCS.length);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(
      rows.map((r) => `${r.arc}: ${String(r.reachedTheHook)}`),
    ).toStrictEqual(ARCS.map((a) => `${a.name}: true`));

    expect(
      rows.map((r) => `${r.arc}: ${String(r.isCallersObject)}`),
    ).toStrictEqual(ARCS.map((a) => `${a.name}: false`));
  });

  it("freezes it on every arc, so the annotation habit fails loudly", async () => {
    const rows = await Promise.all(ARCS.map((a) => observe(a)));

    expect(rows.map((r) => `${r.arc}: ${String(r.frozen)}`)).toStrictEqual(
      ARCS.map((a) => `${a.name}: true`),
    );
    expect(
      rows.map((r) => `${r.arc}: ${String(r.writeRefused)}`),
    ).toStrictEqual(ARCS.map((a) => `${a.name}: true`));
  });

  it("leaves the application's own literal untouched on every arc", async () => {
    const rows = await Promise.all(ARCS.map((a) => observe(a)));

    expect(
      rows.map((r) => `${r.arc}: ${String(r.callerBagUntouched)}`),
    ).toStrictEqual(ARCS.map((a) => `${a.name}: true`));
  });

  it("runs the six-shape container battery through the door", async () => {
    // ⚠ The battery existed and this door was not in it: `handed-out-containers-1957`
    // runs `CONTAINER_SHAPES` against the router-options and dependencies doors,
    // while the `NavigationOptions` section tested ONE shape (an own `__proto__`
    // from `JSON.parse`). A door that copies a caller's object belongs in the
    // battery, so here it is — with the two things the shapes decide between:
    //
    //   · `swaps`  — does merging what the hook received re-parent the target?
    //                Must be `false` for every shape; that is #1957's property.
    //   · `kept`   — did the caller's key survive the copy? This is where "own
    //                enumerable properties only" becomes visible: the inherited
    //                and non-enumerable shapes are NOT supported input and are
    //                dropped, while a pass-through Proxy and a null-prototype bag
    //                report own-enumerable keys normally and are carried.
    const rows: string[] = [];

    for (const [label, wrap] of CONTAINER_SHAPES) {
      const router = createRouter(ROUTES);
      let received: Record<string, unknown> | undefined;

      router.usePlugin(() => ({
        onTransitionSuccess: (_t, _f, opts) => {
          received = opts as Record<string, unknown>;
        },
      }));

      await router.start("/a");

      received = undefined;
      await router.navigate(
        "b",
        {},
        undefined,
        wrap({ kept: 1 }) as NavigationOptions,
      );

      const merged = Object.assign({}, received) as Record<string, unknown>;

      rows.push(
        `${label}: swaps=${String(
          Object.getPrototypeOf(merged) !== Object.prototype,
        )} kept=${String(
          (received as Record<string, unknown> | undefined)?.kept === 1,
        )}`,
      );

      router.dispose();
    }

    expect(rows).toStrictEqual([
      "own enumerable (control): swaps=false kept=true",
      "inherited through the prototype: swaps=false kept=false",
      "own non-enumerable: swaps=false kept=false",
      "pass-through Proxy (a reactive store): swaps=false kept=true",
      "null-prototype: swaps=false kept=true",
      "an own __proto__ key, as JSON.parse yields: swaps=false kept=true",
    ]);
    // The battery must not have quietly emptied.
    expect(rows).toHaveLength(6);
  });

  it("tolerates every NON-OBJECT container the battery lists", async () => {
    // ⚠ The other half of the battery, and it was cited before it was run.
    // `Object.keys(null)` THROWS, so this is a crash question rather than a style
    // one, and `hostileBags` states the requirement: bare core tolerates each of
    // these, so a door that crashes on one refuses input its siblings accept.
    //
    // Measured: none crashes. `undefined` and `null` never reach the door at all
    // — the facade substitutes the shared empty singleton for both — and the
    // remaining four produce their own enumerable keys, which for a primitive is
    // nothing at all except a string's indices.
    const rows: string[] = [];

    for (const [label, value] of NON_OBJECT_CONTAINERS) {
      const router = createRouter(ROUTES);
      let received: unknown;

      router.usePlugin(() => ({
        onTransitionSuccess: (_t, _f, opts) => {
          received = opts;
        },
      }));

      await router.start("/a");
      received = undefined;

      await router.navigate("b", {}, undefined, value as NavigationOptions);

      rows.push(`${label}: ${JSON.stringify(received)}`);

      router.dispose();
    }

    expect(rows).toStrictEqual([
      "undefined: {}",
      "null: {}",
      "an empty string: {}",
      "zero: {}",
      // ⚑ Not an exception to the rule but an instance of it: a string's indices
      // ARE its own enumerable keys. Before the door the plain arc handed the
      // hook the string itself; either way every real field reads `undefined`,
      // and passing a string here was never supported input. Pinned so the shape
      // is known rather than rediscovered.
      'a string: {"0":"n","1":"o","2":"p","3":"e"}',
      "a number: {}",
    ]);
    expect(rows).toHaveLength(6);
  });

  it("freezes the bag on the two SYSTEM_COMMIT arcs too", async () => {
    // ⚠ These do not pass the entry door — they are core's own commits, not
    // navigations, and they announce with a module constant. The authority suite
    // requires each announcement to hand out `payload.opts` or a `*_OPTS`
    // constant, which is a check on the NAME: an unfrozen `SNEAKY_OPTS` would
    // satisfy it. So the frozen half is asserted here, behaviourally, where
    // spelling cannot stand in for the property.
    //
    // Without this the contract "every hook receives a frozen bag" would hold on
    // six arcs by test and on two by coincidence.
    const notFound = createRouter([{ name: "a", path: "/a" }], {
      allowNotFound: true,
    });
    let fromNotFound: unknown;

    notFound.usePlugin(() => ({
      onTransitionSuccess: (_t, _f, opts) => {
        fromNotFound = opts;
      },
    }));

    await notFound.start("/a");
    fromNotFound = undefined;
    notFound.navigateToNotFound("/nope");

    expect(fromNotFound).toStrictEqual({ replace: true });
    expect(Object.isFrozen(fromNotFound)).toBe(true);

    notFound.dispose();

    const revalidated = createRouter(ROUTES);
    let fromRevalidate: unknown;

    revalidated.usePlugin(() => ({
      onTransitionSuccess: (_t, _f, opts) => {
        fromRevalidate = opts;
      },
    }));

    await revalidated.start("/a");
    fromRevalidate = undefined;
    getRoutesApi(revalidated).replace([
      { name: "a", path: "/a" },
      { name: "c", path: "/c" },
    ]);

    // `revalidate` is what tells a plugin this was NOT a real navigation, so the
    // shape is asserted rather than only the freeze — it is the one marker that
    // distinguishes this arc from a `replace: true` navigation.
    expect(fromRevalidate).toStrictEqual({ replace: true, revalidate: true });
    expect(Object.isFrozen(fromRevalidate)).toBe(true);

    revalidated.dispose();
  });

  it("keeps a key core does not declare — the owner decision of 2026-08-30", async () => {
    const router = createRouter(ROUTES);
    let received: NavigationOptions | undefined;

    router.usePlugin(() => ({
      onTransitionSuccess: (_t, _f, opts) => {
        received = opts;
      },
    }));

    await router.start("/a");
    await router.navigate("b", {}, undefined, {
      replace: true,
      hash: "section",
    } as NavigationOptions);

    expect((received as Record<string, unknown>).hash).toBe("section");
    // CONTROL — a key core DOES declare rides the same copy, so the cell above
    // is not measuring "everything is missing".
    expect(received?.replace).toBe(true);

    router.dispose();
  });

  it("a throwing getter on ANY key fails the navigation before it commits", async () => {
    // ⚠ A behaviour change, and the arc it replaces was worse than "silent".
    // Measured on `origin/master`, with `{ reload: true, get boom() { throw } }`:
    //
    //     no signal : RESOLVED                committed = b
    //     WITH sig  : REJECTED "CANCELLED"    committed = b   <- and announced
    //
    // The plain arc never read `boom`, so it succeeded. The signal arc read it
    // from `stripSignal`'s spread — inside the ANNOUNCEMENT, below the commit —
    // so the state moved, every plugin was told the navigation succeeded, and
    // the caller was handed `CANCELLED`: a rejection naming neither the real
    // cause nor the actual outcome. The `signal` decided which, again.
    //
    // The door reads the bag once, above the commit, so both arcs now fail with
    // the caller's OWN error and commit nothing.
    // ⚠ Built by `defineProperty` on BOTH arms rather than spread into the
    // second: a spread would read the throwing getter here, in the test, and
    // the cell would measure its own fixture instead of the door.
    const throwingBag = (signal?: AbortSignal): NavigationOptions => {
      const bag: Record<string, unknown> = { reload: true };

      if (signal !== undefined) {
        bag.signal = signal;
      }

      Object.defineProperty(bag, "boom", {
        enumerable: true,
        get() {
          throw new Error("from the bag");
        },
      });

      return bag;
    };

    for (const signal of [undefined, AbortSignal.timeout(5000)]) {
      const router = createRouter(ROUTES);

      await router.start("/a");

      await expect(
        router.navigate("b", {}, undefined, throwingBag(signal)),
      ).rejects.toThrow("from the bag");

      // Nothing committed — the router is still where it was.
      expect(router.getState()?.name).toBe("a");

      router.dispose();
    }
  });

  it("reuses ONE shared empty record when the caller passes no options", async () => {
    // ⚑ This pins the door's fast path, which is otherwise an EQUIVALENT mutant:
    // removing it reds nothing, because a fresh frozen `{}` and the shared frozen
    // `{}` are indistinguishable by value. They are distinguishable by IDENTITY,
    // and the reuse is the contract — the same one `EMPTY_PARAMS` / `EMPTY_SEARCH`
    // carry for `state.params` / `state.search` (#1027): a navigation that says
    // nothing allocates nothing.
    //
    // `navigate("b")` is the commonest call in the library, so this is also where
    // the door has to cost nothing; measured, it costs one comparison.
    const router = createRouter(ROUTES);
    const seen: unknown[] = [];

    router.usePlugin(() => ({
      onTransitionSuccess: (_t, _f, opts) => {
        seen.push(opts);
      },
    }));

    await router.start("/a");
    await router.navigate("b");
    await router.navigate("a");

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-1)).toBe(seen.at(-2));
    expect(Object.isFrozen(seen.at(-1))).toBe(true);

    // CONTROL — a navigation that DOES carry options gets its own record, so the
    // identity above pins reuse rather than "every hook gets one global object".
    await router.navigate("b", {}, undefined, { reload: true });

    expect(seen.at(-1)).not.toBe(seen.at(-2));

    router.dispose();
  });

  it("reads the caller's bag ONCE per key, keeping #1817's guarantee", async () => {
    // The entry copy must not re-read what it already read: an accessor-backed
    // bag is application code, and the count is what `opts-read-once-1817`
    // pins for the named flags. Here the same question is asked of a key core
    // never names, which only the copy can reach.
    const reads: Record<string, number> = { replace: 0, hash: 0 };
    const bag = {
      get replace() {
        reads.replace += 1;

        return true;
      },
      get hash() {
        reads.hash += 1;

        return "section";
      },
    };

    const router = createRouter(ROUTES);
    let received: NavigationOptions | undefined;

    router.usePlugin(() => ({
      onTransitionSuccess: (_t, _f, opts) => {
        received = opts;
      },
    }));

    await router.start("/a");
    await router.navigate("b", {}, undefined, bag as NavigationOptions);

    expect(reads).toStrictEqual({ replace: 1, hash: 1 });
    expect((received as Record<string, unknown>).hash).toBe("section");

    router.dispose();
  });
});
