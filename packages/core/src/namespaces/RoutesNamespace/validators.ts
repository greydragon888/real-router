// packages/core/src/namespaces/RoutesNamespace/validators.ts

import { getTypeDescription } from "type-guards";

export function validateSetRootPathArgs(
  rootPath: unknown,
): asserts rootPath is string {
  if (typeof rootPath !== "string") {
    throw new TypeError(
      `[router.setRootPath] rootPath must be a string, got ${getTypeDescription(rootPath)}`,
    );
  }
}
