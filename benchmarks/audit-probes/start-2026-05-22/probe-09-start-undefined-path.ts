/**
 * Probe 09: router.start(undefined) without browser-plugin interceptor.
 *
 * Contract per CLAUDE.md: «`start(path)` requires a path string. Core is
 * platform-agnostic — the caller always provides the path. Browser-plugin
 * overrides `start(path?)` to make path optional…»
 *
 * Without the plugin, what does start() do? Validator probably throws if
 * present, but core has structural guards only — does it actually validate?
 */

import { createRouter, errorCodes } from "@real-router/core";

async function main(): Promise<void> {
  const router = createRouter([{ name: "home", path: "/" }]);

  // Type-erase the call
  let r: unknown;
  try {
    // @ts-expect-error - intentional: testing missing path
    r = await router.start();
    console.log("start() returned:", r);
  } catch (e) {
    console.log("start() threw:", (e as Error).message, "code=", (e as { code?: string }).code);
  }

  console.log("After invalid start, router.isActive():", router.isActive());

  // Can we recover and start again with a real path?
  try {
    const s = await router.start("/");
    console.log("Recovery start succeeded, state.name=", s.name);
  } catch (e) {
    console.log("Recovery start failed:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
