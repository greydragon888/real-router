import { createRouteTree } from "route-tree";
import { describe, it, expect, beforeEach } from "vitest";

import { RouteUtils, getRouteUtils } from "@real-router/route-utils";

// Tree:
//   "" (root)
//     users
//       profile
//         edit
//           detail
//             extra   <- 5 segments deep (4 dots)
//     admin
//     modal  <- absolute: true
const makeRoot = () =>
  createRouteTree("", "", [
    {
      name: "users",
      path: "/users",
      children: [
        {
          name: "profile",
          path: "/:id",
          children: [
            {
              name: "edit",
              path: "/edit",
              children: [
                {
                  name: "detail",
                  path: "/detail",
                  children: [{ name: "extra", path: "/extra" }],
                },
              ],
            },
          ],
        },
      ],
    },
    { name: "admin", path: "/admin" },
    { name: "modal", path: "~/modal" },
  ]);

describe("RouteUtils", () => {
  let root: ReturnType<typeof makeRoot>;
  let utils: RouteUtils;

  beforeEach(() => {
    root = makeRoot();
    utils = new RouteUtils(root);
  });

  describe("getRoute", () => {
    it("returns the node for a known route", () => {
      expect(utils.getRoute("users")?.fullName).toBe("users");
      expect(utils.getRoute("")?.fullName).toBe("");
      expect(utils.getRoute("users.profile.edit.detail.extra")?.fullName).toBe(
        "users.profile.edit.detail.extra",
      );
    });

    it("returns undefined for unknown route", () => {
      expect(utils.getRoute("nonexistent")).toBeUndefined();
    });

    it("returns the node for an absolute route (indexed by #buildIndex)", () => {
      expect(utils.getRoute("modal")?.fullName).toBe("modal");
      expect(utils.getRoute("modal")?.absolute).toBe(true);
    });
  });

  describe("getChain", () => {
    it("returns undefined for unknown route", () => {
      expect(utils.getChain("nonexistent")).toBeUndefined();
    });

    it("returns [root] for root", () => {
      const chain = utils.getChain("");

      expect(chain).toStrictEqual([root]);
    });

    it("returns ancestor chain from root to node (inclusive)", () => {
      const chain = utils.getChain("users.profile");

      expect(chain?.length).toBe(3);
      expect(chain?.[0].fullName).toBe("");
      expect(chain?.[1].fullName).toBe("users");
      expect(chain?.[2].fullName).toBe("users.profile");
    });

    it("returns cached result on second call (referential equality)", () => {
      const chain1 = utils.getChain("users.profile");
      const chain2 = utils.getChain("users.profile");

      expect(chain1).toBe(chain2);
    });

    it("returns frozen array", () => {
      const chain = utils.getChain("users");

      expect(Object.isFrozen(chain)).toBe(true);
    });

    it("returns chain for an absolute route", () => {
      const chain = utils.getChain("modal");
      expect(chain?.length).toBe(2);
      expect(chain?.[0].fullName).toBe("");
      expect(chain?.[1].fullName).toBe("modal");
    });
  });

  describe("getParent", () => {
    it("returns undefined for unknown route", () => {
      expect(utils.getParent("nonexistent")).toBeUndefined();
    });

    it("returns null for root", () => {
      expect(utils.getParent("")).toBeNull();
    });

    it("returns the parent node for non-root routes", () => {
      expect(utils.getParent("users")?.fullName).toBe("");
      expect(utils.getParent("users.profile")?.fullName).toBe("users");
    });
  });

  describe("getSiblings", () => {
    it("returns undefined for unknown route", () => {
      expect(utils.getSiblings("nonexistent")).toBeUndefined();
    });

    it("returns undefined for root (no parent)", () => {
      expect(utils.getSiblings("")).toBeUndefined();
    });

    it("returns empty array for only-child", () => {
      const siblings = utils.getSiblings("users.profile");

      expect(Array.isArray(siblings)).toBe(true);
      expect(siblings?.length).toBe(0);
    });

    it("returns siblings excluding self", () => {
      const siblings = utils.getSiblings("users");

      expect(siblings?.map((s) => s.fullName)).toContain("admin");
      expect(siblings?.map((s) => s.fullName)).not.toContain("users");
    });

    it("returns cached result on second call (referential equality)", () => {
      const s1 = utils.getSiblings("users");
      const s2 = utils.getSiblings("users");

      expect(s1).toBe(s2);
    });

    it("returns frozen array", () => {
      const siblings = utils.getSiblings("users");

      expect(Object.isFrozen(siblings)).toBe(true);
    });

    it("excludes absolute routes from siblings", () => {
      // "modal" is absolute, so it should NOT appear in siblings of "users" or "admin"
      const siblings = utils.getSiblings("users");
      expect(siblings?.map((s) => s.fullName)).not.toContain("modal");
      // "admin" is non-absolute, so it SHOULD appear
      expect(siblings?.map((s) => s.fullName)).toContain("admin");
    });
  });

  describe("getNameSegments", () => {
    it("returns undefined for unknown route", () => {
      expect(utils.getNameSegments("nonexistent")).toBeUndefined();
    });

    it("returns [''] for root", () => {
      expect(utils.getNameSegments("")).toStrictEqual([""]);
    });

    it("returns [name] for 1-segment route", () => {
      expect(utils.getNameSegments("users")).toStrictEqual(["users"]);
    });

    it("returns prefix segments for 2-segment route", () => {
      expect(utils.getNameSegments("users.profile")).toStrictEqual([
        "users",
        "users.profile",
      ]);
    });

    it("returns prefix segments for 3-segment route", () => {
      expect(utils.getNameSegments("users.profile.edit")).toStrictEqual([
        "users",
        "users.profile",
        "users.profile.edit",
      ]);
    });

    it("returns prefix segments for 4-segment route", () => {
      expect(utils.getNameSegments("users.profile.edit.detail")).toStrictEqual([
        "users",
        "users.profile",
        "users.profile.edit",
        "users.profile.edit.detail",
      ]);
    });

    it("returns prefix segments for 5-segment route (general case)", () => {
      expect(
        utils.getNameSegments("users.profile.edit.detail.extra"),
      ).toStrictEqual([
        "users",
        "users.profile",
        "users.profile.edit",
        "users.profile.edit.detail",
        "users.profile.edit.detail.extra",
      ]);
    });

    it("returns cached result on second call (referential equality)", () => {
      const s1 = utils.getNameSegments("users.profile");
      const s2 = utils.getNameSegments("users.profile");

      expect(s1).toBe(s2);
    });

    it("returns frozen array", () => {
      const segs = utils.getNameSegments("users");

      expect(Object.isFrozen(segs)).toBe(true);
    });
  });

  describe("isDescendantOf", () => {
    it("returns true when child is a descendant", () => {
      expect(utils.isDescendantOf("users.profile", "users")).toBe(true);
      expect(utils.isDescendantOf("users.profile.edit", "users")).toBe(true);
    });

    it("returns false for same route", () => {
      expect(utils.isDescendantOf("users", "users")).toBe(false);
    });

    it("returns false when child is not a descendant of root via string check", () => {
      expect(utils.isDescendantOf("users", "")).toBe(false);
    });

    it("returns false for sibling routes", () => {
      expect(utils.isDescendantOf("admin", "users")).toBe(false);
    });

    it("returns false for prefix match without dot boundary", () => {
      expect(utils.isDescendantOf("users2", "users")).toBe(false);
    });
  });
});

describe("getRouteUtils", () => {
  let root: ReturnType<typeof makeRoot>;

  beforeEach(() => {
    root = makeRoot();
  });

  it("returns a RouteUtils instance", () => {
    const u = getRouteUtils(root);

    expect(u).toBeInstanceOf(RouteUtils);
  });

  it("returns the same instance for the same root (WeakMap cache)", () => {
    const u1 = getRouteUtils(root);
    const u2 = getRouteUtils(root);

    expect(u1).toBe(u2);
  });

  it("returns different instances for different roots", () => {
    const root2 = createRouteTree("", "", [{ name: "home", path: "/" }]);
    const u1 = getRouteUtils(root);
    const u2 = getRouteUtils(root2);

    expect(u1).not.toBe(u2);
  });
});
