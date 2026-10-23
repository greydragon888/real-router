import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

import { captureUnhandledRejections } from "../../helpers";

import type { Router } from "@real-router/core";

/**
 * #2797 — a leave listener's promise is consumed on every arc, the one where an
 * earlier listener has already cancelled the navigation included.
 *
 * Every `subscribeLeave` listener runs, and the later ones run with
 * `signal.aborted === true`. A promise nothing is attached to rejects as an
 * unhandled rejection, which ends a Node process under the default
 * `--unhandled-rejections=throw` — whatever the navigation itself rejected with.
 *
 * The CONTROL is the same rejection with no earlier cancel: it is consumed and
 * becomes the navigation's own rejection.
 */
describe("a leave listener that rejects after an earlier one cancelled (#2797)", () => {
  const describeError = (error: unknown): string =>
    (error as { code?: string }).code ?? (error as Error).message;

  /** `<how navigate() settled>; unhandled: [<messages>]`. */
  const run = async (
    first: (router: Router, controller: AbortController) => void,
  ): Promise<string> => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    await router.start("/");

    const controller = new AbortController();

    router.subscribeLeave(() => {
      first(router, controller);
    });
    router.subscribeLeave(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));

      throw new Error("late leave failure");
    });

    let outcome = "pending";
    const unhandled = await captureUnhandledRejections(() => {
      void router.navigate("a", {}, {}, { signal: controller.signal }).then(
        () => {
          outcome = "resolved";
        },
        (error: unknown) => {
          outcome = describeError(error);
        },
      );
    });

    router.dispose();

    const leaked = unhandled.map((reason) => describeError(reason));

    return `${outcome}; unhandled: [${leaked.join(", ")}]`;
  };

  it("is consumed whichever way the navigation ended", async () => {
    const table = {
      "the first listener aborts the caller's signal": await run(
        (_router, controller) => {
          controller.abort(new Error("caller abort"));
        },
      ),
      "the first listener calls router.stop()": await run((router) => {
        router.stop();
      }),
      "CONTROL — the first listener does nothing": await run(() => undefined),
    };

    expect(table).toStrictEqual({
      "the first listener aborts the caller's signal":
        "CANCELLED; unhandled: []",
      "the first listener calls router.stop()": "CANCELLED; unhandled: []",
      "CONTROL — the first listener does nothing":
        "late leave failure; unhandled: []",
    });
  });
});
