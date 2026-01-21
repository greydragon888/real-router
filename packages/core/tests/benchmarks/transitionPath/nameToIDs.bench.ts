/**
 * nameToIDs benchmarks
 *
 * Tests nameToIDs() performance:
 * - Core scenarios (empty string, single segment, varying depths)
 * - Cache impact (repeated calls, unique names)
 * - Real navigation patterns (drilling down, breadcrumb, sibling navigation)
 */

import { bench, boxplot, summary } from "mitata";

import { nameToIDs } from "../../../src/transitionPath";

// Helper to generate deep route names
function generateDeepRoute(depth: number): string {
  return Array.from({ length: depth })
    .fill(0)
    .map((_, i) => `segment${i}`)
    .join(".");
}

// Pre-generated test data to avoid runtime allocations
const TEST_DATA = {
  routes: {
    simple: "home",
    typical: "app.users.profile",
    deep10: generateDeepRoute(10),
    deep15: generateDeepRoute(15),
    deep30: generateDeepRoute(30),
  },
  patterns: {
    drilling: ["app", "app.users", "app.users.list", "app.users.list.filters"],
    breadcrumb: [
      "shop.category.product.reviews",
      "shop.category.product",
      "shop.category",
      "shop",
    ],
    siblings: [
      "app.users.view",
      "app.users.edit",
      "app.users.delete",
      "app.users.create",
    ],
  },
  uniqueNames: Array.from({ length: 100 })
    .fill(0)
    .map((_, i) => `route${i}`),
};

// Core scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("nameToIDs: empty string (fast path)", () => {
      nameToIDs("");
    });

    bench("nameToIDs: single segment", () => {
      nameToIDs(TEST_DATA.routes.simple);
    });

    bench("nameToIDs: typical depth (3 segments)", () => {
      nameToIDs(TEST_DATA.routes.typical);
    });

    bench("nameToIDs: deep nesting (10 segments)", () => {
      nameToIDs(TEST_DATA.routes.deep10);
    });

    bench("nameToIDs: extreme depth (30 segments)", () => {
      nameToIDs(TEST_DATA.routes.deep30);
    });
  });
});

// Cache impact - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("nameToIDs: 10 repeated calls - short name", () => {
      const name = "users";

      for (let i = 0; i < 10; i++) {
        nameToIDs(name);
      }
    });

    bench("nameToIDs: 100 repeated calls - long name", () => {
      let sum = 0;

      for (let i = 0; i < 100; i++) {
        const result = nameToIDs(TEST_DATA.routes.deep15);

        sum += result.length;
      }

      sum; // Return to prevent dead code elimination
    });

    bench("nameToIDs: 100 unique short names", () => {
      let sum = 0;

      for (const name of TEST_DATA.uniqueNames) {
        const result = nameToIDs(name);

        sum += result.length;
      }

      sum;
    });
  });
});

// Real navigation patterns - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("nameToIDs: incremental depth (drilling down)", () => {
      let sum = 0;

      for (const route of TEST_DATA.patterns.drilling) {
        sum += nameToIDs(route).length;
      }

      sum;
    });

    bench("nameToIDs: breadcrumb (going up)", () => {
      let sum = 0;

      for (const route of TEST_DATA.patterns.breadcrumb) {
        sum += nameToIDs(route).length;
      }

      sum;
    });

    bench("nameToIDs: sibling navigation", () => {
      let sum = 0;

      for (const route of TEST_DATA.patterns.siblings) {
        sum += nameToIDs(route).length;
      }

      sum;
    });
  });
});
