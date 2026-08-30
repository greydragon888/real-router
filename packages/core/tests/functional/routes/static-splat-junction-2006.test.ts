import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * A STATIC branch that dead-ends falls back to its splat sibling (#2006).
 *
 * The trie took a static child whenever the segment matched one, with no way
 * back: if the walk then ran out of path on a node carrying no route, the match
 * failed even though a splat sibling at the same node would have captured the
 * whole remainder.
 *
 * ⚑ The param half of this already existed. `#traverseFrom` implements a
 * validated sub-traverse for the param+splat junction (#1288, INVARIANTS
 * "Matching #8" — *"param wins if its branch can complete"*): the param branch
 * is tried on a scratch object and commits only if it structurally completes,
 * otherwise the splat captures. The STATIC+splat junction had no such fallback.
 *
 * ⚠ Found through #2006, whose reported symptom was `~` and `setRootPath` — an
 * absolute splat under a mount point refusing a URL it had just built. That was
 * two layers of coincidence over this: `setRootPath` rebuilds the tree with the
 * mount as the ROOT NODE, so the mount contributes a static child, and `~` puts
 * a splat beside it. Neither is needed — plain sibling routes reproduce it.
 */
describe("a dead-end static branch falls back to its splat sibling (#2006)", () => {
  describe("plain sibling routes — no tilde, no root path", () => {
    const tree = () =>
      createRouter([
        { name: "deep", path: "/app/x" },
        { name: "all", path: "/*rest" },
      ]);

    it("matches the splat when the static branch has no route to end on", () => {
      const matched = getPluginApi(tree()).matchPath("/app") as
        { name: string; params: Record<string, string> } | undefined;

      expect(matched?.name).toBe("all");
      expect(matched?.params).toStrictEqual({ rest: "app" });
    });

    it("holds whichever order the routes are declared in", () => {
      const swapped = createRouter([
        { name: "all", path: "/*rest" },
        { name: "deep", path: "/app/x" },
      ]);
      const matched = getPluginApi(swapped).matchPath("/app") as
        { name: string } | undefined;

      expect(matched?.name).toBe("all");
    });

    it("CONTROL — the static branch still wins when it CAN complete", () => {
      // The fallback must not turn into "the splat always wins".
      const matched = getPluginApi(tree()).matchPath("/app/x") as
        { name: string } | undefined;

      expect(matched?.name).toBe("deep");
    });

    it("commits the params the completing static branch collected", () => {
      // ⚠ The success arm of the junction, and it needs a PARAM below the static
      // hop to be reachable at all: a fully static path (`/app/x`) is served
      // from the static cache before the traversal runs, so the control above
      // proves the outcome without exercising this code. Here the sub-traverse
      // fills a scratch object and the commit has to carry it out.
      const r = createRouter([
        { name: "deep", path: "/app/:id" },
        { name: "all", path: "/*rest" },
      ]);
      const matched = getPluginApi(r).matchPath("/app/7") as
        { name: string; params: Record<string, string> } | undefined;

      expect(matched?.name).toBe("deep");
      expect(matched?.params).toStrictEqual({ id: "7" });
    });

    it("CONTROL — a real route at the dead-end node still wins over the splat", () => {
      const r = createRouter([
        { name: "top", path: "/app" },
        { name: "deep", path: "/app/x" },
        { name: "all", path: "/*rest" },
      ]);
      const matched = getPluginApi(r).matchPath("/app") as
        { name: string } | undefined;

      expect(matched?.name).toBe("top");
    });

    it("CONTROL — with no splat sibling the dead end is still a miss", () => {
      const r = createRouter([{ name: "deep", path: "/app/x" }]);

      expect(getPluginApi(r).matchPath("/app")).toBeUndefined();
    });
  });

  describe("deeper, and through the shapes #2006 was reported as", () => {
    it("falls back from a MULTI-segment static dead end", () => {
      const r = createRouter([
        { name: "deep", path: "/a/b/c" },
        { name: "all", path: "/*rest" },
      ]);
      const matched = getPluginApi(r).matchPath("/a/b") as
        { name: string; params: Record<string, string> } | undefined;

      expect(matched?.name).toBe("all");
      expect(matched?.params).toStrictEqual({ rest: "a/b" });
    });

    it("an absolute splat under a mount point matches the URL it builds", () => {
      // The reported #2006 shape. `setRootPath` rebuilds the tree with the mount
      // as the root node, so `/app` becomes a static child; `~/*rest` puts a
      // splat beside it. Before, `rest="app"` built "/app" and matched nothing.
      const r = createRouter([
        {
          name: "shell",
          path: "/shell",
          children: [{ name: "deep", path: "~/*rest" }],
        },
      ]);

      getPluginApi(r).setRootPath("/app");

      for (const rest of ["docs/intro", "app", "app/docs", "application"]) {
        const built = r.buildPath("shell.deep", { rest });
        const matched = getPluginApi(r).matchPath(built) as
          { name: string } | undefined;

        expect(matched?.name, `rest=${rest} built ${built}`).toBe("shell.deep");
      }
    });
  });
});
