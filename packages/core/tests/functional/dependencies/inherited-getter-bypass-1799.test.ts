import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";

/**
 * `guardDependencies` (`src/guards.ts`) enumerates with `for…in`, which walks the
 * prototype chain, and then asks `Object.getOwnPropertyDescriptor`, which answers
 * only about OWN properties. For an inherited name the descriptor is `undefined`,
 * so `?.get` never fires: the guard iterates exactly the names it cannot answer
 * about (#1799).
 *
 * ⚠ The issue says the guard "passes and the copy loop then reads — getter
 * invoked 2 times". Corrected while fixing (#1816 spotted it): the guard invokes
 * the accessor ZERO times — `getOwnPropertyDescriptor` returns a descriptor
 * without calling it. Both reads are inside the copy loop.
 */
const withGetter = (
  onRead: () => void,
): { proto: object; own: Record<string, unknown> } => {
  const proto = {};

  Object.defineProperty(proto, "svc", {
    enumerable: true,
    configurable: true,
    get(): string {
      onRead();

      return "FORBIDDEN";
    },
  });

  const own = {};

  Object.defineProperty(own, "svc", {
    enumerable: true,
    configurable: true,
    get(): string {
      onRead();

      return "FORBIDDEN";
    },
  });

  return { proto, own };
};

describe("dependencies: an inherited getter must not walk past the guard (#1799)", () => {
  it("refuses an OWN getter — the control that proves the guard works", () => {
    let reads = 0;
    const { own } = withGetter(() => {
      reads += 1;
    });

    expect(() =>
      createRouter([{ name: "a", path: "/a" }], {}, own as never),
    ).toThrow('dependencies cannot contain getters: "svc"');
    expect(reads).toBe(0);
  });

  it("never adopts the SAME getter one Object.create away", () => {
    let reads = 0;
    const { proto } = withGetter(() => {
      reads += 1;
    });

    const router = createRouter(
      [{ name: "a", path: "/a" }],
      {},
      Object.create(proto) as never,
    );

    // The inherited name is not supported input, so it must not become a
    // dependency — by whichever route: refused at the guard, or never copied.
    expect(getDependenciesApi(router).get("svc")).toBeUndefined();
    // And the forbidden accessor must not have run at all.
    expect(reads).toBe(0);

    router.dispose();
  });

  it("reads the CAPTURED Object.keys, so a post-boot shim cannot blind it", () => {
    // ⚑ The one cell that pins `guards.ts` itself. Everything else in this
    // file is green on a full revert of that line, because `for…in` and
    // `Object.keys` return the SAME verdict for every plain bag — an inherited
    // name has no own descriptor, so `?.get` could never fire on the extra
    // names `for…in` visits. The walk change bought coherence, not behaviour.
    //
    // What it DID change is the binding: `for…in` is syntax and cannot be
    // re-pointed, a raw `Object.keys` can. The first version of the fix reached
    // for the raw global three lines below this file's own capture and made the
    // guard strictly weaker than the code it replaced. This cell is the only
    // thing that tells the two apart.
    const bag: Record<string, unknown> = {};

    Object.defineProperty(bag, "svc", {
      enumerable: true,
      configurable: true,
      get: () => "FORBIDDEN",
    });

    const nativeKeys = Object.keys;

    const attempt = (): string => {
      try {
        // Blind the LIVE intrinsic, after core has loaded.
        (Object as { keys: unknown }).keys = () => [];

        createRouter([{ name: "a", path: "/a" }], {}, bag as never).dispose();

        return "ACCEPTED — the guard was blinded by the shim";
      } catch (error) {
        return (error as Error).message;
      } finally {
        (Object as { keys: unknown }).keys = nativeKeys;
      }
    };

    expect(attempt()).toBe('dependencies cannot contain getters: "svc"');
  });

  it("keeps an ordinary own value working — the anti-collapse control", () => {
    const router = createRouter([{ name: "a", path: "/a" }], {}, {
      svc: "plain",
    } as never);

    expect(getDependenciesApi(router).get("svc")).toBe("plain");

    router.dispose();
  });
});
