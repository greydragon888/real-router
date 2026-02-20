// packages/type-guards/modules/internal/meta-fields.ts

import { isParams, isParamsStrict } from "../guards/params";
import { isRouteName } from "../guards/routes";

import type { Params, StateMeta } from "@real-router/types";

/**
 * Type guard for meta object fields if present.
 * Used by both isStateStrict and isHistoryState.
 *
 * @param meta - Value to check
 * @returns true if meta has valid StateMeta structure
 * @internal
 */
export function isMetaFields<MP extends Params = Params>(
  meta: unknown,
): meta is StateMeta<MP> {
  // Early check: must be a non-null object
  if (typeof meta !== "object" || meta === null) {
    return false;
  }

  const obj = meta as Record<string, unknown>;

  // Check params field if present
  if ("params" in obj && !isParamsStrict(obj.params)) {
    return false;
  }

  // Check options field if present
  if ("options" in obj && typeof obj.options !== "object") {
    return false;
  }

  // Check id field if present
  if ("id" in obj && typeof obj.id !== "number") {
    return false;
  }

  return true;
}

/**
 * Type guard helper that checks if required State fields have valid types.
 * Validates that name, path, and params exist and have correct types.
 * Used by both isStateStrict and isHistoryState.
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
