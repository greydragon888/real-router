import vm from "node:vm";

import { describe, expect, it } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";

import type { Route, Router } from "@real-router/core";

/**
 * A guard's answer counts whatever realm its promise came from (#2251).
 *
 * ⚑ **The seam recognises a THENABLE, not `Promise.prototype`.** `instanceof`
 * compares against the CURRENT realm's prototype, so a promise minted in a `vm`
 * context, an iframe, a worker bridge or a federated module is a genuine
 * thenable and not an `instanceof` match — and the guard walk then takes its
 * SYNCHRONOUS branch, where a pending object is truthy.
 *
 * ⚠ **The failure is not "the `false` is discarded", it is "the guard is never
 * awaited".** Measured: `navigate` resolves BEFORE the guard settles, so the
 * navigation races its own authorisation and wins. Whatever the guard eventually
 * answers arrives after the commit.
 *
 * ⚠ **`subscribeLeave` is NOT part of this.** Its listeners go through
 * `Promise.allSettled`, which duck-types by specification, and its contract
 * consumes settle/reject rather than the resolved value — measured, a `LeaveFn`
 * resolving `false` navigates from EITHER realm, so there is no divergence to
 * fix there. The same holds for the `start` interceptor seam, which already
 * tests `typeof result.then === "function"`.
 */
const context = vm.createContext({ setTimeout });

/** A promise from another realm: a real thenable, not `instanceof Promise`. */
// eslint-disable-next-line sonarjs/code-eval -- a foreign realm is the SUBJECT: the only way to mint a thenable whose prototype is not this realm's
const foreign = vm.runInContext(
  "(value, ms) => new Promise((resolve) => setTimeout(() => resolve(value), ms ?? 0))",
  context,
) as (value: unknown, ms?: number) => Promise<boolean>;

const native = (value: unknown, ms = 0): Promise<boolean> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve(value as boolean);
    }, ms);
  });

type Mint = (value: unknown, ms?: number) => Promise<boolean>;

const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "gated", path: "/gated" },
];

async function started(extra: Partial<Route>, at = "/home"): Promise<Router> {
  const router = createRouter(
    ROUTES.map((r) => (r.name === "gated" ? { ...r, ...extra } : r)),
  );

  await router.start(at);

  return router;
}

/** The navigation's outcome, reduced to what the guard was asked to decide. */
async function outcome(router: Router, to: string): Promise<string> {
  try {
    await router.navigate(to);

    return "NAVIGATED";
  } catch (error) {
    return `BLOCKED ${(error as { code?: string }).code ?? "?"}`;
  }
}

describe("a guard's promise is honoured from any realm (#2251)", () => {
  it("canActivate — a FOREIGN promise resolving false blocks, exactly as a native one does", async () => {
    const foreignRouter = await started({
      canActivate: () => () => foreign(false),
    });
    const nativeRouter = await started({
      canActivate: () => () => native(false),
    });

    const fromForeign = await outcome(foreignRouter, "gated");
    const fromNative = await outcome(nativeRouter, "gated");

    // Stated as a COMPARISON: the realm of the promise must not decide.
    expect(fromForeign).toBe(fromNative);
    expect(fromForeign).toBe(`BLOCKED ${errorCodes.CANNOT_ACTIVATE}`);

    foreignRouter.stop();
    nativeRouter.stop();
  });

  it("canDeactivate — the same, on the other guard (#2251)", async () => {
    // The issue measured only `canActivate`; both doors share one walk, so the
    // divergence is the same one and this cell is what says so.
    const build = async (mint: Mint): Promise<string> => {
      const router = createRouter([
        { name: "home", path: "/home" },
        {
          name: "leaver",
          path: "/leaver",
          canDeactivate: () => () => mint(false),
        },
      ]);

      await router.start("/leaver");

      const result = await outcome(router, "home");

      router.stop();

      return result;
    };

    const fromForeign = await build(foreign);
    const fromNative = await build(native);

    expect(fromForeign).toBe(fromNative);
    expect(fromForeign).toBe(`BLOCKED ${errorCodes.CANNOT_DEACTIVATE}`);
  });

  it("the guard is AWAITED — navigate does not resolve before the answer arrives", async () => {
    // The sharper half: a foreign guard that ALLOWS still reveals the defect,
    // because the sync branch commits without waiting. Order, not value.
    const order: string[] = [];
    const router = await started({
      canActivate: () => () => {
        const pending = foreign(true, 30);

        void pending.then(() => {
          order.push("guard");
        });

        return pending;
      },
    });

    await router.navigate("gated");
    order.push("navigate");

    expect(order).toStrictEqual(["guard", "navigate"]);

    router.stop();
  });

  it("CONTROL — a plain synchronous answer is untouched, both polarities", async () => {
    const blocking = await started({ canActivate: () => () => false });
    const allowing = await started({ canActivate: () => () => true });

    await expect(outcome(blocking, "gated")).resolves.toBe(
      `BLOCKED ${errorCodes.CANNOT_ACTIVATE}`,
    );
    await expect(outcome(allowing, "gated")).resolves.toBe("NAVIGATED");

    blocking.stop();
    allowing.stop();
  });

  it("reads `then` ONCE — a slot that stops answering a function is still awaited (#2136)", async () => {
    // The mechanism this fix INTRODUCED, pinned on its own. Deciding on read #1
    // and letting `await` take read #2 is the defect #2136 measured on the
    // emitter; capturing the function is what makes the second read impossible.
    let reads = 0;
    const drifting = {
      // eslint-disable-next-line unicorn/no-thenable -- the drifting `then` slot IS the subject under test
      get then(): unknown {
        reads += 1;

        return reads === 1
          ? (onFulfilled: (value: boolean) => void): void => {
              onFulfilled(false);
            }
          : undefined;
      },
    };

    const router = await started({
      canActivate: () => () => drifting as never,
    });

    await expect(outcome(router, "gated")).resolves.toBe(
      `BLOCKED ${errorCodes.CANNOT_ACTIVATE}`,
    );

    expect(reads).toBe(1);

    router.stop();
  });

  it("a hostile `then` fails the navigation through the guard's own channel", async () => {
    // Reading `then` runs application code — an accessor or a `Proxy` trap — and
    // this is the FIRST read, so a throw originates here. It must reach the same
    // error channel a throwing guard does, not escape as a bare `TypeError`.
    for (const hostile of [
      (): unknown => ({
        // eslint-disable-next-line unicorn/no-thenable -- a hostile `then` accessor IS the subject
        get then(): never {
          throw new TypeError("hostile accessor");
        },
      }),
      (): unknown =>
        new Proxy(
          {},
          {
            get(): never {
              throw new TypeError("hostile trap");
            },
          },
        ),
    ]) {
      const router = await started({
        canActivate: () => hostile as never,
      });

      await expect(outcome(router, "gated")).resolves.toBe(
        `BLOCKED ${errorCodes.CANNOT_ACTIVATE}`,
      );

      router.stop();
    }
  });

  it("CONTROL — null and undefined stay on the falsy branch, as before the widening", async () => {
    // `GuardFn` declares `boolean | Promise<boolean>`, but a JS caller is not
    // bound by that. The optional chain is what keeps them answering `blocked`
    // rather than throwing on a property read.
    for (const value of [null, undefined]) {
      const router = await started({
        canActivate: () => (): never => value as never,
      });

      await expect(outcome(router, "gated")).resolves.toBe(
        `BLOCKED ${errorCodes.CANNOT_ACTIVATE}`,
      );

      router.stop();
    }
  });

  it("CONTROL — an object whose `then` is NOT callable stays on the synchronous branch", async () => {
    // The boundary of the widening: `{ then: 1 }` is truthy and not a thenable,
    // so it must read as "allowed" rather than be awaited forever.
    // eslint-disable-next-line unicorn/no-thenable -- a non-callable `then` IS the boundary under test
    const notThenable = { then: 1 } as unknown as boolean;
    const router = await started({ canActivate: () => () => notThenable });

    await expect(outcome(router, "gated")).resolves.toBe("NAVIGATED");

    router.stop();
  });
});
