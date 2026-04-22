import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { safeParseUrl, shouldReplaceHistory } from "../../src/browser-env";
import { computeDirection } from "../../src/navigate-handler";
import { deriveNavigationType } from "../../src/plugin";

import type { NavigationOptions, State } from "@real-router/core";

// --- Arbitraries ---

const arbIndex = fc.integer({ min: 0, max: 1000 });

const STUB_TRANSITION = Object.freeze({
  phase: "activating",
  reason: "success",
  segments: Object.freeze({
    deactivated: Object.freeze([]),
    activated: Object.freeze([]),
    intersection: "",
  }),
}) as unknown as State["transition"];

const arbState: fc.Arbitrary<State> = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 10 }),
    params: fc.constant({}),
    path: fc.stringMatching(/^\/[a-z]{0,10}$/),
  })
  .map(
    (r) =>
      ({
        ...r,
        transition: STUB_TRANSITION,
        context: {},
      }) as unknown as State,
  );

const arbNavOptions: fc.Arbitrary<NavigationOptions> = fc.record({
  replace: fc.constantFrom(true, false, undefined),
  reload: fc.constantFrom(true, false, undefined),
});

describe("computeDirection Properties", () => {
  test.prop([fc.tuple(arbIndex, arbIndex).filter(([a, b]) => a !== b)], {
    numRuns: NUM_RUNS.standard,
  })("traverse direction is antisymmetric for distinct indices", ([a, b]) => {
    const directionAB = computeDirection("traverse", a, b);
    const directionBA = computeDirection("traverse", b, a);

    expect(new Set([directionAB, directionBA])).toStrictEqual(
      new Set(["forward", "back"]),
    );
  });

  test.prop([arbIndex], { numRuns: NUM_RUNS.fast })(
    "traverse direction is unknown for equal indices",
    (index) => {
      expect(computeDirection("traverse", index, index)).toBe("unknown");
    },
  );

  test.prop([arbIndex, arbIndex], { numRuns: NUM_RUNS.fast })(
    "push direction is always forward",
    (destination, curr) => {
      expect(computeDirection("push", destination, curr)).toBe("forward");
    },
  );

  test.prop([arbIndex, arbIndex], { numRuns: NUM_RUNS.fast })(
    "replace direction is always unknown",
    (destination, curr) => {
      expect(computeDirection("replace", destination, curr)).toBe("unknown");
    },
  );

  test.prop([arbIndex, arbIndex], { numRuns: NUM_RUNS.fast })(
    "reload direction is always unknown",
    (destination, curr) => {
      expect(computeDirection("reload", destination, curr)).toBe("unknown");
    },
  );
});

describe("deriveNavigationType Properties", () => {
  test.prop(
    [arbNavOptions, arbState, fc.option(arbState, { nil: undefined })],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "always returns a valid navigation type (closure)",
    (opts, toState, fromState) => {
      const result = deriveNavigationType(opts, toState, fromState);

      expect(["reload", "replace", "push"]).toContain(result);
    },
  );
});

describe("shouldReplaceHistory Properties (cross-partition)", () => {
  test.prop(
    [arbNavOptions, arbState, fc.option(arbState, { nil: undefined })],
    { numRuns: NUM_RUNS.standard },
  )(
    "never throws for any valid input combination",
    (opts, toState, fromState) => {
      expect(() =>
        shouldReplaceHistory(opts, toState, fromState),
      ).not.toThrow();
    },
  );

  test.prop(
    [arbNavOptions, arbState, fc.option(arbState, { nil: undefined })],
    { numRuns: NUM_RUNS.standard },
  )("always returns boolean", (opts, toState, fromState) => {
    const result = shouldReplaceHistory(opts, toState, fromState);

    expect(typeof result).toBe("boolean");
  });
});

describe("shouldReplaceHistory Properties (partitioned)", () => {
  // G4 truth-table cells — each partition of (replace, reload, fromState)
  // has a deterministic answer. Totality alone doesn't protect against a
  // regression that silently flips one cell.
  test.prop([arbState, fc.option(arbState, { nil: undefined })], {
    numRuns: NUM_RUNS.standard,
  })("replace: true → always true", (toState, fromState) => {
    expect(shouldReplaceHistory({ replace: true }, toState, fromState)).toBe(
      true,
    );
  });

  test.prop([arbState], { numRuns: NUM_RUNS.fast })(
    "replace nullish + fromState undefined → true (initial nav default)",
    (toState) => {
      expect(shouldReplaceHistory({}, toState, undefined)).toBe(true);
    },
  );

  test.prop([arbState], { numRuns: NUM_RUNS.fast })(
    "replace: false + fromState undefined → false (explicit user override, #447)",
    (toState) => {
      expect(shouldReplaceHistory({ replace: false }, toState, undefined)).toBe(
        false,
      );
    },
  );

  test.prop([arbState], { numRuns: NUM_RUNS.fast })(
    "reload: true + same path → true",
    (state) => {
      expect(shouldReplaceHistory({ reload: true }, state, state)).toBe(true);
    },
  );

  test.prop([arbState, arbState.filter((s) => s.path !== "/")], {
    numRuns: NUM_RUNS.fast,
  })(
    "reload: true + different path + explicit replace:false → false",
    (to, from) => {
      fc.pre(to.path !== from.path);

      expect(
        shouldReplaceHistory({ reload: true, replace: false }, to, from),
      ).toBe(false);
    },
  );
});

describe("deriveNavigationType Properties (partitioned)", () => {
  test.prop([arbState], { numRuns: NUM_RUNS.fast })(
    "reload: true + same path → reload",
    (state) => {
      expect(deriveNavigationType({ reload: true }, state, state)).toBe(
        "reload",
      );
    },
  );

  test.prop([arbState, fc.option(arbState, { nil: undefined })], {
    numRuns: NUM_RUNS.standard,
  })("replace: true → replace (unless reload+same-path)", (to, from) => {
    fc.pre(to.path !== from?.path);

    expect(deriveNavigationType({ replace: true }, to, from)).toBe("replace");
  });

  test.prop([arbState, arbState.filter((s) => s.path !== "/")], {
    numRuns: NUM_RUNS.fast,
  })(
    "replace: false + fromState present + different path → push",
    (to, from) => {
      fc.pre(to.path !== from.path);

      expect(deriveNavigationType({ replace: false }, to, from)).toBe("push");
    },
  );
});

describe("safeParseUrl Properties (totality)", () => {
  // G3 — scheme-agnostic parser must NEVER throw and must ALWAYS return
  // a {pathname, search, hash} triple of strings, for any input.
  // Includes random bytes, non-ASCII, opaque URIs, custom schemes.
  test.prop([fc.string()], { numRuns: 2000 })(
    "never throws on any string input",
    (anyStr) => {
      expect(() => safeParseUrl(anyStr)).not.toThrow();
    },
  );

  test.prop([fc.string()], { numRuns: 1000 })(
    "always returns three string fields",
    (anyStr) => {
      const result = safeParseUrl(anyStr);

      expect(typeof result.pathname).toBe("string");
      expect(typeof result.search).toBe("string");
      expect(typeof result.hash).toBe("string");
    },
  );

  test.prop([fc.string()], { numRuns: 1000 })(
    "search field is empty or starts with '?'",
    (anyStr) => {
      const { search } = safeParseUrl(anyStr);

      expect(search === "" || search.startsWith("?")).toBe(true);
    },
  );

  test.prop([fc.string()], { numRuns: 1000 })(
    "hash field is empty or starts with '#'",
    (anyStr) => {
      const { hash } = safeParseUrl(anyStr);

      expect(hash === "" || hash.startsWith("#")).toBe(true);
    },
  );

  test.prop([fc.webUrl()], { numRuns: NUM_RUNS.standard })(
    "pathname for absolute HTTP URLs always starts with '/'",
    (url) => {
      const { pathname } = safeParseUrl(url);

      expect(pathname.startsWith("/")).toBe(true);
    },
  );
});
