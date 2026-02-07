/**
 * Real-World Scenarios benchmarks
 *
 * Tests realistic application scenarios:
 * - SPA Application (~100 routes)
 * - Enterprise Application (200+ routes)
 *
 * Note: .gc("inner") is used for tests with heavy allocations to stabilize results
 */

import { barplot, bench, boxplot, summary } from "mitata";

import {
  countRoutes,
  generateEnterpriseRoutes,
  generateSpaRoutes,
} from "./helpers/generators";
import { createRouteTree, createRouteTreeBuilder } from "../../src/builder";
import { buildPath } from "../../src/operations/build";
import { MatcherService } from "../../src/services/MatcherService";

function matchSegments(tree: any, path: string, options?: any) {
  const matcher = new MatcherService();

  matcher.registerTree(tree);

  return matcher.match(path, options) ?? null;
}

// ============================================================================
// SPA Application (~100 routes)
// ============================================================================

summary(() => {
  const spaRoutes = generateSpaRoutes();
  const routeCount = countRoutes(spaRoutes);

  console.log(`SPA routes count: ${routeCount}`);

  bench("SPA: init tree", function* () {
    yield () => {
      createRouteTree("", "", spaRoutes);
    };
  }).gc("inner");
});

// SPA matchSegments scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    const spaRoutes = generateSpaRoutes();
    const spaTree = createRouteTree("", "", spaRoutes);

    bench("SPA: matchSegments home (/)", () => {
      matchSegments(spaTree, "/");
    });

    bench("SPA: matchSegments deep (/users/123/details)", () => {
      matchSegments(spaTree, "/users/123/details");
    });

    bench("SPA: matchSegments last resource (/help/456/history)", () => {
      matchSegments(spaTree, "/help/456/history");
    });
  });
});

// SPA buildPath scenarios - barplot for comparison
barplot(() => {
  summary(() => {
    const spaRoutes = generateSpaRoutes();
    const spaTree = createRouteTree("", "", spaRoutes);

    bench("SPA: buildPath simple (users)", () => {
      buildPath(spaTree, "users");
    });

    bench("SPA: buildPath deep (users.view.details)", () => {
      buildPath(spaTree, "users.view.details", { id: "123" });
    });
  });
});

summary(() => {
  const spaRoutes = generateSpaRoutes();

  bench("SPA: add dynamic route at runtime", function* () {
    yield () => {
      // Build tree with dynamic route added via builder pattern
      createRouteTreeBuilder("", "")
        .addMany(spaRoutes)
        .add({ name: "dynamic", path: "/dynamic/:id" })
        .build();
    };
  }).gc("inner");
});

// ============================================================================
// Enterprise Application (200+ routes)
// ============================================================================

summary(() => {
  const enterpriseRoutes = generateEnterpriseRoutes();
  const routeCount = countRoutes(enterpriseRoutes);

  console.log(`Enterprise routes count: ${routeCount}`);

  bench("Enterprise: init tree", function* () {
    yield () => {
      createRouteTree("", "", enterpriseRoutes);
    };
  }).gc("inner");
});

// Enterprise matchSegments scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    const enterpriseRoutes = generateEnterpriseRoutes();
    const enterpriseTree = createRouteTree("", "", enterpriseRoutes);

    bench("Enterprise: matchSegments home", () => {
      matchSegments(enterpriseTree, "/");
    });

    bench(
      "Enterprise: matchSegments deep admin (/admin/users/management/roles/permissions)",
      () => {
        matchSegments(
          enterpriseTree,
          "/admin/users/management/roles/permissions?filter=active&sort=name&page=1&limit=10",
        );
      },
    );

    bench(
      "Enterprise: matchSegments last section (/legal/123/related/links)",
      () => {
        matchSegments(enterpriseTree, "/legal/123/related/links");
      },
    );

    bench("Enterprise: matchSegments absolute modal", () => {
      matchSegments(enterpriseTree, "/modal/prompt/confirm");
    });
  });
});

// Enterprise buildPath scenarios - barplot for comparison
barplot(() => {
  summary(() => {
    const enterpriseRoutes = generateEnterpriseRoutes();
    const enterpriseTree = createRouteTree("", "", enterpriseRoutes);

    bench("Enterprise: buildPath simple", () => {
      buildPath(enterpriseTree, "products");
    });

    bench("Enterprise: buildPath deep with query", () => {
      buildPath(enterpriseTree, "admin.users.management.roles.permissions", {
        filter: "active",
        sort: "name",
        page: "1",
        limit: "10",
      });
    });
  });
});
