import { logger } from "@real-router/logger";

import { LOGGER_CONTEXT } from "./constants";

export const safelyEncodePath = (path: string): string => {
  try {
    return encodeURI(decodeURI(path));
  } catch (error) {
    logger.warn(LOGGER_CONTEXT, `Could not encode path "${path}"`, error);

    return path;
  }
};
