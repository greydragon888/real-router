import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router, State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * #2059 / #1929 — a claim that no longer holds its namespace must not act on
 * it. The two issues are the two methods of one root: the returned object
 * closed over the namespace STRING, so neither method could tell whether it
 * was still the holder.
 *
 * The census below is the guard, not the two point cells: a method added to
 * `ContextNamespaceClaim` later is driven by construction, and only stays
 * green while it too consults the record.
 */

const NS = "shared";

let router: Router;
let api: PluginApi;

async function startedState(): Promise<State> {
  await router.start("/home");

  return router.getState()!;
}

/** Claims `NS`, expecting the namespace to be free. */
function claim(): ReturnType<PluginApi["claimContextNamespace"]> {
  return api.claimContextNamespace(NS);
}

/** True when nobody holds `NS` — the only observable read of the record. */
function isFree(): boolean {
  try {
    api.claimContextNamespace(NS).release();

    return true;
  } catch {
    return false;
  }
}

describe("a released claim is inert (#2059, #1929)", () => {
  beforeEach(() => {
    router = createTestRouter();
    api = getPluginApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("write() after release() does not write", async () => {
    const stale = claim();
    const state = await startedState();

    stale.release();
    stale.write(state, "WRITTEN-AFTER-RELEASE");

    expect(Object.hasOwn(state.context, NS)).toBe(false);
  });

  it("write() from a stale claim does not overwrite the plugin that re-claimed", async () => {
    const stale = claim();

    stale.release();

    const owner = claim();
    const state = await startedState();

    owner.write(state, "OWNER-VALUE");
    stale.write(state, "STALE-CLAIM-OVERWRITE");

    expect(state.context[NS]).toBe("OWNER-VALUE");
  });

  it("release() from a stale claim does not free the plugin that re-claimed", () => {
    const stale = claim();

    stale.release();

    const owner = claim();

    stale.release();

    // The holder is still `owner`, so a third claim must be refused.
    expect(() => api.claimContextNamespace(NS)).toThrow(
      expect.objectContaining({
        code: errorCodes.CONTEXT_NAMESPACE_ALREADY_CLAIMED,
      }),
    );

    owner.release();

    expect(isFree()).toBe(true);
  });

  it("EVERY method on a released claim leaves the current holder untouched", async () => {
    const stale = claim();

    stale.release();

    const owner = claim();
    const state = await startedState();

    owner.write(state, "OWNER-VALUE");

    const surface = Object.keys(stale).filter(
      (key) =>
        typeof (stale as unknown as Record<string, unknown>)[key] ===
        "function",
    );

    // Census, not a threshold: a rename or an addition reds here first.
    expect(surface).toStrictEqual(["write", "release"]);

    for (const key of surface) {
      const method = (
        stale as unknown as Record<string, (...args: unknown[]) => unknown>
      )[key];

      method.call(stale, state, `STALE-${key.toUpperCase()}`);
    }

    expect(state.context[NS]).toBe("OWNER-VALUE");
    expect(() => api.claimContextNamespace(NS)).toThrow(
      expect.objectContaining({
        code: errorCodes.CONTEXT_NAMESPACE_ALREADY_CLAIMED,
      }),
    );
  });

  it("CONTROL — a live claim writes and releases normally", async () => {
    const live = claim();
    const state = await startedState();

    live.write(state, "CONTROL");

    expect(state.context[NS]).toBe("CONTROL");

    live.release();

    expect(isFree()).toBe(true);
  });

  it("CONTROL — release() is still idempotent while nobody re-claimed", () => {
    const only = claim();

    only.release();
    only.release();

    expect(isFree()).toBe(true);
  });
});
