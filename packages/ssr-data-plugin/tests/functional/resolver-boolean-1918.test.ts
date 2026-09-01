/**
 * A resolver that returns a boolean is refused, and the refusal says why (#1918).
 *
 * ⚑ The refusal itself is what the published type contracts:
 * `SsrModeResolver<M> = (state) => M` with `M extends SsrMode`, i.e. a string.
 * `boolean` is a member of `SsrModeConfig` — the STATIC slot — and never of what
 * a resolver returns. Accepting booleans from a resolver would widen that type;
 * what was wrong is only the message, which listed the allowed strings and left
 * the reader to guess why `ssr: false` works and `ssr: () => false` does not.
 */

import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { ssrDataPluginFactory } from "../../src";

const routes = [{ name: "p", path: "/p" }];

const start = async (ssr: unknown): Promise<void> => {
  const router = createRouter(routes);

  router.usePlugin(
    ssrDataPluginFactory({
      p: {
        ssr: ssr as never,
        loader: () => async () => "x",
      },
    }),
  );
  await router.start("/p");
};

describe("a resolver returning a boolean (#1918)", () => {
  it.each([[false], [true]])(
    "names the static shorthand when a resolver returns %s",
    async (value) => {
      await expect(start(() => value)).rejects.toThrow(
        new RegExp(`resolver.+returned ${String(value)}`, "u"),
      );
    },
  );

  it("points at the slot that does accept the boolean", async () => {
    await expect(start(() => false)).rejects.toThrow(/ssr: false/u);
  });

  it("CONTROL — the static boolean still resolves, it is the documented shorthand", async () => {
    await expect(start(false)).resolves.toBeUndefined();
  });

  it("CONTROL — a resolver returning a valid mode string still resolves", async () => {
    await expect(start(() => "client-only")).resolves.toBeUndefined();
  });
});
