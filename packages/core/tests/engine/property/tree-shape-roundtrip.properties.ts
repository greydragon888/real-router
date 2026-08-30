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
 * `inverse-half.properties.ts`) assert the same invariant and are GREEN on the
 * broken code, because their generator varies param VALUES over fixed,
 * hand-written trees — fifteen route paths across the fixtures, not one of them
 * ending in a trailing slash. #2002 lived in how paths COMPOSE, and nothing
 * varied composition.
 *
 * ⚑ Measured, both directions: against the pre-#2002 build this reports **1227
 * violations in 3000 shapes** (41 % of the space) and shrinks to the minimal
 * counterexample `/s0/ > /s1` building `/s0//s1`; on this branch it is green.
 * Three audit rounds found six of those shapes by hand; the generator found the
 * class in one run.
 *
 * ⚑ **The precondition is AMBIGUITY, and it is computed rather than assumed.**
 * A round-trip cannot hold where two routes claim one URL — `matchPath` must
 * answer with exactly one of them, and which one is a different contract. So the
 * property builds every route in the tree first and asserts only for the URLs
 * that exactly ONE route produces.
 *
 * ⚠ Written first as "exclude absolute (`~`) segments", which was the wrong
 * shape of exclusion: `~` is a supported, documented path format (`engine/
 * ARCHITECTURE.md`, "Absolute with tilde — override parent path"), so excluding
 * it left a supported format ungenerated — the very blind spot this file exists
 * to close. Absolutes are generated here; what removes the noise instead is the
 * per-segment static discriminator in `segPath`, which makes a tree unambiguous
 * BY CONSTRUCTION rather than filtering ambiguity afterwards.
 *
 * ⚑ Removing that exclusion is what found #2006 — `buildPath` ignores the root
 * path for an absolute route while `matchPath` strips it, so an absolute SPLAT
 * whose value puts the mount segment at the front builds an href the router then
 * refuses (mount `/app`, `~/*rest`, `rest="app/docs"` -> `undefined`).
 *
 * ⚠ **That shape is NOT generated here any more, and this note is the gap.** The
 * discriminator prefixes every segment, so an absolute splat now builds
 * `/d2/...` and can no longer collide with a mount point. A skip pointing at
 * #2006 was added and then removed as DEAD — measured, the suite is green
 * without it. #2006 needs its own regression cell; do not read this property as
 * covering it.
 */

interface Seg {
  readonly kind: "static" | "param" | "splat" | "index";
  readonly slash: boolean;
  readonly query: boolean;
  readonly absolute: boolean;
}

const arbSegment: fc.Arbitrary<Seg> = fc.record({
  kind: fc.constantFrom("static", "param", "splat", "index"),
  // The term that matters: a path written WITH a trailing slash must behave
  // exactly like the same path written without one.
  slash: fc.boolean(),
  query: fc.boolean(),
  absolute: fc.boolean(),
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

  // ⚑ Every segment carries a UNIQUE STATIC discriminator (`d${depth}`), and
  // that is what makes the invariant assertable rather than a filter applied
  // afterwards. Without it a generated tree is routinely ambiguous BY DESIGN —
  // `/:p0/:p1` matches any two segments, so it swallows what `/*w2` builds; an
  // absolute descendant ignores its ancestors, so it lands on their URLs. In
  // those trees several routes legitimately match one URL and `matchPath`
  // answering with one of them is correct, so there is no round-trip to assert.
  // Filtering by what routes BUILD cannot see it — the competition is between
  // what one route builds and what ANOTHER matches. A distinct static prefix
  // removes pattern overlap at the source and leaves the axes this property is
  // about — trailing slash, absolute marker, query declaration, nesting depth —
  // fully generated.
  const marker = segment.absolute && depth > 0 ? "~" : "";
  const tail = segment.slash ? "/" : "";
  const query = segment.query ? `?q${depth}` : "";

  return `${marker}/d${depth}/${BODY[segment.kind]}${tail}${query}`;
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
        // index under a splat parent, a tilde under a parameterised parent)
        // carries no invariant.
        return;
      }

      const params: Record<string, string> = {};

      segments.forEach((segment, index) => {
        if (segment.kind === "param") {
          params[`p${index}`] = "v";
        } else if (segment.kind === "splat") {
          params[`w${index}`] = "a/b";
        }
      });

      // ⚠ A NON-FINAL splat has no round-trip to assert, and that is #1568's
      // documented contract rather than a shape being dodged: such a splat
      // "matches empty and `buildPath` omits it", so the URL a route builds
      // deliberately does not carry its full pattern. Measured, this is the one
      // term that makes the invariant inapplicable once absolute segments are
      // generated — `/*w0 > /s1` round-trips on its own, `/p > /s1 > ~/:p2`
      // round-trips on its own, and only the two together let a sibling take the
      // shortened URL.
      const lastSplat = segments.findLastIndex(
        (segment) => segment.kind === "splat",
      );

      if (lastSplat !== -1 && lastSplat !== segments.length - 1) {
        return;
      }

      // Build EVERY route first: a URL two routes claim carries no round-trip.
      const built = new Map<string, string>();
      const claims = new Map<string, number>();

      for (let depth = 0; depth < segments.length; depth += 1) {
        const name = segments
          .slice(0, depth + 1)
          .map((_, index) => `n${index}`)
          .join(".");

        const url = router.buildPath(name, params);

        built.set(name, url);
        claims.set(url, (claims.get(url) ?? 0) + 1);
      }

      for (const [name, url] of built) {
        if (claims.get(url) !== 1) {
          continue;
        }

        const matched = getPluginApi(router).matchPath(url) as
          { name: string } | undefined;

        expect(matched, `${paths.join(" > ")} built ${url}`).toBeDefined();
        expect(matched?.name, `${paths.join(" > ")} built ${url}`).toBe(name);
      }
    },
  );
});
