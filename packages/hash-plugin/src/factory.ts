import { getPluginApi } from "@real-router/core/api";

import {
  createSafeBrowser,
  normalizeBase,
  safelyEncodePath,
} from "./browser-env";
import { defaultOptions, source } from "./constants";
import { createHashPrefixRegex, extractHashPath } from "./hash-utils";
import { HashPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { Browser, SharedFactoryState } from "./browser-env";
import type { HashPluginOptions } from "./types";
import type { PluginFactory, Router } from "@real-router/core";

export function hashPluginFactory(
  opts?: Partial<HashPluginOptions>,
  browser?: Browser,
): PluginFactory {
  validateOptions(opts);

  const definedOpts = opts
    ? Object.fromEntries(
        Object.entries(opts).filter(
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
    createSafeBrowser(() => {
      const hashPath = safelyEncodePath(
        extractHashPath(globalThis.location.hash, prefixRegex),
      );

      return hashPath.includes("?")
        ? hashPath
        : hashPath + globalThis.location.search;
    }, "hash-plugin");

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
