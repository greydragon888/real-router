import { runInNewContext } from "node:vm";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect } from "vitest";

import { validationPlugin } from "../../src";
import { isParams } from "../../src/type-guards";

import type { Params, Route, Router } from "@real-router/core";

/**
 * #2834 — a `Date` is a state value in `params`, as it is in `search`.
 *
 * A route codec decodes a path slot into a `Date`, and bare core carries it
 * through every door. The plugin admits it at each door that walks the values
 * of `params`; `isActiveRoute` walks none, which `router-methods.validation`
 * pins. Another class instance beside it is the control that the walk still
 * runs; a function and a `Date` as the bag itself are refused before the walk.
 */

const toDay = (date: Date): string =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");

const fromDay = (day: string): Date => new Date(`${day}T00:00`);

const DAY: Route = {
  name: "day",
  path: "/day/:day",
  decodeParams: ({ params, search }) => ({
    params: { ...params, day: fromDay(params.day) },
    search,
  }),
  encodeParams: ({ params, search }) => ({
    params: {
      ...params,
      day: params.day instanceof Date ? toDay(params.day) : params.day,
    },
    search,
  }),
};

const MARCH_15 = new Date(2024, 2, 15);

/** A `Date` subclass, as `@date-fns/tz`'s `TZDate` is one. */
class ZonedDate extends Date {}

const validated = (): Router => {
  const router = createRouter([{ name: "home", path: "/" }, DAY], {
    defaultRoute: "home",
  });

  router.usePlugin(validationPlugin());

  return router;
};

describe("#2834 — the plugin admits a Date in params at each door that walks them", () => {
  it("start, through the route's decoder", async () => {
    const router = validated();

    const state = await router.start("/day/2024-03-15");

    expect(state.params.day).toBeInstanceOf(Date);
  });

  it("navigate", async () => {
    const router = validated();

    await router.start("/");

    const state = await router.navigate("day", { day: MARCH_15 });

    expect(state.path).toBe("/day/2024-03-15");
  });

  it("buildPath", () => {
    expect(validated().buildPath("day", { day: MARCH_15 })).toBe(
      "/day/2024-03-15",
    );
  });

  it("buildPathResolved", () => {
    expect(
      getPluginApi(validated()).buildPathResolved("day", { day: MARCH_15 }),
    ).toBe("/day/2024-03-15");
  });

  it("canNavigateTo", () => {
    expect(validated().canNavigateTo("day", { day: MARCH_15 })).toBe(true);
  });

  it("makeState", () => {
    expect(
      getPluginApi(validated()).makeState("day", { day: MARCH_15 }).params.day,
    ).toBe(MARCH_15);
  });

  it("buildNavigationState", () => {
    expect(
      getPluginApi(validated()).buildNavigationState("day", { day: MARCH_15 })
        ?.path,
    ).toBe("/day/2024-03-15");
  });

  it("forwardState", () => {
    expect(
      getPluginApi(validated()).forwardState("day", { day: MARCH_15 }, {})
        .params.day,
    ).toBe(MARCH_15);
  });
});

describe("#2834 — isParams", () => {
  it.each<[string, Params]>([
    ["a Date value", { day: MARCH_15 }],
    ["a Date subclass value", { day: new ZonedDate(2024, 2, 15) }],
    ["a Date in an array", { days: [MARCH_15, MARCH_15] }],
    ["a Date in a nested object", { range: { from: MARCH_15 } }],
    // A Date's own fields are not walked: a structured clone drops them.
    [
      "a Date with an own function field",
      { day: Object.assign(new Date(0), { format: () => "" }) },
    ],
  ])("accepts %s", (_label, params) => {
    expect(isParams(params)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["a Map value", { day: new Map() }],
    ["a RegExp value", { day: /x/u }],
    ["a function value", { day: () => MARCH_15 }],
    ["a Date as the bag", MARCH_15],
  ])("still refuses %s", (_label, value) => {
    expect(isParams(value)).toBe(false);
  });

  // None of the three is a date this realm made, which is what core compares by
  // its time: the first two make `getTime` throw, the third fails `instanceof`.
  it.each<[string, unknown]>([
    ["an object built on Date.prototype", Object.create(Date.prototype)],
    ["a Proxy over a Date", new Proxy(MARCH_15, {})],
    ["a Date of another realm", runInNewContext("new Date(0)")],
  ])("refuses %s, which only looks like a Date", (_label, value) => {
    expect(isParams({ day: value })).toBe(false);
  });

  it("still refuses a Map in params at navigate", async () => {
    const router = validated();

    await router.start("/");

    expect(() =>
      router.navigate("day", { day: new Map() as unknown as string }),
    ).toThrow(TypeError);
  });
});
