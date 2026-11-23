import * as ssrUtils from "@real-router/ssr-utils";
import { describe, expect, it } from "vitest";

import * as subpath from "@real-router/rsc-server-plugin/errors";

describe("@real-router/rsc-server-plugin/errors (#2977)", () => {
  it("hands out the loader errors and withTimeout of @real-router/ssr-utils", () => {
    expect(
      Object.keys(subpath).toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([
      "LoaderNotFound",
      "LoaderRedirect",
      "LoaderTimeout",
      "withTimeout",
    ]);
    expect(subpath.LoaderNotFound).toBe(ssrUtils.LoaderNotFound);
    expect(subpath.LoaderRedirect).toBe(ssrUtils.LoaderRedirect);
    expect(subpath.LoaderTimeout).toBe(ssrUtils.LoaderTimeout);
    expect(subpath.withTimeout).toBe(ssrUtils.withTimeout);
  });
});
