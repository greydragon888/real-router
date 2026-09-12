import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { installSpyValidator } from "../helpers/spyValidator";

/**
 * Both codec directions read the container they are handed ONCE (#2254 row 5).
 *
 * A codec is application code, so what it returns may be backed by accessors —
 * and a second read is a second call into it. At two reads the value the checks
 * judge is not the value that ships, which is the #2134 class.
 *
 * ⚠ The asymmetry is what made it visible: `encodeParams` was already read once
 * and `decodeParams` twice, so the pair disagreed about the same contract.
 */
/**
 * ⚠ `reset` is not decoration: `start()` runs the codec too, so a counter live
 * across it reports the start's read plus the call's and every cell here reads
 * 2 for the wrong reason.
 */
const counting = (): {
  container: unknown;
  reads: () => number;
  reset: () => void;
} => {
  let reads = 0;

  return {
    container: {
      get params() {
        reads += 1;

        return { id: "7" };
      },
      get search() {
        return {};
      },
    },
    reads: () => reads,
    reset: () => {
      reads = 0;
    },
  };
};

describe("a codec's container is read once (#2254)", () => {
  it("encodeParams — the direction that already held", async () => {
    const probe = counting();
    const router = createRouter([
      {
        name: "u",
        path: "/u/:id",
        encodeParams: () => probe.container,
      } as never,
    ]);

    await router.start("/u/7");
    probe.reset();

    router.buildPath("u", { id: "7" });

    expect(probe.reads()).toBe(1);
  });

  it("decodeParams — its twin", async () => {
    const probe = counting();
    const router = createRouter([
      {
        name: "u",
        path: "/u/:id",
        decodeParams: () => probe.container,
      } as never,
    ]);

    await router.start("/u/7");
    probe.reset();

    getPluginApi(router).matchPath("/u/7");

    expect(probe.reads()).toBe(1);
  });

  it("decodeParams — with a validator live, which reads the slot again", async () => {
    // ⚠ Its own arm, and it is not redundant: in bare core `getValidator()`
    // answers null, so the validator's read never happens and a single-arm cell
    // leaves half the fix unpinned. Measured — reverting just that line survived
    // until this existed.
    const probe = counting();
    const router = createRouter([
      {
        name: "u",
        path: "/u/:id",
        decodeParams: () => probe.container,
      } as never,
    ]);

    await router.start("/u/7");
    installSpyValidator(router);
    probe.reset();

    getPluginApi(router).matchPath("/u/7");

    expect(probe.reads()).toBe(1);
  });

  it("CONTROL — the decoder's value still reaches the state", async () => {
    // ⚑ Without this, a door that stopped calling the decoder at all would read
    // zero and pass the cell above.
    const router = createRouter([
      {
        name: "u",
        path: "/u/:id",
        decodeParams: () => ({ params: { id: "DECODED" }, search: {} }),
      },
    ]);

    await router.start("/u/7");

    expect(getPluginApi(router).matchPath("/u/7")?.params).toStrictEqual({
      id: "DECODED",
    });
  });
});
