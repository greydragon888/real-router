import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { routerConfig } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2796 — the popstate handler is browser-plugin's (`browser-env`), so a Back a
 * guard cancels quietly returns to the entry it started from here too.
 * browser-plugin's `quiet-cancelled-traversal-2796.test.ts` owns the cells for
 * a newer navigation behind the cancel.
 */

type Verdict =
  | "refuses (control)"
  | "throws RouterError(TRANSITION_CANCELLED)"
  | "rejects with RouterError(TRANSITION_CANCELLED)"
  | "throws an AbortError";

const VERDICTS: readonly Verdict[] = [
  "refuses (control)",
  "throws RouterError(TRANSITION_CANCELLED)",
  "rejects with RouterError(TRANSITION_CANCELLED)",
  "throws an AbortError",
];

// The traversal, the transition and the plugin's own return each take a task.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;

async function setup(): Promise<Router> {
  globalThis.history.replaceState(null, "", "/#/sentinel");
  globalThis.history.pushState(null, "", "/#/sentinel");
  globalThis.history.pushState(null, "", "/#/home");

  const created = createRouter(routerConfig, { defaultRoute: "home" });

  created.usePlugin(hashPluginFactory());
  await created.start();
  router = created;

  return created;
}

const at = (): { path: string; route: string | undefined } => ({
  path: globalThis.location.hash.slice(1),
  route: router?.getState()?.name,
});

describe("#2796 — a Back a guard cancels quietly returns to the entry it started from", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("the verdict table holds each verdict once", () => {
    expect(VERDICTS).toHaveLength(new Set(VERDICTS).size);
  });

  it.each(VERDICTS)(
    "a canDeactivate guard that %s: the page the Back was for is still one Back away",
    async (verdict) => {
      const r = await setup();

      await r.navigate("users.view", { id: "42" });

      let active = true;

      getLifecycleApi(r).addDeactivateGuard("users.view", () => () => {
        if (!active) {
          return true;
        }

        switch (verdict) {
          case "refuses (control)": {
            return false;
          }
          case "throws RouterError(TRANSITION_CANCELLED)": {
            throw new RouterError(errorCodes.TRANSITION_CANCELLED);
          }
          case "rejects with RouterError(TRANSITION_CANCELLED)": {
            return Promise.reject(
              new RouterError(errorCodes.TRANSITION_CANCELLED),
            );
          }
          case "throws an AbortError": {
            throw new DOMException("aborted", "AbortError");
          }
        }
      });

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({
        path: "/users/view/42",
        route: "users.view",
      });

      active = false;
      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({ path: "/home", route: "home" });
    },
  );
});
