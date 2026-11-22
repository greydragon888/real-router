import { vi } from "vitest";

import type { LogCallback, LoggerConfig } from "@real-router/core";
import type { Mock } from "vitest";

/** The context of the messages the plugin logs. */
export const PLUGIN_CONTEXT = "lifecycle-plugin";

/**
 * A router `logger` option that records every message, with the console off.
 * A hook's failure goes to the router's logger (#2975), so a cell reads it
 * from `callback`.
 */
export function recordingLogger(): {
  readonly logger: Partial<LoggerConfig>;
  readonly callback: Mock<LogCallback>;
  /** The errors the plugin logged, in the order it logged them. */
  readonly errors: () => unknown[];
} {
  const callback = vi.fn<LogCallback>();

  return {
    logger: { level: "none", callbackIgnoresLevel: true, callback },
    callback,
    errors: () =>
      callback.mock.calls
        .filter(
          ([level, context]) => level === "error" && context === PLUGIN_CONTEXT,
        )
        .map((call) => call[3]),
  };
}

/** The message the plugin logs for a failure of `hook` on `route`. */
export function hookFailure(hook: string, route: string): string {
  return `Error in ${hook} hook of route "${route}":`;
}

/**
 * Waits a macrotask, so the reactions to a rejection a hook returned have run.
 */
export async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
