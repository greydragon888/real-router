import { createOptionsValidator } from "browser-env";

import { LOGGER_CONTEXT, defaultOptions } from "./constants";

import type { HashPluginOptions } from "./types";

export const validateOptions = createOptionsValidator<HashPluginOptions>(
  defaultOptions,
  LOGGER_CONTEXT,
);
