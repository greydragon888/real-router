import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { LoggerConfig } from "@real-router/core/types";

/**
 * `cloneRouter` reads `opts.logger` ONCE (#1930).
 *
 * `CloneOptions` is unvalidated and application-owned, so a truthiness test plus
 * a spread were two calls into application code — and the SECOND answer shipped.
 * Counting the reads is what discriminates: a stable getter produces the same
 * outcome however many times it is read.
 *
 * ⚑ The FSM half of #1930 lives in `tests/functional/utils/fsm/fsm.test.ts`,
 * which is the path where that internal import is allowed.
 */
describe("cloneRouter reads opts.logger once (#1930)", () => {
  const baseCallback = (): void => {};
  const requestCallback = (): void => {};

  /** `{ logger }` answering the per-request config once, then `then`. */
  const driftingOpts = (
    then: unknown,
  ): { opts: unknown; reads: () => number } => {
    let reads = 0;
    const opts = {};

    Object.defineProperty(opts, "logger", {
      enumerable: true,
      configurable: true,
      get(): unknown {
        reads += 1;

        return reads <= 1 ? { level: "all", callback: requestCallback } : then;
      },
    });

    return { opts, reads: () => reads };
  };

  /** `reads · which callback the clone ended up with`. */
  const observe = (opts: unknown, reads: () => number): string => {
    const base = createRouter([{ name: "h", path: "/h" }], {
      logger: { level: "all", callback: baseCallback },
    } as never);
    const clone = cloneRouter(base, undefined, opts as never);
    const resolved = (
      getInternals(clone).logger as unknown as {
        getConfig: () => Partial<LoggerConfig>;
      }
    ).getConfig();

    let which = "neither";

    if (resolved.callback === requestCallback) {
      which = "per-request";
    } else if (resolved.callback === baseCallback) {
      which = "BASE";
    }

    clone.dispose();
    base.dispose();

    return `${reads()} read · ${which}`;
  };

  it("keeps the per-request callback whatever the slot answers next", () => {
    const rows: [string, string][] = [
      [
        "plain object",
        observe(
          { logger: { level: "all", callback: requestCallback } },
          () => 1,
        ),
      ],
    ];

    for (const [name, then] of [
      ["drifts to {}", {}],
      ["drifts to undefined", undefined],
    ] as const) {
      const drifting = driftingOpts(then);

      rows.push([name, observe(drifting.opts, drifting.reads)]);
    }

    const table = Object.fromEntries(rows);

    // The per-request callback IS the isolation `CloneOptions.logger` exists
    // for — an SSR clone binds a traceId to it. Falling back to the base's is
    // the process-wide sink every request then shares.
    expect(table).toStrictEqual({
      "plain object": "1 read · per-request",
      "drifts to {}": "1 read · per-request",
      "drifts to undefined": "1 read · per-request",
    });
  });
});
