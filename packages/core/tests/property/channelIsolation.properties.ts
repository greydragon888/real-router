import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { NUM_RUNS } from "./helpers";

import type { Params, Router, SearchParams } from "@real-router/core";

/**
 * THE invariant the channel split exists for: **`params` and `search` meet only
 * in the printed URL.** Nothing between a config slot and that URL may move a
 * key from one channel to the other.
 *
 * Three point-checks enforce it today (registration, the `forwardState` seam,
 * the decoder boundary) and each is pinned by its own functional test. This
 * file states the RULE instead, over generated routes, because the point-checks
 * are only as complete as the cells someone thought to write: `separateChannels`
 * survived four RFC revisions precisely because every cell it corrupted was a
 * cell nobody had a fixture for.
 *
 * ⚠ **Two halves, and neither is sufficient alone.** "A key never migrates" is
 * satisfiable by dropping every key; "the value survives" is satisfiable by the
 * repair this invariant exists to forbid. Blocks 1 and 2 below are that pair.
 *
 * The oracle is the FIXTURE: every expectation is re-derived from the route
 * string the property just built, so it cannot agree with a wrong classifier by
 * construction.
 *
 * **Mutationally validated, and the run rewrote the file.** Three mutants, each
 * re-introducing one removed mechanism:
 *
 * | mutant | caught by |
 * |---|---|
 * | the `forwardState` seam REPAIRS a mis-channelled bag again (stage ②) | blocks 6 + 7 |
 * | the chain fold routes a hop's `defaultParams` by the TARGET's declaration | block 7 |
 * | the registration check is removed | block 5 |
 *
 * ⚠ **The first draft caught NONE of them.** Blocks 1-5 alone were green on a
 * seam mutated back into repairing bags, because every refusal they assert fires
 * at the FACADE (P1, on the caller's raw argument) or at registration — both
 * upstream of the seam. The seam is reachable only through a bag the caller did
 * not write: an interceptor's injection (6) or a forwarding hop's defaults (7).
 * A second draft still missed it by reaching for `makeState`, whose literal form
 * (`{ resolveForward: false }`) does not touch the seam by construction.
 *
 * ⚠ **A fourth mutant survives, and that is CORRECT, not a gap.** Restoring the
 * defaults split inside `pipeline/canonicalize` / `StateNamespace.makeState`
 * changes nothing observable: it only moves a `defaultParams` key the route
 * declares with `?`, and the registration check makes such a config
 * unregistrable through every entry point (`createRouter` / `add` / `replace` /
 * `update` / `setRootPath`). Those two split sites were removable precisely
 * because the guard renders them dead — no property can distinguish dead code
 * from its absence, and one that appeared to would be asserting something else.
 */
describe("channel isolation — params and search meet only in the URL", () => {
  const arbName = fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/);

  /**
   * Four disjoint name pools, drawn as one tuple so no name can play two roles:
   * path slots, declared `?` names, and one undeclared name per channel.
   *
   * Disjointness is load-bearing rather than tidy. A name occupying BOTH a path
   * slot and a `?` declaration is the `/items/:id?id` carve-out (#843 / #1549),
   * where the params-bag value is legitimately path-owned — a different rule,
   * pinned separately in `queryChannelRegistry.properties.ts`. Folding it in
   * here would make the property assert the carve-out is a violation.
   */
  const arbShape = fc
    .uniqueArray(arbName, { minLength: 4, maxLength: 8 })
    .map((names) => ({
      pathSlots: names.slice(0, 2),
      queryNames: names.slice(2, 4),
      // May be empty — a route without spare names still exercises the
      // declared-only case.
      undeclaredPath: names[4],
      undeclaredQuery: names[5],
    }));

  const arbMode = fc.constantFrom("default", "loose", "strict" as const);

  const VALUE = "V";

  function buildRoute(shape: {
    pathSlots: string[];
    queryNames: string[];
  }): string {
    const slots = shape.pathSlots.map((slot) => `/:${slot}`).join("");

    return `/r${slots}?${shape.queryNames.join("&")}`;
  }

  const bagOf = (names: (string | undefined)[]): Params =>
    Object.fromEntries(
      names.filter((n): n is string => n !== undefined).map((n) => [n, VALUE]),
    );

  /** Same literal, the other channel's type. */
  const searchOf = (names: (string | undefined)[]): SearchParams =>
    bagOf(names) as SearchParams;

  /**
   * Every producer that builds a `State` from an intent, read through the
   * PUBLIC surface. `buildPath` is absent on purpose — it returns a string, so
   * it has no channels to keep apart; its agreement with these five is what
   * `entryPointConvergence.properties.ts` locks.
   */
  async function producedStates(
    router: Router,
    name: string,
    params: Params,
    search: SearchParams,
  ): Promise<{ label: string; params: Params; search: SearchParams }[]> {
    const api = getPluginApi(router);
    const navigated = await router.navigate(name, params, search, {
      reload: true,
    });
    const made = api.makeState(name, params, search);
    const built = api.buildNavigationState(name, params, search)!;
    const matched = api.matchPath(navigated.path)!;

    return [
      { label: "navigate", params: navigated.params, search: navigated.search },
      { label: "makeState", params: made.params, search: made.search },
      {
        label: "buildNavigationState",
        params: built.params,
        search: built.search,
      },
      { label: "matchPath", params: matched.params, search: matched.search },
    ];
  }

  // 1. NO MIGRATION. A name supplied in one channel never surfaces in the other
  //    — for any producer, any mode, whether it came from the caller or from
  //    the route's own defaults. This is the half `separateChannels` violated:
  //    it moved a declared `?` name out of the params bag, and every producer
  //    downstream published a bag its author had not written.
  test.prop([arbShape, arbMode], { numRuns: NUM_RUNS.standard })(
    "a name supplied in one channel never appears in the other",
    async (shape, mode) => {
      const router = createRouter([{ name: "r", path: buildRoute(shape) }], {
        queryParamsMode: mode,
      });

      const pathBag = bagOf([...shape.pathSlots, shape.undeclaredPath]);
      const queryBag = searchOf([...shape.queryNames, shape.undeclaredQuery]);

      await router.start("/");

      try {
        for (const produced of await producedStates(
          router,
          "r",
          pathBag,
          queryBag,
        )) {
          for (const key of Object.keys(pathBag)) {
            expect(
              Object.hasOwn(produced.search, key),
              `${produced.label}: path-channel \`${key}\` surfaced in search`,
            ).toBe(false);
          }

          for (const key of Object.keys(queryBag)) {
            expect(
              Object.hasOwn(produced.params, key),
              `${produced.label}: query-channel \`${key}\` surfaced in params`,
            ).toBe(false);
          }
        }
      } finally {
        router.stop();
      }
    },
  );

  // 2. AND THE VALUE SURVIVES — the half that stops block 1 from being
  //    satisfiable by dropping everything. Path slots and DECLARED query names
  //    must reach their own channel intact, in every mode.
  //
  //    ⚠ Undeclared names are deliberately excluded from this block: the mode
  //    gate (#1575) drops an undeclared query key under `default`/`strict` by
  //    design, and that is a DROP, not a migration — block 1 already forbids it
  //    reappearing in `params`. Asserting survival here would make the property
  //    contradict a shipped rule.
  test.prop([arbShape, arbMode], { numRuns: NUM_RUNS.standard })(
    "a path slot and a declared query name each reach their own channel intact",
    async (shape, mode) => {
      const router = createRouter([{ name: "r", path: buildRoute(shape) }], {
        queryParamsMode: mode,
      });

      const pathBag = bagOf(shape.pathSlots);
      const queryBag = searchOf(shape.queryNames);

      await router.start("/");

      try {
        for (const produced of await producedStates(
          router,
          "r",
          pathBag,
          queryBag,
        )) {
          for (const slot of shape.pathSlots) {
            expect(
              produced.params[slot],
              `${produced.label}: path slot \`${slot}\``,
            ).toBe(VALUE);
          }

          for (const declared of shape.queryNames) {
            expect(
              produced.search[declared],
              `${produced.label}: declared query \`${declared}\``,
            ).toBe(VALUE);
          }
        }
      } finally {
        router.stop();
      }
    },
  );

  // 3. THE SLOT IS THE CHANNEL, for the route's OWN defaults too. `defaultParams`
  //    feeds `state.params`, `defaultSearch` feeds `state.search`, and neither
  //    crosses over. This is the block that would have caught the defaults split
  //    the RFC carried for four revisions under "not stage ②, keeps working".
  test.prop([arbShape, arbMode], { numRuns: NUM_RUNS.standard })(
    "a route's own defaults land in the channel of the slot they were written in",
    async (shape, mode) => {
      const router = createRouter(
        [
          {
            name: "r",
            path: buildRoute(shape),
            defaultParams: bagOf(shape.pathSlots),
            defaultSearch: searchOf(shape.queryNames),
          },
        ],
        { queryParamsMode: mode },
      );

      await router.start("/");

      try {
        // Caller supplies NOTHING — every value below comes from a config slot.
        for (const produced of await producedStates(router, "r", {}, {})) {
          for (const slot of shape.pathSlots) {
            expect(produced.params[slot]).toBe(VALUE);
            expect(Object.hasOwn(produced.search, slot)).toBe(false);
          }

          for (const declared of shape.queryNames) {
            expect(produced.search[declared]).toBe(VALUE);
            expect(Object.hasOwn(produced.params, declared)).toBe(false);
          }
        }
      } finally {
        router.stop();
      }
    },
  );

  // 4. REFUSED, NOT REPAIRED. The other face of the same rule: a declared query
  //    name handed in the PATH bag is rejected outright. Without this block the
  //    first three are satisfiable by a router that silently drops such a key —
  //    quieter than the repair, and just as wrong.
  test.prop([arbShape, arbMode], { numRuns: NUM_RUNS.standard })(
    "a declared query name handed in the path bag is refused, not re-channelled",
    async (shape, mode) => {
      const router = createRouter([{ name: "r", path: buildRoute(shape) }], {
        queryParamsMode: mode,
      });

      await router.start("/");

      const misChannelled = {
        ...bagOf(shape.pathSlots),
        ...bagOf(shape.queryNames),
      };

      try {
        // SYNCHRONOUS on both, and that is the contract, not an accident: P1
        // fires at the facade on the caller's RAW argument, before a transition
        // exists, so `navigate` throws instead of rejecting — an argument-shape
        // defect must not be swallowable by a `.catch()` written for navigation
        // failures. (The seam's refusal, reached only when a `forwardTo` chain
        // resolves elsewhere, arrives as a rejection instead; pinned in
        // `forwardState.test.ts`.)
        expect(() =>
          getPluginApi(router).makeState("r", misChannelled),
        ).toThrow(/declares `/);
        expect(() =>
          router.navigate("r", misChannelled, {}, { reload: true }),
        ).toThrow(/declares `/);
      } finally {
        router.stop();
      }
    },
  );

  // 6. THE SEAM, which blocks 1-5 do NOT reach. Every refusal above fires at the
  //    FACADE (P1, on the caller's raw argument) or at registration — both
  //    upstream of the `forwardState` seam. So a seam that went back to
  //    REPAIRING bags would leave all five green, which is exactly what a
  //    mutation run showed. The seam is reachable only when the bag is not the
  //    caller's: an interceptor's injection is the shortest such path.
  test.prop([arbShape, arbMode], { numRuns: NUM_RUNS.standard })(
    "an interceptor injecting a declared query name into the path bag is refused at the seam",
    async (shape, mode) => {
      const router = createRouter([{ name: "r", path: buildRoute(shape) }], {
        queryParamsMode: mode,
      });
      const api = getPluginApi(router);
      const injected = shape.queryNames[0];

      api.addInterceptor("forwardState", (next, name, params, search) => {
        const result = next(name, params, search);

        return {
          ...result,
          params: { ...result.params, [injected]: VALUE },
        };
      });

      await router.start("/");

      try {
        // The caller's own bag is clean, so P1 passes and the seam is the only
        // thing between the injection and a committed state.
        //
        // ⚠ `buildNavigationState`, NOT `makeState`: the literal form
        // (`{ resolveForward: false }`) does not reach the seam by construction,
        // which is the whole reason the two classes exist. A first draft of this
        // block used `makeState` and was green on a seam that had been mutated
        // back into repairing bags.
        expect(() =>
          api.buildNavigationState("r", bagOf(shape.pathSlots), searchOf([])),
        ).toThrow(new RegExp(`declares \\\`${injected}\\\``));
      } finally {
        router.stop();
      }
    },
  );

  // 7. A FORWARDING HOP's defaults, the other bag the caller never wrote. Its
  //    channel comes from the SLOT, not from the target's declaration — and the
  //    mis-channelled spelling is refused at the seam, where the target is
  //    finally known. Registration cannot see this one: the hop's own
  //    declarations are clean.
  test.prop([arbShape, arbMode], { numRuns: NUM_RUNS.standard })(
    "a hop's defaults keep their slot's channel, and the mis-channelled spelling is refused",
    async (shape, mode) => {
      const target = buildRoute(shape);
      const legal = createRouter(
        [
          { name: "dst", path: target },
          {
            name: "src",
            path: "/src",
            forwardTo: "dst",
            defaultParams: bagOf(shape.pathSlots),
            defaultSearch: searchOf(shape.queryNames),
          },
        ],
        { queryParamsMode: mode },
      );

      await legal.start("/src");

      try {
        const state = legal.getState()!;

        for (const slot of shape.pathSlots) {
          expect(state.params[slot]).toBe(VALUE);
          expect(Object.hasOwn(state.search, slot)).toBe(false);
        }

        for (const declared of shape.queryNames) {
          expect(state.search[declared]).toBe(VALUE);
          expect(Object.hasOwn(state.params, declared)).toBe(false);
        }
      } finally {
        legal.stop();
      }

      // The same intent spelled into the path bag. The hop declares none of
      // these names, so registration passes and the seam is the only guard.
      const misChannelled = createRouter(
        [
          { name: "dst", path: target },
          {
            name: "src",
            path: "/src",
            forwardTo: "dst",
            defaultParams: {
              ...bagOf(shape.pathSlots),
              ...bagOf(shape.queryNames),
            },
          },
        ],
        { queryParamsMode: mode },
      );

      await expect(misChannelled.start("/src")).rejects.toThrow(/declares `/);

      misChannelled.stop();
    },
  );

  // 5. AND THE CONFIG FORM IS REFUSED AT REGISTRATION — the static half, where
  //    both sides are known before a single navigation. Its absence is what made
  //    removing the defaults split incomplete: the router accepted the config,
  //    built a state from it, and its own always-on guard rejected that state on
  //    `start()` — a WRONG_CHANNEL about a bag the caller never passed.
  test.prop([arbShape], { numRuns: NUM_RUNS.fast })(
    "a defaultParams naming a declared query key is refused at registration",
    (shape) => {
      expect(() =>
        createRouter([
          {
            name: "r",
            path: buildRoute(shape),
            defaultParams: bagOf(shape.queryNames),
          },
        ]),
      ).toThrow(/Move it to `defaultSearch`/);
    },
  );
});
