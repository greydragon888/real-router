import { fc, test } from "@fast-check/vitest";

import { createInputNode, createRootWithChildren, NUM_RUNS } from "./helpers";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { SegmentMatcher } from "../../../../src/engine/path-matcher/SegmentMatcher";

/**
 * Property-based coverage for param-name aliasing in the segment trie (#736).
 *
 * Invariant under test ("a trie position binds to exactly one name"):
 *
 * - **Conflict ⇒ throw.** Two routes that share a parametric (`:`) or splat
 *   (`*`) POSITION under DIFFERENT names are unrepresentable in the trie —
 *   registration MUST throw rather than silently let first-registration win the
 *   name and capture the second route's value under the wrong key.
 * - **Agreement ⇒ no aliasing.** When both routes use the SAME name at a shared
 *   position, registration succeeds and every matched value is captured under
 *   that one true name — never swapped, never dropped.
 *
 * These are the two halves of the same invariant: the matcher either rejects the
 * ambiguity loudly or matches it without key corruption — there is no silent
 * middle ground where `match()` returns a value under a name the terminal route
 * never declared.
 */

// A clean param identifier accepted by the build/scan grammar (`[:*][\w]+`).
const arbIdent = fc.stringMatching(/^[a-z]\w{0,9}$/);

// A pair of *distinct* identifiers — the precondition for a real conflict.
const arbDistinctIdents = fc
  .tuple(arbIdent, arbIdent)
  .filter(([a, b]) => a !== b);

/** Two sibling routes sharing the leading param position `/area/:<name>`. */
function buildSharedParamMatcher(
  nameA: string,
  nameB: string,
): () => SegmentMatcher {
  return () => {
    const matcher = createTestMatcher();

    const child = createInputNode({
      name: "child",
      path: "/end",
      fullName: "b.child",
    });
    const a = createInputNode({
      name: "a",
      path: `/area/:${nameA}`,
      fullName: "a",
    });
    const b = createInputNode({
      name: "b",
      path: `/area/:${nameB}`,
      fullName: "b",
      children: new Map([["child", child]]),
      nonAbsoluteChildren: [child],
    });

    matcher.registerTree(createRootWithChildren([a, b]));

    return matcher;
  };
}

describe("Param-name conflict properties (#736)", () => {
  describe("conflict ⇒ throw", () => {
    test.prop([arbDistinctIdents], { numRuns: NUM_RUNS.standard })(
      "distinct param names at a shared position throw at registration",
      ([nameA, nameB]) => {
        expect(buildSharedParamMatcher(nameA, nameB)).toThrow(
          /Parameter name conflict/,
        );
      },
    );

    test.prop([arbDistinctIdents], { numRuns: NUM_RUNS.standard })(
      "distinct splat names at a shared position throw at registration",
      ([nameA, nameB]) => {
        const build = (): SegmentMatcher => {
          const matcher = createTestMatcher();

          const a = createInputNode({
            name: "a",
            path: `/files/*${nameA}`,
            fullName: "a",
          });
          const b = createInputNode({
            name: "b",
            path: `/files/*${nameB}`,
            fullName: "b",
          });

          matcher.registerTree(createRootWithChildren([a, b]));

          return matcher;
        };

        expect(build).toThrow(/Parameter name conflict/);
      },
    );
  });

  describe("agreement ⇒ no aliasing", () => {
    test.prop([arbIdent, arbStr()], { numRuns: NUM_RUNS.standard })(
      "shared position with one agreed name captures under that name only",
      (paramName, value) => {
        const matcher = createTestMatcher();

        const child = createInputNode({
          name: "child",
          path: "/end",
          fullName: "b.child",
        });
        // `a` shares the `:${paramName}` position with `b`/`b.child` but terminates
        // DEEPER (`/leaf`), so the #736 same-name reuse is exercised without a
        // #1153 duplicate effective path (which `a` == `b` at `/area/:${paramName}`
        // would now, correctly, be).
        const a = createInputNode({
          name: "a",
          path: `/area/:${paramName}/leaf`,
          fullName: "a",
        });
        const b = createInputNode({
          name: "b",
          path: `/area/:${paramName}`,
          fullName: "b",
          children: new Map([["child", child]]),
          nonAbsoluteChildren: [child],
        });

        matcher.registerTree(createRootWithChildren([a, b]));

        // Both the shallow route (b) and the deeper route (b.child) must bind the
        // shared position under exactly `paramName` — no swap, no extra keys.
        const shallow = matcher.match(`/area/${value}`);
        const deep = matcher.match(`/area/${value}/end`);

        expect(shallow?.params).toStrictEqual({ [paramName]: value });
        expect(deep?.params).toStrictEqual({ [paramName]: value });

        // Every captured key must belong to the terminal route's declared params.
        for (const result of [shallow, deep]) {
          const declared = new Set(
            result!.segments.flatMap((s) => [...s.paramMeta.urlParams]),
          );

          for (const key of Object.keys(result!.params)) {
            expect(declared.has(key)).toBe(true);
          }
        }
      },
    );
  });
});

/**
 * A name-less marker (#858): a bare `:` / `*`, optionally carrying ONLY a
 * constraint and/or optional `?` modifier but still no name. Each compiles to a
 * phantom empty-named slot (match captures under `""`, build emits the literal
 * marker, buildParamMeta sees no param) and MUST be rejected at registration —
 * the same match/build/meta desync class as #736/#738.
 */
const arbNamelessMarker = fc.constantFrom(
  ":",
  "*",
  ":?",
  String.raw`:<\d+>`,
  ":<[a-z]+>?",
);

// A clean static segment, used only to vary the marker's position in the path.
const arbStaticSeg = fc.stringMatching(/^[a-z]{1,6}$/);

describe("Name-less marker rejection (#858)", () => {
  test.prop([fc.array(arbStaticSeg, { maxLength: 3 }), arbNamelessMarker], {
    numRuns: NUM_RUNS.standard,
  })(
    "a bare ':' or '*' (no name) is rejected at registration, at any position",
    (prefix, marker) => {
      const path = `/${[...prefix, marker].join("/")}`;

      const build = (): SegmentMatcher => {
        const matcher = createTestMatcher();

        matcher.registerTree(
          createRootWithChildren([
            createInputNode({ name: "r", path, fullName: "r" }),
          ]),
        );

        return matcher;
      };

      expect(build).toThrow(/Empty parameter name/);
    },
  );
});

// URL-safe single-segment value (no "/", no reserved chars).
function arbStr(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-zA-Z0-9_\-.~]{1,15}$/);
}
