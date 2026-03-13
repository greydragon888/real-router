// packages/route-tree/tests/property/validation.properties.ts

import { fc, test } from "@fast-check/vitest";

import { NUM_RUNS, PARAM_TREE } from "./helpers";
import { validateRoute } from "../../src/validation/route-batch";
import { validateRoutePath } from "../../src/validation/routes";

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
        }).not.toThrowError();
      },
    );
  });

  describe("2: invalid names rejected — empty, whitespace, dots, bad start char throw TypeError (high)", () => {
    test.prop([arbInvalidRouteName], { numRuns: NUM_RUNS.standard })(
      "names violating the pattern throw TypeError",
      (name: string) => {
        expect(() => {
          validateRoute({ name, path: "" }, "add");
        }).toThrowError(TypeError);
      },
    );
  });

  describe("3: system route bypass — @@ prefix bypasses pattern check (medium)", () => {
    test.prop([arbSystemRouteName], { numRuns: NUM_RUNS.fast })(
      "@@-prefixed names pass regardless of characters after prefix",
      (name: string) => {
        expect(() => {
          validateRoute({ name, path: "" }, "add");
        }).not.toThrowError();
      },
    );
  });

  describe("4: non-string name rejection — non-string values throw TypeError (high)", () => {
    test.prop([arbNonStringName], { numRuns: NUM_RUNS.fast })(
      "number, null, undefined, boolean all throw TypeError",
      (name: unknown) => {
        expect(() => {
          validateRoute({ name, path: "" }, "add");
        }).toThrowError(TypeError);
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
        }).not.toThrowError();
      },
    );
  });

  describe("2: non-string path rejection — non-string values throw TypeError (high)", () => {
    test.prop([arbNonStringPath], { numRuns: NUM_RUNS.fast })(
      "number, null, undefined, boolean, array all throw TypeError",
      (path: unknown) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrowError(TypeError);
      },
    );
  });

  describe("3: whitespace rejection — paths with whitespace throw TypeError (high)", () => {
    test.prop([arbWhitespacePath], { numRuns: NUM_RUNS.standard })(
      "paths containing space/tab/newline throw TypeError",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrowError(TypeError);
      },
    );
  });

  describe("4: double-slash rejection — paths with // throw TypeError (high)", () => {
    test.prop([arbDoubleSlashPath], { numRuns: NUM_RUNS.standard })(
      "paths containing consecutive slashes throw TypeError",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrowError(TypeError);
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
        }).toThrowError(TypeError);
      },
    );
  });
});
