// packages/type-guards/modules/internal/meta-fields.ts

import { isParams } from "../guards/params";
import { isRouteName } from "../guards/routes";

/**
 * Type guard helper that checks if required State fields have valid types.
 * Validates that name, path, and params exist and have correct types.
 * Used by isState and isStateStrict.
 *
 * @param obj - Object to check
 * @returns true if object has valid required fields
 * @internal
 */
export function isRequiredFields(obj: Record<string, unknown>): boolean {
  return (
    isRouteName(obj.name) &&
    typeof obj.path === "string" &&
    isParams(obj.params)
  );
}
