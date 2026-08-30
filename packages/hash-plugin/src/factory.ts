import { getPluginApi } from "@real-router/core/api";

import { createSafeBrowser, normalizeBase } from "./browser-env";
import { defaultOptions, source } from "./constants";
import { buildHashLocation, createHashPrefixRegex } from "./hash-utils";
import { HashPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { Browser, SharedFactoryState } from "./browser-env";
import type { HashPluginOptions } from "./types";
import type { PluginFactory, Router } from "@real-router/core";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;

export function hashPluginFactory(
  opts?: Partial<HashPluginOptions>,
  browser?: Browser,
): PluginFactory {
  validateOptions(opts);

  const definedOpts = opts
    ? Object.fromEntries(
        objectEntries(opts).filter(
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime may receive explicit undefined via conditional spreads (exactOptionalPropertyTypes does not apply here)
          ([, value]) => value !== undefined,
        ),
      )
    : {};
  const options: Required<HashPluginOptions> = {
    ...defaultOptions,
    ...definedOpts,
  };

  options.base = normalizeBase(options.base);

  const prefixRegex = createHashPrefixRegex(options.hashPrefix);
  const resolvedBrowser =
    browser ??
    createSafeBrowser(
      () =>
        buildHashLocation(
          globalThis.location.hash,
          globalThis.location.search,
          prefixRegex,
        ),
      "hash-plugin",
    );

  const transitionOptions = {
    forceDeactivate: options.forceDeactivate,
    source,
    replace: true as const,
  };

  const shared: SharedFactoryState = { removePopStateListener: undefined };

  return function hashPlugin(routerBase) {
    const plugin = new HashPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      resolvedBrowser,
      prefixRegex,
      transitionOptions,
      shared,
    );

    return plugin.getPlugin();
  };
}
