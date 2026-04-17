import {
  createOptionsValidator,
  safeBaseRule,
  safeHashPrefixRule,
} from "./browser-env/index.js";
import { LOGGER_CONTEXT, defaultOptions } from "./constants";

import type { HashPluginOptions } from "./types";

export const validateOptions = createOptionsValidator<HashPluginOptions>(
  defaultOptions,
  LOGGER_CONTEXT,
  { base: safeBaseRule, hashPrefix: safeHashPrefixRule },
);
