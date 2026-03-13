import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { arbDeepRouteName, NUM_RUNS } from "./helpers";
import { nameToIDs } from "../../src/transitionPath";

describe("nameToIDs Properties", () => {
  test.prop([arbDeepRouteName], { numRuns: NUM_RUNS.thorough })(
    "last element equals the original name",
    (name) => {
      const ids = nameToIDs(name);

      expect(ids.at(-1)).toBe(name);
    },
  );

  test.prop([arbDeepRouteName], { numRuns: NUM_RUNS.thorough })(
    "first element equals the first segment",
    (name) => {
      const ids = nameToIDs(name);

      expect(ids[0]).toBe(name.split(".")[0]);
    },
  );

  test.prop([arbDeepRouteName], { numRuns: NUM_RUNS.thorough })(
    "length equals number of segments",
    (name) => {
      const ids = nameToIDs(name);

      expect(ids).toHaveLength(name.split(".").length);
    },
  );

  test.prop(
    [
      fc
        .array(fc.stringMatching(/^[a-zA-Z_]\w{0,15}$/), {
          minLength: 2,
          maxLength: 7,
        })
        .map((a) => a.join(".")),
    ],
    { numRuns: NUM_RUNS.thorough },
  )(
    "prefix property: nameToIDs(a.b) is a strict prefix of nameToIDs(a.b.c)",
    (name) => {
      const parts = name.split(".");
      const prefixName = parts.slice(0, -1).join(".");
      const prefixIds = nameToIDs(prefixName);
      const fullIds = nameToIDs(name);

      expect(fullIds.length).toBeGreaterThan(prefixIds.length);

      for (const [i, prefixId] of prefixIds.entries()) {
        expect(fullIds[i]).toBe(prefixId);
      }
    },
  );

  it("empty string returns ['']", () => {
    const ids = nameToIDs("");

    expect(ids).toStrictEqual([""]);
  });

  test.prop([arbDeepRouteName], { numRuns: NUM_RUNS.thorough })(
    "monotonic string lengths: each element is strictly longer than the previous",
    (name) => {
      const ids = nameToIDs(name);

      for (let i = 0; i < ids.length - 1; i++) {
        expect(ids[i].length).toBeLessThan(ids[i + 1].length);
      }
    },
  );

  test.prop([arbDeepRouteName], { numRuns: NUM_RUNS.thorough })(
    "nesting: each element is a dot-prefix of the next",
    (name) => {
      const ids = nameToIDs(name);

      for (let i = 0; i < ids.length - 1; i++) {
        expect(ids[i + 1].startsWith(`${ids[i]}.`)).toBe(true);
      }
    },
  );
});
