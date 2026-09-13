import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

/**
 * An unrecognised string-enum option degrades to its OWN default, not to a
 * different mode (#1831).
 *
 * ⚑ **The defect is not "core does not throw" — that is a recorded decision.**
 * `packages/core/src/engine/CLAUDE.md` states it: bare core falls back rather
 * than throwing, because refusing a value BY NAME belongs to
 * `@real-router/validation-plugin`, which owns the list. What was never decided
 * is WHICH value the fallback lands on, and two of the three landed on a
 * different mode than their own default — `trailingSlash` behaving like
 * `"never"` where the default is `"preserve"`, and `queryParamsMode` like
 * `"default"` where the default is `"loose"`, which DROPS an undeclared key out
 * of `state.search`.
 *
 * ⚑ **The shape is one, at several sites: the DEFAULT is recognised by
 * equality and everything else falls into the non-default branch.**
 * `ts === "preserve" ? undefined : ts`, `queryParamsMode === "loose"`,
 * `!== "loose"` — each reads as "is it the default?", so an unrecognised value
 * answers "no" and takes the other road. Resolving the value against the
 * declared SET once, at the consumption boundary, closes every one of them.
 *
 * ⚠ **Both directions, because they are separate sites.** The match side and
 * the build side read the mode from different bags, and a fix on one leaves the
 * other live — measured: `matchPath` was corrected while `buildPath` still
 * dropped the key.
 *
 * ⚠ **`validation-plugin` must keep reporting.** Resolving at OPTION ADOPTION
 * instead would rewrite the value before the plugin reads it, and the one
 * diagnostic that exists today would go silent — measured, it did. The
 * resolution therefore happens where the value is USED, exactly where
 * `urlParamsEncoding`'s own fallback lives (`SegmentMatcher`'s constructor).
 */
const ROUTES: readonly Route[] = [
  { name: "a", path: "/a" },
  { name: "s", path: "/s?tags" },
];

async function started(options: Record<string, unknown>): Promise<Router> {
  const router = createRouter([...ROUTES], {
    allowNotFound: true,
    ...options,
  });

  await router.start("/a");

  return router;
}

describe("an unrecognised enum option degrades to its own default (#1831)", () => {
  it("trailingSlash — the MATCH side keeps the source slash, as `preserve` does", async () => {
    const bogus = await started({ trailingSlash: "bogusTypo" });
    const byDefault = await started({});

    expect(getPluginApi(bogus).matchPath("/a/")?.path).toBe(
      getPluginApi(byDefault).matchPath("/a/")?.path,
    );

    bogus.stop();
    byDefault.stop();
  });

  it("queryParamsMode — the MATCH side keeps an undeclared key, as `loose` does", async () => {
    const bogus = await started({ queryParamsMode: "bogusTypo" });
    const byDefault = await started({});

    expect(
      getPluginApi(bogus).matchPath("/s?tags=1&zz=9")?.search,
    ).toStrictEqual(
      getPluginApi(byDefault).matchPath("/s?tags=1&zz=9")?.search,
    );

    bogus.stop();
    byDefault.stop();
  });

  it("queryParamsMode — the BUILD side prints an undeclared key, as `loose` does", async () => {
    // A separate site from the cell above: the build reads the mode from its own
    // bag, and the match-side fix does not reach it.
    const bogus = await started({ queryParamsMode: "bogusTypo" });
    const byDefault = await started({});

    expect(bogus.buildPath("s", {}, { tags: "1", zz: "9" })).toBe(
      byDefault.buildPath("s", {}, { tags: "1", zz: "9" }),
    );

    bogus.stop();
    byDefault.stop();
  });

  it("queryParamsMode — the REBUILT path is a third site, not the search bag", async () => {
    // ⚠ A door its sibling cell does not reach: `matchPath` rebuilds
    // `state.path` through its own options bag, and the cell above asserts
    // `state.search`, which a different gate decides. Found by mutation —
    // reverting the rebuild's site left the whole file green.
    const bogus = await started({ queryParamsMode: "bogusTypo" });
    const byDefault = await started({});

    expect(getPluginApi(bogus).matchPath("/s?tags=1&zz=9")?.path).toBe(
      getPluginApi(byDefault).matchPath("/s?tags=1&zz=9")?.path,
    );

    bogus.stop();
    byDefault.stop();
  });

  it("CONTROL — a LEGAL non-default value is still honoured", async () => {
    // Without this the three cells above are equally true of a core that
    // ignored the option entirely.
    const never = await started({ trailingSlash: "never" });
    const strictQuery = await started({ queryParamsMode: "default" });

    expect(getPluginApi(never).matchPath("/a/")?.path).toBe("/a");
    expect(
      getPluginApi(strictQuery).matchPath("/s?tags=1&zz=9")?.search,
    ).toStrictEqual({ tags: 1 });

    never.stop();
    strictQuery.stop();
  });

  it("CONTROL — the two defaults differ from the modes the typo used to pick", async () => {
    // The cells above compare bogus against default. They would ALSO pass if
    // the default happened to equal the wrong mode — this pins that it does not,
    // so the comparison discriminates.
    const byDefault = await started({});
    const wrongSlash = await started({ trailingSlash: "never" });
    const wrongQuery = await started({ queryParamsMode: "default" });

    expect(getPluginApi(byDefault).matchPath("/a/")?.path).not.toBe(
      getPluginApi(wrongSlash).matchPath("/a/")?.path,
    );
    expect(
      getPluginApi(byDefault).matchPath("/s?tags=1&zz=9")?.search,
    ).not.toStrictEqual(
      getPluginApi(wrongQuery).matchPath("/s?tags=1&zz=9")?.search,
    );

    byDefault.stop();
    wrongSlash.stop();
    wrongQuery.stop();
  });
});
