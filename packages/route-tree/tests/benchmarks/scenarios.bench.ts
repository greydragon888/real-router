/**
 * Real-World Scenarios benchmarks
 *
 * Tests realistic application scenarios:
 * - SPA Application (~100 routes)
 * - Enterprise Application (200+ routes)
 *
 * IMPORTANT: match() is a non-mutating operation.
 * MatcherService must be created OUTSIDE bench blocks.
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

/** Creates a pre-registered matcher for a given route tree (reusable across iterations) */
function createMatcher(tree: any): MatcherService {
  const matcher = new MatcherService();

  matcher.registerTree(tree);

  return matcher;
}

// =============================================================================
// JIT Warmup: Pre-warm tree construction and match code paths
// Without this, init/build benchmarks show unstable RME (0.5-0.7%)
// due to V8 JIT not optimizing Object.freeze, Map/Set, meta iteration
// =============================================================================
{
  const warmupRoutes = generateSpaRoutes();

  for (let i = 0; i < 100; i++) {
    // Warmup: createRouteTree (freeze, paramMeta, staticPath)
    const tree = createRouteTree("", "", warmupRoutes);

    // Warmup: createRouteTreeBuilder + add + build
    createRouteTreeBuilder("", "")
      .addMany(warmupRoutes)
      .add({ name: "dynamic", path: "/dynamic/:id" })
      .build();

    // Warmup: buildPath code paths
    buildPath(tree, "users");
    buildPath(tree, "users.view.details", { id: "123" });

    // Warmup: match code paths
    const matcher = createMatcher(tree);

    matcher.match("/");
    matcher.match("/users/123/details");
  }
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
    const spaMatcher = createMatcher(spaTree);

    bench("SPA: matchSegments home (/)", () => {
      spaMatcher.match("/");
    });

    bench("SPA: matchSegments deep (/users/123/details)", () => {
      spaMatcher.match("/users/123/details");
    });

    bench("SPA: matchSegments last resource (/help/456/history)", () => {
      spaMatcher.match("/help/456/history");
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
    const enterpriseMatcher = createMatcher(enterpriseTree);

    bench("Enterprise: matchSegments home", () => {
      enterpriseMatcher.match("/");
    });

    bench(
      "Enterprise: matchSegments deep admin (/admin/users/management/roles/permissions)",
      () => {
        enterpriseMatcher.match(
          "/admin/users/management/roles/permissions?filter=active&sort=name&page=1&limit=10",
        );
      },
    );

    bench(
      "Enterprise: matchSegments last section (/legal/123/related/links)",
      () => {
        enterpriseMatcher.match("/legal/123/related/links");
      },
    );

    bench("Enterprise: matchSegments absolute modal", () => {
      enterpriseMatcher.match("/modal/prompt/confirm");
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
