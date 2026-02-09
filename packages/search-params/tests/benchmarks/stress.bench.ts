/**
 * Search Params Stress Tests
 *
 * Tests performance under extreme conditions:
 * 1. Very large query strings
 * 2. Very long values
 * 3. Large arrays
 * 4. Unicode stress
 * 5. Large omit/keep
 * 6. Parse+build roundtrip scaling
 */

import { barplot, bench, do_not_optimize, lineplot, summary } from "mitata";

import { build, keep, omit, parse } from "../../src";

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
}

// =============================================================================
// Helper generators
// =============================================================================

function generateQueryString(count: number): string {
  return Array.from({ length: count }, (_, i) => `p${i}=v${i}`).join("&");
}

function generateParams(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`p${i}`, `v${i}`]),
  );
}

function generateLongValue(length: number): string {
  return "x".repeat(length);
}

function generateArrayItems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `item${i}`);
}

function generateParamNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${i}`);
}

// =============================================================================
// JIT Warmup
// =============================================================================
{
  for (let i = 0; i < 100; i++) {
    parse("a=1&b=2&c=3");
    build({ a: "1", b: "2" });
    omit("a=1&b=2&c=3", ["a"]);
    keep("a=1&b=2&c=3", ["a"]);
  }
}

// =============================================================================
// 1. Very large query strings
//    lineplot parse/build with [100, 500, 1000] params
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: parse $count params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const qs = generateQueryString(count);

      yield () => {
        do_not_optimize(parse(qs));
      };
    }).args("count", [100, 500, 1000]);
  });
});

lineplot(() => {
  summary(() => {
    bench("stress: build $count params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const params = generateParams(count);

      yield () => {
        do_not_optimize(build(params));
      };
    }).args("count", [100, 500, 1000]);
  });
});

// =============================================================================
// 2. Very long values
//    lineplot [1KB, 10KB, 100KB] value strings
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: parse value $size bytes", function* (state: BenchState) {
      const size = state.get("size") as number;
      const value = generateLongValue(size);
      const qs = `key=${value}`;

      yield () => {
        do_not_optimize(parse(qs));
      };
    }).args("size", [1000, 10_000, 100_000]);
  });
});

lineplot(() => {
  summary(() => {
    bench("stress: build value $size bytes", function* (state: BenchState) {
      const size = state.get("size") as number;
      const value = generateLongValue(size);
      const params = { key: value };

      yield () => {
        do_not_optimize(build(params));
      };
    }).args("size", [1000, 10_000, 100_000]);
  });
});

// =============================================================================
// 3. Large arrays
//    lineplot [50, 100, 500] items
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: parse array $count items", function* (state: BenchState) {
      const count = state.get("count") as number;
      const items = generateArrayItems(count);
      const qs = items.map((item) => `arr=${item}`).join("&");

      yield () => {
        do_not_optimize(parse(qs));
      };
    }).args("count", [50, 100, 500]);
  });
});

lineplot(() => {
  summary(() => {
    bench("stress: build array $count items", function* (state: BenchState) {
      const count = state.get("count") as number;
      const items = generateArrayItems(count);
      const params = { arr: items };

      yield () => {
        do_not_optimize(build(params));
      };
    }).args("count", [50, 100, 500]);
  });
});

// =============================================================================
// 4. Unicode stress
//    barplot ASCII vs Cyrillic vs CJK vs emoji-heavy
// =============================================================================

barplot(() => {
  summary(() => {
    const ascii = "name=hello&value=world&key=test";
    const cyrillic =
      "name=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82&value=%D0%BC%D0%B8%D1%80";
    const cjk = "name=%E4%BD%A0%E5%A5%BD&value=%E4%B8%96%E7%95%8C";
    const emoji = "name=%F0%9F%91%8B&value=%F0%9F%8C%8D&key=%E2%9C%A8";

    bench("stress: parse ASCII", () => {
      do_not_optimize(parse(ascii));
    });

    bench("stress: parse Cyrillic (encoded)", () => {
      do_not_optimize(parse(cyrillic));
    });

    bench("stress: parse CJK (encoded)", () => {
      do_not_optimize(parse(cjk));
    });

    bench("stress: parse emoji (encoded)", () => {
      do_not_optimize(parse(emoji));
    });
  });
});

barplot(() => {
  summary(() => {
    const ascii = { name: "hello", value: "world", key: "test" };
    const cyrillic = {
      name: "\u043F\u0440\u0438\u0432\u0435\u0442",
      value: "\u043C\u0438\u0440",
    };
    const cjk = { name: "\u4F60\u597D", value: "\u4E16\u754C" };
    const emoji = { name: "\u{1F44B}", value: "\u{1F30D}", key: "\u2728" };

    bench("stress: build ASCII", () => {
      do_not_optimize(build(ascii));
    });

    bench("stress: build Cyrillic", () => {
      do_not_optimize(build(cyrillic));
    });

    bench("stress: build CJK", () => {
      do_not_optimize(build(cjk));
    });

    bench("stress: build emoji", () => {
      do_not_optimize(build(emoji));
    });
  });
});

// =============================================================================
// 5. Large omit/keep
//    lineplot filter [10, 50, 100] params from [100, 500] param string
// =============================================================================

lineplot(() => {
  summary(() => {
    const qs100 = generateQueryString(100);
    const qs500 = generateQueryString(500);

    bench("stress: omit $count from 100 params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const toOmit = generateParamNames(count);

      yield () => {
        do_not_optimize(omit(qs100, toOmit));
      };
    }).args("count", [10, 50, 100]);

    bench("stress: omit $count from 500 params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const toOmit = generateParamNames(count);

      yield () => {
        do_not_optimize(omit(qs500, toOmit));
      };
    }).args("count", [10, 50, 100]);

    bench("stress: keep $count from 100 params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const toKeep = generateParamNames(count);

      yield () => {
        do_not_optimize(keep(qs100, toKeep));
      };
    }).args("count", [10, 50, 100]);

    bench("stress: keep $count from 500 params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const toKeep = generateParamNames(count);

      yield () => {
        do_not_optimize(keep(qs500, toKeep));
      };
    }).args("count", [10, 50, 100]);
  });
});

// =============================================================================
// 6. Parse+build roundtrip
//    lineplot roundtrip with [10, 50, 100, 500] params
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: roundtrip $count params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const qs = generateQueryString(count);

      yield () => {
        const parsed = parse(qs);

        do_not_optimize(build(parsed));
      };
    }).args("count", [10, 50, 100, 500]);
  });
});
