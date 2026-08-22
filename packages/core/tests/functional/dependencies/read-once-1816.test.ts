import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";

/**
 * Both copy loops read each key TWICE — once for the `!== undefined` admission
 * test, once for the value they store — so the key is ADMITTED on one value and
 * STORED with another (#1816).
 *
 * ⚠ Inheritance is not required, which is what separates this from #1799/#1823:
 * a `Proxy` over a plain object with an OWN data property passes
 * `guardDependencies` (there is no accessor descriptor to find) and the loop
 * still reads it twice.
 */
const countingProxy = (
  source: Record<string, unknown>,
  onRead: (nth: number) => void,
): Record<string, unknown> => {
  let n = 0;

  return new Proxy(source, {
    get(target, key, receiver): unknown {
      if (key === "svc") {
        n += 1;
        onRead(n);

        return `read#${n}`;
      }

      return Reflect.get(target, key, receiver);
    },
  });
};

describe("dependencies: each key is read once, not twice (#1816)", () => {
  it("stores the value it admitted, through the constructor door", () => {
    let reads = 0;
    const bag = countingProxy({ svc: "seed" }, (n) => {
      reads = n;
    });

    const router = createRouter([{ name: "a", path: "/a" }], {}, bag as never);

    expect(reads).toBe(1);
    expect(getDependenciesApi(router).get("svc" as never)).toBe("read#1");

    router.dispose();
  });

  it("stores the value it admitted, through setAll", () => {
    let reads = 0;
    const bag = countingProxy({ svc: "seed" }, (n) => {
      reads = n;
    });

    const router = createRouter([{ name: "a", path: "/a" }]);
    const api = getDependenciesApi(router);

    api.setAll(bag);

    expect(reads).toBe(1);
    expect(api.get("svc" as never)).toBe("read#1");

    router.dispose();
  });

  it("still drops a genuinely undefined value — the anti-collapse control", () => {
    const router = createRouter([{ name: "a", path: "/a" }], {}, {
      gone: undefined,
      kept: "yes",
    } as never);
    const api = getDependenciesApi(router);

    expect(api.get("kept" as never)).toBe("yes");
    expect(api.has("gone")).toBe(false);

    router.dispose();
  });
});
