import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

/**
 * `limits` reaches `EventEmitter` as data, not as the caller's object (#1875),
 * and a clone inherits the resolved limits rather than re-reading them (#1880).
 *
 * The population is the same one `urlParamsEncoding` has (#1839): `LimitsConfig`
 * declares every field `number`, so a `valueOf`-backed value or an accessor on
 * the bag needs a cast in TypeScript — and is ordinary in JavaScript, or in a
 * config assembled at runtime from computed properties or a class instance.
 */
const ROUTES = [{ name: "home", path: "/home" }];

const subscribeN = (
  router: ReturnType<typeof createRouter>,
  n: number,
): string => {
  const offs: (() => void)[] = [];

  try {
    for (let i = 0; i < n; i += 1) {
      offs.push(router.subscribe(() => {}));
    }

    return "ok";
  } catch (error) {
    return (error as Error).message;
  } finally {
    for (const off of offs) {
      off();
    }
  }
};

describe("limits are read once, at construction (#1875 / #1880)", () => {
  it("a valueOf-backed limit is coerced once, not once per registration", () => {
    let reads = 0;
    const maxListeners = {
      valueOf: () => {
        reads += 1;

        return 100;
      },
    };
    const router = createRouter(ROUTES, { limits: { maxListeners } } as never);
    const atConstruction = reads;

    expect(subscribeN(router, 10)).toBe("ok");
    expect(reads - atConstruction).toBe(0);

    expect(subscribeN(router, 10)).toBe("ok");
    expect(reads - atConstruction).toBe(0);

    router.dispose();
  });

  it("a DRIFTING limit cannot give a clone a different cap from its base (#1880)", () => {
    // ⚑ The getter sits on the BAG, which is the shape `createLimits`' spread
    // re-invokes. A `valueOf` on the VALUE is the other door and is covered
    // above; both must land on the same resolved number for base and clone.
    let reads = 0;
    const limits = Object.defineProperty({}, "maxListeners", {
      enumerable: true,
      configurable: true,
      get: () => {
        reads += 1;

        return reads === 1 ? 50 : 1;
      },
    }) as { maxListeners: number };

    const base = createRouter(ROUTES, { limits });
    const clone = cloneRouter(base);

    expect(reads).toBe(1);
    expect(subscribeN(base, 3)).toBe("ok");
    expect(subscribeN(clone, 3)).toBe("ok");

    clone.dispose();
    base.dispose();
  });

  it("CONTROL — an ordinary numeric limit still caps, and still reports itself", () => {
    const router = createRouter(ROUTES, { limits: { maxListeners: 2 } });

    expect(subscribeN(router, 3)).toContain("Listener limit (2) reached");
    expect(getPluginApi(router).getOptions().limits?.maxListeners).toBe(2);

    router.dispose();
  });
});
