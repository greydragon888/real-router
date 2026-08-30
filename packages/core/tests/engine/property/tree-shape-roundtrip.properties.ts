import { fc, test } from "@fast-check/vitest";

import { NUM_RUNS } from "./helpers";
import { getPluginApi } from "../../../src/api";
import { createRouter } from "../../../src/createRouter";

/**
 * The URL a router BUILDS matches back to the route that built it — over
 * generated TREE SHAPES, not generated param values (#2002).
 *
 * ⚠ This axis was the blind spot that let #1996 and #2002 both ship. The
 * existing round-trip properties (`roundtrip.properties.ts`,
 * `inverse-half.properties.ts`) are strong on the VALUE axis and structurally
 * cannot see this one: they generate param values over ~15 hand-written route
 * paths, and not one of those paths ends in a trailing slash. #2002 lived in how
 * paths COMPOSE, so nothing varied it.
 *
 * ⚑ Measured, which is why this file exists rather than another hand-written
 * cell: against the pre-#2002 build this property reports **1227 violations in
 * 3000 shapes** — 41 % of the generated space — and it is green on every one of
 * them now. A hand-enumerated list found six of those shapes across three audit
 * rounds; the generator found the class in one run.
 *
 * ⚠ ABSOLUTE segments (`~`) are excluded, and the reason is that the invariant
 * does not APPLY to them here rather than that they pass. An absolute descendant
 * ignores its ancestors, so a generated tree routinely lands two or three routes
 * on one URL — measured, `setRootPath("/a/b/")` over `/` > `/` > `~/*w2` has all
 * three routes building `"/a/b"`. `matchPath` answering with one of them is
 * correct for an ambiguous tree, not a round-trip violation. Their structural
 * round-trip is covered by `tree.properties.ts`'s absolute pool.
 */

interface Seg {
  readonly kind: "static" | "param" | "splat" | "index";
  readonly slash: boolean;
  readonly query: boolean;
}

const arbSegment: fc.Arbitrary<Seg> = fc.record({
  kind: fc.constantFrom("static", "param", "splat", "index"),
  // The term that matters: a path written WITH a trailing slash must behave
  // exactly like the same path written without one.
  slash: fc.boolean(),
  query: fc.boolean(),
});

const arbTree = fc.array(arbSegment, { minLength: 1, maxLength: 4 });

// The root path is a junction like any other, and the severest form of #2002
// lived here: a trailing slash on the mount point made EVERY route unmatchable.
const arbRoot = fc.constantFrom("", "/app", "/app/", "/", "/a/b/");

function segPath(segment: Seg, depth: number): string {
  if (segment.kind === "index") {
    return "/";
  }

  const BODY = {
    static: `s${depth}`,
    param: `:p${depth}`,
    splat: `*w${depth}`,
  } as const;

  const tail = segment.slash ? "/" : "";
  const query = segment.query ? `?q${depth}` : "";

  return `/${BODY[segment.kind]}${tail}${query}`;
}

describe("Tree-shape roundtrip properties (#2002)", () => {
  test.prop([arbTree, arbRoot], { numRuns: NUM_RUNS.thorough })(
    "a URL the router builds matches back to the route that built it",
    (segments: Seg[], rootPath: string) => {
      const paths = segments.map((segment, index) => segPath(segment, index));

      let definition: Record<string, unknown> = {
        name: `n${segments.length - 1}`,
        path: paths[segments.length - 1],
      };

      for (let index = segments.length - 2; index >= 0; index -= 1) {
        definition = {
          name: `n${index}`,
          path: paths[index],
          children: [definition],
        };
      }

      let router;

      try {
        router = createRouter([definition as never]);

        if (rootPath !== "") {
          getPluginApi(router).setRootPath(rootPath);
        }
      } catch {
        // A shape registration legitimately refuses (a duplicate param name, an
        // index under a splat parent, a duplicate path) carries no invariant.
        return;
      }

      const name = segments.map((_, index) => `n${index}`).join(".");
      const params: Record<string, string> = {};

      segments.forEach((segment, index) => {
        if (segment.kind === "param") {
          params[`p${index}`] = "v";
        } else if (segment.kind === "splat") {
          params[`w${index}`] = "a/b";
        }
      });

      const built = router.buildPath(name, params);
      const matched = getPluginApi(router).matchPath(built) as
        { name: string } | undefined;

      expect(matched, `${paths.join(" > ")} built ${built}`).toBeDefined();
      expect(matched?.name, `${paths.join(" > ")} built ${built}`).toBe(name);
    },
  );
});
