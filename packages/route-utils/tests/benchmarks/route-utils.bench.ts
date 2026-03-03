/**
 * RouteUtils benchmarks
 *
 * Tests all public API of RouteUtils:
 * - Construction (index building)
 * - getChain (cached hot path + cold path)
 * - getSiblings (cached hot path + wide tree)
 * - isDescendantOf (string prefix check)
 * - getRouteUtils factory (WeakMap cache)
 * - Stress scenarios (large/deep/wide trees, many operations)
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";
import { createRouteTree } from "route-tree";

import { RouteUtils, getRouteUtils } from "@real-router/route-utils";

import type { RouteTree } from "route-tree";

// ============================================================================
// Tree factory helpers
// ============================================================================

function makeSmallTree(): RouteTree {
  return createRouteTree("", "", [
    {
      name: "users",
      path: "/users",
      children: [
        { name: "profile", path: "/:id" },
        { name: "settings", path: "/settings" },
      ],
    },
    {
      name: "admin",
      path: "/admin",
      children: [{ name: "dashboard", path: "/dashboard" }],
    },
  ]);
}

function makeMediumTree(): RouteTree {
  // 50 routes: 10 top-level, each with 4 children
  const children = [];

  for (let i = 0; i < 10; i++) {
    const grandchildren = [];

    for (let j = 0; j < 4; j++) {
      grandchildren.push({ name: `child${j}`, path: `/child${j}` });
    }

    children.push({
      name: `section${i}`,
      path: `/section${i}`,
      children: grandchildren,
    });
  }

  return createRouteTree("", "", children);
}

function makeLargeTree(): RouteTree {
  // 500 flat routes
  const children = [];

  for (let i = 0; i < 500; i++) {
    children.push({ name: `route${i}`, path: `/route${i}` });
  }

  return createRouteTree("", "", children);
}

function makeDeepTree(depth: number): RouteTree {
  // Linear chain: root → l1 → l2 → ... → lN
  let current: any[] = [];

  for (let i = depth; i >= 1; i--) {
    current = [
      {
        name: `l${i}`,
        path: `/l${i}`,
        children: current.length > 0 ? current : undefined,
      },
    ];
  }

  return createRouteTree("", "", current);
}

function makeWideTree(width: number): RouteTree {
  // root with N children
  const children = [];

  for (let i = 0; i < width; i++) {
    children.push({ name: `item${i}`, path: `/item${i}` });
  }

  return createRouteTree("", "", children);
}

// ============================================================================
// Section 1: Construction
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const smallTree = makeSmallTree();

      bench("1.1 Construction: small tree (7 nodes)", () => {
        do_not_optimize(new RouteUtils(smallTree));
      }).gc("inner");
    }

    {
      const mediumTree = makeMediumTree();

      bench("1.2 Construction: medium tree (50 nodes)", () => {
        do_not_optimize(new RouteUtils(mediumTree));
      }).gc("inner");
    }

    {
      const largeTree = makeLargeTree();

      bench("1.3 Construction: large flat tree (500 nodes)", () => {
        do_not_optimize(new RouteUtils(largeTree));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Section 2: getChain — hot path (cached)
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const tree = makeSmallTree();
      const utils = new RouteUtils(tree);

      // Pre-warm cache
      utils.getChain("users.profile");
      utils.getChain("");
      // Alternate routes to prevent LICM
      const names = ["users.profile", "admin.dashboard"];
      let index = 0;

      bench("2.1 getChain: cached hit (alternating)", () => {
        do_not_optimize(utils.getChain(names[index++ % 2]));
      }).gc("inner");
    }

    {
      const tree = makeSmallTree();
      const utils = new RouteUtils(tree);

      // Pre-warm cache
      utils.getChain("users");
      utils.getChain("admin");
      const names = ["users", "admin"];
      let index = 0;

      bench("2.2 getChain: cached hit, root-level (alternating)", () => {
        do_not_optimize(utils.getChain(names[index++ % 2]));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Section 3: getChain — cold path
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const tree = makeSmallTree();

      bench("3.1 getChain: cold (fresh RouteUtils + first call)", () => {
        const u = new RouteUtils(tree);

        do_not_optimize(u.getChain("users.profile"));
      }).gc("inner");
    }

    {
      const tree = makeMediumTree();

      bench("3.2 getChain: cold, medium tree + deep name", () => {
        const u = new RouteUtils(tree);

        do_not_optimize(u.getChain("section5.child3"));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Section 4: getSiblings — hot path
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const tree = makeSmallTree();
      const utils = new RouteUtils(tree);

      // Pre-warm cache
      utils.getSiblings("users");
      utils.getSiblings("admin");
      const names = ["users", "admin"];
      let index = 0;

      bench("4.1 getSiblings: cached hit (alternating)", () => {
        do_not_optimize(utils.getSiblings(names[index++ % 2]));
      }).gc("inner");
    }

    {
      const tree = makeSmallTree();
      const utils = new RouteUtils(tree);

      // Pre-warm cache for nested routes
      utils.getSiblings("users.profile");
      utils.getSiblings("users.settings");
      const names = ["users.profile", "users.settings"];
      let index = 0;

      bench("4.2 getSiblings: cached hit, nested routes (alternating)", () => {
        do_not_optimize(utils.getSiblings(names[index++ % 2]));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Section 5: getSiblings — wide tree
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const tree = makeWideTree(100);
      const utils = new RouteUtils(tree);

      // Pre-warm cache
      utils.getSiblings("item0");
      utils.getSiblings("item1");
      const names = ["item0", "item1"];
      let index = 0;

      bench("5.1 getSiblings: cached, 100 siblings", () => {
        do_not_optimize(utils.getSiblings(names[index++ % 2]));
      }).gc("inner");
    }

    {
      const tree = makeWideTree(1000);
      const utils = new RouteUtils(tree);

      // Pre-warm cache
      utils.getSiblings("item0");
      utils.getSiblings("item1");
      const names = ["item0", "item1"];
      let index = 0;

      bench("5.2 getSiblings: cached, 1000 siblings", () => {
        do_not_optimize(utils.getSiblings(names[index++ % 2]));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Section 6: isDescendantOf
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const tree = makeSmallTree();
      const utils = new RouteUtils(tree);
      const truePairs: [string, string][] = [
        ["users.profile", "users"],
        ["admin.dashboard", "admin"],
      ];
      let index = 0;

      bench("6.1 isDescendantOf: true case (alternating)", () => {
        const p = truePairs[index++ % 2];

        do_not_optimize(utils.isDescendantOf(p[0], p[1]));
      }).gc("inner");
    }

    {
      const tree = makeSmallTree();
      const utils = new RouteUtils(tree);
      const falsePairs: [string, string][] = [
        ["users.profile", "admin"],
        ["admin.dashboard", "users"],
      ];
      let index = 0;

      bench("6.2 isDescendantOf: false case (alternating)", () => {
        const p = falsePairs[index++ % 2];

        do_not_optimize(utils.isDescendantOf(p[0], p[1]));
      }).gc("inner");
    }

    {
      const tree = makeDeepTree(10);
      const utils = new RouteUtils(tree);
      // Deep descendant check: l1.l2.l3...l10 is descendant of l1
      const deepPairs: [string, string][] = [
        ["l1.l2.l3.l4.l5.l6.l7.l8.l9.l10", "l1"],
        ["l1.l2.l3.l4.l5.l6.l7.l8.l9.l10", "l1.l2.l3"],
      ];
      let index = 0;

      bench("6.3 isDescendantOf: deep ancestor (alternating)", () => {
        const p = deepPairs[index++ % 2];

        do_not_optimize(utils.isDescendantOf(p[0], p[1]));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Section 7: getRouteUtils factory
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const tree = makeSmallTree();

      // Pre-warm WeakMap
      getRouteUtils(tree);

      bench("7.1 getRouteUtils: WeakMap cache hit", () => {
        do_not_optimize(getRouteUtils(tree));
      }).gc("inner");
    }

    {
      bench("7.2 getRouteUtils: cache miss (new tree)", () => {
        const t = makeSmallTree();

        do_not_optimize(getRouteUtils(t));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Section 8: Stress
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const tree = makeLargeTree();
      // All route names pre-built
      const names = Array.from({ length: 500 }, (_, i) => `route${i}`);

      bench("8.1 Stress: getChain on all 500 routes", () => {
        const u = new RouteUtils(tree);

        for (let i = 0; i < 500; i++) {
          do_not_optimize(u.getChain(names[i]));
        }
      }).gc("inner");
    }

    {
      const tree = makeMediumTree();
      const utils = new RouteUtils(tree);
      // Pre-build descendant pairs
      const pairs: [string, string][] = [];

      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 4; j++) {
          pairs.push([`section${i}.child${j}`, `section${i}`]);
        }
      }

      bench("8.2 Stress: 1000 isDescendantOf checks", () => {
        for (let i = 0; i < 1000; i++) {
          const p = pairs[i % pairs.length];

          do_not_optimize(utils.isDescendantOf(p[0], p[1]));
        }
      }).gc("inner");
    }

    {
      const deepTree = makeDeepTree(20);

      bench("8.3 Stress: Construction deep tree (20 levels)", () => {
        do_not_optimize(new RouteUtils(deepTree));
      }).gc("inner");
    }

    {
      const wideTree = makeWideTree(100);

      bench("8.4 Stress: Construction wide tree (100 children)", () => {
        do_not_optimize(new RouteUtils(wideTree));
      }).gc("inner");
    }
  });
});
