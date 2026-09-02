import { fc, test } from "@fast-check/vitest";
import { describe, expect, beforeAll, afterAll } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { NUM_RUNS } from "./helpers";

import type {
  Params,
  Route,
  Router,
  SearchParams,
  State,
} from "@real-router/core";

/**
 * THE SPELLING OF AN ABSENT BAG IS NOT OBSERVABLE (#1822).
 *
 * `navigate(name, null)` is supported runtime input while the signature admits
 * only `Params | undefined`, so every position that asks "is there a bag?" has
 * two answers to recognise and a type that shows it only one. Three normalisers
 * carry the term: `findMisChanneledKey`, `normalizeChannel` and
 * `adoptForeignBag`.
 *
 * ⚠ It guards all three, measured by mutation rather than assumed: removing any
 * one arm reds this file. `adoptForeignBag` is the reason the committing door is
 * here — it is reachable through no other, so a property confined to the
 * synchronous doors leaves that term with no derived guard at all.
 *
 * What makes it worth a property rather than a table: the failure was never
 * about the argument. It was about the ROUTE — the guard's
 * `queryNames.length === 0` short-circuit shielded every route without a `?`
 * declaration, so the same call was fine or fatal depending on a fact the
 * caller never touched. The route dimension is therefore generated, not chosen.
 *
 * ⚠ Scope: the six synchronous doors plus `navigateToState`. `navigate` is left
 * to cells (`tests/functional/state/channel-guard.test.ts`) because it reaches
 * exactly ONE of the three arms and two doors here already reach it: P1 runs on
 * the RAW argument, one line above the `?? EMPTY_PARAMS` that would have made
 * the bag safe.
 *
 * ⚠ An absent bag is a different fact from an absent VALUE. A key whose value
 * is `null` is a real value and stays one — that rule is #1550 / #1551 and the
 * control below pins that this property does not reach it.
 */

const ROUTES: Route[] = [
  { name: "plain", path: "/plain" },
  { name: "query", path: "/query?page&lang" },
  { name: "defaulted", path: "/defaulted?page", defaultSearch: { page: "1" } },
  { name: "slotted", path: "/slotted/:id" },
  { name: "collision", path: "/collision/:id?id" },
];

const ROUTE_NAMES = ROUTES.map((route) => route.name);

/** The two spellings of "no bag". Omission is `undefined` by construction. */
const ABSENT = [undefined, null] as const;

type Outcome = { ok: string } | { threw: string };

/**
 * The door's answer OR the way it refused, as one comparable value. Comparing
 * only the happy path would let a fix that swaps one throw for another pass.
 */
function outcome(call: () => unknown): Outcome {
  try {
    return { ok: JSON.stringify(call()) ?? "undefined" };
  } catch (error) {
    return { threw: (error as Error).message };
  }
}

/**
 * The same, for a door that commits. A `RouterError`'s `code` is the comparable
 * part — `message` interpolates the route name, and a bare `TypeError` has no
 * code at all, which is exactly the difference #1822 is about.
 */
async function committedOutcome(call: () => Promise<State>): Promise<Outcome> {
  try {
    const state = await call();

    // The identity fields only: `meta` carries a per-navigation id, so the whole
    // state is never equal to itself across two calls.
    return {
      ok: JSON.stringify({
        name: state.name,
        params: state.params,
        search: state.search,
        path: state.path,
      }),
    };
  } catch (error) {
    const err = error as Error & { code?: string };

    return { threw: err.code ?? `${err.constructor.name}: ${err.message}` };
  }
}

describe("core — an absent bag has two spellings and one meaning (#1822)", () => {
  let router: Router;
  let api: ReturnType<typeof getPluginApi>;

  beforeAll(async () => {
    router = createRouter(ROUTES);
    api = getPluginApi(router);
    await router.start("/plain");
  });

  afterAll(() => {
    router.stop();
  });

  test.prop([fc.constantFrom(...ROUTE_NAMES)], { numRuns: NUM_RUNS.fast })(
    "every synchronous door answers for null exactly as it answers for undefined",
    (name) => {
      const doors: ((bag: Params | null | undefined) => unknown)[] = [
        (bag) => router.buildPath(name, bag!),
        (bag) => router.isActiveRoute(name, bag!),
        (bag) => api.makeState(name, bag!).path,
        (bag) => api.buildNavigationState(name, bag!)?.path,
        (bag) => router.canNavigateTo(name, bag!),
        (bag) => api.forwardState(name, bag!).name,
      ];

      expect(doors, "one cell per synchronous door").toHaveLength(6);

      for (const door of doors) {
        expect(outcome(() => door(ABSENT[1]))).toStrictEqual(
          outcome(() => door(ABSENT[0])),
        );
      }
    },
  );

  test.prop([fc.constantFrom(...ROUTE_NAMES)], { numRuns: NUM_RUNS.fast })(
    "the query slot shares the rule, because it shares the normaliser",
    (name) => {
      const withNull = outcome(() =>
        router.buildPath(name, {}, null as unknown as SearchParams),
      );

      expect(withNull).toStrictEqual(outcome(() => router.buildPath(name, {})));
    },
  );

  // The COMMITTING doors, and they are the reason this property is not confined
  // to the synchronous ones: `adoptForeignBag` is reachable through no other
  // route, so without this block the third term has no derived guard at all.
  // Both spellings are driven from the same starting state and with `reload`, so
  // the comparison is about the BAG and not about where the router happened to
  // be standing.
  test.prop(
    [fc.constantFrom(...ROUTE_NAMES), fc.constantFrom("params", "search")],
    { numRuns: NUM_RUNS.fast },
  )(
    "navigateToState adopts a null slot exactly as it adopts an undefined one",
    async (name, slot) => {
      const matched = api.matchPath(router.buildPath(name, { id: "7" }));

      expect(matched, "the fixture builds a matchable URL").toBeDefined();

      const drive = async (bag: undefined | null): Promise<Outcome> => {
        await router.navigate({ name: "plain" }, { reload: true });

        return committedOutcome(() =>
          api.navigateToState(
            { ...matched!, [slot]: bag },
            {
              reload: true,
            },
          ),
        );
      };

      await expect(drive(ABSENT[1])).resolves.toStrictEqual(
        await drive(ABSENT[0]),
      );
    },
  );

  // Without this the property above passes on a router that answers the same
  // thing for everything — the whole shape it is supposed to discriminate.
  test.prop([fc.string({ minLength: 1, maxLength: 8 })], {
    numRuns: NUM_RUNS.fast,
  })(
    "CONTROL — a POPULATED bag is observable, so absence is a real answer",
    (id) => {
      // The exact encoding is `buildPath`'s business and is pinned elsewhere; what
      // this control needs is only that a filled slot PRINTS while an absent bag
      // refuses.
      expect(router.buildPath("slotted", { id })).toMatch(/^\/slotted\/.+$/);
      expect(
        outcome(() => router.buildPath("slotted", { id })),
      ).not.toStrictEqual(outcome(() => router.buildPath("slotted")));
    },
  );

  // The rule this property must NOT reach: `null` as a key's VALUE is a value.
  test.prop([fc.constantFrom("query", "defaulted")], {
    numRuns: NUM_RUNS.fast,
  })("CONTROL — a null-VALUED key is not an absent bag", (name) => {
    expect(router.buildPath(name, {}, { page: null })).not.toBe(
      router.buildPath(name, {}, null as unknown as SearchParams),
    );
  });
});
