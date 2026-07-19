// packages/route-tree/tests/property/validation.properties.ts

import { fc, test } from "@fast-check/vitest";

import { NUM_RUNS, PARAM_TREE } from "./helpers";
import { createRouteTree } from "../../../src/engine/builder/createRouteTree";
import { validateRoute } from "../../../src/engine/validation/route-batch";
import { validateRoutePath } from "../../../src/engine/validation/routes";

import type { RouteDefinition } from "../../../src/engine/types";

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

/**
 * Param paths with a marker FUSED to a static prefix within a segment — `:`/`*`
 * after ≥1 static char, no `/` between (`/a:b`, `/users/x:id`, `/a*b`). build/meta
 * extract it as a param while the trie compiles the segment as a literal, so the
 * route's build and match shapes drift; `validateRoute` must reject it at the gate
 * (path-matcher backstops at `registerTree`), the sibling of the name-less
 * rejection (#1050). Both prefix and name are non-empty so the marker is always
 * mid-segment AND name-bearing.
 */
const arbFusedMarkerPath = fc
  .tuple(arbSafeSegment, fc.constantFrom(":", "*"), arbSafeSegment)
  .map(([prefix, marker, name]) => `/${prefix}${marker}${name}`);

/**
 * Param paths with static text FUSED to a constraint's closing `>` within a
 * segment (`/:id<abc>xyz`, `/:year<abc>-archive`). build strips `<…>` then
 * re-extracts the name greedily and fuses the suffix, so build name ≠ meta name — a
 * silent dead route; `validateRoute` must reject at the gate (path-matcher backstops
 * at `registerTree`, #1150). Body and suffix are non-empty so the `>` is always
 * mid-segment. The mirror of the fused mid-segment marker on the OTHER side (#1150).
 */
const arbFusedConstraintSuffixPath = fc
  .tuple(arbSafeSegment, arbSafeSegment, arbSafeSegment)
  .map(([name, body, suffix]) => `/:${name}<${body}>${suffix}`);

/**
 * Paths with an optional splat `*name?` (`/*path?`). build treats it as a
 * multi-segment splat while the trie's optional fork compiles a single-segment
 * plain param, so the build/match shapes drift; `validateRoute` must reject it
 * (path-matcher backstops at `registerTree`, #1149).
 */
const arbOptionalSplatPath = fc
  .stringMatching(/^[a-z]{1,8}$/)
  .map((name) => `/*${name}?`);

/**
 * Paths with an UNCONSTRAINED optional param directly before a splat
 * (`/:v?/*rest`). With no constraint there is no validity signal to disambiguate
 * take-the-optional from let-the-splat-capture, so every multi-segment value has two
 * readings; `validateRoute` must reject it (path-matcher backstops at `registerTree`,
 * #1264). A CONSTRAINED optional→splat is supported and NOT generated here.
 */
const arbUnconstrainedOptBeforeSplatPath = fc
  .tuple(arbSafeSegment, arbSafeSegment)
  // distinct names — `/:ref?/*ref` (opt === rest) is a duplicate-param name, which
  // the gate rejects via the dup-param check (VP12), not this one (VP11).
  .filter(([opt, rest]) => opt !== rest)
  .map(([opt, rest]) => `/:${opt}?/*${rest}`);

/**
 * Paths that repeat one param name within a single route (`/:id/:id`). The trie
 * would bind both positions under one name, so `match`'s later capture overwrites
 * the earlier and rewrites the user's URL; `validateRoute` must reject it (#1151).
 */
const arbDuplicateParamPath = fc
  .stringMatching(/^[a-z]{1,8}$/)
  .map((name) => `/:${name}/:${name}`);

/**
 * A raw non-ASCII code point (≥ U+0080) in a STATIC segment (`/café`, `/меню`).
 * `match` compares static trie keys raw and rejects non-ASCII input, so the route
 * would register but never match; `validateRoute` must reject it (path-matcher
 * backstops at `registerTree`, #1154). The non-ASCII char is embedded BETWEEN two
 * ASCII runs so the segment is unambiguously static, not a marker-led name.
 */
const arbNonAsciiChar = fc.constantFrom("é", "ü", "ñ", "ö", "ç", "中", "я");
const arbNonAsciiStaticPath = fc
  .tuple(arbSafeSegment, arbNonAsciiChar, arbSafeSegment)
  .map(([before, ch, after]) => `/${before}${ch}${after}`);

/**
 * A malformed query-param declaration — either a query-param name containing
 * `<`/`>` (`/a?filter<x`, #1242 §5.1) or a query name colliding with a path-param
 * name (`/a/:tab?tab`, where buildPath would emit the value twice, #1242 §5.3).
 * Both must be rejected by `validateRoute` (path-matcher backstops at
 * `registerTree`). (Under M1 the `<` lives directly in the query name — the former
 * `:b?<abc>` reverse-typo form is now caught as an optional, removed, before the
 * query check.)
 */
const arbMalformedQueryDeclarationPath = fc.oneof(
  // §5.1: a '<' in the query name (never round-trips)
  fc
    .tuple(arbSafeSegment, arbSafeSegment, arbSafeSegment)
    .map(([seg, qname, body]) => `/${seg}?${qname}<${body}`),
  // §5.3: query name collides with a path-param name
  fc
    .tuple(arbSafeSegment, arbSafeSegment)
    .map(([seg, name]) => `/${seg}/:${name}?${name}`),
);

/**
 * A `<...>` constraint filling a STATIC segment — no `:`/`*` marker (`/foo<abc>`,
 * `/a<b>`). path-matcher's marker-agnostic strip silently removes it (`/foo<abc>` →
 * `/foo`), reshaping the route; `validateRoute` must reject it (path-matcher backstops
 * at `registerTree`, #1311). The constraint cleanly ENDS its segment, so the
 * fused-suffix check (#1150) does not catch it — this is the residual axis.
 */
const arbConstraintInStaticPath = fc
  .tuple(arbSafeSegment, arbSafeSegment)
  .map(([seg, body]) => `/${seg}<${body}>`);

/**
 * A param whose constraint body is BALANCED and non-empty (so
 * `validateConstraintSyntax` lets it through) yet is NOT a valid regular
 * expression — `<*x>`, `<(>`, `<[>`, `<+>`. `buildParamMeta` throws when it
 * compiles the body to a `RegExp`; the gate must re-throw it as its
 * route-contextual `TypeError` (not leak a bare `[buildParamMeta]` Error). This is
 * the invalid-regex axis path-matcher #1324 closed at `registerTree`, mirrored at
 * the gate — the one malformed class that previously escaped the gate's contract.
 */
const arbInvalidRegexConstraintPath = fc
  .tuple(
    fc.constantFrom("id", "x", "p", "slug"),
    fc.constantFrom("*x", "(", "[", "+", "?", "*", "a(", "(?"),
  )
  .map(([name, body]) => `/:${name}<${body}>`);

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

  describe("6: constraint removed — any stray < or > throws the constraint recipe (M1) (high)", () => {
    test.prop([arbUnbalancedConstraintPath], { numRuns: NUM_RUNS.fast })(
      "a path carrying a former constraint delimiter throws the removed-constraint recipe",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/regex constraints are not supported/u);
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

  describe("8: fused mid-segment marker rejection — ':'/'*' after a static prefix throws (high)", () => {
    test.prop([arbFusedMarkerPath], { numRuns: NUM_RUNS.fast })(
      "a marker fused to a static prefix throws (gate-level, consistent with path-matcher #1050)",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/must begin a segment/u);
      },
    );
  });

  describe("9: constraint removed — text fused after a former constraint '>' throws the constraint recipe (M1) (high)", () => {
    test.prop([arbFusedConstraintSuffixPath], { numRuns: NUM_RUNS.fast })(
      "a segment carrying a `<...>` throws the removed-constraint recipe regardless of a fused suffix",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/regex constraints are not supported/u);
      },
    );
  });

  describe("10: optional removed — '*name?' throws the optional recipe (M1) (high)", () => {
    test.prop([arbOptionalSplatPath], { numRuns: NUM_RUNS.fast })(
      "an optional splat throws the removed-optional recipe (declare two sibling routes)",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/optional params are not supported/u);
      },
    );
  });

  describe("11: optional removed — '/:v?/*rest' throws the optional recipe (M1) (high)", () => {
    test.prop([arbUnconstrainedOptBeforeSplatPath], { numRuns: NUM_RUNS.fast })(
      "an optional param before a splat throws the removed-optional recipe",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/optional params are not supported/u);
      },
    );
  });

  describe("12: duplicate param name rejection — a repeated name in one path throws (high)", () => {
    test.prop([arbDuplicateParamPath], { numRuns: NUM_RUNS.fast })(
      "a param name repeated within one route throws (gate-level, consistent with path-matcher #1151)",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/duplicate parameter name/u);
      },
    );
  });

  describe("13: non-ASCII static segment rejection — a raw code point ≥ U+0080 in static text throws (high)", () => {
    test.prop([arbNonAsciiStaticPath], { numRuns: NUM_RUNS.fast })(
      "a non-ASCII code point in a static segment throws (gate-level, consistent with path-matcher #1154)",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/non-ASCII static segment/u);
      },
    );
  });

  describe("14: malformed query-param declaration rejection — '<>' in a query name or a path/query name collision throws (high)", () => {
    test.prop([arbMalformedQueryDeclarationPath], { numRuns: NUM_RUNS.fast })(
      "a query name carrying '<>' or colliding with a path param throws (gate-level, consistent with path-matcher #1242)",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/query.?param/u);
      },
    );
  });

  describe("15: constraint removed — '<...>' filling a static segment throws the constraint recipe (M1) (high)", () => {
    test.prop([arbConstraintInStaticPath], { numRuns: NUM_RUNS.fast })(
      "a '<...>' filling a static segment throws the removed-constraint recipe",
      (path: string) => {
        expect(() => {
          validateRoutePath(path, "test", "add");
        }).toThrow(/regex constraints are not supported/u);
      },
    );
  });

  describe("16: constraint removed — a former `<...>` body throws the gate's route-contextual TypeError (M1) (high)", () => {
    test.prop([arbInvalidRegexConstraintPath], { numRuns: NUM_RUNS.fast })(
      "a `<...>` segment (whatever the former regex body) re-throws as the gate's route-contextual TypeError, carrying the route context",
      (path: string) => {
        // Must be the gate's own error type (TypeError) and carry the route context.
        expect(() => {
          validateRoutePath(path, "myroute", "add");
        }).toThrow(TypeError);
        expect(() => {
          validateRoutePath(path, "myroute", "add");
        }).toThrow(/\[router\.add\] Invalid path for route "myroute"/u);
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
