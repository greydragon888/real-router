import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { keyOf } from "../../src/dom-utils/scroll-restore";

/**
 * The scroll key names a LOCATION, not a state's contents (#1923).
 *
 * ⚑ It is built from `state.path` — the form core prints — so the two domains
 * that describe one location agree by construction. `packages/core/src/helpers.ts`
 * states why they otherwise do not: the URL direction parses `?page=2` into the
 * number `2` under the default `numberFormat: "auto"`, while an intent keeps
 * `"2"` as the caller wrote it, and comparison is "the single place that knows
 * the two domains describe one location". A key derived from the bags would be
 * a SECOND place that has to know it.
 *
 * ⚠ That is also why the key is not a normalisation of the bags. Mapping values
 * through `String()` reconciles `2` with `"2"` and then collides two locations
 * that genuinely differ: `?tags=a&tags=b` (an array) and `?tags=a%2Cb` (one
 * comma-bearing string) both print `"a,b"`. The third cell pins that pair apart,
 * so a future "normalise the values" refactor cannot reintroduce it.
 *
 * ⚠ What this costs, named: two states that share a URL share a bucket, so a
 * value that never reaches the URL — an undeclared param, a function — no longer
 * separates them. For scroll restoration that is the definition of the same
 * page; it is the axis `history.scrollRestoration` keys on too.
 */
describe("#1923 — the scroll key is the location", () => {
  const build = (): ReturnType<typeof getPluginApi> => {
    const router = createRouter([
      { name: "docs", path: "/docs?page" },
      { name: "items", path: "/items/:id?id" },
      { name: "s", path: "/s?tags" },
    ] as never);

    return getPluginApi(router);
  };

  it("one location reached two ways keys alike", () => {
    const api = build();
    const intent = api.makeState(
      "docs",
      {} as never,
      { page: "2" } as never,
      "/docs?page=2",
    );
    const fromUrl = api.matchPath("/docs?page=2")!;

    expect(keyOf(intent)).toBe(keyOf(fromUrl));
  });

  it("a query twin no longer erases the path slot of the same name", () => {
    // `/items/:id?id` is core's deliberate carve-out (#843 / #1549): both bags
    // legitimately carry `id`, and merging them let `search` win the spread.
    const api = build();

    expect(keyOf(api.matchPath("/items/1?id=9")!)).not.toBe(
      keyOf(api.matchPath("/items/7?id=9")!),
    );
  });

  it("an array value and a comma-bearing string stay apart", () => {
    const api = build();
    const asArray = api.matchPath("/s?tags=a&tags=b")!;
    const asComma = api.makeState(
      "s",
      {} as never,
      { tags: "a,b" } as never,
      "/s?tags=a%2Cb",
    );

    expect(keyOf(asArray)).not.toBe(keyOf(asComma));
  });

  it("control · query order does not split a location", () => {
    const api = build();

    expect(keyOf(api.matchPath("/s?tags=a&tags=b")!)).toBe(
      keyOf(api.matchPath("/s?tags=a&tags=b")!),
    );
    expect(keyOf(api.matchPath("/docs?page=2")!)).toBe(
      keyOf(api.matchPath("/docs?page=2")!),
    );
  });

  it("control · different routes and different params still differ", () => {
    const api = build();

    expect(keyOf(api.matchPath("/docs")!)).not.toBe(
      keyOf(api.matchPath("/items/1")!),
    );
    expect(keyOf(api.matchPath("/items/1")!)).not.toBe(
      keyOf(api.matchPath("/items/2")!),
    );
  });
});
