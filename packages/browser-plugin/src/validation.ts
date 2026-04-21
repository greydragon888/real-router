import { createOptionsValidator, safeBaseRule } from "./browser-env";
import { LOGGER_CONTEXT, defaultOptions } from "./constants";

import type { BrowserPluginOptions } from "./types";

export const validateOptions = createOptionsValidator<BrowserPluginOptions>(
  defaultOptions,
  LOGGER_CONTEXT,
  { base: safeBaseRule },
);
