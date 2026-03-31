/**
 * Full Rebuild Pipeline Benchmarks
 *
 * Tests the combined cost of createRouteTree + createMatcher + registerTree
 * as a single operation — the real pattern from core's routesStore.rebuildTree().
 *
 * Every addRoute/removeRoute/replace triggers this full pipeline.
 * Existing benchmarks test each step in isolation; this measures combined overhead.
 */

import { barplot, bench, lineplot, summary } from "mitata";

import {
  generateEnterpriseRoutes,
  generateSpaRoutes,
  generateWideTree,
} from "./helpers/generators";
import { createRouteTree } from "../../src/builder";
import { createMatcher } from "../../src/createMatcher";

import type { CreateMatcherOptions } from "../../src/createMatcher";
import type { RouteDefinition } from "../../src/types";

function rebuildTree(
  definitions: RouteDefinition[],
  rootPath: string,
  matcherOptions?: CreateMatcherOptions,
) {
  const tree = createRouteTree("", rootPath, definitions);
  const matcher = createMatcher(matcherOptions);

  matcher.registerTree(tree);

  return { tree, matcher };
}

// =============================================================================
// JIT Warmup
// =============================================================================
{
  const warmup = generateSpaRoutes();

  for (let i = 0; i < 50; i++) {
    rebuildTree(warmup, "");
    rebuildTree(warmup, "/app");
  }
}

// =============================================================================
// 1. Full pipeline: realistic tree sizes
// =============================================================================

barplot(() => {
  summary(() => {
    const spaRoutes = generateSpaRoutes();
    const enterpriseRoutes = generateEnterpriseRoutes();

    bench("rebuild: SPA (~100 routes)", function* () {
      yield () => {
        rebuildTree(spaRoutes, "");
      };
    }).gc("inner");

    bench("rebuild: Enterprise (200+ routes)", function* () {
      yield () => {
        rebuildTree(enterpriseRoutes, "");
      };
    }).gc("inner");
  });
});

// =============================================================================
// 2. Pipeline with rootPath (browser-plugin setRootPath triggers rebuild)
// =============================================================================

barplot(() => {
  summary(() => {
    const spaRoutes = generateSpaRoutes();

    bench("rebuild: SPA no rootPath", function* () {
      yield () => {
        rebuildTree(spaRoutes, "");
      };
    }).gc("inner");

    bench("rebuild: SPA with rootPath /app", function* () {
      yield () => {
        rebuildTree(spaRoutes, "/app");
      };
    }).gc("inner");

    bench("rebuild: SPA with rootPath /api/v2", function* () {
      yield () => {
        rebuildTree(spaRoutes, "/api/v2");
      };
    }).gc("inner");
  });
});

// =============================================================================
// 3. Pipeline with matcher options (reflects core's deriveMatcherOptions)
// =============================================================================

barplot(() => {
  summary(() => {
    const spaRoutes = generateSpaRoutes();

    bench("rebuild: default options", function* () {
      yield () => {
        rebuildTree(spaRoutes, "");
      };
    }).gc("inner");

    bench("rebuild: strict trailing slash", function* () {
      yield () => {
        rebuildTree(spaRoutes, "", { strictTrailingSlash: true });
      };
    }).gc("inner");

    bench("rebuild: case insensitive", function* () {
      yield () => {
        rebuildTree(spaRoutes, "", { caseSensitive: false });
      };
    }).gc("inner");

    bench("rebuild: all options", function* () {
      yield () => {
        rebuildTree(spaRoutes, "", {
          strictTrailingSlash: true,
          caseSensitive: false,
          urlParamsEncoding: "uriComponent",
        });
      };
    }).gc("inner");
  });
});

// =============================================================================
// 4. Flat tree scaling (simulates incremental addRoute accumulation)
// =============================================================================

lineplot(() => {
  summary(() => {
    const sizes = [10, 50, 100, 500];

    for (const size of sizes) {
      const routes = generateWideTree(size);

      bench(`rebuild: ${size} flat routes`, function* () {
        yield () => {
          rebuildTree(routes, "");
        };
      }).gc("inner");
    }
  });
});
