import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { arbQueryString, NUM_RUNS } from "./helpers";
import { parse, parseInto } from "../../src";

describe("parseInto equivalence", () => {
  test.prop([arbQueryString], { numRuns: NUM_RUNS.standard })(
    "parseInto(qs, {}) produces the same result as parse('?' + qs)",
    (qs: string) => {
      const target: Record<string, unknown> = {};

      parseInto(qs, target);

      const expected = parse(`?${qs}`);

      expect(target).toStrictEqual(expected);
    },
  );

  test.prop([arbQueryString], { numRuns: NUM_RUNS.standard })(
    "parseInto does not overwrite existing keys not present in qs",
    (qs: string) => {
      const sentinel = "__sentinel_value__";
      const target: Record<string, unknown> = { __sentinel: sentinel };

      parseInto(qs, target);

      expect(target.__sentinel).toBe(sentinel);
    },
  );

  test.prop([arbQueryString], { numRuns: NUM_RUNS.standard })(
    "parseInto is additive: result contains all keys from both target and qs",
    (qs: string) => {
      const prefilled: Record<string, unknown> = { preKey: "preVal" };
      const fromQs = parse(qs);

      parseInto(qs, prefilled);

      for (const key of Object.keys(fromQs)) {
        expect(key in prefilled).toBe(true);
      }

      expect("preKey" in prefilled).toBe(true);
    },
  );
});
