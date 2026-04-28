import { describe, expect, it } from "vitest";

import { getNavigator } from "@real-router/core";

import { createFixtureRouter } from "./helpers";

describe("getNavigator Properties", () => {
  it("cached: same reference returned on repeated calls", () => {
    const router = createFixtureRouter();

    const nav1 = getNavigator(router);
    const nav2 = getNavigator(router);

    expect(nav1).toBe(nav2);
  });

  it("frozen: navigator object is frozen", () => {
    const router = createFixtureRouter();
    const nav = getNavigator(router);

    expect(Object.isFrozen(nav)).toBe(true);
  });

  it("method identity: navigator methods are the same as router methods", () => {
    const router = createFixtureRouter();
    const nav = getNavigator(router);

    expect(nav.navigate).toBe(router.navigate);
    expect(nav.getState).toBe(router.getState);
    expect(nav.isActiveRoute).toBe(router.isActiveRoute);
    expect(nav.canNavigateTo).toBe(router.canNavigateTo);
    expect(nav.subscribe).toBe(router.subscribe);
    expect(nav.subscribeLeave).toBe(router.subscribeLeave);
    expect(nav.isLeaveApproved).toBe(router.isLeaveApproved);
  });

  it("contains exactly the expected methods", () => {
    const router = createFixtureRouter();
    const nav = getNavigator(router);
    const keys = Object.keys(nav).toSorted((a, b) => a.localeCompare(b));

    expect(keys).toStrictEqual([
      "canNavigateTo",
      "getState",
      "isActiveRoute",
      "isLeaveApproved",
      "navigate",
      "subscribe",
      "subscribeLeave",
    ]);
  });
});
