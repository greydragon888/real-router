// packages/validation-plugin/src/validators/state.ts

import { isString, isParams, getTypeDescription } from "type-guards";

export function validateMakeStateArgs(
  name: unknown,
  params: unknown,
  path: unknown,
): void {
  if (!isString(name)) {
    throw new TypeError(
      `[router.makeState] Invalid name: ${getTypeDescription(name)}. Expected string.`,
    );
  }

  if (params !== undefined && !isParams(params)) {
    throw new TypeError(
      `[router.makeState] Invalid params: ${getTypeDescription(params)}. Expected plain object.`,
    );
  }

  if (path !== undefined && !isString(path)) {
    throw new TypeError(
      `[router.makeState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
    );
  }
}
