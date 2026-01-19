/**
 * search-params benchmarks
 *
 * Tests query string parsing and building performance:
 * - parse() - query string parsing
 * - build() - query string generation
 * - omit() - parameter removal
 * - keep() - parameter filtering
 */

import { barplot, bench, boxplot, lineplot, summary } from "mitata";

import { build, keep, omit, parse } from "../../modules";

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
}

// =============================================================================
// Helper generators
// =============================================================================

/**
 * Generate a query string with N simple parameters.
 * Example: "p0=v0&p1=v1&p2=v2"
 */
const generateQueryString = (count: number): string =>
  Array.from({ length: count }, (_, i) => `p${i}=v${i}`).join("&");

/**
 * Generate a params object with N simple parameters.
 */
const generateParams = (count: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`p${i}`, `v${i}`]),
  );

/**
 * Generate a params object with array values.
 */
const generateArrayParams = (count: number): Record<string, string[]> => ({
  arr: Array.from({ length: count }, (_, i) => `${i}`),
});

/**
 * Generate parameter names for omit/keep.
 */
const generateParamNames = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `p${i}`);

// =============================================================================
// parse() benchmarks
// =============================================================================

// 1.1 Basic parse scenarios
boxplot(() => {
  summary(() => {
    const simple = "page=1&sort=name&limit=10";
    const withPrefix = "?page=1&sort=name&limit=10";
    const encoded =
      "name=hello%20world&value=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82";
    const withPlus = "name=hello+world&query=foo+bar";

    bench("parse: simple (3 params)", () => {
      parse(simple);
    });

    bench("parse: with ? prefix", () => {
      parse(withPrefix);
    });

    bench("parse: encoded values", () => {
      parse(encoded);
    });

    bench("parse: + as space", () => {
      parse(withPlus);
    });
  });
});

// 1.2 parse scaling - lineplot shows O(n)
lineplot(() => {
  summary(() => {
    bench("parse: $count params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const queryString = generateQueryString(count);

      yield () => {
        parse(queryString);
      };
    }).args("count", [5, 10, 20, 50]);
  });
});

// 1.3 parse with array formats
boxplot(() => {
  summary(() => {
    const bracketsQuery = "items[]=a&items[]=b&items[]=c";
    const indexQuery = "items[0]=a&items[1]=b&items[2]=c";
    const repeatQuery = "items=a&items=b&items=c";
    const commaQuery = "items=a,b,c";

    bench("parse: array (default/repeat)", () => {
      parse(repeatQuery);
    });

    bench("parse: array (brackets)", () => {
      parse(bracketsQuery, { arrayFormat: "brackets" });
    });

    bench("parse: array (index)", () => {
      parse(indexQuery, { arrayFormat: "index" });
    });

    bench("parse: array (comma)", () => {
      parse(commaQuery, { arrayFormat: "comma" });
    });
  });
});

// 1.4 parse with boolean formats
boxplot(() => {
  summary(() => {
    const stringBool = "enabled=true&disabled=false";
    const emptyTrue = "enabled&other=value";

    bench("parse: boolean (default)", () => {
      parse(stringBool);
    });

    bench("parse: boolean (string)", () => {
      parse(stringBool, { booleanFormat: "string" });
    });

    bench("parse: boolean (empty-true)", () => {
      parse(emptyTrue, { booleanFormat: "empty-true" });
    });
  });
});

// =============================================================================
// build() benchmarks
// =============================================================================

// 2.1 Basic build scenarios
boxplot(() => {
  summary(() => {
    const empty = {};
    const simple = { page: "1", sort: "name", limit: "10" };
    const withNumbers = { page: 1, limit: 10, offset: 0 };

    bench("build: empty object", () => {
      build(empty);
    });

    bench("build: simple (3 params)", () => {
      build(simple);
    });

    bench("build: with numbers", () => {
      build(withNumbers);
    });
  });
});

// 2.2 build scaling - lineplot shows O(n)
lineplot(() => {
  summary(() => {
    bench("build: $count params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const params = generateParams(count);

      yield () => {
        build(params);
      };
    }).args("count", [5, 10, 20, 50]);
  });
});

// 2.3 build with array formats
boxplot(() => {
  summary(() => {
    const arrParams = { items: ["a", "b", "c"] };

    bench("build: array (default/repeat)", () => {
      build(arrParams);
    });

    bench("build: array (brackets)", () => {
      build(arrParams, { arrayFormat: "brackets" });
    });

    bench("build: array (index)", () => {
      build(arrParams, { arrayFormat: "index" });
    });

    bench("build: array (comma)", () => {
      build(arrParams, { arrayFormat: "comma" });
    });
  });
});

// 2.4 build with boolean formats
boxplot(() => {
  summary(() => {
    const boolParams = { enabled: true, disabled: false };

    bench("build: boolean (default)", () => {
      build(boolParams);
    });

    bench("build: boolean (string)", () => {
      build(boolParams, { booleanFormat: "string" });
    });

    bench("build: boolean (empty-true)", () => {
      build(boolParams, { booleanFormat: "empty-true" });
    });
  });
});

// 2.5 build with null formats
barplot(() => {
  summary(() => {
    const nullParams = { value: null, other: "test" };

    bench("build: null (default)", () => {
      build(nullParams);
    });

    bench("build: null (hidden)", () => {
      build(nullParams, { nullFormat: "hidden" });
    });
  });
});

// 2.6 build with array scaling
lineplot(() => {
  summary(() => {
    bench("build: array $count items", function* (state: BenchState) {
      const count = state.get("count") as number;
      const params = generateArrayParams(count);

      yield () => {
        build(params);
      };
    }).args("count", [3, 5, 10, 20]);
  });
});

// =============================================================================
// omit() benchmarks
// =============================================================================

// 3.1 Basic omit scenarios
boxplot(() => {
  summary(() => {
    const query = "a=1&b=2&c=3&d=4&e=5";

    bench("omit: single param", () => {
      omit(query, ["c"]);
    });

    bench("omit: multiple params (3)", () => {
      omit(query, ["a", "c", "e"]);
    });

    bench("omit: with ? prefix", () => {
      omit(`?${query}`, ["c"]);
    });
  });
});

// 3.2 omit scaling - query size
lineplot(() => {
  summary(() => {
    bench("omit: from $count params (remove 2)", function* (state: BenchState) {
      const count = state.get("count") as number;
      const query = generateQueryString(count);
      const toOmit = ["p0", "p1"];

      yield () => {
        omit(query, toOmit);
      };
    }).args("count", [5, 10, 20, 50]);
  });
});

// 3.3 omit scaling - params to remove
lineplot(() => {
  summary(() => {
    const query = generateQueryString(20);

    bench("omit: remove $count params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const toOmit = generateParamNames(count);

      yield () => {
        omit(query, toOmit);
      };
    }).args("count", [1, 3, 5, 10]);
  });
});

// =============================================================================
// keep() benchmarks
// =============================================================================

// 4.1 Basic keep scenarios
boxplot(() => {
  summary(() => {
    const query = "a=1&b=2&c=3&d=4&e=5";

    bench("keep: single param", () => {
      keep(query, ["c"]);
    });

    bench("keep: multiple params (3)", () => {
      keep(query, ["a", "c", "e"]);
    });

    bench("keep: with ? prefix", () => {
      keep(`?${query}`, ["c"]);
    });
  });
});

// 4.2 keep scaling - query size
lineplot(() => {
  summary(() => {
    bench("keep: from $count params (keep 2)", function* (state: BenchState) {
      const count = state.get("count") as number;
      const query = generateQueryString(count);
      const toKeep = ["p0", "p1"];

      yield () => {
        keep(query, toKeep);
      };
    }).args("count", [5, 10, 20, 50]);
  });
});

// 4.3 keep scaling - params to keep
lineplot(() => {
  summary(() => {
    const query = generateQueryString(20);

    bench("keep: keep $count params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const toKeep = generateParamNames(count);

      yield () => {
        keep(query, toKeep);
      };
    }).args("count", [1, 3, 5, 10]);
  });
});

// =============================================================================
// Combined/Mixed scenarios
// =============================================================================

boxplot(() => {
  summary(() => {
    // Real-world mixed params
    const mixedParams = {
      page: 1,
      sort: "created_at",
      filter: ["active", "pending"],
      includeArchived: false,
      search: null,
    };

    bench("build: mixed types (real-world)", () => {
      build(mixedParams);
    });

    bench("build: mixed with brackets", () => {
      build(mixedParams, { arrayFormat: "brackets" });
    });

    // Parse then rebuild
    const queryString = "page=1&sort=name&items=a&items=b&enabled=true";

    bench("parse+build roundtrip", () => {
      const parsed = parse(queryString);

      build(parsed);
    });
  });
});
