import { createOptionsValidator } from "./browser-env/index.js";
import { LOGGER_CONTEXT, defaultOptions } from "./constants";

import type { NavigationPluginOptions } from "./types";

export const validateOptions = createOptionsValidator<NavigationPluginOptions>(
  defaultOptions,
  LOGGER_CONTEXT,
);
