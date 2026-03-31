/**
 * validateRoute Benchmarks
 *
 * Tests route validation performance:
 * - Single route validation
 * - Batch validation (HMR replace scenario)
 * - Duplicate detection against existing tree
 * - Recursive children validation
 *
 * Used by core's addRoute() and replace() — DX-critical for HMR.
 */

import { barplot, bench, lineplot, summary } from "mitata";

import {
  generateSpaRoutes,
  generateEnterpriseRoutes,
  generateWideTree,
} from "./helpers/generators";
import { createRouteTree } from "../../src/builder";
import { validateRoute } from "../../src/validation/route-batch";

// =============================================================================
// JIT Warmup
// =============================================================================
{
  const warmupTree = createRouteTree("", "", [
    { name: "existing", path: "/existing" },
  ]);

  for (let i = 0; i < 100; i++) {
    validateRoute({ name: "users", path: "/users" }, "add");
    validateRoute({ name: "users", path: "/users" }, "add", warmupTree);

    const seenNames = new Set<string>();
    const seenPaths = new Map<string, Set<string>>();

    validateRoute(
      { name: "users", path: "/users" },
      "add",
      warmupTree,
      "",
      seenNames,
      seenPaths,
    );
  }
}

// =============================================================================
// 1. Single route validation (no tree context)
// =============================================================================

barplot(() => {
  summary(() => {
    bench("validate: simple route", () => {
      validateRoute({ name: "users", path: "/users" }, "add");
    });

    bench("validate: route with params", () => {
      validateRoute({ name: "user", path: "/users/:id" }, "add");
    });

    bench("validate: route with children", () => {
      validateRoute(
        {
          name: "users",
          path: "/users",
          children: [
            { name: "list", path: "/" },
            { name: "view", path: "/:id" },
            { name: "create", path: "/new" },
          ],
        },
        "add",
      );
    });

    bench("validate: route with encodeParams/decodeParams", () => {
      validateRoute(
        {
          name: "user",
          path: "/users/:id",
          encodeParams: (p: Record<string, unknown>) => p,
          decodeParams: (p: Record<string, unknown>) => p,
        },
        "add",
      );
    });
  });
});

// =============================================================================
// 2. Batch validation with duplicate detection (HMR replace scenario)
// =============================================================================

barplot(() => {
  summary(() => {
    const spaRoutes = generateSpaRoutes();
    const enterpriseRoutes = generateEnterpriseRoutes();

    bench("validate batch: SPA (~100 routes)", () => {
      const seenNames = new Set<string>();
      const seenPaths = new Map<string, Set<string>>();

      for (const route of spaRoutes) {
        validateRoute(route, "replace", undefined, "", seenNames, seenPaths);
      }
    });

    bench("validate batch: Enterprise (200+ routes)", () => {
      const seenNames = new Set<string>();
      const seenPaths = new Map<string, Set<string>>();

      for (const route of enterpriseRoutes) {
        validateRoute(route, "replace", undefined, "", seenNames, seenPaths);
      }
    });
  });
});

// =============================================================================
// 3. Validation against existing tree (addRoute scenario)
// =============================================================================

barplot(() => {
  summary(() => {
    const spaTree = createRouteTree("", "", generateSpaRoutes());
    const enterpriseTree = createRouteTree("", "", generateEnterpriseRoutes());

    bench("validate vs tree: add to SPA tree", () => {
      validateRoute(
        { name: "newRoute", path: "/new-route" },
        "add",
        spaTree,
        "",
        new Set<string>(),
        new Map<string, Set<string>>(),
      );
    });

    bench("validate vs tree: add to Enterprise tree", () => {
      validateRoute(
        { name: "newRoute", path: "/new-route" },
        "add",
        enterpriseTree,
        "",
        new Set<string>(),
        new Map<string, Set<string>>(),
      );
    });
  });
});

// =============================================================================
// 4. Batch size scaling
// =============================================================================

lineplot(() => {
  summary(() => {
    const sizes = [10, 50, 100, 500];

    for (const size of sizes) {
      const routes = generateWideTree(size);

      bench(`validate batch: ${size} flat routes`, () => {
        const seenNames = new Set<string>();
        const seenPaths = new Map<string, Set<string>>();

        for (const route of routes) {
          validateRoute(route, "replace", undefined, "", seenNames, seenPaths);
        }
      });
    }
  });
});
