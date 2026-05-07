import { ERROR_PREFIX } from "./constants";
import { createLoadersValidator } from "./shared-ssr";

export const validateLoaders = createLoadersValidator(ERROR_PREFIX, [
  "full",
  "client-only",
]);
