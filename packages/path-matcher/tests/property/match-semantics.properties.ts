import { fc, test } from "@fast-check/vitest";

import {
  arbEncoding,
  arbNonNumericParam,
  arbNumericParam,
  createConstrainedMatcher,
  createInputNode,
  createParamMatcher,
  createRootWithChildren,
  NUM_RUNS,
} from "./helpers";
import { createTestMatcher } from "../helpers/createTestMatcher";

import type { SegmentMatcher } from "../../src/SegmentMatcher";

const arbSeg = fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/);
const arbMultiSeg = fc
  .array(arbSeg, { minLength: 2, maxLength: 4 })
  .map((segs) => segs.join("/"));

// =============================================================================
// P2.4 — strictTrailingSlash (match): trailing-slash-ness of input must equal
// the route's. (The build-side `trailingSlash:"never"` branch is unreachable in
// isolation — buildStaticParts is already normalized — and is handled by core.)
// =============================================================================

describe("strictTrailingSlash matching", () => {
  test.prop([arbSeg], { numRuns: NUM_RUNS.standard })(
    "route without a trailing slash rejects a trailing-slash input",
    (seg) => {
      const matcher = createTestMatcher({ strictTrailingSlash: true });
      const node = createInputNode({
        name: seg,
        path: `/${seg}`,
        fullName: seg,
      });

      matcher.registerTree(createRootWithChildren([node]));

      expect(matcher.match(`/${seg}`)?.segments.at(-1)?.fullName).toBe(seg);
      expect(matcher.match(`/${seg}/`)).toBeUndefined();
    },
  );

  test.prop([arbSeg], { numRuns: NUM_RUNS.standard })(
    "route declared with a trailing slash requires a trailing-slash input",
    (seg) => {
      const matcher = createTestMatcher({ strictTrailingSlash: true });
      const node = createInputNode({
        name: seg,
        path: `/${seg}/`,
        fullName: seg,
      });

      matcher.registerTree(createRootWithChildren([node]));

      expect(matcher.match(`/${seg}/`)?.segments.at(-1)?.fullName).toBe(seg);
      expect(matcher.match(`/${seg}`)).toBeUndefined();
    },
  );

  test.prop([arbSeg], { numRuns: NUM_RUNS.standard })(
    "without strictTrailingSlash, both forms match",
    (seg) => {
      const matcher = createTestMatcher({ strictTrailingSlash: false });
      const node = createInputNode({
        name: seg,
        path: `/${seg}`,
        fullName: seg,
      });

      matcher.registerTree(createRootWithChildren([node]));

      expect(matcher.match(`/${seg}`)).toBeDefined();
      expect(matcher.match(`/${seg}/`)).toBeDefined();
    },
  );
});

// =============================================================================
// P3.5 — constraint filtering at match time
// =============================================================================

describe("constraint filtering at match time", () => {
  test.prop([arbNonNumericParam], { numRuns: NUM_RUNS.standard })(
    "a value violating the constraint is rejected (route filtered → undefined)",
    (id) => {
      const matcher = createConstrainedMatcher(); // /users/:id<\d+>

      expect(matcher.match(`/users/${id}`)).toBeUndefined();
    },
  );

  test.prop([arbNumericParam], { numRuns: NUM_RUNS.standard })(
    "a value satisfying the constraint is admitted and captured",
    (id) => {
      const matcher = createConstrainedMatcher();

      expect(matcher.match(`/users/${id}`)?.params).toStrictEqual({ id });
    },
  );

  test.prop([arbNumericParam], { numRuns: NUM_RUNS.standard })(
    "an over-encoded value matches when its DECODED form satisfies the constraint (#857)",
    (id) => {
      const matcher = createConstrainedMatcher(); // /users/:id<\d+>

      // Percent-encode every digit ("5" → "%35"); the raw form does NOT match
      // \d+, but it decodes back to `id`, which does. The constraint is checked
      // on the decoded value, so the route must match and recover `id`. With the
      // old pre-decode order the raw "%3X…" was rejected → undefined.
      const overEncoded = id.replaceAll(/\d/g, (digit) => `%3${digit}`);

      expect(matcher.match(`/users/${overEncoded}`)?.params).toStrictEqual({
        id,
      });
    },
  );
});

// =============================================================================
// buildPath — empty-required-param rejection (#740). Previously guarded only by
// unit tests; the mutation campaign showed the property suite did not catch
// removing the throw. This asserts the dichotomy across the value space.
// =============================================================================

describe("buildPath empty required param", () => {
  // Printable ASCII incl. the empty string (avoids encoder throws on lone
  // surrogates, which is a separate concern).
  const arbRequestValue = fc.stringMatching(/^[ -~]{0,12}$/);

  test.prop([arbRequestValue], { numRuns: NUM_RUNS.thorough })(
    "throws iff a required param value is the empty string",
    (value) => {
      const build = (): string =>
        createParamMatcher().buildPath("users.profile", { id: value });

      if (value === "") {
        expect(build).toThrow(/empty string/);
      } else {
        expect(build).not.toThrow();
      }
    },
  );
});

// =============================================================================
// P3.6 — splat backtracking: a splat node with a child route prefers the more
// specific child for a matching remainder, else captures the wildcard.
// =============================================================================

describe("splat backtracking", () => {
  function splatWithChild(): SegmentMatcher {
    const matcher = createTestMatcher();
    const item = createInputNode({
      name: "item",
      path: "/:id",
      fullName: "files.item",
    });
    const files = createInputNode({
      name: "files",
      path: "/files/*path",
      fullName: "files",
      children: new Map([["item", item]]),
      nonAbsoluteChildren: [item],
    });

    matcher.registerTree(createRootWithChildren([files]));

    return matcher;
  }

  test.prop([arbSeg], { numRuns: NUM_RUNS.standard })(
    "a single-segment remainder resolves to the more-specific child route",
    (seg) => {
      const result = splatWithChild().match(`/files/${seg}`);

      expect(result?.segments.at(-1)?.fullName).toBe("files.item");
      expect(result?.params).toStrictEqual({ id: seg });
    },
  );

  test.prop([arbMultiSeg], { numRuns: NUM_RUNS.standard })(
    "a multi-segment remainder falls back to the wildcard capture",
    (rest) => {
      const result = splatWithChild().match(`/files/${rest}`);

      expect(result?.segments.at(-1)?.fullName).toBe("files");
      expect(result?.params).toStrictEqual({ path: rest });
    },
  );
});

// =============================================================================
// P3.7 — `match()` never throws, across the full option matrix × any input.
// =============================================================================

describe("match() never-throw across option matrix", () => {
  const arbOptions = fc.record({
    caseSensitive: fc.boolean(),
    strictTrailingSlash: fc.boolean(),
    strictQueryParams: fc.boolean(),
    urlParamsEncoding: arbEncoding,
  });

  test.prop([arbOptions, fc.string({ maxLength: 40 })], {
    numRuns: NUM_RUNS.thorough,
  })(
    "no option combination makes match() throw on arbitrary input",
    (options, raw) => {
      const matcher = createParamMatcher(options);

      expect(() => matcher.match(raw)).not.toThrow();
      expect(() => matcher.match(`/users/${raw}`)).not.toThrow();
      expect(() => matcher.match(`/users/${raw}/profile`)).not.toThrow();
      expect(() => matcher.match(`/users?x=${raw}`)).not.toThrow();
    },
  );
});
