import { createRouter } from "@real-router/core";
import { describe, it, expect } from "vitest";

import * as rx from "../../src";
import { RxObservable } from "../../src/RxObservable";

/**
 * The key a TC39-interop consumer resolves — written out independently of the
 * source so this file pins the contract rather than restating the
 * implementation. It is the rule RxJS applies in `from()`: the symbol when the
 * host defines it, the `"@@observable"` string otherwise.
 */
const consumerKey: symbol | string =
  (Symbol as { observable?: symbol }).observable ?? "@@observable";

function protoOf(value: object): object {
  return Object.getPrototypeOf(value) as object;
}

function interopMethod(obs: object): unknown {
  return (obs as Record<symbol | string, unknown>)[consumerKey];
}

describe("TC39 interop key — host WITHOUT a Symbol.observable polyfill", () => {
  it("runs in a host where Symbol.observable is absent", () => {
    // Control: every assertion below is about the un-polyfilled arm, so the
    // arm has to actually be un-polyfilled. Without this the file silently
    // becomes a second copy of the polyfilled arm.
    expect((Symbol as { observable?: symbol }).observable).toBeUndefined();
  });

  it('installs no prototype member under the string key "undefined"', () => {
    const names = Object.getOwnPropertyNames(
      protoOf(new RxObservable(() => {})),
    );

    expect(names).toContain("@@observable");
    expect(names).not.toContain("undefined");
  });

  it("installs no observable symbol, since the host has none to install under", () => {
    const symbols = Object.getOwnPropertySymbols(
      protoOf(new RxObservable(() => {})),
    );

    // Exact, not `not.toContain("Symbol(observable)")`: matching on a symbol's
    // description would miss a polyfill that named its symbol anything else.
    expect(symbols).toStrictEqual([Symbol.asyncIterator]);
  });

  it('resolves the interop key to "@@observable" and answers with self', () => {
    const obs = new RxObservable(() => {});
    const method = interopMethod(obs);

    expect(consumerKey).toBe("@@observable");
    expect(typeof method).toBe("function");
    expect((method as () => unknown).call(obs)).toBe(obs);
  });

  it("answers the interop key on a router observable, not just a bare one", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const obs = rx.observable(router);
    const method = interopMethod(obs);

    expect(typeof method).toBe("function");
    expect((method as () => unknown).call(obs)).toBe(obs);
  });
});

describe("no package export carries a member computed from an absent symbol", () => {
  it("scans every exported constructor's prototype", () => {
    const scanned: [string, string[]][] = [];

    for (const [exportName, value] of Object.entries(rx)) {
      if (typeof value !== "function") {
        continue;
      }

      const { prototype } = value as { prototype?: object };

      if (prototype === undefined) {
        continue;
      }

      scanned.push([exportName, Object.getOwnPropertyNames(prototype)]);
    }

    // Controls. The census is named rather than counted: a threshold reads as
    // a number to decrement when an export is renamed or turned into an arrow
    // function, and decrementing it silently narrows what the scan covers.
    expect(
      scanned
        .map(([exportName]) => exportName)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([
      "debounceTime",
      "distinctUntilChanged",
      "events$",
      "filter",
      "map",
      "observable",
      "RxObservable",
      "state$",
      "takeUntil",
    ]);
    expect(scanned.flatMap(([, names]) => names)).toContain("@@observable");

    // Names the offending export, not just the fact that one exists.
    expect(
      scanned
        .filter(([, names]) => names.includes("undefined"))
        .map(([exportName]) => exportName),
    ).toStrictEqual([]);
  });

  it("scans what the public factories actually hand back", () => {
    // The prototype scan above cannot see a member installed on an instance —
    // an object literal or `Object.assign` would carry a computed key on the
    // object itself. These are the three objects a consumer receives.
    const router = createRouter([{ name: "home", path: "/" }]);
    const produced: [string, object][] = [
      ["observable", rx.observable(router)],
      ["state$", rx.state$(router)],
      ["events$", rx.events$(router)],
    ];

    // Control: the factories returned real objects, so the scan below has a
    // subject.
    expect(produced.map(([label]) => label)).toHaveLength(3);
    expect(
      produced.every(([, value]) => value instanceof rx.RxObservable),
    ).toBe(true);

    expect(
      produced
        .filter(([, value]) =>
          Object.getOwnPropertyNames(value).includes("undefined"),
        )
        .map(([label]) => label),
    ).toStrictEqual([]);
  });
});
