// #2834 — a `Date` a route codec decoded is a state value, so a history entry
// the router wrote with one is restorable.
//
// `history.pushState` structured-clones the entry: a `Date` survives that with
// its time, a subclass's instance as a plain `Date` without its own fields.
// The guard shares its value walk with validation-plugin's
// `isParams` (`scripts/tests/twin-lockstep.test.mjs`), so the two admit the
// same values: of class instances, this realm's `Date` now, and an `Array`'s
// as before, walked as an array.
import { runInNewContext } from "node:vm";

import { createRouter } from "@real-router/core";
import { describe, expect, it, vi } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { isStateStrict } from "../../../src/browser-env/state-guard";
import { createMockedBrowser, noop } from "../../helpers/testUtils";

import type { Route, Router } from "@real-router/core";

const BASE = { name: "day", path: "/day/2024-03-15" };

/** A subclass with an own field, which a structured clone drops. */
class AppDate extends Date {
  format = (): string => "";
}

describe("#2834 — isStateStrict admits a Date in both channels", () => {
  // The `Date`s `isParams` admits too (`date-param-value-2834.test.ts`,
  // `params-edge-cases.properties.ts`): the guard judges neither the time nor
  // the instance's own fields.
  it.each<[string, Date]>([
    ["a Date", new Date(2024, 2, 15)],
    ["an Invalid Date", new Date(Number.NaN)],
    ["a subclass's instance with an own function field", new AppDate(0)],
  ])("accepts %s in params and in search", (_label, date) => {
    expect(
      isStateStrict({ ...BASE, params: { day: date }, search: { from: date } }),
    ).toBe(true);
  });

  it("CONTROL — still refuses another class instance", () => {
    expect(isStateStrict({ ...BASE, params: { day: new Map() } })).toBe(false);
    expect(
      isStateStrict({ ...BASE, params: {}, search: { from: new Map() } }),
    ).toBe(false);
  });

  // None of the three is a date this realm made: the first two make `getTime`
  // throw, the third fails `instanceof`.
  it.each<[string, unknown]>([
    ["an object built on Date.prototype", Object.create(Date.prototype)],
    ["a Proxy over a Date", new Proxy(new Date(2024, 2, 15), {})],
    ["a Date of another realm", runInNewContext("new Date(0)")],
  ])("refuses %s, which only looks like a Date", (_label, value) => {
    expect(isStateStrict({ ...BASE, params: { day: value } })).toBe(false);
    expect(
      isStateStrict({ ...BASE, params: {}, search: { from: value } }),
    ).toBe(false);
  });
});

describe("#2834 — a Back onto an entry holding a Date restores the entry", () => {
  it("commits the entry's Date without running the decoder", async () => {
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);

    const decodeParams = vi.fn<NonNullable<Route["decodeParams"]>>(
      ({ params, search }) => ({
        params: { ...params, day: new Date(`${params.day}T00:00`) },
        search,
      }),
    );
    const router: Router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "day", path: "/day/:day", decodeParams },
      ],
      { defaultRoute: "home" },
    );

    router.usePlugin(browserPluginFactory({}, createMockedBrowser(noop)));
    await router.start("/home");

    const day = new Date(2024, 2, 15);

    globalThis.history.replaceState({}, "", "/day/2024-03-15");
    globalThis.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { ...BASE, params: { day }, search: {} },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(router.getState()?.params.day).toBe(day);
    expect(decodeParams).not.toHaveBeenCalled();

    router.stop();
  });
});
