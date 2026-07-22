import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  arbIdParam,
  arbSearchParams,
  NUM_RUNS,
} from "./helpers";

/**
 * `:id` values that REQUIRE percent-encoding yet still roundtrip cleanly: every
 * value contains a literal space, so a correct `buildPath` must emit `%20` (and
 * never a raw space), and `matchPath` must decode it back. The surrounding
 * alphanumerics keep the value match-safe. `arbIdParam` (the `[a-zA-Z0-9_-]`
 * charset used by the other roundtrip tests) never needs encoding, so a
 * `decode∘encode` roundtrip over it is BLIND to under-encoding — `encode=identity`
 * survives it. This generator + the anti-identity assert below close that gap.
 */
const arbEncodableId = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9]{1,4}$/),
    fc.stringMatching(/^[a-zA-Z0-9]{1,4}$/),
  )
  .map(([a, b]) => `${a} ${b}`);

describe("buildPath ↔ matchPath Roundtrip Properties", () => {
  const router = createFixtureRouter();
  const pluginApi = getPluginApi(router);

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "roundtrip: matchPath(buildPath(name, params)) preserves name and params",
    (params) => {
      const path = router.buildPath("users.view", params);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(matched!.name).toBe("users.view");
      // Path params are always strings after URL decode
      expect(matched!.params).toStrictEqual({ id: params.id });
    },
  );

  test.prop([arbEncodableId], { numRuns: NUM_RUNS.standard })(
    "encode-requiring values: buildPath actually percent-encodes AND roundtrips",
    (id) => {
      const path = router.buildPath("users.view", { id });

      // Anti-identity: a value needing encoding must NOT appear raw — the space
      // must be percent-encoded. A roundtrip alone can't see this (permissive
      // decode inverts raw segments too, so encode=identity would survive it);
      // this assert is what catches under-encoding / a stripped encoder.
      expect(path).not.toContain(" ");
      expect(path).toContain("%20");

      // Roundtrip: decode recovers the exact original value (catches over/wrong
      // decode in the other direction).
      const matched = pluginApi.matchPath(path);

      expect(matched!.name).toBe("users.view");
      expect(matched!.params).toStrictEqual({ id });
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "buildPath always starts with /",
    (params) => {
      const path = router.buildPath("users.view", params);

      expect(path.startsWith("/")).toBe(true);
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "determinism: same args produce same path",
    (params) => {
      const path1 = router.buildPath("users.view", params);
      const path2 = router.buildPath("users.view", params);

      expect(path1).toBe(path2);
    },
  );

  test.prop([arbSearchParams], { numRuns: NUM_RUNS.standard })(
    "query params roundtrip: search route preserves q and page values",
    (params) => {
      const path = router.buildPath("search", params);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(matched!.name).toBe("search");

      // numberFormat: "auto" converts canonical numeric strings to numbers.
      // Roundtrip preserves VALUE but may change TYPE (string→number). Query
      // values now live in `state.search`, not `state.params` (RFC-4 M2 / #1548).
      const q = matched!.search.q as string | number;
      const page = matched!.search.page as string | number;

      expect(`${q}`).toBe(params.q);
      expect(`${page}`).toBe(params.page);
    },
  );

  it("buildPath with no params uses defaults for static routes", () => {
    const path = router.buildPath("home");

    expect(path).toBe("/");
  });
});
