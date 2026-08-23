import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

/**
 * `limits` reaches `EventEmitter` as data, not as the caller's object (#1875),
 * and a clone inherits the resolved limits rather than re-reading them (#1880).
 *
 * The population is the same one `urlParamsEncoding` has (#1839): `LimitsConfig`
 * declares every field `number`, so a `valueOf`-backed value or an accessor on
 * the bag needs a cast in TypeScript — and is ordinary in JavaScript, or in a
 * config assembled at runtime from computed properties or a class instance.
 */
const ROUTES = [{ name: "home", path: "/home" }];

const subscribeN = (
  router: ReturnType<typeof createRouter>,
  n: number,
): string => {
  const offs: (() => void)[] = [];

  try {
    for (let i = 0; i < n; i += 1) {
      offs.push(router.subscribe(() => {}));
    }

    return "ok";
  } catch (error) {
    return (error as Error).message;
  } finally {
    for (const off of offs) {
      off();
    }
  }
};

describe("limits are read once, at construction (#1875 / #1880)", () => {
  it("a valueOf-backed limit is coerced once, not once per registration", () => {
    let reads = 0;
    const maxListeners = {
      valueOf: () => {
        reads += 1;

        return 100;
      },
    };
    const router = createRouter(ROUTES, { limits: { maxListeners } } as never);
    const atConstruction = reads;

    // ⚑ "ONCE", not merely "zero per registration": without this a mutation that
    // coerces three times AT CONSTRUCTION passes every cell in the package.
    expect(atConstruction).toBe(1);

    expect(subscribeN(router, 10)).toBe("ok");
    expect(reads - atConstruction).toBe(0);

    expect(subscribeN(router, 10)).toBe("ok");
    expect(reads - atConstruction).toBe(0);

    router.dispose();
  });

  it("a DRIFTING limit cannot give a clone a different cap from its base (#1880)", () => {
    // ⚑ The getter sits on the BAG, which is the shape `createLimits`' spread
    // re-invokes. A `valueOf` on the VALUE is the other door and is covered
    // above; both must land on the same resolved number for base and clone.
    let reads = 0;
    const limits = Object.defineProperty({}, "maxListeners", {
      enumerable: true,
      configurable: true,
      get: () => {
        reads += 1;

        return reads === 1 ? 50 : 1;
      },
    }) as { maxListeners: number };

    const base = createRouter(ROUTES, { limits });
    const clone = cloneRouter(base);

    expect(reads).toBe(1);
    expect(subscribeN(base, 3)).toBe("ok");
    expect(subscribeN(clone, 3)).toBe("ok");

    clone.dispose();
    base.dispose();
  });

  it("a clone reports the base's KNOWN-LIMIT keys, not the resolved defaults", () => {
    // ⚑ The clone inherits RESOLVED limits, and the substitution must carry only
    // the keys the base actually passed. Substituting the whole resolved bag
    // materialises the four unset DEFAULTS into the clone's reported options —
    // and `warnListeners: 1000` beside a base's `maxListeners: 100` is a pair
    // `validation-plugin` rejects, so `cloneRouter` throws for a plain-number
    // config and `createRequestScope` fails on every request.
    const cases: [string, Record<string, number> | undefined][] = [
      ["partial", { maxListeners: 100 }],
      ["other field", { maxPlugins: 10 }],
      ["two fields", { maxListeners: 10, warnListeners: 5 }],
      ["none", undefined],
    ];
    let visited = 0;

    for (const [, limits] of cases) {
      const base = createRouter(
        ROUTES,
        (limits === undefined ? {} : { limits }) as never,
      );
      const clone = cloneRouter(base);
      const byName = (a: string, b: string): number => a.localeCompare(b);
      const baseKeys = Object.keys(
        getPluginApi(base).getOptions().limits ?? {},
      ).toSorted(byName);
      const cloneKeys = Object.keys(
        getPluginApi(clone).getOptions().limits ?? {},
      ).toSorted(byName);

      expect(cloneKeys).toStrictEqual(baseKeys);

      visited += 1;
      clone.dispose();
      base.dispose();
    }

    // ⚑ A LITERAL, not `cases.length`: comparing the counter against the array
    // it counts is self-referential — empty the array and both sides are 0, so
    // the cell passes having asserted nothing. Measured: it did.
    expect(visited).toBe(4);
  });

  it("the clone's key filter is hasOwn, not `in` — a JSON bag cannot smuggle a prototype member", () => {
    // ⚑ `key in sourceLimits` answers TRUE for `"__proto__"`, `"constructor"`,
    // `"toString"` and every other `Object.prototype` member, so it is not a
    // filter at all for the shape that matters. `JSON.parse` is the ordinary way
    // to get those as OWN keys on a caller's bag — and with `in`, each would
    // have been copied into the clone's reported options carrying
    // `Object.prototype` itself as its value.
    const bag = JSON.parse(
      '{"__proto__": {"polluted": true}, "constructor": 1, "maxListeners": 5}',
    ) as Record<string, unknown>;

    expect(Object.keys(bag)).toStrictEqual([
      "__proto__",
      "constructor",
      "maxListeners",
    ]);

    const base = createRouter(ROUTES, { limits: bag });
    const clone = cloneRouter(base);

    expect(
      Object.keys(getPluginApi(clone).getOptions().limits ?? {}),
    ).toStrictEqual(["maxListeners"]);
    // ⚑ NO `Object.prototype` pollution assertion here, deliberately. One was
    // written and removed: every write on this path is a shallow copy through
    // `Object.fromEntries` / spread, both of which use CreateDataProperty and
    // never reach the inherited setter — so the assertion could not be reddened
    // by ANY mutation of this code, including planting the `out[key] = …`
    // primitive the `limits.ts` comment describes. It was a green line guarding
    // nothing. The key-set assertion above is what discriminates.
    expect(subscribeN(clone, 6)).toContain("Listener limit (5) reached");

    clone.dispose();
    base.dispose();
  });

  it("a base that spells `limits` as null still clones — the substitution is skipped, not applied to null", () => {
    // ⚑ REGRESSION GUARD, and the defect was in the #1880 fix itself. The
    // substitution was gated on `!== undefined`, but `Object.keys(null)` throws
    // and `null` passes that gate. The base never noticed — `createLimits`'
    // default parameter only fires for `undefined`, and `{ ...D, ...null }` is a
    // no-op spread — so construction succeeded and only `cloneRouter` died,
    // which in an SSR deployment means once per request inside
    // `createRequestScope`. `limits: null` is exactly the population the rest of
    // this file exists for: it is how `JSON.parse` spells an unset limit.
    const base = createRouter(ROUTES, { limits: null } as never);

    expect(() => cloneRouter(base)).not.toThrow();

    const clone = cloneRouter(base);

    // Skipping the substitution is the ANSWER, not damage control: `...options`
    // still carries the `null`, and the clone resolves it to the same defaults
    // the base resolved it to. Both report the option as the caller spelled it.
    expect(getPluginApi(clone).getOptions().limits).toBeNull();
    expect(getPluginApi(base).getOptions().limits).toBeNull();
    // Neither is capped at some materialised default — the real check that the
    // two agree on BEHAVIOUR and not merely on the reported field.
    expect(subscribeN(base, 30)).toBe("ok");
    expect(subscribeN(clone, 30)).toBe("ok");

    clone.dispose();
    base.dispose();
  });

  it("an own key that is not a limit is dropped from the clone — the key sets agree only over Limits", () => {
    // ⚑ This cell exists because the claim it replaces was FALSE. The sibling
    // cell above feeds only known keys, so it cannot see that the `hasOwn`
    // filter tests membership in `Limits` and not merely own-ness: a base that
    // passed a key outside the five reports it, and the clone does not.
    //
    // The behaviour is right — a non-limit is not a limit on either router, and
    // carrying it across would hand `validation-plugin` a key it refuses — but
    // "the clone's key set matches the base's" is true only over `Limits`, and
    // that is what this pins so the wording cannot drift back.
    const base = createRouter(ROUTES, {
      limits: { maxListeners: 5, totallyUnknownKey: 7 },
    } as never);
    const clone = cloneRouter(base);

    expect(
      Object.keys(getPluginApi(base).getOptions().limits ?? {}).toSorted(
        (a, b) => a.localeCompare(b),
      ),
    ).toStrictEqual(["maxListeners", "totallyUnknownKey"]);
    expect(
      Object.keys(getPluginApi(clone).getOptions().limits ?? {}),
    ).toStrictEqual(["maxListeners"]);
    // The limit that IS a limit survives the trip with its value intact.
    expect(subscribeN(clone, 6)).toContain("Listener limit (5) reached");

    clone.dispose();
    base.dispose();
  });

  it("all FIVE limits are coerced, not just the one the issue names", () => {
    // ⚑ Four of the five were unpinned: a fix that coerced only `maxListeners`
    // passed the entire suite. Measured — that is why this cell exists.
    //
    // The other four are invisible from bare core (`maxDependencies`,
    // `maxPlugins` and `maxLifecycleHandlers` are read only behind
    // `validation-plugin`; `warnListeners` is compared with `===`, which runs no
    // `ToPrimitive`). The CLONE is the seam that exposes them: it inherits the
    // resolved values, so what it reports is what `createLimits` produced.
    const n = (v: number) => ({ valueOf: () => v });
    const base = createRouter(ROUTES, {
      limits: {
        maxDependencies: n(11),
        maxPlugins: n(12),
        maxListeners: n(13),
        warnListeners: n(9),
        maxLifecycleHandlers: n(14),
      },
    } as never);
    const clone = cloneRouter(base);
    const reported = getPluginApi(clone).getOptions().limits ?? {};

    expect(reported).toStrictEqual({
      maxDependencies: 11,
      maxPlugins: 12,
      maxListeners: 13,
      warnListeners: 9,
      maxLifecycleHandlers: 14,
    });

    // Not just numeric-looking — actually numbers, which is what the five
    // enforcement sites compare against.
    for (const value of Object.values(reported)) {
      expect(typeof value).toBe("number");
    }

    clone.dispose();
    base.dispose();
  });

  it("a non-number warnListeners warns — the rider behaviour change this PR advertises", () => {
    // ⚑ The changeset says a non-number `warnListeners` "never warned; it warns
    // now", and nothing pinned it. The mechanism is `size === warnListeners`:
    // strict equality runs no `ToPrimitive`, so before the coercion the
    // comparison could never be true and the warn was structurally dead.
    const warnings: string[] = [];
    const router = createRouter(ROUTES, {
      limits: { warnListeners: { valueOf: () => 2 } },
      logger: {
        callbackIgnoresLevel: true,
        callback: (_level: string, _context: string, message: string) => {
          warnings.push(message);
        },
      },
    } as never);

    // The comparison uses the PRE-ADD size, so `warnListeners: 2` fires on the
    // THIRD registration, not the second.
    router.subscribe(() => {});
    router.subscribe(() => {});
    router.subscribe(() => {});

    expect(
      warnings.filter((w) => w.includes("possible memory leak")),
    ).toHaveLength(1);
    // And it reports the RESOLVED count, not the caller's object.
    expect(warnings.find((w) => w.includes("possible memory leak"))).toContain(
      "has 2 listeners",
    );

    router.dispose();
  });

  it("a non-enumerable own limit is invisible to the base AND to the clone", () => {
    // ⚑ Pins INVARIANTS #8 against a simplification that passes every other
    // cell. Rewriting the clone filter as `Object.entries(sourceLimits).filter(
    // ([k]) => Object.hasOwn(options.limits, k))` is four lines shorter, needs
    // no cast, and is WRONG: `createLimits`' spread skips a non-enumerable own
    // key, so the base reports nothing for it — but the inverted filter walks
    // the RESOLVED bag, finds the materialised default, and ships it. Measured:
    // the clone reported `maxListeners: 10000` for a base that reported none.
    const bag = {};

    Object.defineProperty(bag, "maxListeners", {
      value: 2,
      enumerable: false,
      writable: false,
      configurable: false,
    });

    const base = createRouter(ROUTES, { limits: bag });
    const clone = cloneRouter(base);

    // The base does not see it — the spread skips non-enumerable own keys.
    expect(
      Object.keys(getPluginApi(base).getOptions().limits ?? {}),
    ).toStrictEqual([]);
    // And the clone must not invent it. The key set is the base's, whatever the
    // base's happens to be.
    expect(
      Object.keys(getPluginApi(clone).getOptions().limits ?? {}),
    ).toStrictEqual([]);
    // Neither is capped at the hidden 2, nor at a materialised default.
    expect(subscribeN(base, 30)).toBe("ok");
    expect(subscribeN(clone, 30)).toBe("ok");

    clone.dispose();
    base.dispose();
  });

  it("the resolved limits are FROZEN — a clone cannot be moved out from under its base", () => {
    // ⚑ `getCloneState().limits` hands out the resolved object BY REFERENCE, and
    // `cloneRouter` reads it. Before the freeze, a consumer holding that object
    // could move the cap the clone inherits while the base kept the one its
    // emitter was wired with: measured, base 50 / clone 2 from one router. That
    // is the base/clone divergence #1880 exists to prevent, reached through the
    // slot #1880 added.
    const base = createRouter(ROUTES, { limits: { maxListeners: 50 } });
    const handedOut = getInternals(base).getCloneState().limits as Record<
      string,
      number
    >;

    expect(Object.isFrozen(handedOut)).toBe(true);

    // Silent no-op in sloppy mode, TypeError in strict — either way the value
    // must not move. Asserting the VALUE is what survives both.
    try {
      handedOut.maxListeners = 2;
    } catch {
      /* strict mode */
    }

    expect(handedOut.maxListeners).toBe(50);

    const clone = cloneRouter(base);

    expect(subscribeN(clone, 60)).toContain("Listener limit (50) reached");

    clone.dispose();
    base.dispose();
  });

  it("CONTROL — an ordinary numeric limit still caps, and still reports itself", () => {
    const router = createRouter(ROUTES, { limits: { maxListeners: 2 } });

    expect(subscribeN(router, 3)).toContain("Listener limit (2) reached");
    expect(getPluginApi(router).getOptions().limits?.maxListeners).toBe(2);

    router.dispose();
  });
});
