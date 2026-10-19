import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

/**
 * A splat value with an empty segment builds a path its own matcher accepts.
 *
 * `match` refuses a path with `//` (#2010), and it emits an empty segment
 * itself: `/%2Fevil.com` decodes to `{ rest: "/evil.com" }`. Printed with a
 * literal `/`, that value is `//evil.com` — a path `match` refuses and a URL
 * that names a host. Under the strategies that decode with
 * `decodeURIComponent`, the separator after an empty segment is `%2F`.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "any", path: "/*rest" },
];

const EMPTY_SEGMENT_VALUES = ["/evil.com", "//evil.com", "a//b", "a//", "/"];

const PERCENT_SLASH_ENCODINGS = ["default", "uriComponent"] as const;

const LITERAL_SLASH_ENCODINGS = ["uri", "none"] as const;

describe("a splat value with an empty segment round-trips", () => {
  it("CONTROL — every table below registers the cells it claims to", () => {
    expect(EMPTY_SEGMENT_VALUES).toHaveLength(5);
    expect(PERCENT_SLASH_ENCODINGS).toHaveLength(2);
    expect(LITERAL_SLASH_ENCODINGS).toHaveLength(2);
  });

  it.each(PERCENT_SLASH_ENCODINGS)(
    "prints the leading slash of the value as %2F under urlParamsEncoding %j",
    (urlParamsEncoding) => {
      const router = createRouter([...ROUTES], { urlParamsEncoding });
      const path = router.buildPath("any", { rest: "/evil.com" });

      expect(path).toBe("/%2Fevil.com");
      expect(getPluginApi(router).matchPath(path)?.params).toStrictEqual({
        rest: "/evil.com",
      });
    },
  );

  it.each(EMPTY_SEGMENT_VALUES)(
    "matches %j back from the path it builds",
    (rest) => {
      const router = createRouter([...ROUTES]);
      const path = router.buildPath("any", { rest });

      expect(path).not.toContain("//");
      expect(getPluginApi(router).matchPath(path)?.params).toStrictEqual({
        rest,
      });
    },
  );

  it("keeps the path of a URL that carries the slash encoded", () => {
    const router = createRouter([...ROUTES]);

    expect(getPluginApi(router).matchPath("/%2Fevil.com")?.path).toBe(
      "/%2Fevil.com",
    );
  });

  // `decodeURI` keeps `%2F`, and `none` decodes nothing: the value cannot come
  // back from `%2F`, so the slash stays literal (engine INVARIANTS, Roundtrip
  // Extensions #2).
  it.each(LITERAL_SLASH_ENCODINGS)(
    "leaves the slash literal under urlParamsEncoding %j",
    (urlParamsEncoding) => {
      const router = createRouter([...ROUTES], { urlParamsEncoding });

      expect(router.buildPath("any", { rest: "/evil.com" })).toBe("//evil.com");
    },
  );
});
