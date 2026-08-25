import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { searchParamsStrategyLists } from "./strategy-lists.js";
import { countingBag } from "../../helpers/hostileBags";

import type { SearchParams } from "@real-router/core/types";

/**
 * An invalid `queryParams` format must fail with its NAMED error in BOTH
 * directions — and a prototype member's name is an invalid format like any other
 * (#1796).
 *
 * `requireStrategy` (`engine/search-params/strategies/index.ts`) tested for a
 * missing strategy with `strategy === undefined`, after the caller had already
 * indexed a plain object literal. For the twelve inherited names that lookup
 * returns a MEMBER instead of `undefined`, so the guard passed and that member
 * was installed as the live strategy — the exact deferred `TypeError` #1318 added
 * this guard to prevent, now reached through the one value class its predicate
 * cannot see. (Eleven of the twelve are functions; `__proto__` yields
 * `Object.prototype` itself, which fails the same way one step later, since that
 * object carries no `encode` / `encodeArray`.)
 *
 * Measured before the fix, one probe per cell, each format exercised with a value
 * of its OWN type:
 *
 *     BUILD   array / boolean / null  → TypeError: opts.strategies.X.Y is not a function
 *             number                  → BUILT "/x?a=7" — accepted, and its own
 *                                       matchPath then failed to reproduce it
 *     PARSE   array / null            → resolved, silently CORRECT
 *             boolean / number        → @@router/UNKNOWN_ROUTE, no diagnostic
 *             a plain typo            → @@router/UNKNOWN_ROUTE, no diagnostic
 *
 * That last row is #1318's own reported symptom — *"Every URL with a query
 * resolves to UNKNOWN_ROUTE; the symptom points at routes/URLs, not the config"*
 * — surviving its fix, because the named `TypeError` only ever reached the BUILD
 * direction: on the match path the `#737` catch-all in `SegmentMatcher` swallowed
 * it. So the fix has two halves, and the table below is what proves they are both
 * present: the containers can no longer answer with an inherited member, and a
 * config error is no longer mistaken for malformed input.
 *
 * ⚠ Each format needs a value of its own TYPE. A probe that supplies only an
 * array cannot see three of the four holes — the boolean / null / number
 * strategies are never invoked, and the misconfiguration reads as silent. That is
 * why every cell here carries its own URL and its own build value.
 */
describe("an invalid queryParams format fails with its named error (#1796)", () => {
  interface FormatCase {
    readonly field: string;
    readonly valid: string;
    /** A URL whose value actually exercises this format's strategy. */
    readonly url: string;
    readonly buildValue: unknown;
    readonly parsed: unknown;
  }

  const FORMATS: readonly FormatCase[] = [
    {
      field: "arrayFormat",
      valid: "none",
      url: "/x?a=1&a=2",
      buildValue: ["1", "2"],
      parsed: [1, 2],
    },
    {
      field: "booleanFormat",
      valid: "auto",
      url: "/x?a=true",
      buildValue: true,
      parsed: true,
    },
    {
      field: "nullFormat",
      valid: "default",
      url: "/x?a",
      buildValue: null,
      parsed: null,
    },
    {
      field: "numberFormat",
      valid: "auto",
      url: "/x?a=7",
      buildValue: 7,
      parsed: 7,
    },
  ];

  /**
   * `bogusTypo` is the CONTROL of the invalid column: it is the value class
   * #1318 already covered, so it must keep answering exactly as the prototype
   * names do. If a fix made only the prototype names named, this cell would not
   * notice — which is why it sits in the same list rather than in a cell of its
   * own.
   */
  const INVALID = [
    "bogusTypo",
    "toString",
    "constructor",
    "valueOf",
    "__proto__",
  ];

  /** Bag shapes the snapshot must honour. Counted by the CONTROL cell below. */
  const BAG_SHAPES: readonly (readonly [string, () => object])[] = [
    [
      "own enumerable (the ordinary form)",
      (): object => ({ arrayFormat: "brackets" }),
    ],
    // ⚑ Both of these were DROPPED by a `{ ...queryParams }` snapshot, which copies
    // own enumerable keys only — the router fell back to the default format with
    // nothing said, while `getOptions()` still echoed what the caller set. A plain
    // `opts.arrayFormat` walks the prototype chain, so layering one config over
    // another worked before the snapshot existed; the snapshot reads by NAME to
    // keep that. Pinned as behaviour because the type-mirror table binds the key
    // LIST, not the lookup that reads it.
    [
      "inherited through the prototype",
      (): object => Object.create({ arrayFormat: "brackets" }) as object,
    ],
    [
      "own but non-enumerable",
      (): object =>
        Object.defineProperty({}, "arrayFormat", {
          value: "brackets",
          enumerable: false,
        }),
    ],
  ];

  /** Non-object containers bare core must tolerate. Counted by the CONTROL cell below. */
  const CONTAINERS: readonly (readonly [string, unknown])[] = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "nope"],
    ["a number", 7],
  ];

  const routerWith = (
    field: string,
    value: string,
  ): ReturnType<typeof createRouter> =>
    createRouter(
      [
        { name: "x", path: "/x?a" },
        { name: "home", path: "/home" },
      ],
      { queryParams: { [field]: value } },
    );

  /**
   * Reports WHAT happened rather than a boolean, so a cell that silently
   * succeeds names the value it produced instead of failing as a bare `false`.
   */
  const outcomeOf = async (
    field: string,
    attempt: () => Promise<string> | string,
  ): Promise<string> => {
    try {
      return `accepted: ${await attempt()}`;
    } catch (error) {
      return (error as Error).message.includes(
        `[router.constructor] Invalid "queryParams.${field}"`,
      )
        ? "named"
        : `wrong error: ${(error as Error).message}`;
    }
  };

  describe.each(FORMATS)("$field", (format) => {
    it.each(INVALID)(
      "%s is refused BY NAME at construction, before either direction runs",
      (value) => {
        // ⚑ The refusal moved, and moving it is the fix's second half.
        //
        // `resolveStrategies` used to run per parse and per build, so the named
        // TypeError arrived from INSIDE `matchPath` — the parse path, where the
        // `#737` catch swallowed it into `UNKNOWN_ROUTE` (#1318's own reported
        // symptom, surviving its fix) and where the URL plugins call from
        // popstate and `navigate`-event handlers that have nobody to catch for
        // them. `createMatcher` now resolves once, at construction.
        //
        // Three things follow, and each is asserted somewhere in this file:
        // the error names the field; no direction can raise it any more; and the
        // refusal is UNCONDITIONAL — it no longer waits for a URL that happens
        // to carry a query key.
        expect(() => routerWith(format.field, value)).toThrow(
          `[router.constructor] Invalid "queryParams.${format.field}": "${value}"`,
        );
      },
    );

    it("the refusal does not wait for a query key to appear", () => {
      // ⚑ QUERY-LESS ROUTES, and that is the whole cell. The `it.each` twin
      // above already builds a router with `"bogusTypo"` and expects this exact
      // message — but its table DECLARES a query parameter (`/x?a`), so a
      // refusal that waited for a query key to EXIST would still be reached by
      // it, and this cell would co-fail with its twin under every mutation while
      // exercising nothing its name describes. Measured: gating the resolution
      // on "some route declares a query parameter" — in `rebuildTree`, where the
      // tree and the matcher options meet — left all 55 cells of this file green,
      // the twin included. With the table below, that mutant reds here, and only
      // here.
      //
      // Both directions short-circuit on an empty query before resolving, so a
      // router with a bogus format used to run cleanly until the first URL that
      // carried one: `buildPath("x", {}, {})` and `start("/x")` were both silent.
      // Below there is no query anywhere — not in the route table, not in a URL —
      // and NEITHER DIRECTION IS CALLED: the refusal arrives from `createRouter`
      // itself, which is the unconditional half of the hoist.
      const queryless = [
        { name: "x", path: "/x" },
        { name: "home", path: "/home" },
      ];

      expect(() =>
        createRouter(queryless, {
          queryParams: { [format.field]: "bogusTypo" },
        }),
      ).toThrow(
        `[router.constructor] Invalid "queryParams.${format.field}": "bogusTypo"`,
      );

      // CONTROL — the query-less channel is REACHED, so the cell pins "refused
      // with no query key anywhere" and not "this route table never works". With
      // a valid format the same table builds and matches on an empty query bag,
      // which is exactly the workflow that used to run cleanly under a bogus one.
      const router = createRouter(queryless, {
        queryParams: { [format.field]: format.valid },
      });

      try {
        expect({
          build: router.buildPath("x", {}, {}),
          match: getPluginApi(router).matchPath("/x")?.name,
        }).toStrictEqual({ build: "/x", match: "x" });
      } finally {
        router.dispose();
      }
    });

    it("a VALID format raises nothing from either direction", async () => {
      // The counterpart of the cell above: with the refusal hoisted, neither
      // `buildPath` nor `matchPath` can raise a CONFIG error at all — which is
      // what removes it from every unguarded `matchPath` call site downstream.
      const router = routerWith(format.field, format.valid);

      await expect(
        outcomeOf(format.field, () =>
          router.buildPath("x", {}, { a: format.buildValue } as SearchParams),
        ),
      ).resolves.toMatch(/^accepted: /u);

      await expect(
        outcomeOf(format.field, async () => {
          await router.start(format.url);

          return String(router.getState()?.name);
        }),
      ).resolves.toBe("accepted: x");

      router.dispose();
    });

    it("VALID — the format still round-trips through its own URL", async () => {
      // The column that stops the table degenerating into "everything throws".
      const router = routerWith(format.field, format.valid);
      const href = router.buildPath("x", {}, {
        a: format.buildValue,
      } as SearchParams);

      await router.start(href);

      expect({
        name: router.getState()?.name,
        a: router.getState()?.search.a,
      }).toStrictEqual({ name: "x", a: format.parsed });

      router.dispose();
    });
  });

  it("CONTROL — the message names the remedy, and the remedy is DERIVED", () => {
    // ⚑ The half of the message nothing used to check. `outcomeOf` asserts only
    // the `Unknown <field>` prefix, so the `— expected …` tail — the part that
    // tells a developer what to write instead — was free to be wrong. Measured on
    // the hand-written form: deleting the tail entirely left the whole suite green,
    // and handing `booleanFormat` the `nullFormat` list left them green too. A
    // remedy that points at another option's union is worse than no remedy.
    //
    // The tail is now DERIVED from the very table the lookup failed against, so it
    // cannot name a value the table does not carry — the same shape as #1811's
    // `urlParamsEncoding` message. This cell pins that it is present, per-field,
    // and complete.
    for (const field of Object.keys(searchParamsStrategyLists)) {
      const expected = searchParamsStrategyLists[field];
      let message = "";

      try {
        createRouter([{ name: "x", path: "/x?a" }], {
          queryParams: { [field]: "bogusTypo" },
        });
      } catch (error) {
        message = (error as Error).message;
      }

      // ⚠ The TAIL, exactly — not `toContain` per value. A subset assertion lets
      // the hand list SHRINK and the table GROW without a word, and says nothing
      // about order or separator. Slicing from the marker scopes it away from the
      // `"bogusTypo"` the message already contains, which a per-value `toContain`
      // would happily match against.
      const tail = message.slice(message.indexOf("— expected "));
      const quoted = expected.map((value) => `"${value}"`).join(" | ");

      expect(tail).toBe(`— expected ${quoted}`);
    }
  });

  it("an accessor-backed queryParams is read ONCE, so teardown runs no application code", async () => {
    // Hoisting resolution into `createMatcher` put a read of the caller's
    // `queryParams` on every MATCHER REBUILD — `add` / `remove` / `replace` /
    // `setRootPath`, and `resetStore`, which `dispose()` goes through. That
    // object is supported input and may be accessor-backed, so a getter answering
    // differently on the rebuild threw out of `dispose()` AFTER `sendDispose()`:
    // `isDisposed()` was already true, the idempotency early-return swallowed
    // every retry, and everything below the throw never ran — `markDisposed`, the
    // lifecycle teardown, the dependency reset. What such a router still ANSWERS
    // is `buildPath` / `canNavigateTo` / `has` (measured); `navigate` refuses, but
    // with the wrong reason. Core documents that teardown as holding together
    // "only because no user code runs in them".
    //
    // `deriveMatcherOptions` now SNAPSHOTS the bag, so the getter runs during
    // construction and never again. Counted rather than asserted on the outcome,
    // because the outcome (a clean dispose) is what a still-broken build produces
    // whenever the getter happens to answer consistently.
    let reads = 0;
    const queryParams = {
      get arrayFormat(): string {
        reads += 1;

        return reads > 3 ? "NOPE" : "brackets";
      },
    };

    const router = createRouter(
      [
        { name: "x", path: "/x?a" },
        { name: "home", path: "/home" },
      ],
      { queryParams } as never,
    );

    const afterConstruction = reads;

    getRoutesApi(router).add({ name: "y", path: "/y" });
    await router.start("/home");

    expect(() => {
      router.dispose();
    }).not.toThrow();

    expect({
      readsDuringConstruction: afterConstruction > 0,
      readsAfterConstruction: reads - afterConstruction,
      // the whole teardown ran: a disposed router refuses, it does not answer
      disposed: (() => {
        try {
          getRoutesApi(router).add({ name: "z", path: "/z" });

          return false;
        } catch {
          return true;
        }
      })(),
    }).toStrictEqual({
      readsDuringConstruction: true,
      readsAfterConstruction: 0,
      disposed: true,
    });
  });

  it.each(BAG_SHAPES)(
    "a queryParams format is honoured when it is %s",
    (_label, make) => {
      const router = createRouter(
        [
          { name: "s", path: "/s?tags" },
          { name: "home", path: "/home" },
        ],
        { queryParams: make() },
      );

      try {
        expect(router.buildPath("s", {}, { tags: ["a", "b"] })).toBe(
          "/s?tags[]=a&tags[]=b",
        );
      } finally {
        router.dispose();
      }
    },
  );

  it("CONTROL — the cell above discriminates: no queryParams prints the default form", () => {
    // Without this, all three cells above pass against a router that ignores
    // `queryParams` entirely — `brackets` and the default would be one string.
    const router = createRouter([
      { name: "s", path: "/s?tags" },
      { name: "home", path: "/home" },
    ]);

    try {
      expect(router.buildPath("s", {}, { tags: ["a", "b"] })).toBe(
        "/s?tags=a&tags=b",
      );
    } finally {
      router.dispose();
    }
  });

  it.each(CONTAINERS)(
    "a %s queryParams container is tolerated, not a constructor crash",
    (_label, queryParams) => {
      // `deriveMatcherOptions` asserted this away with a `!` that was FALSE:
      // `createRouter(routes, { queryParams: undefined })` reaches it with nothing.
      // A spread turned that into `{}`; reading a field off it is a `TypeError`
      // thrown from inside the constructor, naming nothing the caller wrote.
      // Rejecting these BY NAME belongs to `@real-router/validation-plugin`, as it
      // does for the three enum options — bare core degrades.
      expect(() => {
        createRouter(
          [
            { name: "s", path: "/s?tags" },
            { name: "home", path: "/home" },
          ],
          { queryParams } as never,
        ).dispose();
      }).not.toThrow();
    },
  );

  it("the snapshot reads each format field exactly ONCE", () => {
    // ⚑ Counted, because the OUTCOME cannot tell one read from two: a getter that
    // answers consistently produces the same router either way, which is how the
    // first version of this snapshot shipped reading every field TWICE. The
    // conditional spread it used —
    // `...(qp.x !== undefined && { x: qp.x })` — evaluates `qp.x` in the test and
    // again in the value, i.e. it MOVED the `makeOptions` TOCTOU here instead of
    // collapsing it, and the router ran on the second value while the test that
    // admitted it saw the first.
    //
    // ⚠ The threshold is 1 read BY THE SNAPSHOT, and — since the deep-freeze
    // started walking DESCRIPTORS rather than values — 1 in the process too.
    // `read-count-authority` pins the TOTAL; what belongs here is the SPLIT,
    // because a total of one is also what a snapshot reading twice and a freeze
    // reading minus-one would print, which is to say a total alone says nothing
    // about WHO read.
    //
    // ⚠ The split is made BY SHAPE, not by the NAME of the frame that read.
    // `OptionsNamespace`'s deep-freeze walks own ENUMERABLE keys only, and takes
    // each value off its DESCRIPTOR, while the snapshot reads the four names BY
    // NAME, which walks the prototype chain and sees a non-enumerable slot too.
    // So one counting bag, placed three ways, attributes every read: own
    // enumerable is read by BOTH (2); inherited and own-non-enumerable are
    // invisible to a value walk, so they could only ever be the snapshot's; and a
    // DECOY key that is no format name at all MEASURES the freeze's share rather
    // than assuming it. That share is now ZERO — sealing a slot needs no value,
    // so the freeze reads descriptors and never invokes an accessor — which is
    // why all three shapes agree at 1 and the decoy never appears. Restore the
    // value walk and the decoy comes back at 1 while `ownEnumerable` goes to 2:
    // the cell states the freeze's behaviour as a number, not as prose.
    //
    // ⚠ The count runs through `dispose()`, which rebuilds the matcher
    // (`resetStore` → `rebuildTreeInPlace` → `createMatcher`). Every rebuild must
    // resolve from plain data, so a read after construction lands in these
    // numbers rather than passing unnoticed.
    //
    // ⚠ An earlier revision attributed each read by searching the V8 stack for
    // the string `"snapshotQueryParams"`. Measured, that pinned the function's
    // NAME and not its read count: a behaviour-preserving rename reds it and the
    // `type-mirror-authority` anchor and NOTHING else in the suite, and
    // `Error.stackTraceLimit = 1` — an ambient global the cell never pinned, which
    // any other file, tool or node flag may set — reds it with the router
    // untouched. `countingBag` is the instrument the repo already had for this
    // question, and it has neither coupling.
    const observe = (
      place: (bag: object) => object,
    ): Record<string, number> => {
      const counted = countingBag({ arrayFormat: "brackets", decoy: "unread" });

      const router = createRouter(
        [
          { name: "s", path: "/s?tags" },
          { name: "home", path: "/home" },
        ],
        { queryParams: place(counted.bag) },
      );

      router.dispose();

      return { ...counted.reads };
    };

    // Copies the ACCESSORS, not their values — a wrapper that read the keys to
    // re-write them would count itself. (`CONTAINER_SHAPES`' own-non-enumerable
    // shape does exactly that, which is why it cannot be used here.)
    const asNonEnumerable = (bag: object): object => {
      const out = {};

      for (const key of Object.keys(bag)) {
        Object.defineProperty(out, key, {
          ...Object.getOwnPropertyDescriptor(bag, key),
          enumerable: false,
        });
      }

      return out;
    };

    expect({
      ownEnumerable: observe((bag) => bag),
      inherited: observe((bag) => Object.create(bag) as object),
      nonEnumerable: observe(asNonEnumerable),
    }).toStrictEqual({
      ownEnumerable: { arrayFormat: 1 },
      inherited: { arrayFormat: 1 },
      nonEnumerable: { arrayFormat: 1 },
    });
  });

  it("BOUNDARY — getOptions() still hands back the caller's OBJECT, not the snapshot", () => {
    // A divergence the snapshot INTRODUCES, pinned rather than papered over — the
    // twin of the `urlParamsEncoding` echo in url-params-encoding-1811.test.ts.
    // `getOptions()` reports the router's raw options while the matcher runs on a
    // copy taken at construction, so for an accessor-backed bag a plugin reading
    // `getOptions().queryParams.arrayFormat` can see a value the matcher is not
    // using. That is strictly better than the alternative it replaced (the matcher
    // re-reading the getter mid-teardown).
    //
    // ⚠ An earlier revision added "and the only configs that can reach the
    // disagreement are ones a getter deliberately varies". That is false, and
    // measurably so: `OptionsNamespace`'s deep-freeze recurses only when
    // `value.constructor === Object`, so an `Object.create(null)` bag or a class
    // instance is never frozen — a plain WRITE to one reaches the divergence
    // with no accessor anywhere. What the snapshot changes is which side wins:
    // before, the late write took effect on the matcher; now the matcher keeps
    // the construction-time value and only `getOptions()` echoes the write.
    //
    // ⚑ Pinned because the tempting "fix" is to hand back the snapshot from
    // `getOptions()` too, which would put the same copy in two places — the second
    // source of truth this class of bug is made of.
    const bag = { arrayFormat: "brackets" };
    const router = createRouter(
      [
        { name: "s", path: "/s?tags" },
        { name: "home", path: "/home" },
      ],
      { queryParams: bag } as never,
    );

    try {
      expect(getPluginApi(router).getOptions().queryParams).toBe(bag);
    } finally {
      router.dispose();
    }
  });

  it("CONTROL — malformed percent-encoding still UNMATCHES rather than throwing", async () => {
    // The #737 hardening the narrowed catch must not retire, and the reason the
    // catch cannot simply be deleted. `match()` must never throw on INPUT: an
    // invalid UTF-8 percent sequence makes the query parser raise a `URIError`,
    // and the router must resolve to UNKNOWN_ROUTE instead of crashing `start()`.
    // Only a CONFIG error — a `TypeError` naming a `queryParams` field — is
    // allowed through.
    const router = createRouter(
      [
        { name: "x", path: "/x?a" },
        { name: "home", path: "/home" },
      ],
      { allowNotFound: true },
    );

    await expect(router.start("/x?a=%E0%41")).resolves.toBeDefined();

    expect(router.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");

    router.dispose();
  });

  it("the guard indexes by the KEY it tested, so a drifting format cannot be admitted as one strategy and used as another", () => {
    // ⚑ The twin of the encoder door's cell in `url-params-encoding-1811`, and
    // the reason both exist: owning the LOOKUP (this file's whole subject) is
    // only half of owning the decision. `Object.hasOwn(table, value)` and the
    // `table[value]` below it each run `ToPropertyKey`, so passing the caller's
    // VALUE through both reads a caller-owned object twice — and `queryParams`
    // is caller-owned, so the two reads may answer differently.
    //
    // Measured before the key was hoisted: a `{ toString }` answering "none"
    // to the guard and "toString" to the lookup installed `Object.prototype`'s
    // method as the live strategy and deferred
    // `opts.strategies.array.encodeArray is not a function` — verbatim the
    // failure this guard was written to prevent, reached one layer out from
    // the blind spot it closed.
    const drifting = (first: string, then: string): string => {
      let reads = 0;

      return {
        toString: () => (++reads === 1 ? first : then),
      } as unknown as string;
    };

    // ⚑ Refused at CONSTRUCTION since the strategies are resolved there, so the
    // drift is caught before any URL exists. That is a stronger statement than
    // the one this cell was written for — it used to build a path and check the
    // href — and it is the same property: the value admitted by the guard is the
    // value used by the lookup, so a `toString` that changes its answer cannot
    // slip a second reading past the first.
    const build = (value: string): string => {
      const router = routerWith("arrayFormat", value);

      try {
        return router.buildPath("x", {}, { a: ["1", "2"] });
      } finally {
        router.dispose();
      }
    };

    const outcome = (value: string): string => {
      try {
        return build(value);
      } catch (error) {
        return `THREW ${(error as Error).message.slice(0, 34)}`;
      }
    };

    expect({
      // Admitted as "none" — must BE "none" (repeated key), not the member the
      // second read answers.
      admittedValid: outcome(drifting("none", "toString")),
      admittedValidThenTypo: outcome(drifting("none", "bogusTypo")),
      // CONTROL — a stable valid value is untouched, so the cell pins the drift
      // and not "an object value is refused".
      stableValid: outcome("none"),
    }).toStrictEqual({
      admittedValid: "/x?a=1&a=2",
      admittedValidThenTypo: "/x?a=1&a=2",
      stableValid: "/x?a=1&a=2",
    });
  });

  it("the #737 catch SWALLOWS a third error class, and rethrows only ours", () => {
    // ⚑ Without this cell the narrowing is pinned by exactly two classes — a
    // `URIError` must unmatch, a `TypeError` must propagate — and ANY predicate
    // separating those two passes, INCLUDING its own complement. Measured:
    // `error instanceof URIError` swapped for `!(error instanceof TypeError)`
    // left the whole suite green. Two points do not determine a line.
    //
    // ⚠ The third class is REACHABLE, which corrects the changeset's safety
    // argument. `assignParam` writes `params[name] = value` for every key except
    // `__proto__`, and the key is chosen by the URL — so on a polluted
    // `Object.prototype` the write dispatches into an application setter, inside
    // the very `try` this narrowing guards. That thrower is neither
    // `decodeURIComponent` nor `requireStrategy`.
    //
    // ⚠ An earlier revision of this cell pinned the OPPOSITE — that the third
    // class propagates, on the reasoning that "an application fault must not be
    // reported as no such route". Reversed, on a measurement that revision did
    // not have: the rethrow is selected by INPUT, and no caller of `matchPath`
    // catches. `browser-plugin/factory.ts:157`, `hash-plugin/plugin.ts:100`,
    // four sites in `navigation-plugin`, `ssr-utils/getStaticPaths`, and
    // `preload-plugin/plugin.ts:299` — the last from a `mouseover` listener on
    // `document`, where one hover raised an uncaught `error` on `window`. Per
    // #1819's own note an un-intercepted navigate event makes Chromium perform a
    // full-document reload. "`match()` never throws on input" outranks
    // "attribute the fault", because the caller that would attribute it is a
    // popstate handler.
    //
    // So the catch is fail-SAFE again — but not fail-open-again: what #1796
    // refused to swallow still escapes, by ORIGIN rather than by class. The
    // config fault carries a marker (`CONFIG_FAULT`, set where it is raised),
    // and the CONTROL below is what keeps this cell from collapsing back into
    // "the catch swallows everything".
    //
    // ⚠ Cost of the alternative, measured and rejected: making `assignParam`
    // define UNCONDITIONALLY removes the dispatch at the source, but it costs
    // **+25 % on `matchPath`** (1400 → 1750 ns at three query keys), on the path
    // every popstate and every `start()` takes.
    //
    // ⚑ That rejection stands; what changed is that a THIRD answer existed
    // (#1852). `putField` asks the chain first and defines only where it
    // answers, so the dispatch is gone at this site for a fraction of the price
    // that was rejected — the figures are in `putField`'s docblock and are not
    // repeated here. So the key-from-the-URL vehicle this cell used to run on is
    // no longer a thrower at all.
    //
    // ⚠ The cell therefore changes VEHICLE, not subject: it still asserts that
    // the `#737` catch swallows an application error it does not recognise. The
    // new vehicle is `Array.prototype.push` inside the repeated-key
    // accumulation — a numeric-index `[[Set]]` whose chain also ends at
    // `Object.prototype`.
    //
    // ⚠ An earlier revision added `arrayFormat: "brackets"` and said the site
    // was "reached only through the BRACKETED array form, because two scalar
    // repetitions are collected with an array LITERAL". The first clause is
    // FALSE — measured, 38 plain `a=0&a=1&…` repetitions reach it too, because
    // only the FIRST collision builds the literal and every later one pushes.
    // The option is gone; two repetitions would indeed not be enough, which is
    // what the length below is for.
    //
    // ⚑ And that site is deliberately NOT closed, which is what keeps this cell
    // alive rather than making it a museum piece. Its precondition is a NUMERIC
    // accessor on `Object.prototype` — an ATTACK shape rather than a library
    // extension: nobody writes `Object.prototype["0"] = …` by accident, whereas
    // `Object.prototype.id` is what an ordinary polyfill or helper library does.
    //
    // ⚠ An earlier revision justified it differently — "in that environment
    // Node's own `console.log` throws first, so the runtime is broken past
    // anything the router can compensate for" — and that is FALSE, measured:
    // `console.log` survives a getter-only property on both `"0"` and `"1"`.
    // What is true is narrower and has to be stated as a LIMIT rather than as a
    // reassurance: `Array.prototype.push` writes an index the target does not
    // own, so it always consults the chain, and core has ~100 such calls. Two of
    // them are reachable from a public door — `createRouter` throws under a
    // getter on `"0"`, and this parser silently substitutes the raw chunk under
    // a getter+setter on the array's next index. Closing that half would mean
    // replacing every `push`, and it is not closed.
    // ⚠ The index is 37, and that is a fixture constraint rather than a style
    // choice: planted on a LOW index the same accessor breaks the test runner
    // itself before a single cell runs (Vitest formats through array writes),
    // which is the same observation as "Node's `console.log` throws first" —
    // demonstrated, not assumed. A rare index is reached by the router's own
    // accumulation and by nothing else in the process.
    const HAZARD_INDEX = "37";
    const REPEATED = Array.from(
      { length: 38 },
      (_, index) => `a=${String(index)}`,
    ).join("&");

    const boom = new RangeError("the application's own setter failed");
    let fired = false;

    const router = createRouter([{ name: "x", path: "/x?a" }]);

    try {
      // ⚑ Planted INSIDE the `try`, so the `finally` below always removes it.
      // Outside it, anything that threw between the plant and the `try` would
      // leave a numeric accessor on `Object.prototype` for the rest of the
      // worker — and there every `push` past index 37 throws, which takes down
      // unrelated files rather than failing this cell.
      Object.defineProperty(Object.prototype, HAZARD_INDEX, {
        get: () => undefined,
        set() {
          fired = true;

          throw boom;
        },
        configurable: true,
      });

      // Swallowed: the URL does not match, and nothing escapes into the caller.
      expect(getPluginApi(router).matchPath(`/x?${REPEATED}`)).toBeUndefined();

      // …and the setter really did run, so this is a swallow and not a case of
      // the write never happening. Without it the cell would pass on a build
      // where the accumulation had stopped accumulating.
      expect(fired, "the application setter was reached").toBe(true);

      // CONTROL — the class the catch EXISTS for is still swallowed, so the cell
      // pins a narrowing rather than the absence of a catch.
      expect(getPluginApi(router).matchPath("/x?a=%E0%41")).toBeUndefined();

      // CONTROL — and the config fault still ESCAPES, which is what stops this
      // cell from being satisfied by a catch that swallows everything. Two
      // swallows and one rethrow determine the predicate; two swallows alone do
      // not.
      // ⚑ At CONSTRUCTION, since the strategies resolve there — the hoist's
      // point, and it makes this control stronger than it was: the fault cannot
      // reach `matchPath` at all, so the parse could not report a config error
      // as `UNKNOWN_ROUTE` even with the marker arm removed. The arm still
      // guards the engine-layer seam, pinned directly in
      // `tests/engine/unit/path-matcher/SegmentMatcher.test.ts`.
      expect(() =>
        createRouter([{ name: "x", path: "/x?a" }], {
          queryParams: { arrayFormat: "bogusTypo" as never },
        }),
      ).toThrow(/Invalid "queryParams\.arrayFormat"/);
    } finally {
      Reflect.deleteProperty(Object.prototype, HAZARD_INDEX);
      router.dispose();
    }
  });

  it("a format whose coercion THROWS is reported as a fault about ITS OWN field", () => {
    // The snapshot moved `String(value)` — i.e. the CALLER's `toString` — into
    // `createRouter`. Uncaught, an application's own exception then leaves the
    // constructor naming no option at all, which is strictly less useful than
    // the named refusal beside it and is the shape `options.test.ts` pins the
    // opposite of for the sibling `defaultRoute` slot.
    const bomb = {
      toString() {
        throw new Error("app toString bomb");
      },
    };

    let caught: unknown;

    try {
      createRouter([{ name: "s", path: "/s?tags" }], {
        queryParams: { booleanFormat: bomb },
      } as never);
    } catch (error) {
      caught = error;
    }

    expect({
      type: (caught as Error | undefined)?.constructor.name,
      message: (caught as Error | undefined)?.message,
      // The app's own error is not REPLACED, it rides along — losing it would
      // trade one unhelpful diagnostic for another.
      cause: ((caught as Error | undefined)?.cause as Error | undefined)
        ?.message,
    }).toStrictEqual({
      type: "TypeError",
      message:
        '[router.constructor] Invalid "queryParams.booleanFormat": its value cannot be converted to a string.',
      cause: "app toString bomb",
    });

    // ⚑ The THIRD shape, and the one where the reading itself is the caller's
    // code: an ACCESSOR slot. The read used to sit at the call site, one frame
    // outside the guard, so this escaped `createRouter` raw — no option named,
    // no `cause` — while the guard's own comment claimed a value it cannot read
    // is reported as a fault about its field. An accessor-backed config is the
    // ordinary lazy spelling, not an exotic one.
    let getterCaught: unknown;

    try {
      createRouter([{ name: "s", path: "/s?tags" }], {
        queryParams: {
          get nullFormat(): string {
            throw new Error("lazy config boom");
          },
        },
      } as never);
    } catch (error) {
      getterCaught = error;
    }

    expect({
      message: (getterCaught as Error | undefined)?.message,
      cause: ((getterCaught as Error | undefined)?.cause as Error | undefined)
        ?.message,
    }).toStrictEqual({
      message:
        '[router.constructor] Invalid "queryParams.nullFormat": reading it threw.',
      cause: "lazy config boom",
    });

    // ⚑ The SECOND shape, and the reason the message does not name `toString`.
    // Here the callback RETURNS, cleanly — `String()` throws from the conversion
    // instead. Without this cell the message could go back to saying "its
    // `toString` threw" and nothing would red, which is how that sentence got in.
    let symbolCaught: unknown;

    try {
      createRouter([{ name: "s", path: "/s?tags" }], {
        queryParams: { arrayFormat: { toString: () => Symbol("s") } },
      } as never);
    } catch (error) {
      symbolCaught = error;
    }

    expect({
      message: (symbolCaught as Error | undefined)?.message,
      cause: ((symbolCaught as Error | undefined)?.cause as Error | undefined)
        ?.message,
    }).toStrictEqual({
      message:
        '[router.constructor] Invalid "queryParams.arrayFormat": its value cannot be converted to a string.',
      cause: "Cannot convert a Symbol value to a string",
    });

    // CONTROL — a `toString` that ANSWERS is still honoured, so the catch did not
    // turn every object-valued slot into a refusal.
    const router = createRouter([{ name: "s", path: "/s?tags" }], {
      queryParams: { arrayFormat: { toString: () => "brackets" } },
    } as never);

    try {
      expect(router.buildPath("s", {}, { tags: ["a", "b"] })).toBe(
        "/s?tags[]=a&tags[]=b",
      );
    } finally {
      router.dispose();
    }
  });

  it("every own-key guard reads a CAPTURED intrinsic, not the mutable global", () => {
    // ⚑ Capturing one guard and leaving its siblings reading `Object.hasOwn` at
    // call time bought nothing, and the siblings live in the same file. Measured
    // before this cell: re-pointing the global after boot poisoned a URL through
    // the declared-query guard (#1798) and let an invalid format through the
    // strategy table (#1318) — and the whole suite stayed green, because nothing
    // asked what happens when the intrinsic moves.
    const stock = Object.hasOwn;
    const stockDescriptor = Object.getOwnPropertyDescriptor;
    const stockDescriptorDefine = Object.defineProperty;

    const withGlobals = <T>(
      hasOwn: unknown,
      descriptor: unknown,
      run: () => T,
    ): T => {
      (Object as unknown as Record<string, unknown>).hasOwn = hasOwn;
      (Object as unknown as Record<string, unknown>).getOwnPropertyDescriptor =
        descriptor;

      try {
        return run();
      } finally {
        (Object as unknown as Record<string, unknown>).hasOwn = stock;
        (
          Object as unknown as Record<string, unknown>
        ).getOwnPropertyDescriptor = stockDescriptor;
      }
    };

    // Built with the STOCK intrinsics, so the router is healthy before tampering.
    const router = createRouter([
      { name: "q", path: "/q?toString" },
      { name: "home", path: "/home" },
    ]);

    const refuses = (build: () => unknown): string => {
      try {
        build();

        return "ACCEPTED";
      } catch {
        return "refused";
      }
    };

    try {
      expect(
        withGlobals(
          () => true,
          stockDescriptor,
          () => ({
            // #1798: a declared query name that is also an `Object.prototype`
            // member must not be printed from the prototype.
            declaredQuery: router.buildPath("q", {}, {}),
            // #1318: an invalid format must still be refused by name.
            invalidFormat: refuses(() =>
              createRouter([{ name: "s", path: "/s?a" }], {
                queryParams: { arrayFormat: "bogusTypo" },
              } as never),
            ),
          }),
        ),
      ).toStrictEqual({ declaredQuery: "/q", invalidFormat: "refused" });

      // ⚑ A SIBLING reader of the same intrinsic, in the parse path one frame
      // from the guard that was captured first. The first round captured at FILE
      // scope; the rule is per-INTRINSIC, and measured on the file-scoped form
      // this identical tamper walked straight through five such readers.
      expect(
        withGlobals(
          (o: object, k: PropertyKey) => k in new Object(o),
          stockDescriptor,
          () => {
            const parser = createRouter([{ name: "q", path: "/q?toString" }]);

            try {
              return getPluginApi(parser).matchPath("/q?toString=1")?.search;
            } finally {
              parser.dispose();
            }
          },
        ),
      ).toStrictEqual({ toString: 1 });

      // ⚑ The two intrinsics whose captures shipped UNPINNED, and were measured
      // so by reverting each and watching the whole suite stay green. A defect
      // found, closed, and left unguarded is the shape this file exists to
      // catch — it just had to be pointed at the newest fixes.
      //
      // `freeze` — the state CHANNELS. A capture rewrote the shell site and left
      // the four in `mergeWithDefault`, which produce `params` and `search`.
      expect(
        withGlobals(stock, stockDescriptor, () => {
          const stockFreeze = Object.freeze;

          (Object as unknown as Record<string, unknown>).freeze = (
            value: unknown,
          ): unknown => value;

          try {
            const router = createRouter([{ name: "u", path: "/u/:id?q" }]);

            try {
              const state = getPluginApi(router).makeState(
                "u",
                { id: "1" },
                { q: "a" },
              );

              return {
                params: stockFreeze === Object.freeze,
                paramsFrozen: Object.isFrozen(state.params),
                searchFrozen: Object.isFrozen(state.search),
              };
            } finally {
              router.dispose();
            }
          } finally {
            (Object as unknown as Record<string, unknown>).freeze = stockFreeze;
          }
        }),
      ).toStrictEqual({
        params: false,
        paramsFrozen: true,
        searchFrozen: true,
      });

      // `fromEntries` — the REGISTRATION half of the `__proto__` write primitive
      // whose `update` half was captured a commit earlier. A route carrying a
      // genuine own `__proto__` comes straight out of `JSON.parse`.
      const stockFromEntries = Object.fromEntries;

      (Object as unknown as Record<string, unknown>).fromEntries = (
        entries: Iterable<readonly [string, unknown]>,
      ): Record<string, unknown> => {
        const out: Record<string, unknown> = {};

        for (const [key, value] of entries) {
          out[key] = value;
        }

        return out;
      };

      try {
        const hostile = JSON.parse(
          '{"name":"a","path":"/a","tag":1,"__proto__":{"pwned":"YES"}}',
        ) as never;
        const router = createRouter([hostile]);

        try {
          const config = (
            getPluginApi(router) as unknown as {
              getRouteConfig: (name: string) => Record<string, unknown>;
            }
          ).getRouteConfig("a");

          expect({
            ownKeys: Object.keys(config ?? {}),
            injected: config?.pwned,
          }).toStrictEqual({
            ownKeys: ["tag", "__proto__"],
            injected: undefined,
          });
        } finally {
          router.dispose();
        }
      } finally {
        (Object as unknown as Record<string, unknown>).fromEntries =
          stockFromEntries;
      }

      // `defineProperty` — the UPDATE half of the same `__proto__` primitive.
      // Its registration twin is pinned above; this one shipped unpinned too.
      const stockDefine = Object.defineProperty;

      (Object as unknown as Record<string, unknown>).defineProperty = (
        target: object,
        key: PropertyKey,
        descriptor: PropertyDescriptor,
      ): object => {
        (target as Record<PropertyKey, unknown>)[key] = descriptor.value;

        return target;
      };

      try {
        const router = createRouter([{ name: "a", path: "/a", tag: 1 }]);

        try {
          getRoutesApi(router).update(
            "a",
            JSON.parse('{"__proto__":{"pwned":"YES"}}') as never,
          );

          const config = (
            getPluginApi(router) as unknown as {
              getRouteConfig: (name: string) => Record<string, unknown>;
            }
          ).getRouteConfig("a");

          expect({
            ownKeys: Object.keys(config ?? {}),
            injected: config?.pwned,
          }).toStrictEqual({
            ownKeys: ["tag", "__proto__"],
            injected: undefined,
          });
        } finally {
          router.dispose();
        }
      } finally {
        (Object as unknown as Record<string, unknown>).defineProperty =
          stockDefine;
      }

      // ⚑ And the WRITER, not only the readers: the marker predicate tests a
      // descriptor, so `Object.defineProperty` at the tag site is part of the
      // same guard. Re-pointing it to force `configurable: true` made a GENUINE
      // fault look foreign — #1318's symptom, restored by the commit that
      // introduced the descriptor test.
      const forcedConfigurable = ((
        target: object,
        key: PropertyKey,
        descriptor: PropertyDescriptor,
      ) =>
        stockDescriptorDefine(target, key, {
          ...descriptor,
          configurable: true,
        })) as typeof Object.defineProperty;

      (Object as unknown as Record<string, unknown>).defineProperty =
        forcedConfigurable;

      try {
        // Raised through the PUBLIC door, so the tag is the one a consumer's own
        // fault would carry.
        const tagged = (() => {
          try {
            createRouter([{ name: "s", path: "/s?a" }], {
              queryParams: { arrayFormat: "bogusTypo" },
            } as never);

            return;
          } catch (error) {
            return stockDescriptor(
              error,
              Symbol.for("real-router.searchParams.configFault"),
            );
          }
        })();

        expect(tagged?.configurable).toBe(false);
      } finally {
        (Object as unknown as Record<string, unknown>).defineProperty =
          stockDescriptorDefine;
      }

      // …and the always-on dependency guard, whose reader is
      // `getOwnPropertyDescriptor` rather than `hasOwn`.
      expect(
        withGlobals(
          stock,
          (target: object, key: PropertyKey) => {
            const real = stockDescriptor(target, key);

            return real?.get
              ? { value: undefined, enumerable: true, configurable: true }
              : real;
          },
          () =>
            refuses(() =>
              createRouter([{ name: "s", path: "/s" }], {}, {
                get svc() {
                  return 1;
                },
              } as never),
            ),
        ),
      ).toBe("refused");

      // CONTROL — with the stock intrinsics the same three answers hold, so the
      // cell is about the capture and not about these calls failing anyway.
      expect({
        declaredQuery: router.buildPath("q", {}, {}),
        invalidFormat: refuses(() =>
          createRouter([{ name: "s", path: "/s?a" }], {
            queryParams: { arrayFormat: "bogusTypo" },
          } as never),
        ),
      }).toStrictEqual({ declaredQuery: "/q", invalidFormat: "refused" });
    } finally {
      router.dispose();
    }
  });

  it("the options deep-freeze asks a Proxy bag ONCE per key, and does not widen to non-enumerables", () => {
    // ⚑ The existing split table counts through an ACCESSOR bag, so it can only
    // ever observe `[[Get]]`. That made it structurally blind to the reader the
    // freeze actually uses on a Proxy — `[[GetOwnProperty]]`, which is the
    // caller's trap just as much as a getter is. Measured before this cell: an
    // extra `getOwnPropertyDescriptor` per key survived the entire suite, and so
    // did dropping the enumerability filter. Both are pinned here.
    const seen: string[] = [];
    const bag = new Proxy(
      { arrayFormat: "brackets" },
      {
        get(target, key, receiver) {
          if (typeof key === "string") {
            seen.push(`get:${key}`);
          }

          return Reflect.get(target, key, receiver);
        },
        ownKeys(target) {
          seen.push("ownKeys");

          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          if (typeof key === "string") {
            seen.push("gOPD");
          }

          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );

    createRouter([{ name: "s", path: "/s?a" }], {
      queryParams: bag,
    } as never).dispose();

    expect({
      // ONE for `Object.freeze`'s own integrity pass, ONE for the walk. A third
      // means the walk asked twice — the shape that turned a re-entrant trap
      // from 2^n into 3^n.
      descriptorReads: seen.filter((entry) => entry === "gOPD").length,
      // The four format names, read by the snapshot. `constructor` is the
      // deep-freeze's plain-object test.
      valueReads: seen.filter((entry) => entry.startsWith("get:")).length,
    }).toStrictEqual({ descriptorReads: 2, valueReads: 5 });

    // …and the enumerability filter still holds, which `Object.values` used to
    // carry inside a builtin where no mutation could reach it. A nested plain
    // object under a NON-enumerable key must stay unfrozen.
    const hidden = { deep: "v" };
    const carrier = Object.defineProperty({}, "hiddenBag", {
      value: hidden,
      enumerable: false,
    });

    createRouter([{ name: "s", path: "/s" }], {
      defaultParams: carrier,
    }).dispose();

    expect(Object.isFrozen(hidden)).toBe(false);

    // CONTROL — the same object under an ENUMERABLE key is frozen, so the
    // assertion above is about enumerability and not about the walk being dead.
    const shown = { deep: "v" };

    createRouter([{ name: "s", path: "/s" }], {
      defaultParams: { shownBag: shown },
    }).dispose();

    expect(Object.isFrozen(shown)).toBe(true);
  });

  it("cloneRouter re-runs the refusal, and a DRIFT is confined to the clone", () => {
    // ⚑ Zero cells in the repo paired `cloneRouter` with `queryParams`, while the
    // changeset AND the wiki assert three things about the pair. Written because
    // of that, not because a defect was suspected — an unpinned claim in shipped
    // documentation is the same liability either way.
    const routes = [{ name: "s", path: "/s?a" }];

    // 1. A valid bag survives the clone. Without this the two below would pass
    //    against a clone that ignores `queryParams` entirely.
    const base = createRouter(routes, {
      queryParams: { arrayFormat: "brackets" },
    } as never);
    const clone = cloneRouter(base);

    try {
      expect(clone.buildPath("s", {}, { a: ["x", "y"] })).toBe(
        "/s?a[]=x&a[]=y",
      );
    } finally {
      clone.dispose();
      base.dispose();
    }

    // 2. A bag that DRIFTS fails the clone and leaves the base working. This is
    //    the snapshot's actual win: before it, a drift poisoned the long-lived
    //    router; now the damage is scoped to the request that cloned.
    let reads = 0;
    const drifting = {
      get arrayFormat(): string {
        reads += 1;

        // MEASURED, not guessed: construction reads this slot exactly ONCE
        // (the snapshot; the deep-freeze walks descriptors and never invokes an
        // accessor), and `cloneRouter` adds exactly one more. So the clone's own
        // read is #2, and it is the one that must meet the bad value.
        return reads <= 1 ? "brackets" : "bogusTypo";
      },
    };

    const live = createRouter(routes, { queryParams: drifting } as never);

    try {
      expect(() => cloneRouter(live)).toThrow(
        /Invalid "queryParams\.arrayFormat": "bogusTypo"/u,
      );

      // The base is untouched by its clone's failure.
      expect(live.buildPath("s", {}, { a: ["x", "y"] })).toBe("/s?a[]=x&a[]=y");
    } finally {
      live.dispose();
    }
  });

  it("the stored matcher options are frozen — container, snapshot, and the empty singleton", () => {
    // ⚑ Three freezes, none of which had a test: mutation showed that removing
    // any one of them left the whole suite green. They matter for different
    // reasons, so all three are asserted here rather than one standing in for
    // the others.
    const stored = (queryParams: unknown) => {
      const router = createRouter([{ name: "s", path: "/s?tags" }], {
        queryParams,
      } as never);

      // `@real-router/core/validation` is a PUBLISHED subpath, which is what
      // makes these objects reachable at all — the freezes are not internal
      // hygiene.
      return {
        router,
        options: (
          getInternals(router) as unknown as {
            routeGetStore: () => { matcherOptions: { queryParams: object } };
          }
        ).routeGetStore().matcherOptions,
      };
    };

    const custom = stored({ arrayFormat: "brackets" });
    const empty = stored(undefined);
    const secondEmpty = stored(undefined);

    try {
      expect({
        // The CONTAINER: freezing only the snapshot stops a write INTO it and
        // nothing about REPLACING the slot — measured, a swap here made `add`,
        // `setRootPath` and `dispose()` throw, restoring the defect verbatim.
        container: Object.isFrozen(custom.options),
        // The SNAPSHOT: `defineProperty` could otherwise re-install an accessor
        // in the very slot the snapshot exists to empty.
        snapshot: Object.isFrozen(custom.options.queryParams),
        // The EMPTY singleton is the strongest of the three, because it is a
        // module-level object shared by every router that passes an EMPTY
        // container — the #897 class. Poisoning it through one router changed a
        // later, unrelated router's output.
        //
        // ⚠ Not "every router that passes no bag", which an earlier revision
        // claimed: `createRouter(routes)` with no options never reaches the
        // singleton at all, because `OptionsNamespace` fills `queryParams` with
        // the four defaults first and the snapshot then builds a fresh frozen
        // copy. Only an explicitly falsy container — `undefined`, `null`, `0`,
        // `""` — gets here, which is what `stored(undefined)` passes.
        // ⚠ Sharing is asserted because it is the PRECONDITION for the hazard —
        // an unshared object cannot be poisoned across routers — and not because
        // sharing is required. A fresh frozen `{}` per router would be equally
        // safe and would red this line, so it over-pins by exactly that much;
        // the freeze beside it is the assertion that carries the safety.
        emptyIsShared:
          empty.options.queryParams === secondEmpty.options.queryParams,
        emptyIsFrozen: Object.isFrozen(empty.options.queryParams),
      }).toStrictEqual({
        container: true,
        snapshot: true,
        emptyIsShared: true,
        emptyIsFrozen: true,
      });

      // …and the freezes BITE, rather than merely being reported. `isFrozen` on
      // its own would pass against a `Proxy` that lies about it.
      expect(() =>
        Object.defineProperty(custom.options.queryParams, "arrayFormat", {
          get: () => "comma",
        }),
      ).toThrow(TypeError);

      expect(() => {
        (custom.options as { queryParams: unknown }).queryParams = {};
      }).toThrow(TypeError);

      // ⚑ And the SLOT that holds the container, one level further out. Freezing
      // the snapshot left the container writable; freezing the container left
      // this writable — and each time the same `dispose()` throw came back
      // through the same published surface. Measured before this assertion:
      // replacing `store.matcherOptions` wholesale was ACCEPTED and `dispose()`
      // threw the named config error, while two shipped comments said the hole
      // was closed.
      const store = (
        getInternals(custom.router) as unknown as {
          routeGetStore: () => Record<string, unknown>;
        }
      ).routeGetStore();

      expect(() => {
        store.matcherOptions = { queryParams: { arrayFormat: "bogusTypo" } };
      }).toThrow(TypeError);

      // …and the router is still healthy afterwards, which is the outcome the
      // three freezes exist for.
      expect(() => {
        custom.router.dispose();
      }).not.toThrow();
    } finally {
      custom.router.dispose();
      empty.router.dispose();
      secondEmpty.router.dispose();
    }
  });

  it("the published store hands out ONE sealed data slot, and eight siblings are destructive", () => {
    // ⚑ The cell above closes `store.matcherOptions` — "the freeze closed one
    // level and the hole was one level out". This asks where the sequence
    // actually stops. `routeGetStore()` is on the `RouterInternals` contract
    // published at `@real-router/core/validation`, and it hands out the store
    // OBJECT, so the level beyond the slot is its fourteen siblings. Measured:
    // one of them refuses a write for the same reason `matcherOptions` does,
    // one refuses only because it is an accessor with no setter, and EIGHT are
    // replaceable and then break the router through its ordinary public API.
    //
    // ⚠ Pinned as the CURRENT boundary, not as desirable — the `emptyIsShared`
    // contract. Sealing another slot reds `sealed` and is a deliberate change;
    // a slot silently becoming writable, or a new slot arriving unsealed and
    // destructive, is what this exists to catch.
    const mk = () =>
      createRouter([{ name: "u", path: "/u/:id?tab" }], {
        queryParams: { arrayFormat: "brackets" },
      } as never);

    const storeOf = (router: ReturnType<typeof mk>) =>
      (
        getInternals(router) as unknown as {
          routeGetStore: () => Record<string, unknown>;
        }
      ).routeGetStore();

    const probe = mk();
    const slots = Object.getOwnPropertyNames(storeOf(probe));

    probe.dispose();

    const sealed: string[] = [];
    const destructive: string[] = [];

    for (const slot of slots) {
      const writeProbe = mk();
      const store = storeOf(writeProbe);
      let refused = false;

      const held = store[slot];

      try {
        store[slot] = held;
      } catch {
        refused = true;
      }

      writeProbe.dispose();

      if (refused) {
        sealed.push(slot);
        continue;
      }

      const usageProbe = mk();
      const replaced = storeOf(usageProbe);
      let broke = false;

      replaced[slot] = undefined;

      try {
        usageProbe.buildPath("u", { id: "1" }, { tab: "x" });
        getRoutesApi(usageProbe).add({ name: "z", path: "/z" });
        getRoutesApi(usageProbe).get("u");
      } catch {
        broke = true;
      }

      try {
        usageProbe.dispose();
      } catch {
        broke = true;
      }

      if (broke) {
        destructive.push(slot);
      }
    }

    expect({ slots: slots.length, sealed, destructive }).toStrictEqual({
      slots: 15,
      // `definitions` is an accessor with no setter — sealed by shape, not by a
      // decision; `matcherOptions` is the one sealed ON PURPOSE.
      sealed: ["definitions", "matcherOptions"],
      destructive: [
        "config",
        "tree",
        "matcher",
        "urlParamsCache",
        "queryParamsCache",
        "rootPath",
        "depsStore",
        "lifecycleNamespace",
      ],
    });
  });

  it("EVERY format slot's read sits inside the guard, not just the one that was measured", () => {
    // ⚑ The accessor row in the coercion cell exercises `nullFormat` alone.
    // Measured: moving `arrayFormat`'s read back to the call site — the exact
    // defect this branch fixed, on a sibling slot — left the whole suite green
    // while `createRouter` escaped with a raw `Error: lazy boom`, no `cause` and
    // no option named. Four slots, four identical call sites, one cell.
    const caught = [
      "arrayFormat",
      "booleanFormat",
      "nullFormat",
      "numberFormat",
    ].map((field) => {
      const bag: Record<string, unknown> = {};

      Object.defineProperty(bag, field, {
        get: () => {
          throw new Error(`lazy boom ${field}`);
        },
        enumerable: true,
        configurable: true,
      });

      try {
        createRouter([{ name: "s", path: "/s?tags" }], {
          queryParams: bag,
        }).dispose();

        return `${field}: NOT REFUSED`;
      } catch (error) {
        return `${(error as Error).message} <- ${
          ((error as Error).cause as Error | undefined)?.message ?? "no cause"
        }`;
      }
    });

    expect(caught).toStrictEqual([
      '[router.constructor] Invalid "queryParams.arrayFormat": reading it threw. <- lazy boom arrayFormat',
      '[router.constructor] Invalid "queryParams.booleanFormat": reading it threw. <- lazy boom booleanFormat',
      '[router.constructor] Invalid "queryParams.nullFormat": reading it threw. <- lazy boom nullFormat',
      '[router.constructor] Invalid "queryParams.numberFormat": reading it threw. <- lazy boom numberFormat',
    ]);
  });

  it("a hostile `constructor` needs no Proxy to escape the options deep-freeze", () => {
    // ⚑ `asKey`'s docblock names this residual and scopes it to "a hostile Proxy
    // CONTAINER". Measured: a PLAIN object with an accessor in the `constructor`
    // slot does it too — `deepFreeze`'s plain-object test reads `value.constructor`
    // by name, so any bag that answers with code escapes, Proxy or not. Pinned as
    // the ACCEPTED boundary; if it reds because the test became
    // `Object.getPrototypeOf(value) === Object.prototype`, the residual paragraph
    // is what to update, and this cell becomes the CONTROL for the fix.
    const escapes = (bag: object): string => {
      try {
        createRouter([{ name: "s", path: "/s?a" }], {
          queryParams: bag,
        }).dispose();

        return "no throw";
      } catch (error) {
        return (error as Error).message;
      }
    };

    const proxied = new Proxy(
      { arrayFormat: "brackets" },
      {
        get: (target, key, receiver) => {
          if (key === "constructor") {
            throw new Error("container trap boom");
          }

          return Reflect.get(target, key, receiver);
        },
      },
    );

    const plain: Record<string, unknown> = { arrayFormat: "brackets" };

    Object.defineProperty(plain, "constructor", {
      get: () => {
        throw new Error("plain ctor boom");
      },
      configurable: true,
    });

    expect({ proxied: escapes(proxied), plain: escapes(plain) }).toStrictEqual({
      proxied: "container trap boom",
      plain: "plain ctor boom",
    });
  });

  it("the ordinary createRouter(routes) spelling gets a FRESH snapshot, never the singleton", () => {
    // ⚑ The half of the singleton claim nothing asserted. The cell above pins
    // that an explicitly falsy CONTAINER shares one frozen `{}`; the note beside
    // it states — in prose only — that `createRouter(routes)` with no options
    // "never reaches the singleton at all, because `OptionsNamespace` fills
    // `queryParams` with the four defaults first and the snapshot then builds a
    // fresh frozen copy". Measured, that is true and it is the STRONGER of the
    // two properties: the object two ordinary routers hand to
    // `@real-router/core/validation` is not one shared object, so there is
    // nothing to poison across routers even before the freeze is considered.
    //
    // ⚠ Distinct AND populated, both, because either alone is satisfied by a
    // mistake. Sharing one object would red the first; returning the empty
    // singleton (the defect this pins) would red the second while the first
    // still passed for `{}` !== `{}`… which it would not, since the singleton is
    // one object — so the pair is what separates "fresh and filled" from every
    // neighbouring shape.
    const stored = (opts?: unknown) => {
      const router = createRouter(
        [{ name: "s", path: "/s?tags" }],
        opts as never,
      );

      return {
        router,
        queryParams: (
          getInternals(router) as unknown as {
            routeGetStore: () => { matcherOptions: { queryParams: object } };
          }
        ).routeGetStore().matcherOptions.queryParams,
      };
    };

    const first = stored();
    const second = stored();
    const emptyOptions = stored({});
    const falsyContainer = stored({ queryParams: undefined });

    try {
      expect({
        freshPerRouter: first.queryParams !== second.queryParams,
        // …and it carries the four resolved defaults, i.e. it is NOT the empty
        // singleton wearing a different name.
        filled: { ...first.queryParams },
        // `{}` as the options object takes the same door as no options at all.
        emptyOptionsAlsoFresh:
          emptyOptions.queryParams !== first.queryParams &&
          Object.keys(emptyOptions.queryParams).length === 4,
        // CONTROL — the singleton door is still reachable, so this cell pins a
        // boundary and not "the singleton is gone".
        falsyContainerIsTheSingleton:
          Object.keys(falsyContainer.queryParams).length === 0 &&
          falsyContainer.queryParams !== first.queryParams,
        frozen: Object.isFrozen(first.queryParams),
      }).toStrictEqual({
        freshPerRouter: true,
        filled: {
          arrayFormat: "none",
          booleanFormat: "auto",
          nullFormat: "default",
          numberFormat: "auto",
        },
        emptyOptionsAlsoFresh: true,
        falsyContainerIsTheSingleton: true,
        frozen: true,
      });
    } finally {
      first.router.dispose();
      second.router.dispose();
      emptyOptions.router.dispose();
      falsyContainer.router.dispose();
    }
  });

  it("a NON-DEFAULT value of every format actually TAKES EFFECT", () => {
    // ⚑ This cell exists because the file did not have it, and the gap was
    // total: a mutant that let invalid values through (so every refusal cell
    // stayed green) while silently DROPPING a valid `booleanFormat` /
    // `nullFormat` / `numberFormat` left the whole suite — 4462 tests — green.
    //
    // The cause is a vacuity mode worth naming: every `FORMATS[i].valid` was
    // that field's OWN DEFAULT (`auto` / `default` / `auto`, byte-identical to
    // `DEFAULT_QUERY_PARAMS`), so eight cells asserting "a VALID format raises
    // nothing" and "it round-trips through its own URL" could not tell HONOURED
    // from IGNORED. Only `arrayFormat` had a non-default pin, via `BAG_SHAPES`.
    //
    // So each value below differs from its default, and the assertion is on the
    // OBSERVABLE difference rather than on the absence of a throw. Both
    // directions, because the four formats do not all show up in one of them.
    const observe = (queryParams: unknown, url: string, bag: unknown) => {
      const router = createRouter([{ name: "s", path: "/s?a" }], {
        queryParams,
      } as never);

      try {
        return {
          match: getPluginApi(router).matchPath(url)?.search,
          build: router.buildPath("s", {}, bag as never),
        };
      } finally {
        router.dispose();
      }
    };

    expect({
      boolean: observe({ booleanFormat: "none" }, "/s?a=true", { a: true }),
      null: observe({ nullFormat: "hidden" }, "/s?a", { a: null }),
      number: observe({ numberFormat: "none" }, "/s?a=5", { a: 5 }),
      array: observe({ arrayFormat: "brackets" }, "/s?a=1", { a: ["x", "y"] }),
    }).toStrictEqual({
      // decode: "true" stays a string instead of becoming a boolean
      boolean: { match: { a: "true" }, build: "/s?a=true" },
      // build: the bare key is omitted instead of printed
      null: { match: { a: null }, build: "/s" },
      // decode: "5" stays a string instead of becoming a number
      number: { match: { a: "5" }, build: "/s?a=5" },
      // build: the repeat form gains brackets. ⚠ `match` is `1` and not `"1"`
      // because `numberFormat` is still its default `auto` — arrayFormat does
      // not govern a single scalar's coercion, and writing `"1"` here made the
      // cell red, which is the cell doing its job on its own author.
      array: { match: { a: 1 }, build: "/s?a[]=x&a[]=y" },
    });

    // CONTROL — the same four reads under the DEFAULTS. Without it the block
    // above would also pass against a router that ignores `queryParams`
    // entirely and happens to default to these answers.
    expect({
      boolean: observe(undefined, "/s?a=true", { a: true }),
      null: observe(undefined, "/s?a", { a: null }),
      number: observe(undefined, "/s?a=5", { a: 5 }),
      array: observe(undefined, "/s?a=1", { a: ["x", "y"] }),
    }).toStrictEqual({
      boolean: { match: { a: true }, build: "/s?a=true" },
      null: { match: { a: null }, build: "/s?a" },
      number: { match: { a: 5 }, build: "/s?a=5" },
      array: { match: { a: 1 }, build: "/s?a=x&a=y" },
    });
  });

  it('a NULLISH format slot is absence, not the string "null"', () => {
    // ⚑ A regression this branch shipped and the swarm caught: `asKey` guarded
    // `undefined` only, so `null` reached `String(null)` and became the key
    // `"null"` — and `makeOptions`' `?? DEFAULT` can never rescue that, because
    // it is handed a non-nullish value. `createRouter` then refused a config the
    // base accepted.
    //
    // ⚠ `null` is the REACHABLE half of nullish, not the exotic one: `JSON.parse`
    // and YAML produce `null` and never `undefined`, and `cfg.x ?? null` is an
    // ordinary spelling. Four changeset / docblock sentences said this class
    // "stays outside the guard"; it did not.
    const refusal = (queryParams: unknown): string => {
      try {
        build(queryParams);

        return "ACCEPTED — no refusal at all";
      } catch (error) {
        // The remedy tail has its own CONTROL cell; what this one is about is
        // WHICH value was refused and that it was refused at all.
        return (error as Error).message
          .replace("[router.constructor] ", "")
          .split(" — expected ", 1)[0];
      }
    };

    const build = (queryParams: unknown): string => {
      const router = createRouter([{ name: "s", path: "/s?tags" }], {
        queryParams,
      } as never);

      try {
        return router.buildPath("s", {}, { tags: ["a", "b"] });
      } finally {
        router.dispose();
      }
    };

    expect({
      // All four slots, because the coercion is per-slot.
      arrayNull: build({ arrayFormat: null }),
      booleanNull: build({ booleanFormat: null }),
      nullNull: build({ nullFormat: null }),
      numberNull: build({ numberFormat: null }),
      // CONTROL — `undefined` behaved correctly all along, so the cell must not
      // pass merely because nullish is handled at all.
      undefinedSlot: build({ arrayFormat: undefined }),
      // CONTROL — the OTHER pole of the same axis. `== null` must admit exactly
      // the two nullish values and nothing else, and this half was measured and
      // reported but never asserted: mutating the guard to `!value` left all
      // 4472 cells green, because nothing here said what a FALSY-but-present
      // value does. Each of these is a real value the caller wrote, so each must
      // be refused BY NAME rather than quietly defaulted.
      falseSlot: refusal({ arrayFormat: false }),
      zeroSlot: refusal({ arrayFormat: 0 }),
      emptySlot: refusal({ arrayFormat: "" }),
      nanSlot: refusal({ arrayFormat: Number.NaN }),
      // CONTROL — a real value still takes effect, so the fix is not "ignore the
      // slot".
      realValue: build({ arrayFormat: "brackets" }),
    }).toStrictEqual({
      arrayNull: "/s?tags=a&tags=b",
      booleanNull: "/s?tags=a&tags=b",
      nullNull: "/s?tags=a&tags=b",
      numberNull: "/s?tags=a&tags=b",
      undefinedSlot: "/s?tags=a&tags=b",
      falseSlot: 'Invalid "queryParams.arrayFormat": "false"',
      zeroSlot: 'Invalid "queryParams.arrayFormat": "0"',
      emptySlot: 'Invalid "queryParams.arrayFormat": ""',
      nanSlot: 'Invalid "queryParams.arrayFormat": "NaN"',
      realValue: "/s?tags[]=a&tags[]=b",
    });

    // …and an INVALID string is still refused by name, so restoring nullish did
    // not widen the gate.
    expect(() => build({ arrayFormat: "bogusTypo" })).toThrow(
      /Invalid "queryParams\.arrayFormat": "bogusTypo"/g,
    );
  });

  it("ATTACK — the marker check cannot itself throw, and a primitive throw is safe", () => {
    // ⚑ Found by attacking this branch's own fix, not by review. The narrowing
    // rethrows what carries a marker — and asking `SYMBOL in error` runs the
    // `has` trap of a Proxy, so the ASK could throw out of `matchPath`, which is
    // the exact contract the narrowing exists to protect. One fail-open default
    // was replaced by another wearing a different hat.
    //
    // Three shapes, all thrown from inside the guarded `try`. ⚠ The channel
    // MOVED with #1852 and the subject did not: a setter keyed by the URL is no
    // longer a thrower, because `putField` DEFINES for a name the chain answers
    // for instead of dispatching into it.
    //
    // ⚠ An earlier revision of this sentence said the primitive "never consults
    // the chain", which is the exact opposite of what it does and of what
    // `chain-walk-authority` records for it — asking the chain IS the guard; not
    // dispatching into it is the consequence. The remaining reachable one is the
    // numeric-index
    // write `Array.prototype.push` performs while accumulating a repeated
    // BRACKETED key — see the sibling cell above for why that site stays open on
    // purpose.
    // Index 37 for the reason the sibling cell states: a low one takes the test
    // runner down before any cell runs.
    const HAZARD_INDEX = "37";
    const REPEATED = Array.from(
      { length: 38 },
      (_, index) => `a=${String(index)}`,
    ).join("&");

    const outcome = (thrown: unknown): string => {
      Object.defineProperty(Object.prototype, HAZARD_INDEX, {
        configurable: true,
        get: () => undefined,
        set() {
          throw thrown;
        },
      });

      const router = createRouter([{ name: "x", path: "/x?a" }]);

      try {
        return (
          getPluginApi(router).matchPath(`/x?${REPEATED}`)?.name ?? "unmatched"
        );
      } catch (error) {
        return `THREW ${(error as Error).constructor.name}`;
      } finally {
        Reflect.deleteProperty(Object.prototype, HAZARD_INDEX);
        router.dispose();
      }
    };

    const forged = new Error("forged by the application");

    Object.defineProperty(
      forged,
      Symbol.for("real-router.searchParams.configFault"),
      { value: true },
    );

    expect({
      // A Proxy whose `has` trap throws — the ask itself.
      proxyHasTrap: outcome(
        new Proxy(new Error("boom"), {
          has() {
            throw new RangeError("has trap");
          },
        }),
      ),
      // A primitive — `in` on one is a TypeError, so the typeof gate matters.
      primitive: outcome("a string, not an Error"),
      // CONTROL — the marker is a LABEL, not a capability: `Symbol.for` is a
      // global registry, so an application CAN forge it, and then it is
      // rethrown. Accepted and pinned rather than left to be discovered.
      forgedMarker: outcome(forged),
    }).toStrictEqual({
      proxyHasTrap: "unmatched",
      primitive: "unmatched",
      forgedMarker: "THREW Error",
    });
  });

  it("a symbol format is REFUSED BY NAME, not by a raw coercion crash", () => {
    // ⚑ A behaviour change that ships with the key hoist, and the only one. The
    // guard always detected a symbol (`Object.hasOwn` answered `false`), but
    // building its own message then threw `Cannot convert a Symbol value to a
    // string` from the template — so the named `TypeError` this file exists to
    // deliver never reached the caller for that one value class. Coercing above
    // the check is legal on a symbol, so the message now arrives.
    //
    // ⚑ At CONSTRUCTION, since the strategies resolve there: the symbol is
    // coerced once, where the router is built, and the named error arrives
    // before any URL exists. What the cell pins is unchanged.
    const message = (() => {
      try {
        routerWith("arrayFormat", Symbol("s") as unknown as string).dispose();
      } catch (error) {
        return (error as Error).message;
      }

      return "";
    })();

    expect(message).toContain(
      '[router.constructor] Invalid "queryParams.arrayFormat": "Symbol(s)"',
    );

    // ⚑ And the REMEDY half, which nothing pinned: the sibling cells match the
    // message PREFIX only, so replacing the whole `— expected …` tail with a
    // constant survived the whole suite.
    //
    // ⚠ Asserted as the ORDERED TAIL, exactly — not as a set of memberships, and
    // the reversal is the point. An earlier revision compared a set
    // "deliberately", reasoning that the printed order follows the strategy
    // table's declaration and so "a literal here would red on a change that is
    // correct". Two measurements refute that. (1) The order IS the announced
    // shape: the wiki quotes this sentence verbatim, tail included
    // (`RouterOptions.md`: `— expected "auto" | "none"` for `numberFormat` —
    // which is NOT the order the TS union printed beside it is written in), so
    // reordering a table rewrites documented output rather than nothing. (2) The
    // file pinned the order anyway, one cell up, in the derived CONTROL —
    // measured: reordering `nullStrategies` to `{ hidden, default }` reds that
    // cell and ONLY that cell in the whole suite, while reordering
    // `arrayStrategies` used to leave THIS cell green. Both claims could not
    // hold at once; the surviving one is the one that answers to the sentence a
    // user reads.
    //
    // ⚠ Read from `strategy-lists.ts` — the same hand-written authority the
    // CONTROL uses — instead of a fourth copy of the union written out here. It
    // is still hand-written, for the reason `VALID` is in the #1811 sibling: a
    // functional test may not import an internal `src/*` path, and a fifth
    // arrayFormat added to `arrayStrategies` arrives as an uncovered branch,
    // which this package's 100% gate already refuses. What it stops being is a
    // copy that can drift from the copy beside it.
    //
    // ⚑ And it cannot go vacuous, which is what the set form needed its
    // `for…of` note for: an emptied list yields the bare string `"— expected "`
    // against a real tail, and reds.
    const tail = message.slice(message.indexOf("— expected "));

    expect(tail).toBe(
      `— expected ${searchParamsStrategyLists.arrayFormat
        .map((name) => `"${name}"`)
        .join(" | ")}`,
    );
  });

  it("CONTROL — the table is non-empty and both of its axes are populated", () => {
    // ⚑ Non-vacuity, OUTSIDE `describe.each`: an empty list registers ZERO cells
    // in silence, so a broken derivation would leave this file green with
    // nothing in it. A count is what discriminates there, not a colour.
    expect(FORMATS).toHaveLength(4);
    expect(INVALID.length).toBeGreaterThanOrEqual(5);

    // The invalid column must contain BOTH classes, or the table stops proving
    // that the fix covers the one #1318 missed.
    expect(INVALID).toContain("bogusTypo");
    expect(INVALID).toContain("toString");

    // ⚑ `searchParamsStrategyLists` indexes the remedy cell's only loop, so an
    // empty record runs ZERO assertions there and the cell passes green — the
    // same failure this file already guards for `FORMATS` and `INVALID`, and the
    // one the sibling `options.test.ts` was restructured to avoid. It gets its
    // OWN threshold, cross-checked against `FORMATS` so the two cannot drift.
    const byName = (a: string, b: string): number => a.localeCompare(b);

    expect(
      Object.keys(searchParamsStrategyLists).toSorted(byName),
    ).toStrictEqual(FORMATS.map((format) => format.field).toSorted(byName));

    // ⚑ And the two lists this file grew for the snapshot, for the SAME reason —
    // measured: emptying either drops the file by 3 resp. 4 registered cells — one per row of
    // each list, since each feeds exactly one `it.each` — with
    // RC=0, i.e. they vanish exactly as silently as the ones above. One threshold
    // per list, because a count on one does not reach the other.
    expect(BAG_SHAPES).toHaveLength(3);
    expect(CONTAINERS).toHaveLength(4);

    for (const values of Object.values(searchParamsStrategyLists)) {
      expect(values.length).toBeGreaterThanOrEqual(2);
    }

    // And each format must be exercised with a value of its own type — the
    // warning at the top, made checkable.
    expect(
      FORMATS.map((f) => typeof f.buildValue).toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toStrictEqual(["boolean", "number", "object", "object"]);
  });

  const UNFROZEN_BAG_SHAPES: readonly (readonly [
    label: string,
    make: () => Record<string, string>,
  ])[] = [
    [
      "null-prototype",
      (): Record<string, string> =>
        Object.assign(Object.create(null) as Record<string, string>, {
          arrayFormat: "none",
        }),
    ],
    [
      "class instance",
      (): Record<string, string> => {
        class Bag {
          arrayFormat = "none";
        }

        return new Bag() as unknown as Record<string, string>;
      },
    ],
  ];

  it("SELF-TEST — both unfrozen shapes are registered", () => {
    // The count, asserted OUTSIDE the `each` — see table-vacuity-authority.
    expect(UNFROZEN_BAG_SHAPES).toHaveLength(2);
  });

  it.each(UNFROZEN_BAG_SHAPES)(
    "BOUNDARY — a %s bag is never frozen, so a plain WRITE splits the two readers",
    (_label, make) => {
      // The measured half of the note on the test above, which asserted it in
      // prose and tested only the plain-object case. `deepFreeze` recurses when
      // `value.constructor === Object`, and NEITHER of these shapes satisfies it —
      // so the caller's bag stays writable, and a write after construction is
      // ACCEPTED. `getOptions()` hands back that same object and therefore echoes
      // the new value, while the matcher keeps the construction-time snapshot.
      //
      // ⚠ Widening the freeze does NOT close this, and that is why it is pinned
      // rather than "fixed": a PLAIN bag — frozen here, on every revision — whose
      // `arrayFormat` is an own-enumerable GETTER answers differently on a later
      // call and splits the same two readers. Freezing is not the mechanism that
      // makes the readers agree; a shared value would be. Handing the SNAPSHOT
      // back from `getOptions()` is the other tempting fix and costs more than it
      // buys: the snapshot carries the four known names only, so
      // `@real-router/validation-plugin` would lose the "unknown option" report
      // it currently raises for a mis-spelled `queryParams` field (measured).
      const bag = make();
      const router = createRouter(
        [
          { name: "s", path: "/s?tags" },
          { name: "home", path: "/home" },
        ],
        { queryParams: bag },
      );

      try {
        expect(Object.isFrozen(bag)).toBe(false);
        expect(router.buildPath("s", {}, { tags: ["a", "b"] })).toBe(
          "/s?tags=a&tags=b",
        );

        bag.arrayFormat = "brackets";

        // The report moves…
        expect(getPluginApi(router).getOptions().queryParams?.arrayFormat).toBe(
          "brackets",
        );
        // …and the router does not.
        expect(
          getInternals(router).routeGetStore().matcherOptions?.queryParams,
        ).toStrictEqual({ arrayFormat: "none" });
        expect(router.buildPath("s", {}, { tags: ["a", "b"] })).toBe(
          "/s?tags=a&tags=b",
        );
      } finally {
        router.dispose();
      }
    },
  );

  it("BOUNDARY — the option error is raised BEFORE a malformed route path", () => {
    // Two independent mistakes in one call; the constructor can only report one.
    // Resolving the query strategies at matcher CONSTRUCTION (the #1796 hoist)
    // moved that report ahead of `matcher.registerTree(tree)`, so a config with
    // both now names the option and the path error waits for the next attempt.
    //
    // ⚑ Kept, because it is the order this constructor already had: `logger`,
    // then the options shape, then the dependencies, then the routes — options
    // before routes at every earlier gate. Undoing it means making the strategy
    // resolution lazy again, which is the defect #1796 closed (a bad format ran
    // cleanly until the first URL that happened to carry a query key, and then
    // raised from inside `match()`, where the URL plugins have nobody to catch
    // for them).
    //
    // ⚠ The route guards that run BEFORE the namespaces are unaffected and still
    // win — pinned below, so "options always win" is not read into this.
    const badPath = [{ name: "s", path: "/s/:" }];

    expect(() =>
      createRouter(badPath, {
        queryParams: { arrayFormat: "bogusTypo" },
      } as never),
    ).toThrow(/Invalid "queryParams\.arrayFormat"/);

    // Fix the option and the path error is there, unchanged.
    expect(() => createRouter(badPath)).toThrow(/Empty parameter name/);

    // A duplicate name is caught by the batch guard, above the namespaces.
    expect(() =>
      createRouter(
        [
          { name: "s", path: "/s" },
          { name: "s", path: "/t" },
        ],
        { queryParams: { arrayFormat: "bogusTypo" } } as never,
      ),
    ).toThrow(/Duplicate route "s" in batch/);
  });

  it("CONTROL — a valid config resolves with no params bag at all", () => {
    // Pins the fast path `makeOptions` takes when no format is customised: the
    // cached DEFAULT_OPTIONS must not be reachable from any of the cells above.
    const router = createRouter([{ name: "x", path: "/x?a" }]);

    expect(router.buildPath("x", {}, { a: 7 })).toBe("/x?a=7");

    router.dispose();
  });
});
