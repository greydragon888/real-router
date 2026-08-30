import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * A parent whose path ends in `/` made EVERY child of it unreachable (#2002).
 *
 * `buildFullPath` concatenated, so a child's full path carried a DOUBLE slash —
 * `buildFullPath("/files/list/", "/detail") === "/files/list//detail"` — and the
 * trie registered the route at that doubled path. The child then built a URL its
 * own `matchPath` refuses, and the natural URL matched nothing at all.
 *
 * ⚠ This is not about splats or index routes, though that is how it was found.
 * #1996 closed the `setRootPath` half of the §5.4 splat guard; the four
 * route-config doors reached a DIFFERENT root, and this is it. Ordinary nesting
 * is the common case and was silently broken by a trailing slash in the parent's
 * path.
 *
 * ⚑ The repair is forced. A narrowed fix to `isSlashChild` (compare after
 * stripping every trailing slash) corrects the index CLASSIFICATION and leaves
 * ordinary children broken — measured, because `isSlashChild` is not consulted
 * for a non-index child. Only collapsing the separator fixes both.
 *
 * ⚠ And the index case's convergence is NOT separable: today's behaviour for a
 * static parent (`p.idx` building `"/files/list/"` and matching `p`) exists
 * because the index is misclassified as a standard route. Both candidate fixes
 * produce the identical change there, so scoping cannot avoid it.
 */
describe("a trailing slash in a parent's path no longer breaks its children (#2002)", () => {
  describe("ordinary children — the common case, and the headline", () => {
    const nested = (parentPath: string) =>
      createRouter([
        {
          name: "p",
          path: parentPath,
          children: [{ name: "c", path: "/detail" }],
        },
      ]);

    it("builds a URL its own matchPath accepts", () => {
      const r = nested("/files/list/");

      expect(r.buildPath("p.c", {})).toBe("/files/list/detail");
      expect(getPluginApi(r).matchPath("/files/list/detail")).toBeDefined();
    });

    it("agrees with the same tree written without the trailing slash", () => {
      // The whole point: the parent's trailing slash stops being observable.
      const withSlash = nested("/files/list/");
      const without = nested("/files/list");

      expect(withSlash.buildPath("p.c", {})).toBe(without.buildPath("p.c", {}));
    });

    it("does the same under a SPLAT parent", () => {
      const r = createRouter([
        {
          name: "p",
          path: "/files/*rest/",
          children: [{ name: "c", path: "/detail" }],
        },
      ]);

      expect(r.buildPath("p.c", { rest: "a/b" })).toBe("/files/detail");
      expect(getPluginApi(r).matchPath("/files/detail")).toBeDefined();
    });

    it("CONTROL — a parent WITHOUT a trailing slash is untouched", () => {
      const r = nested("/files/list");

      expect(r.buildPath("p.c", {})).toBe("/files/list/detail");
      expect(getPluginApi(r).matchPath("/files/list/detail")).toBeDefined();
    });

    it("CONTROL — a slash-LESS child path converges the same way", () => {
      // ⚠ This cell was first written as "a child that does not start with a
      // slash is untouched" and used `/detail`, which does — a vacuous control.
      // Measured, a slash-less child IS legal and `createNode` normalises it to
      // a leading `/` before `buildFullPath` runs (#1407), so both parent
      // spellings must land on the same URL.
      const withSlash = createRouter([
        {
          name: "p",
          path: "/files/list/",
          children: [{ name: "c", path: "detail" }],
        },
      ]);
      const without = createRouter([
        {
          name: "p",
          path: "/files/list",
          children: [{ name: "c", path: "detail" }],
        },
      ]);

      expect(withSlash.buildPath("p.c", {})).toBe("/files/list/detail");
      expect(without.buildPath("p.c", {})).toBe("/files/list/detail");
      expect(
        getPluginApi(withSlash).matchPath("/files/list/detail"),
      ).toBeDefined();
    });
  });

  describe("the index case, which is how this was found", () => {
    it("refuses an index under a splat parent through every route-config door", () => {
      // These were the #1996 boundary pins, asserting the broken behaviour.
      // The guard is reached now, so they invert.
      const REFUSAL = /Index route .* is not supported/;

      expect(() =>
        createRouter([
          {
            name: "p",
            path: "/files/*rest/",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).toThrow(REFUSAL);
    });

    it("a STATIC parent's index converges on the no-trailing-slash form", () => {
      // ⚠ The unavoidable behaviour change. Before: `p.idx` built
      // "/files/list/" and that URL matched `p`. Now both spellings of the
      // parent produce the identical tree.
      const withSlash = createRouter([
        {
          name: "p",
          path: "/files/list/",
          children: [{ name: "idx", path: "/" }],
        },
      ]);
      const without = createRouter([
        {
          name: "p",
          path: "/files/list",
          children: [{ name: "idx", path: "/" }],
        },
      ]);

      expect(withSlash.buildPath("p.idx", {})).toBe("/files/list");
      expect(withSlash.buildPath("p.idx", {})).toBe(
        without.buildPath("p.idx", {}),
      );

      const matched = getPluginApi(withSlash).matchPath("/files/list") as
        { name: string } | undefined;

      expect(matched?.name).toBe("p.idx");
    });
  });
});
