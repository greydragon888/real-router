import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, cloneRouter } from "@real-router/core/api";

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

    it("a slash-LESS child path converges the same way", () => {
      // ⚠ Twice mislabelled before it was right. First written as "a child that
      // does not start with a slash is untouched" using `/detail`, which does —
      // a vacuous control. Then kept the CONTROL label, which was also wrong:
      // measured, it FAILS without the fix, so it discriminates and is a cell.
      // The genuine controls in this file are the no-trailing-slash parent and
      // the absolute child, both of which hold either way.
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

  describe("the ROOT path is a parent too — the severest form", () => {
    it("a trailing slash on the root path no longer breaks EVERY route", () => {
      // ⚠ Found by attacking the fix, and it is the worst expression of this
      // defect: before, `setRootPath("/app/")` made every route in the tree
      // unmatchable, top-level ones included — `p` built "/app//list" and
      // matched nothing. A mount point written with a trailing slash is an
      // ordinary thing to write.
      const mounted = (rootPath: string) => {
        const r = createRouter([
          {
            name: "p",
            path: "/list",
            children: [{ name: "c", path: "/detail" }],
          },
        ]);

        getPluginApi(r).setRootPath(rootPath);

        return r;
      };

      const withSlash = mounted("/app/");
      const without = mounted("/app");

      for (const name of ["p", "p.c"]) {
        const built = withSlash.buildPath(name, {});

        expect(built).toBe(without.buildPath(name, {}));
        expect(getPluginApi(withSlash).matchPath(built)).toBeDefined();
      }

      expect(withSlash.buildPath("p", {})).toBe("/app/list");
      expect(withSlash.buildPath("p.c", {})).toBe("/app/list/detail");
    });
  });

  describe("the other shapes the junction reaches", () => {
    it("three levels, with the MIDDLE one carrying the slash", () => {
      const r = createRouter([
        {
          name: "a",
          path: "/a",
          children: [
            { name: "b", path: "/b/", children: [{ name: "c", path: "/c" }] },
          ],
        },
      ]);

      expect(r.buildPath("a.b.c", {})).toBe("/a/b/c");
      expect(getPluginApi(r).matchPath("/a/b/c")).toBeDefined();
    });

    it("a PARAM parent with a trailing slash", () => {
      const r = createRouter([
        {
          name: "p",
          path: "/u/:id/",
          children: [{ name: "c", path: "/edit" }],
        },
      ]);

      expect(r.buildPath("p.c", { id: "7" })).toBe("/u/7/edit");
      expect(getPluginApi(r).matchPath("/u/7/edit")).toBeDefined();
    });

    it("a CLONE rebuilds the same tree", () => {
      const base = createRouter([
        {
          name: "p",
          path: "/list/",
          children: [{ name: "c", path: "/detail" }],
        },
      ]);
      const clone = cloneRouter(base);

      expect(clone.buildPath("p.c", {})).toBe("/list/detail");
      expect(getPluginApi(clone).matchPath("/list/detail")).toBeDefined();
    });

    it("CONTROL — an ABSOLUTE child bypasses the junction and is untouched", () => {
      // `~/abs` skips `buildFullPath` entirely, so it behaved identically before
      // and after — which is what makes it a control rather than a cell.
      const r = createRouter([
        { name: "p", path: "/list/", children: [{ name: "c", path: "~/abs" }] },
      ]);

      expect(r.buildPath("p.c", {})).toBe("/abs");
      expect(getPluginApi(r).matchPath("/abs")).toBeDefined();
    });
  });

  describe("the index case, which is how this was found", () => {
    it("refuses an index under a splat parent through every route-config door", () => {
      // These were the #1996 boundary pins, asserting the broken behaviour.
      // The guard is reached now, so they invert.
      const REFUSAL = /Index route .* is unreachable/;

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
