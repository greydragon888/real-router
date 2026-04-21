import { createOptionsValidator, safeBaseRule } from "./browser-env";
import { LOGGER_CONTEXT, defaultOptions } from "./constants";

import type { NavigationPluginOptions } from "./types";

export const validateOptions = createOptionsValidator<NavigationPluginOptions>(
  defaultOptions,
  LOGGER_CONTEXT,
  { base: safeBaseRule },
);
