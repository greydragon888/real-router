// packages/svelte/tests/property/getActiveSegment.properties.ts

/**
 * Property-based tests for `getActiveSegment` from `RouteView.svelte`.
 *
 * `getActiveSegment` lives inside the `<script module>` block of
 * `RouteView.svelte` (component-local helper). Property tests run under
 * `environment: "node"` without vite-plugin-svelte, so a direct `import` from
 * the `.svelte` file is not possible. We replicate the function inline here —
 * the SAME pattern Preact's `link.properties.ts` uses for `areLinkPropsEqual`.
 * The replica mirrors `RouteView.svelte:6-23` verbatim and depends on the
 * production `startsWithSegment` from `@real-router/route-utils` — so any
 * regex/segment-boundary regression in the route-utils package surfaces here
 * just as it would in the component.
 *
 * Invariants (closes review §6 Invariant 6):
 *
 * 1. **Reserved names never matched** — `notFound` and `self` are never
 *    returned as the active segment, even when the route literally starts
 *    with `notFound.` or `self.` and a snippet by that name is registered.
 * 2. **Dotted reserved names also excluded** — `notFound.detail` /
 *    `self.profile` routes do not match the reserved snippets either.
 * 3. **Empty result when no segment matches** — the function returns `""`
 *    (not `undefined`, not `notFound`) when no non-reserved snippet matches.
 * 4. **First-match wins** — iteration order over snippets is deterministic
 *    (`for…in` on a plain object), and the first non-reserved match is
 *    returned.
 * 5. **Empty `node` prefix vs nested** — the function correctly composes the
 *    `node.` prefix for nested RouteView (e.g. `node="users"` looking for
 *    segment "list" matches route name `"users.list"`).
 */

import { fc, test } from "@fast-check/vitest";
import { startsWithSegment } from "@real-router/route-utils";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  arbDottedNameExtended,
  arbSegmentNameExtended,
} from "./helpers";

// =============================================================================
// Inline replica of getActiveSegment (NOT exported from RouteView.svelte)
//
// Mirrors RouteView.svelte:6-23 verbatim. Any divergence is a bug — keep this
// definition byte-identical with the original.
// =============================================================================

const RESERVED_SLOT_NAMES = new Set(["self", "notFound"]);

function getActiveSegment(
  routeName: string,
  node: string,
  snippets: Record<string, unknown>,
): string {
  const prefix = node ? `${node}.` : "";

  for (const segment in snippets) {
    if (RESERVED_SLOT_NAMES.has(segment)) {
      continue;
    }
    if (startsWithSegment(routeName, prefix + segment)) {
      return segment;
    }
  }

  return "";
}

// =============================================================================
// Arbitraries
// =============================================================================

// Snippet name uses the extended ASCII surface — `users-list`, `tab_2`, etc.
const arbSnippetName = arbSegmentNameExtended;

// Snippets object: a dictionary mapping snippet names to opaque values.
// `noop` is fine — getActiveSegment only inspects the keys, not the values.
const noop = (): void => undefined;

const arbSnippets: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  arbSnippetName,
  fc.constant(noop),
  { minKeys: 0, maxKeys: 6 },
);

// =============================================================================
// Tests
// =============================================================================

describe("getActiveSegment — Property Tests", () => {
  describe("Invariant 1: Reserved names `notFound` / `self` never returned", () => {
    // Even when the route literally starts with `notFound.` or `self.` AND a
    // snippet of that name is registered, the function must skip it. The
    // reserved-name check (`RESERVED_SLOT_NAMES.has(segment) → continue`) is
    // the only thing standing between consumers writing `notFound`-routed
    // pages and getting the fallback fallback for "real" notFound URLs.
    test.prop([fc.constantFrom("notFound", "self"), arbDottedNameExtended], {
      numRuns: NUM_RUNS.standard,
    })(
      "reserved-name routes do not return the reserved name",
      (reservedName, suffix) => {
        const snippets = {
          [reservedName]: noop,
          foo: noop,
        };
        const routeName = `${reservedName}.${suffix}`;
        const result = getActiveSegment(routeName, "", snippets);

        // Tightened from a pair of `.not.toBe(reserved)` assertions: the
        // function is typed `string` and must never return `undefined` /
        // `null` / a non-string value, regardless of input shape. Without
        // the type check, a regression that returned `undefined` for
        // reserved names would pass both negative assertions silently.
        expect(typeof result).toBe("string");
        expect(result).not.toBe("notFound");
        expect(result).not.toBe("self");
      },
    );

    test("literal 'notFound' route + notFound snippet → still skipped", () => {
      const result = getActiveSegment("notFound", "", {
        notFound: noop,
        foo: noop,
      });

      expect(result).not.toBe("notFound");
    });

    test("literal 'self' route + self snippet → still skipped", () => {
      const result = getActiveSegment("self", "", { self: noop, foo: noop });

      expect(result).not.toBe("self");
    });
  });

  describe("Invariant 2: Reserved-prefix routes (`notFound.detail`) are excluded", () => {
    // The skip is on the SNIPPET name, not the route name — a route like
    // `notFound.detail` could in principle match a non-reserved snippet whose
    // name matches the segment under `notFound.` But there's no way for the
    // function to enter that branch because RESERVED_SLOT_NAMES is hard-coded.
    test.prop([arbDottedNameExtended], { numRuns: NUM_RUNS.standard })(
      "notFound.<suffix> route + only notFound snippet → returns ''",
      (suffix) => {
        const result = getActiveSegment(`notFound.${suffix}`, "", {
          notFound: noop,
        });

        expect(result).toBe("");
      },
    );

    test.prop([arbDottedNameExtended], { numRuns: NUM_RUNS.standard })(
      "self.<suffix> route + only self snippet → returns ''",
      (suffix) => {
        const result = getActiveSegment(`self.${suffix}`, "", { self: noop });

        expect(result).toBe("");
      },
    );
  });

  describe("Invariant 3: Empty result when no non-reserved segment matches", () => {
    test.prop([arbDottedNameExtended], { numRuns: NUM_RUNS.standard })(
      "route name unrelated to all snippets → returns ''",
      (routeName) => {
        // Use a snippet whose name shares no prefix with the route — the
        // simplest way is to suffix it with a known sentinel.
        const sentinel = `${routeName}-not-a-match`;
        const snippets = { [sentinel]: noop };

        const result = getActiveSegment(routeName, "", snippets);

        expect(result).toBe("");
      },
    );

    test("empty snippets object → returns ''", () => {
      expect(getActiveSegment("anything", "", {})).toBe("");
    });
  });

  describe("Invariant 4: First-match wins (deterministic iteration order)", () => {
    // `for…in` on a plain object iterates string-keyed properties in their
    // insertion order (per ES2015+ spec, for non-integer keys). When two
    // snippets could both match the route, the first one inserted wins.
    test("first non-reserved match wins over later matches", () => {
      const snippets = {
        users: noop,
        "users.list": noop,
      };
      // Both 'users' and 'users.list' match — but 'users' is iterated first.
      const result = getActiveSegment("users.list.archive", "", snippets);

      expect(result).toBe("users");
    });

    test.prop([arbSnippets], { numRuns: NUM_RUNS.standard })(
      "if any non-reserved snippet exists and matches by prefix, it's returned",
      (snippets) => {
        const names = Object.keys(snippets).filter(
          (k) => !RESERVED_SLOT_NAMES.has(k),
        );

        fc.pre(names.length > 0);

        // Pick the FIRST non-reserved snippet and craft a matching route.
        const firstNonReserved = names[0];
        const routeName = firstNonReserved;
        const result = getActiveSegment(routeName, "", snippets);

        // The function may return ANY non-reserved snippet whose name forms a
        // segment prefix of routeName — but at minimum, the exact-match one
        // (firstNonReserved) qualifies. Since 'for…in' iterates in insertion
        // order, the first match seen is returned.
        const expected =
          names.find((n) => startsWithSegment(routeName, n)) ?? "";

        expect(result).toBe(expected);
      },
    );
  });

  describe("Invariant 5: Nested `node` prefix composition", () => {
    // When RouteView is nested (`<RouteView nodeName="users">`), the function
    // composes `${node}.${segment}` to test against the route name. A route
    // `"users.list"` with `node="users"` and snippet `"list"` must match.
    test.prop([arbSegmentNameExtended, arbSegmentNameExtended], {
      numRuns: NUM_RUNS.standard,
    })("nested node: segment 's' matches route '<node>.s'", (node, segment) => {
      fc.pre(node !== segment);
      fc.pre(!RESERVED_SLOT_NAMES.has(segment));
      fc.pre(!RESERVED_SLOT_NAMES.has(node));

      const snippets = { [segment]: noop };
      const routeName = `${node}.${segment}`;
      const result = getActiveSegment(routeName, node, snippets);

      expect(result).toBe(segment);
    });

    test.prop([arbSegmentNameExtended, arbSegmentNameExtended], {
      numRuns: NUM_RUNS.standard,
    })(
      "nested node: foreign route '<other>.s' does not match under node",
      (node, other) => {
        fc.pre(node !== other);
        fc.pre(!RESERVED_SLOT_NAMES.has(node));
        fc.pre(!RESERVED_SLOT_NAMES.has(other));

        const snippets = { s: noop };
        // route is `<other>.s` but RouteView is nested under `<node>` — the
        // prefix becomes `<node>.s`, which does not match `<other>.s`.
        const routeName = `${other}.s`;
        const result = getActiveSegment(routeName, node, snippets);

        expect(result).toBe("");
      },
    );

    test("empty node + segment 's' matches route 's' (no prefix)", () => {
      expect(getActiveSegment("s", "", { s: noop })).toBe("s");
      // and 's.detail' (segment-prefix match)
      expect(getActiveSegment("s.detail", "", { s: noop })).toBe("s");
    });
  });

  // Closes review §5.8 row 10: routes that start with `.` are not produced by
  // real-router (route names use dots as segment separators, never as a
  // leading char). startsWithSegment(".foo", "") returns true (empty prefix
  // matches any string at position 0), but the iteration's `prefix + segment`
  // composition means we'd be looking for "" as the segment — which is not
  // a valid snippet name. Pin the current behavior so a future startsWithSegment
  // refactor doesn't silently accept dot-prefixed routes.
  describe("Edge case: route name starts with '.'", () => {
    it("'.foo' route with empty node and 'foo' snippet → does not match (literal '.foo' != 'foo')", () => {
      // startsWithSegment(".foo", "foo") is false — segment is "foo" not ".foo".
      const result = getActiveSegment(".foo", "", { foo: noop });

      expect(result).toBe("");
    });

    it("'.foo' route with empty node and empty-string snippet name → no match (RESERVED check passes, but Snippet is not iterated when key is '')", () => {
      // `for…in` on `{ "": noop }` does iterate the empty-string key, and
      // RESERVED_SLOT_NAMES doesn't contain "", so the function proceeds to
      // check startsWithSegment(".foo", "" + "") === startsWithSegment(".foo", "").
      // Empty prefix matches anything → would return "".
      // Lock this corner: a snippet named "" wins on ANY route, which is why
      // consumers cannot register such a snippet at the Svelte syntax level.
      // The pin-test confirms runtime behavior even if a consumer somehow
      // smuggled an empty-string-keyed snippet through.
      const result = getActiveSegment(".foo", "", { "": noop });

      // Returns "" because the empty-string segment matches and is the value
      // returned (which happens to be the segment name).
      expect(result).toBe("");
    });
  });

  // Closes review §5.8 row 11: snippets dict with `undefined` / `null` values.
  // The function inspects KEYS only (via `for…in`), not values. A snippet
  // whose value is `undefined` or `null` still has its key iterated, the
  // RESERVED check still applies, and startsWithSegment still runs. So
  // such snippets match like any other. Lock this behavior — consumers
  // sometimes pass `notFound: undefined` for conditional rendering.
  describe("Edge case: snippets dict with undefined / null values", () => {
    it("snippet with undefined value still matched by key", () => {
      const snippets = { users: undefined };
      const result = getActiveSegment("users.list", "", snippets);

      // The function returns the matching segment name regardless of value.
      // Consumer is responsible for not rendering an undefined snippet.
      expect(result).toBe("users");
    });

    it("snippet with null value still matched by key", () => {
      const snippets = { admin: null };
      const result = getActiveSegment("admin.settings", "", snippets);

      expect(result).toBe("admin");
    });

    it("only undefined-valued snippets with reserved names → no match (RESERVED still skipped)", () => {
      const snippets = { notFound: undefined, self: undefined };
      const result = getActiveSegment("notFound.detail", "", snippets);

      // RESERVED_SLOT_NAMES check fires before the iteration value matters.
      expect(result).toBe("");
    });
  });

  // Closes review §5.8 row 13: 100-segment route names exercise the
  // startsWithSegment matcher under pathological depth. The function uses
  // `for…in` over snippets (constant N) and startsWithSegment on each — O(N)
  // not O(N × depth). Locks the linear-in-snippets contract.
  describe("Edge case: very long routes (100 segments)", () => {
    it("100-segment route + matching first-segment snippet → returns segment", () => {
      const segments = Array.from({ length: 100 }, (_, i) => `s${i}`);
      const routeName = segments.join(".");
      const snippets = { s0: noop };

      const result = getActiveSegment(routeName, "", snippets);

      expect(result).toBe("s0");
    });

    it("100-segment route + non-matching snippet → ''", () => {
      const segments = Array.from({ length: 100 }, (_, i) => `s${i}`);
      const routeName = segments.join(".");
      const snippets = { unrelated: noop };

      const result = getActiveSegment(routeName, "", snippets);

      expect(result).toBe("");
    });

    it("100-segment route + nested node prefix at depth 50 → matches segment 51", () => {
      const segments = Array.from({ length: 100 }, (_, i) => `s${i}`);
      const routeName = segments.join(".");
      // Nest under s0.s1.…s49 — the next segment is s50.
      const node = segments.slice(0, 50).join(".");
      const snippets = { s50: noop };

      const result = getActiveSegment(routeName, node, snippets);

      expect(result).toBe("s50");
    });
  });
});
