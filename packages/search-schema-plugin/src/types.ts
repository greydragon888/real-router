// packages/search-schema-plugin/src/types.ts

import type { Params } from "@real-router/core";

// =============================================================================
// Standard Schema V1 (inline — zero external deps)
// https://github.com/standard-schema/standard-schema
// =============================================================================

/** A single validation issue from Standard Schema V1. */
export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?:
    | readonly (PropertyKey | { readonly key: PropertyKey })[]
    | undefined;
}

/** Validation result — either success or failure. */
export type StandardSchemaV1Result<Output = unknown> =
  | { readonly value: Output }
  | { readonly issues: readonly StandardSchemaV1Issue[] };

/**
 * Standard Schema V1 interface.
 *
 * Supported by Zod 3.24+, Valibot 1.0+, ArkType.
 * The plugin doesn't depend on any specific schema library.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | StandardSchemaV1Result<Output>
      | Promise<StandardSchemaV1Result<Output>>;
    readonly types?:
      | {
          readonly input: Input;
          readonly output: Output;
        }
      | undefined;
  };
}

// =============================================================================
// Plugin Options
// =============================================================================

export interface SearchSchemaPluginOptions {
  /**
   * Error handling mode.
   * - "development" (default): strip invalid + console.error
   * - "production": silent strip
   *
   * For recovery of invalid params use defaultParams (strip + merge + diagnostics).
   * For filling absent params use .default() in schema (no diagnostics).
   * .catch() is not recommended — suppresses errors, mode: "development" won't see the issue.
   */
  readonly mode?: "development" | "production";

  /**
   * Strip search params not described in schema.
   * - false (default): unknown params pass through
   * - true: unknown params are removed
   *
   * Per-route override: .strict() / .passthrough() in Zod schema.
   */
  readonly strict?: boolean;

  /**
   * Custom error handler (overrides mode completely).
   * Must return cleaned params.
   *
   * Contract:
   * - Returned params are used as-is, without re-validation.
   *   Responsibility for correctness is on the callback author.
   *   (Re-validation would risk infinite loops.)
   * - Exceptions from onError propagate up without suppression.
   *   Consistent with interceptor behavior in core.
   * - When onError is set, neither console.error (mode: "development"),
   *   nor silent strip (mode: "production") are executed.
   *   All responsibility for diagnostics and recovery is on the callback.
   */
  readonly onError?: (
    routeName: string,
    params: Params,
    issues: readonly StandardSchemaV1Issue[],
  ) => Params;
}
