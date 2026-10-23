import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { captureUnhandledRejections } from "../../helpers";

import type { Router } from "@real-router/core";

/**
 * An async guard asked by a SYNCHRONOUS check has its promise consumed (#2797's
 * class).
 *
 * `canNavigateTo` and the 404 door's consultation of the departing route's
 * `canDeactivate` call the guard and cannot wait for a promise: a non-boolean
 * answer reads as "blocked". The promise itself is still application code's,
 * and one that rejects — an async guard whose request failed — is otherwise an
 * unhandled rejection, which ends a Node process under the default
 * `--unhandled-rejections=throw`.
 *
 * The answers of both checks are the CONTROL: consuming the promise does not
 * change what either check returns or throws.
 */
describe("an async guard asked by a synchronous check (#2797)", () => {
  const describeError = (error: unknown): string =>
    (error as { code?: string }).code ?? (error as Error).message;

  /** A router on `a`, with `guard` on the given side of `a` or of `b`. */
  const mk = async (install: (router: Router) => void): Promise<Router> => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    install(router);
    await router.start("/a");

    return router;
  };

  /** `<what the check answered>; unhandled: [<messages>]`. */
  const run = async (
    install: (router: Router) => void,
    check: (router: Router) => unknown,
  ): Promise<string> => {
    const router = await mk(install);
    let answer = "pending";
    const unhandled = await captureUnhandledRejections(() => {
      try {
        answer = `returned ${String(check(router))}`;
      } catch (error) {
        answer = `threw ${describeError(error)}`;
      }
    });

    router.dispose();

    const leaked = unhandled.map((reason) => describeError(reason));

    return `${answer}; unhandled: [${leaked.join(", ")}]`;
  };

  const rejectingActivate = (router: Router): void => {
    getLifecycleApi(router).addActivateGuard("b", () => async () => {
      throw new Error("network down");
    });
  };

  const rejectingDeactivate = (router: Router): void => {
    getLifecycleApi(router).addDeactivateGuard("a", () => async () => {
      throw new Error("network down");
    });
  };

  // An async guard that starts a navigation before its first `await`: the
  // consultation is a window of the reentrancy ban, so the call throws inside
  // the async body and the guard's promise rejects with that refusal.
  const navigatingDeactivate = (router: Router): void => {
    getLifecycleApi(router).addDeactivateGuard("a", () => async () => {
      await router.navigate("b");

      return true;
    });
  };

  const resolvingActivate = (router: Router): void => {
    getLifecycleApi(router).addActivateGuard("b", () => async () => true);
  };

  const canNavigateToB = (router: Router): unknown => router.canNavigateTo("b");
  const notFound = (router: Router): unknown =>
    router.navigateToNotFound("/nowhere");

  it("consumes the guard's promise, and the check answers as before", async () => {
    const table = {
      "canNavigateTo — an activate guard rejects": await run(
        rejectingActivate,
        canNavigateToB,
      ),
      "navigateToNotFound — the departing route's canDeactivate rejects":
        await run(rejectingDeactivate, notFound),
      "navigateToNotFound — the canDeactivate starts a navigation": await run(
        navigatingDeactivate,
        notFound,
      ),
      "CONTROL — canNavigateTo, an activate guard resolves": await run(
        resolvingActivate,
        canNavigateToB,
      ),
    };

    expect(table).toStrictEqual({
      "canNavigateTo — an activate guard rejects":
        "returned false; unhandled: []",
      "navigateToNotFound — the departing route's canDeactivate rejects":
        "threw CANNOT_DEACTIVATE; unhandled: []",
      "navigateToNotFound — the canDeactivate starts a navigation":
        "threw CANNOT_DEACTIVATE; unhandled: []",
      "CONTROL — canNavigateTo, an activate guard resolves":
        "returned false; unhandled: []",
    });
  });
});
