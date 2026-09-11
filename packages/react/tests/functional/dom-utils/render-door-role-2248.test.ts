import { createRouter } from "@real-router/core";
import { validationPlugin } from "@real-router/validation-plugin";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildHref } from "../../../src/dom-utils/link-utils";

import type { Router } from "@real-router/core";

/**
 * An href predicts a commit; it does not make one (#2248).
 *
 * `reportUndeclaredParamKey` is opted into by the COMMITTING producers, and the
 * discriminator core records is that "the advice is about a state you are about
 * to commit, and a predicate commits nothing" — which is why `canNavigateTo`
 * was silenced even though it shares `navigate`'s form. `buildHref` builds a
 * string and throws the state away, so it is on the predicate side of that line.
 *
 * ⚠ **The other diagnostic is NOT in scope and must survive**: a route's
 * declared query name handed in the PATH bag is a channel error, and #2250 made
 * this door refuse it. The cell below pins that it still speaks.
 */
const ROUTES = [
  { name: "plain", path: "/plain" },
  { name: "items", path: "/items/:id?tab" },
  { name: "old", path: "/old", forwardTo: "plain" },
];

let router: Router;
let warnSpy: ReturnType<typeof vi.spyOn>;

const mk = (): Router => {
  const instance = createRouter(ROUTES);

  instance.usePlugin(validationPlugin());

  return instance;
};

describe("the render door predicts a commit without diagnosing one (#2248)", () => {
  beforeEach(async () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    router = mk();
    await router.start("/plain");
    warnSpy.mockClear();
  });

  it("says nothing about an undeclared param key", () => {
    expect(buildHref(router, "plain", { appData: "x" })).toBe("/plain");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("CONTROL — the same key on the same route DOES warn when committed", async () => {
    // Without this the cell above is a spy that could never have fired. Its own
    // key, because the de-dup is per route+key — and a DIFFERENT route, because
    // navigating to the one already active answers `SAME_STATES` and commits
    // nothing, which would make the control vacuous in a second way.
    await router.navigate("items", { id: "7", appDataB: "x" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Param "appDataB"');
  });

  it("CONTROL — the channel refusal this door makes is untouched (#2250)", () => {
    // `tab` is DECLARED as a query name on `items`; handing it in the path bag
    // is a channel error, and it is reported rather than silently re-homed.
    buildHref(router, "items", { id: "7", tab: "x" });

    expect(warnSpy).toHaveBeenCalled();
  });

  it("still resolves forwardTo, which is what the href promises (#2250)", () => {
    expect(buildHref(router, "old", {})).toBe("/plain");
    expect(buildHref(router, "items", { id: "7" }, { tab: "x" })).toBe(
      "/items/7?tab=x",
    );
  });
});
