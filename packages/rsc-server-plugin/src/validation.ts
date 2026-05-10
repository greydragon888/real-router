import { ALLOWED_RSC_MODES, ERROR_PREFIX } from "./constants";
import { createLoadersValidator } from "./shared-ssr";

export const validateLoaders = createLoadersValidator(
  ERROR_PREFIX,
  ALLOWED_RSC_MODES,
);
