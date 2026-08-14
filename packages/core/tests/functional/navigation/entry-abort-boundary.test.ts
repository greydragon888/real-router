import { describe, it, expect } from "vitest";

import { createRouter, errorCodes, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { NavigationOptions } from "@real-router/core/types";

/**
 * The boundary between "dead on arrival" and "died inside" — one rule, and it
 * used to be five.
 *
 * `navigate()` refuses a caller's already-aborted signal WITHOUT announcing:
 * nothing was announced, so nothing is owed a terminal event
 * (`external-signal-bridge-1684`). An abort that lands LATER is the opposite
 * case — the navigation exists, so it is announced and then cancelled, and
 * `TRANSITION_CANCEL` never precedes its own `TRANSITION_START` (#1732).
 *
 * ⚠ **Which of the two applied used to depend on WHICH `opts` field the getter
 * aborted on**, because `abortPreviousNavigation` re-read `opts.signal` after
 * the prologue had already read three other fields. `replace`, `reload` and
 * `redirected` are read before that re-read, so aborting from their getters
 * took the silent path — a navigation the caller was told about only through a
 * rejected promise, with no event of any kind. `forceDeactivate` is read after
 * it, and only that one produced the pair. Measured on all five before the fix:
 * four silent, one announced.
 *
 * The pre-check now consults the ENTRY snapshot, so the rule is one sentence:
 * refuse silently only when the signal was already dead when the router
 * received it. This matrix is what keeps it one sentence — the outcome never
 * discriminated (every cell rejects `TRANSITION_CANCELLED`), so the events are
 * what has to be asserted.
 */

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

interface Run {
  readonly seen: string[];
  readonly code: string | undefined;
  readonly state: string | undefined;
}

async function abortFromGetter(field: string): Promise<Run> {
  const router = createRouter(ROUTES);

  await router.start("/a");

  const seen: string[] = [];
  const api = getPluginApi(router);

  api.addEventListener(events.TRANSITION_START, () => seen.push("START"));
  api.addEventListener(events.TRANSITION_CANCEL, () => seen.push("CANCEL"));
  api.addEventListener(events.TRANSITION_ERROR, () => seen.push("ERROR"));

  const controller = new AbortController();
  let armed = false;

  const opts = new Proxy<NavigationOptions>(
    { signal: controller.signal },
    {
      get(target, property, receiver) {
        if (property === field && armed) {
          controller.abort(new Error("aborted from an opts getter"));
        }

        return Reflect.get(target, property, receiver) as unknown;
      },
    },
  );

  armed = true;

  const code = await router.navigate("b", {}, undefined, opts).then(
    () => undefined,
    (error: unknown) => (error as { code?: string }).code,
  );

  return { seen, code, state: router.getState()?.name };
}

describe("the entry boundary: dead on arrival vs died inside", () => {
  // Every field the prologue reads AFTER it has the signal. Listed rather than
  // derived, so a new `opts` field has to be added here deliberately.
  it.each(["reload", "replace", "redirected", "forceDeactivate"])(
    "an abort from the `%s` getter is announced, then cancelled",
    async (field) => {
      const run = await abortFromGetter(field);

      // THE assertion: the navigation existed, so both events are owed — and in
      // this order (#1732).
      expect(run.seen).toStrictEqual(["START", "CANCEL"]);
      expect(run.code).toBe(errorCodes.TRANSITION_CANCELLED);
      expect(run.state).toBe("a");
    },
  );

  it("an abort from the `signal` getter itself stays silent — the router never held a live signal", async () => {
    const run = await abortFromGetter("signal");

    expect(run.seen).toStrictEqual([]);
    expect(run.code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(run.state).toBe("a");
  });

  it("a signal aborted before the call stays silent — the control for the rule", async () => {
    const router = createRouter(ROUTES);

    await router.start("/a");

    const seen: string[] = [];
    const api = getPluginApi(router);

    api.addEventListener(events.TRANSITION_START, () => seen.push("START"));
    api.addEventListener(events.TRANSITION_CANCEL, () => seen.push("CANCEL"));

    const dead = new AbortController();

    dead.abort(new Error("pre-aborted"));

    const code = await router
      .navigate("b", {}, undefined, { signal: dead.signal })
      .then(
        () => undefined,
        (error: unknown) => (error as { code?: string }).code,
      );

    expect(seen).toStrictEqual([]);
    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.getState()?.name).toBe("a");
  });
});
