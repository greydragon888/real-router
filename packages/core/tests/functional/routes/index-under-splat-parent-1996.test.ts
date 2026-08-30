import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

/**
 * The #1242 §5.4 guard — an index route (`path: "/"`) under a SPLAT parent is
 * unreachable, because `slashChildRoute` sits on the splat node and
 * `#matchSplat`'s fast path never reads it — was defeated by a TRAILING SLASH
 * in the parent's path (#1996).
 *
 * ⚑ The root is that the guard read a DIFFERENT string from the walk beside it.
 * `insertSlashChildIntoTrie` sliced the last segment off the RAW `parentPath`,
 * while `walkTrieFrom` normalises the trailing slash first and the caller
 * (`registerSlashChild`) normalises again one line later for the cache key. For
 * `"/files/*rest/"` the raw slice yields `""`, which is not a splat by any
 * spelling, so the guard fell silent and an unmatchable route registered.
 *
 * ⚠ The fix is the NORMALISATION, and that is measured rather than reasoned.
 * The issue proposed tokenising the segment instead ("the root cause is the
 * inference, not the trailing slash"); applied alone it changes nothing, because
 * `parseSegment("")` answers `{ kind: "static" }` and `"".startsWith("*")` is
 * `false` — the two spellings AGREE on the empty segment. They disagree only on
 * a malformed splat (`*`, `*y:`), and the grammar pass refuses those before this
 * guard sees them, so tokenising here is inert. That is why this file pins the
 * behaviour and the sibling change is filed as the latent-class close it is.
 *
 * What registering buys the user, all three measured on the same tree: an index
 * whose own path is empty demanding a param it never declared, a URL built from
 * that param, and `matchPath` refusing the URL core just built.
 */
describe("an index under a splat parent is refused with a trailing slash too (#1996)", () => {
  const REFUSAL = /Index route .* is not supported/;
  const withIndex = () => createRouter([{ name: "h", path: "" }]);

  describe("through ordinary route config", () => {
    it("CONTROL — refuses the form without the trailing slash, as it always did", () => {
      expect(() =>
        createRouter([
          {
            name: "p",
            path: "/files/*rest",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).toThrow(REFUSAL);
    });

    it("CONTROL — a trailing slash on a NON-splat parent still registers", () => {
      // Otherwise the fix would read as "trailing slashes are now refused",
      // which is a different and much wider change.
      expect(() =>
        createRouter([
          {
            name: "p",
            path: "/files/:id/",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).not.toThrow();
      expect(() =>
        createRouter([
          {
            name: "s",
            path: "/files/list/",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).not.toThrow();
    });
  });

  describe("through setRootPath — the second door to the same guard", () => {
    it("refuses the trailing-slash form", () => {
      expect(() =>
        getPluginApi(withIndex()).setRootPath("/app/*rest/"),
      ).toThrow(REFUSAL);
    });

    it("CONTROL — refuses the form without the trailing slash", () => {
      expect(() => getPluginApi(withIndex()).setRootPath("/app/*rest")).toThrow(
        REFUSAL,
      );
    });

    it("refuses a DOUBLED trailing slash, and any number of them", () => {
      // ⚠ Found by attacking the first version of this fix, which used
      // `normalizeTrailingSlash` — it strips exactly ONE slash, so `"//"` left
      // an empty last segment again and walked straight past the guard. Bare
      // core does not reject a `//` in a path (that check is route-tree
      // gate-only), so the shape is reachable, and a path ending in `*rest//`
      // still ends in a splat.
      for (const root of ["/app/*rest//", "/app/*rest///"]) {
        expect(() => getPluginApi(withIndex()).setRootPath(root)).toThrow(
          REFUSAL,
        );
      }
    });

    it("CONTROL — a required-param parent still accepts its index, slashes and all", () => {
      // The scan must not turn into "any trailing slash is refused".
      expect(() =>
        getPluginApi(withIndex()).setRootPath("/app/:id/"),
      ).not.toThrow();
    });

    it("CONTROL — a splat at the root of the path is refused too", () => {
      expect(() => getPluginApi(withIndex()).setRootPath("/*rest/")).toThrow(
        REFUSAL,
      );
    });
  });

  describe("what the silent registration produced — pinned so it cannot come back", () => {
    it("no longer builds a URL its own matchPath refuses", () => {
      // Before the fix this tree registered, and then:
      //   buildPath("h", {})            -> throws Missing required param 'rest'
      //   buildPath("h", { rest:"a/b" }) -> "/app/a/b"
      //   matchPath("/app/a/b")          -> undefined
      // i.e. unmatchable in both directions, with no correct value to supply.
      const r = withIndex();

      expect(() => getPluginApi(r).setRootPath("/app/*rest/")).toThrow(REFUSAL);

      // The refusal is atomic: the root path is not half-applied, so the route
      // still builds what it built before the rejected call. Measured — an
      // empty-path route under no root path builds the empty string, not "/".
      expect(r.buildPath("h", {})).toBe("");
    });
  });

  /**
   * ⚠ A SIBLING DOOR that this fix does NOT close, pinned as the boundary so
   * the scope is a decision rather than an oversight.
   *
   * The same tree written as ordinary route config — `{ path: "/files/*rest/",
   * children: [{ path: "/" }] }` — never reaches the §5.4 guard at all, and for
   * a different reason: `buildFullPath` concatenates, so the child's full path
   * is `"/files/*rest//"`, and `normalizeTrailingSlash` strips only ONE slash,
   * so `isSlashChild` compares `"/files/*rest/"` against `"/files/*rest"` and
   * answers false. The child registers as a STANDARD route.
   *
   * Its symptom is different too: not a phantom demanded param, but the splat
   * silently dropped from what the index builds. Filed separately — the fix is
   * in `buildFullPath` / `isSlashChild`, whose blast radius is every nested
   * route, not in this guard.
   */
  describe("boundary — the config doors are a different root and stay open", () => {
    const DEF = {
      name: "p",
      path: "/files/*rest/",
      children: [{ name: "idx", path: "/" }],
    };

    it("EVERY route-config door is silent, and with one identical symptom", () => {
      // Measured, so the follow-up is scoped as ONE root with several doors
      // rather than several defects: `createRouter`, `add()`, `replace()` and a
      // nested `children` chain all register and all build the same broken
      // path. Only `setRootPath` reached the guard's own slice, which is why
      // that is the door #1996 reports and the one this branch closes.
      const doors: [string, () => ReturnType<typeof createRouter>][] = [
        ["createRouter", () => createRouter([DEF])],
        [
          "add",
          () => {
            const r = createRouter([{ name: "keep", path: "/keep" }]);

            getRoutesApi(r).add([DEF]);

            return r;
          },
        ],
        [
          "replace",
          () => {
            const r = createRouter([{ name: "keep", path: "/keep" }]);

            getRoutesApi(r).replace([DEF]);

            return r;
          },
        ],
      ];

      // Asserted as one map rather than per door, so a future divergence names
      // the door that moved in the diff.
      const observed = doors.map(([door, make]) => {
        const r = make();

        return [
          door,
          r.buildPath("p.idx", { rest: "a/b" }),
          getPluginApi(r).matchPath("/files/") === undefined,
        ];
      });

      expect(observed).toStrictEqual([
        ["createRouter", "/files/", true],
        ["add", "/files/", true],
        ["replace", "/files/", true],
      ]);
    });

    it("registers, and the index builds a path its own matchPath refuses", () => {
      const r = createRouter([DEF]);
      const api = getPluginApi(r);

      // The parent itself is fine.
      expect(r.buildPath("p", { rest: "a/b" })).toBe("/files/a/b");

      // The index drops the splat entirely, and the result does not match back.
      const built = r.buildPath("p.idx", { rest: "a/b" });

      expect(built).toBe("/files/");
      expect(api.matchPath(built)).toBeUndefined();
    });

    it("CONTROL — a STATIC parent with the same trailing slash round-trips", () => {
      // So the defect is the SPLAT, not the trailing slash on its own.
      const r = createRouter([
        {
          name: "p",
          path: "/files/list/",
          children: [{ name: "idx", path: "/" }],
        },
      ]);
      const built = r.buildPath("p.idx", {});

      expect(built).toBe("/files/list/");
      expect(getPluginApi(r).matchPath(built)).toBeDefined();
    });
  });
});
