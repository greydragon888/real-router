import { fc, test } from "@fast-check/vitest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStartedRouter, arbFixtureRoute, NUM_RUNS } from "./helpers";

import type { Router } from "@real-router/core";

describe("isActiveRoute Properties", () => {
  let router: Router;

  beforeAll(async () => {
    router = await createStartedRouter("/users/abc");
  });

  afterAll(() => {
    router.stop();
  });

  it("current route with its params is always active", () => {
    const state = router.getState()!;

    expect(router.isActiveRoute(state.name, state.params)).toBe(true);
  });

  it("current route with exact params is active (strictEquality)", () => {
    const state = router.getState()!;

    expect(
      router.isActiveRoute(state.name, state.params, undefined, true),
    ).toBe(true);
  });

  it("ancestor of current route is active", () => {
    const state = router.getState()!;

    expect(state.name).toBe("users.view");
    expect(router.isActiveRoute("users")).toBe(true);
  });

  it("strictEquality blocks ancestor match", () => {
    expect(router.isActiveRoute("users", {}, undefined, true)).toBe(false);
  });

  // #1554 — both branches (exact via areStatesEqual, hierarchical via
  // paramsMatch) must answer independently of how the value was written: the URL
  // decode hands a path slot over as a string, a caller commonly passes a number.
  test.prop([fc.integer({ min: 0, max: 99_999 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "provenance independence: numeric path param matches its URL form",
    async (id) => {
      const provenanceRouter = await createStartedRouter(`/users/${id}`);

      try {
        // exact branch
        expect(provenanceRouter.isActiveRoute("users.view", { id })).toBe(true);
        expect(
          provenanceRouter.isActiveRoute("users.view", { id }, undefined, true),
        ).toBe(true);
        // hierarchical branch (ancestor carrying the descendant's param)
        expect(
          provenanceRouter.isActiveRoute(
            "users",
            { id },
            undefined,
            false,
            false,
          ),
        ).toBe(true);
      } finally {
        provenanceRouter.stop();
      }
    },
  );

  test.prop([arbFixtureRoute, fc.boolean()], { numRuns: NUM_RUNS.fast })(
    "monotonicity of strict: strict=true → strict=false",
    (name, ignoreQP) => {
      const params = router.getState()!.params;
      const strictResult = router.isActiveRoute(
        name,
        params,
        undefined,
        true,
        ignoreQP,
      );
      const looseResult = router.isActiveRoute(
        name,
        params,
        undefined,
        false,
        ignoreQP,
      );

      if (strictResult) {
        expect(looseResult).toBe(true);
      }
    },
  );

  test.prop([arbFixtureRoute, fc.boolean()], { numRuns: NUM_RUNS.fast })(
    "monotonicity of ignoreQueryParams: ignoreQP=false → ignoreQP=true",
    (name, strict) => {
      const params = router.getState()!.params;
      const withQP = router.isActiveRoute(
        name,
        params,
        undefined,
        strict,
        false,
      );
      const withoutQP = router.isActiveRoute(
        name,
        params,
        undefined,
        strict,
        true,
      );

      if (withQP) {
        expect(withoutQP).toBe(true);
      }
    },
  );

  // #1978 — the CLASS: a key the route declares in neither channel rides in
  // `state.params` as app-level data (#1579) and never reaches `state.path`, so
  // it is not part of the location and must not move ANY verdict — on the
  // committed STATE or in the LINK's own bag, under either polarity, on either
  // arm. Written as a comparison against the same call without the key, so it
  // discriminates without hard-coding either answer.
  //
  // ⚠ The line is what the committed STATE carries, not what the path prints:
  // a `defaultParams` key reaches no URL and still decides, on both arms and
  // both polarities (its own cells pin that). The fixture declares no such
  // default, so every generated key is genuinely absent from `state.params`.
  //
  // The domain is what the properties above lack: they read `getState().params`
  // from a fixture whose committed state carries only declared slots, so the
  // shape this covers was unreachable from them.
  test.prop(
    [
      fc
        .stringMatching(/^[a-z]{1,8}$/)
        .filter((key) => key !== "id" && key !== "section"),
      fc.stringMatching(/^[a-z0-9]{1,8}$/),
      fc.boolean(),
      fc.boolean(),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "a key declared in neither channel moves no verdict",
    async (extraKey, extraValue, strict, ignoreQP) => {
      const clean = await createStartedRouter("/home");
      const tainted = await createStartedRouter("/home");

      try {
        await clean.navigate("users.view", { id: "abc" });
        await tainted.navigate("users.view", {
          id: "abc",
          [extraKey]: extraValue,
        });

        // The key really did land in `params` and really is absent from the URL
        // — without this the property is vacuous on any generated key the
        // router happens to drop.
        expect(tainted.getState()!.params[extraKey]).toBe(extraValue);
        expect(tainted.getState()!.path).toBe(clean.getState()!.path);

        for (const [name, params] of [
          ["users.view", { id: "abc" }],
          ["users", {}],
        ] as const) {
          // (a) the key is on the STATE — the link never mentions it
          expect(
            tainted.isActiveRoute(name, params, undefined, strict, ignoreQP),
          ).toBe(
            clean.isActiveRoute(name, params, undefined, strict, ignoreQP),
          );

          // (b) the key is on the LINK — the state never carries it. Same rule,
          // the other side, and on BOTH arms: no route config declares it, so
          // it reaches no URL and decides nothing.
          expect(
            clean.isActiveRoute(
              name,
              { ...params, [extraKey]: extraValue },
              undefined,
              strict,
              ignoreQP,
            ),
          ).toBe(
            clean.isActiveRoute(name, params, undefined, strict, ignoreQP),
          );
        }
      } finally {
        clean.stop();
        tainted.stop();
      }
    },
  );

  it("empty string always returns false", () => {
    expect(router.isActiveRoute("")).toBe(false);
  });
});
