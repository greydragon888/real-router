import { getPluginApi } from "@real-router/core";
import {
  createSafeBrowser,
  normalizeBase,
  safelyEncodePath,
} from "browser-env";

import { defaultOptions, source } from "./constants";
import { createHashPrefixRegex, extractHashPath } from "./hash-utils";
import { HashPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { HashPluginOptions } from "./types";
import type { PluginFactory, Router } from "@real-router/core";
import type { Browser, SharedFactoryState } from "browser-env";

export function hashPluginFactory(
  opts?: Partial<HashPluginOptions>,
  browser?: Browser,
): PluginFactory {
  validateOptions(opts);

  const options: Required<HashPluginOptions> = { ...defaultOptions, ...opts };

  options.base = normalizeBase(options.base);

  const prefixRegex = createHashPrefixRegex(options.hashPrefix);
  const resolvedBrowser =
    browser ??
    createSafeBrowser(
      () =>
        safelyEncodePath(
          extractHashPath(globalThis.location.hash, prefixRegex),
        ) + globalThis.location.search,
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
