// packages/route-tree/tests/property/validation.properties.ts

import { fc, test } from "@fast-check/vitest";

import { NUM_RUNS, PARAM_TREE } from "./helpers";
import { createRouteTree } from "../../src/builder/createRouteTree";
import { validateRoute } from "../../src/validation/route-batch";
import { validateRoutePath } from "../../src/validation/routes";

import type { RouteDefinition } from "../../src/types";

/**
 * Validates a batch the way `@real-router/validation-plugin` does: shared
 * tracking structures, no existing tree (so only the batch-level name/path
 * duplicate checks run). `validateRoute` recurses into `children`.
 */
function validateBatch(routes: RouteDefinition[]): void {
  const seenNames = new Set<string>();
  const seenPathsByParent = new Map<string, Set<string>>();

  for (const route of routes) {
    validateRoute(
      route,
      "addRoute",
      undefined,
      "",
      seenNames,
      seenPathsByParent,
    );
  }
}

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * Valid route name: starts with letter/underscore, followed by letters/digits/underscores/hyphens.
 * Matches ROUTE_NAME_PATTERN = /^[A-Z_a-z][\w-]*$/
 */
const arbValidRouteName = fc.stringMatching(/^[A-Z_a-z][\w-]{0,19}$/);

/**
 * System route name: starts with @@ (bypasses pattern check).
 * After @@ can contain any word/slash/dot/hyphen chars.
 */
const arbSystemRouteName = fc
  .stringMatching(/^[\w/.-]{0,20}$/)
  .map((suffix) => `@@${suffix}`);

/**
 * Safe path segment: short lowercase string for building test paths.
 */
const arbSafeSegment = fc.stringMatching(/^[a-z]{1,8}$/);

// -----------------------------------------------------------------------------
// Invalid route name partitions
// -----------------------------------------------------------------------------

/**
 * Invalid route names covering all rejection branches:
 * - Empty string
 * - Whitespace-only (spaces, tabs, newlines)
 * - Contains dots (must use children/parent instead)
 * - Starts with digit (violates ROUTE_NAME_PATTERN)
 * - Starts with hyphen (violates ROUTE_NAME_PATTERN)
 */
const arbInvalidRouteName = fc.oneof(
  fc.constant(""),
  fc.constant("  "),
  fc.constant("\t\n"),
  arbValidRouteName.map((name) => `${name}.suffix`),
  fc.stringMatching(/^\d\w{0,10}$/),
  fc.stringMatching(/^-\w{0,10}$/),
);

/**
 * Non-string route name values — tests the typeof check.
 */
const arbNonStringName: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
);

// -----------------------------------------------------------------------------
// Valid path partitions
// -----------------------------------------------------------------------------

/**
 * Valid paths covering all acceptance branches:
 * - Empty string (grouping/root)
 * - Absolute (/path)
 * - Tilde absolute (~path) — without parameterized parent
 * - Query (?param)
 * - Relative segment
 */
const arbValidPath = fc.oneof(
  fc.constant(""),
  arbSafeSegment.map((seg) => `/${seg}`),
  arbSafeSegment.map((seg) => `~${seg}`),
  arbSafeSegment.map((seg) => `?${seg}`),
  arbSafeSegment,
);

// -----------------------------------------------------------------------------
// Invalid path partitions
// -----------------------------------------------------------------------------

/**
 * Non-string path values — tests the typeof check.
 */
const arbNonStringPath: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
  fc.constant(["/path"]),
);

/**
 * Paths with embedded whitespace (space/tab/newline).
 */
const arbWhitespacePath = fc
  .tuple(arbSafeSegment, fc.constantFrom(" ", "\t", "\n"), arbSafeSegment)
  .map(([a, ws, b]) => `/${a}${ws}${b}`);

/**
 * Paths with consecutive slashes.
 */
const arbDoubleSlashPath = arbSafeSegment.map((seg) => `/${seg}//${seg}`);

/**
 * Tilde-prefixed paths for absolute-under-parameterized-parent test.
 */
const arbTildePath = arbSafeSegment.map((seg) => `~${seg}`);

/**
 * Param paths with an unbalanced constraint delimiter — a stray `<` (no closing
 * `>`) or a stray `>` (no opening `<`). None of these contain a balanced
 * `<...>`, so every generated value must be rejected (#749).
 */
const arbUnbalancedConstraintPath = fc
  .tuple(arbSafeSegment, fc.constantFrom("<", ">", String.raw`<\d+`, "<[a-z]"))
  .map(([seg, stray]) => `/:${seg}${stray}`);

/**
 * Param paths with a NAME-LESS marker — `:` or `*` immediately followed by a
 * boundary (`/`, `?`, `<`, or end-of-string), i.e. no parameter name. path-matcher
 * rejects these at `registerTree` (#858); `validateRoute` must reject them at the
 * gate too, deriving from the single `PARAM_NAME_PATTERN` grammar (#863).
 */
const arbEmptyParamPath = fc
  .tuple(
    arbSafeSegment,
    fc.constantFrom(":", "*"),
    fc.constantFrom("", "?", String.raw`<\d+>`, "/n"),
  )
  .map(([seg, marker, tail]) => `/${seg}/${marker}${tail}`);

// =============================================================================
// Route Name Validation
// =============================================================================

describe("Route Name Validation", () => {
  describe("1: valid names accepted — pattern-matching names pass validation (high)", () => {
    test.prop([arbValidRouteName], { numRuns: NUM_RUNS.standard })(
      "names matching [a-zA-Z_][a-zA-Z0-9_-]* do not throw",
      (name: string) => {
        expect(() => {
          validateRoute({ name, path: "" }, "add");
        }).not.toThrow();
      },
    );
  });

  describe("2: invalid names rejected — empty, whitespace, dots, bad start char throw TypeError (high)", () => {
    test.prop([arbInvalidRouteName], { numRuns: NUM_RUNS.standard })(
      "names violating the pattern throw TypeError",
      (name: string) => {
        expect(() => {
          validateRoute({ name, path: "" }, "add");
        }).toThrow(TypeError);
      },
    );
  });

  describe("3: system route bypass — @@ prefix bypasses pattern check (medium)", () => {
    test.prop([arbSystemRouteName], { numRuns: NUM_RUNS.fast })(
      "@@-prefixed names pass regardless of characters after prefix",
      (name: string) => {
        expect(() => {
          validateRoute({ name, path: "" }, "add");
        }).not.toThrow();
      },
    );
  });

  describe("4: non-string name rejection — non-string values throw the typeof-guard TypeError (high)", () => {
    test.prop([arbNonStringName], { numRuns: NUM_RUNS.fast })(
      "number, null, undefined, boolean throw TypeError with the 'must be a string' guard message",
      (name: unknown) => {
        // Assert the SPECIFIC guard message, not just `toThrow(TypeError)`: with
        // the typeof guard removed a non-string name still throws an *incidental*
        // runtime TypeError later (`name.startsWith is not a function`, `Cannot
        // read properties of null (reading 'length')`), so a type-only assertion
        // passes even when the guard is gone (mutation-verified). The message
        // pins the assertion to the validation guard itself.
        expect(() => {
          validateRoute({ name, path: "" }, "add");
        }).toThrow(TypeError);
        expect(() => {
          validateRoute({ name, path: "" }, "add");
        }).toThrow(/Route name must be a string/);
      },
    );
  });
});

// =============================================================================
// Route Path Validation
// =============================================================================

describe("Route Path Validation", () => {
  describe("1: valid paths accepted — empty, /, ~, ?, relative pass (high)", () => {
    test.prop([arbValidPath], { numRuns: NUM_RUNS.standard })(
      "valid path formats do not throw",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).not.toThrow();
      },
    );
  });

  describe("2: non-string path rejection — non-string values throw the typeof-guard TypeError (high)", () => {
    test.prop([arbNonStringPath], { numRuns: NUM_RUNS.fast })(
      "number, null, undefined, boolean, array throw TypeError with the 'must be a string' guard message",
      (path: unknown) => {
        // Assert the SPECIFIC guard message, not just `toThrow(TypeError)`: with
        // the typeof guard removed a non-string path still throws an *incidental*
        // runtime TypeError later (`path.includes`/`path.startsWith` is not a
        // function), so a type-only assertion passes even when the guard is gone
        // (mutation-verified). The message pins the assertion to the guard.
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(TypeError);
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/Route path must be a string/);
      },
    );
  });

  describe("3: whitespace rejection — paths with whitespace throw TypeError (high)", () => {
    test.prop([arbWhitespacePath], { numRuns: NUM_RUNS.standard })(
      "paths containing space/tab/newline throw TypeError",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(TypeError);
      },
    );
  });

  describe("4: double-slash rejection — paths with // throw TypeError (high)", () => {
    test.prop([arbDoubleSlashPath], { numRuns: NUM_RUNS.standard })(
      "paths containing consecutive slashes throw TypeError",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(TypeError);
      },
    );
  });

  describe("5: absolute under parameterized parent — ~ path under URL-param parent throws TypeError (high)", () => {
    // Profile node has paramTypeMap = { id: "url" }
    const parentWithUrlParams = PARAM_TREE.children
      .get("users")!
      .children.get("profile")!;

    test.prop([arbTildePath], { numRuns: NUM_RUNS.fast })(
      "tilde-prefixed path under parent with URL params throws TypeError",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add", parentWithUrlParams);
        }).toThrow(TypeError);
      },
    );
  });

  describe("6: unbalanced constraint rejection — stray < or > throws TypeError (high)", () => {
    test.prop([arbUnbalancedConstraintPath], { numRuns: NUM_RUNS.fast })(
      "path with an unbalanced constraint delimiter throws with a constraint message",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/constraint/);
      },
    );
  });

  describe("7: name-less param marker rejection — ':'/'*' with no name throws TypeError (high)", () => {
    test.prop([arbEmptyParamPath], { numRuns: NUM_RUNS.fast })(
      "a marker without a parameter name throws (gate-level, consistent with path-matcher #858)",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/parameter marker/);
      },
    );
  });
});

// =============================================================================
// Route Duplicate Detection
// =============================================================================

describe("Route Duplicate Detection", () => {
  // Distinct valid route names — the building block for every duplicate case.
  const arbDistinctNames = (min: number, max: number) =>
    fc.uniqueArray(arbValidRouteName, { minLength: min, maxLength: max });

  describe("1: batch name duplicate — a repeated name in the batch throws (high)", () => {
    test.prop([arbDistinctNames(2, 6), fc.nat()], {
      numRuns: NUM_RUNS.standard,
    })(
      "re-using a name anywhere in the batch throws, even buried mid-list",
      (names: string[], pos: number) => {
        const routes: RouteDefinition[] = names.map((name, i) => ({
          name,
          path: `/p${i}`,
        }));

        // Insert a second route with an already-used name at a random position.
        routes.splice(pos % (routes.length + 1), 0, {
          name: names[0],
          path: "/dupe",
        });

        expect(() => {
          validateBatch(routes);
        }).toThrow(/Duplicate route/);
      },
    );
  });

  describe("2: batch path duplicate — same path at the same parent level throws (high)", () => {
    test.prop([arbDistinctNames(2, 6)], { numRuns: NUM_RUNS.standard })(
      "distinct names but a shared path at one level throws",
      (names: string[]) => {
        const routes: RouteDefinition[] = names.map((name, i) => ({
          name,
          path: `/p${i}`,
        }));

        // Force two siblings to share a path (names stay distinct).
        routes[1] = { name: names[1], path: routes[0].path };

        expect(() => {
          validateBatch(routes);
        }).toThrow(/already defined/);
      },
    );
  });

  describe("3: same path under different parents is allowed — no false positive (high)", () => {
    test.prop([arbDistinctNames(4, 4)], { numRuns: NUM_RUNS.standard })(
      "two children under different parents may share a path",
      ([parentA, parentB, childA, childB]: string[]) => {
        const routes: RouteDefinition[] = [
          {
            name: parentA,
            path: "/a",
            children: [{ name: childA, path: "/same" }],
          },
          {
            name: parentB,
            path: "/b",
            children: [{ name: childB, path: "/same" }],
          },
        ];

        expect(() => {
          validateBatch(routes);
        }).not.toThrow();
      },
    );
  });

  describe("4: tree name duplicate — re-adding an existing tree name throws (high)", () => {
    test.prop([arbDistinctNames(1, 5), fc.nat()], {
      numRuns: NUM_RUNS.standard,
    })(
      "validating a route whose name already exists in the tree throws",
      (names: string[], pick: number) => {
        const routes: RouteDefinition[] = names.map((name, i) => ({
          name,
          path: `/p${i}`,
        }));
        const tree = createRouteTree("", "", routes);
        const existing = names[pick % names.length];

        const seenNames = new Set<string>();
        const seenPathsByParent = new Map<string, Set<string>>();

        expect(() => {
          validateRoute(
            { name: existing, path: "/fresh" },
            "addRoute",
            tree,
            "",
            seenNames,
            seenPathsByParent,
          );
        }).toThrow(/already exists/);
      },
    );
  });

  describe("5: all-distinct batch — unique names and paths never throw (high)", () => {
    test.prop([arbDistinctNames(1, 8)], { numRuns: NUM_RUNS.standard })(
      "a batch with unique names and unique paths passes validation",
      (names: string[]) => {
        const routes: RouteDefinition[] = names.map((name, i) => ({
          name,
          path: `/p${i}`,
        }));

        expect(() => {
          validateBatch(routes);
        }).not.toThrow();
      },
    );
  });
});
