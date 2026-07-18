import { describe, it, expect, beforeEach } from "vitest";

import { RouteUtils, getRouteUtils } from "@real-router/route-utils";

// Route-tree fixture builder. `RouteUtils` reads only `fullName` / `children` /
// `nonAbsoluteChildren` from a node, and treats a child as absolute when its path
// begins with "~" (the engine's absolute-path marker). Building the fixture to
// route-utils' OWN structural contract here — rather than importing the engine's
// `createRouteTree` — keeps the package free of any dependency on core's routing
// engine (#1301: core is the SOLE engine consumer; route-utils is decoupled, and
// verifying it against a locally-declared compatible shape is exactly its point).
interface RouteDef {
  readonly name: string;
  readonly path: string;
  readonly children?: readonly RouteDef[];
}
interface TreeNode {
  readonly fullName: string;
  readonly children: ReadonlyMap<string, TreeNode>;
  readonly nonAbsoluteChildren: readonly TreeNode[];
}
function makeRouteTree(defs: readonly RouteDef[]): TreeNode {
  const build = (fullName: string, kids: readonly RouteDef[]): TreeNode => {
    const nodes = kids.map((d) =>
      build(fullName ? `${fullName}.${d.name}` : d.name, d.children ?? []),
    );

    return {
      fullName,
      children: new Map(kids.map((d, i) => [d.name, nodes[i]] as const)),
      nonAbsoluteChildren: nodes.filter(
        (_, i) => !kids[i].path.startsWith("~"),
      ),
    };
  };

  return build("", defs);
}

// Tree:
//   "" (root)
//     users
//       profile
//         edit
//           detail
//             extra   <- 5 segments deep (4 dots)
//     admin
//     modal  <- absolute: true (parent == root)
//     shop
//       cart
//       wishlist
//       quickview  <- absolute: true (parent == shop, NOT root)
const makeRoot = () =>
  makeRouteTree([
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
    {
      // A nested subtree whose absolute child ("shop.quickview", path ~/quickview)
      // has a NON-ROOT name-parent ("shop"). The top-level `modal` above has
      // parent == root, which hid the parent-vs-root distinction (#1209 item 2).
      name: "shop",
      path: "/shop",
      children: [
        { name: "cart", path: "/cart" },
        { name: "wishlist", path: "/wishlist" },
        { name: "quickview", path: "~/quickview" },
      ],
    },
  ]);

describe("RouteUtils", () => {
  let utils: RouteUtils;

  beforeEach(() => {
    utils = new RouteUtils(makeRoot());
  });

  describe("getChain", () => {
    it("returns undefined for unknown route", () => {
      expect(utils.getChain("nonexistent")).toBeUndefined();
    });

    it("returns [''] for root", () => {
      expect(utils.getChain("")).toStrictEqual([""]);
    });

    it("returns [name] for 1-segment route", () => {
      expect(utils.getChain("users")).toStrictEqual(["users"]);
    });

    it("returns cumulative segments for 2-segment route", () => {
      expect(utils.getChain("users.profile")).toStrictEqual([
        "users",
        "users.profile",
      ]);
    });

    it("returns cumulative segments for 3-segment route", () => {
      expect(utils.getChain("users.profile.edit")).toStrictEqual([
        "users",
        "users.profile",
        "users.profile.edit",
      ]);
    });

    it("returns cumulative segments for 4-segment route", () => {
      expect(utils.getChain("users.profile.edit.detail")).toStrictEqual([
        "users",
        "users.profile",
        "users.profile.edit",
        "users.profile.edit.detail",
      ]);
    });

    it("returns cumulative segments for 5-segment route", () => {
      expect(utils.getChain("users.profile.edit.detail.extra")).toStrictEqual([
        "users",
        "users.profile",
        "users.profile.edit",
        "users.profile.edit.detail",
        "users.profile.edit.detail.extra",
      ]);
    });

    it("returns chain for an absolute route", () => {
      expect(utils.getChain("modal")).toStrictEqual(["modal"]);
    });

    it("returns chain for a NESTED absolute route (parent is not root)", () => {
      // "shop.quickview" is absolute (path ~/quickview) but its name-parent is
      // "shop", not root — so the chain still walks the name hierarchy up to the
      // non-root parent. The top-level `modal` case (parent == root) can't
      // distinguish this from a single-segment chain (#1209 item 2).
      expect(utils.getChain("shop.quickview")).toStrictEqual([
        "shop",
        "shop.quickview",
      ]);
    });

    it("returns cached result on second call (referential equality)", () => {
      const c1 = utils.getChain("users.profile");
      const c2 = utils.getChain("users.profile");

      expect(c1).toBe(c2);
    });

    it("returns frozen array", () => {
      expect(Object.isFrozen(utils.getChain("users"))).toBe(true);
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
      expect(utils.getSiblings("users.profile")).toStrictEqual([]);
    });

    it("returns siblings excluding self", () => {
      const siblings = utils.getSiblings("users");

      expect(siblings).toContain("admin");
      expect(siblings).not.toContain("users");
    });

    it("returns cached result on second call (referential equality)", () => {
      const s1 = utils.getSiblings("users");
      const s2 = utils.getSiblings("users");

      expect(s1).toBe(s2);
    });

    it("returns frozen array", () => {
      expect(Object.isFrozen(utils.getSiblings("users"))).toBe(true);
    });

    it("excludes absolute routes from siblings", () => {
      const siblings = utils.getSiblings("users");

      expect(siblings).not.toContain("modal");
      expect(siblings).toContain("admin");
    });

    it("returns non-absolute root children for absolute route siblings", () => {
      const siblings = utils.getSiblings("modal");

      expect(siblings).toContain("users");
      expect(siblings).toContain("admin");
      expect(siblings).not.toContain("modal");
    });

    it("returns the PARENT's non-absolute children for a NESTED absolute route", () => {
      // Siblings of the nested absolute "shop.quickview" are the non-absolute
      // children of its name-parent "shop" — NOT the root's children. The
      // top-level `modal` case resolves the parent to root, so this parent-scoped
      // (non-root) branch was previously unexercised (#1209 item 2).
      expect(utils.getSiblings("shop.quickview")).toStrictEqual([
        "shop.cart",
        "shop.wishlist",
      ]);
    });

    it("excludes a nested absolute route from its non-absolute siblings", () => {
      // "shop.cart" is non-absolute; its sibling set must EXCLUDE the absolute
      // "shop.quickview" under the same parent (the exclusion applies at a
      // non-root parent, not only at root as the `users`/`modal` case shows).
      expect(utils.getSiblings("shop.cart")).toStrictEqual(["shop.wishlist"]);
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
  it("returns a RouteUtils instance", () => {
    expect(getRouteUtils(makeRoot())).toBeInstanceOf(RouteUtils);
  });

  it("returns the same instance for the same root (WeakMap cache)", () => {
    const root = makeRoot();
    const u1 = getRouteUtils(root);
    const u2 = getRouteUtils(root);

    expect(u1).toBe(u2);
  });

  it("returns different instances for different roots", () => {
    const u1 = getRouteUtils(makeRoot());
    const u2 = getRouteUtils(makeRouteTree([{ name: "home", path: "/" }]));

    expect(u1).not.toBe(u2);
  });
});
