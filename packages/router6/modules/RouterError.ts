// packages/real-router/modules/RouterError.ts

import { errorCodes } from "./constants";
import { deepFreezeState } from "./helpers";

import type { State } from "router6-types";

// Pre-compute Set of error code values for O(1) lookup in setCode()
// This avoids creating array and doing linear search on every setCode() call
const errorCodeValues = new Set(Object.values(errorCodes));

// Reserved built-in properties - throw error if user tries to set these
const reservedProperties = new Set(["code", "segment", "path", "redirect"]);

// Reserved method names - silently ignore attempts to overwrite these
const reservedMethods = new Set([
  "setCode",
  "setErrorInstance",
  "setAdditionalFields",
  "hasField",
  "getField",
  "toJSON",
]);

export class RouterError extends Error {
  [key: string]: unknown;

  // Using public properties to ensure structural compatibility
  // with RouterError interface in real-router-types
  readonly segment: string | undefined;
  readonly path: string | undefined;
  readonly redirect: State | undefined;

  // Note: code appears to be writable but setCode() should be used
  // to properly update both code and message together
  code: string;

  /**
   * Creates a new RouterError instance.
   *
   * The options object accepts built-in fields (message, segment, path, redirect)
   * and any additional custom fields, which will all be attached to the error instance.
   *
   * @param code - The error code (e.g., "ROUTE_NOT_FOUND", "CANNOT_ACTIVATE")
   * @param options - Optional configuration object
   * @param options.message - Custom error message (defaults to code if not provided)
   * @param options.segment - The route segment where the error occurred
   * @param options.path - The full path where the error occurred
   * @param options.redirect - Optional redirect state for navigation errors
   *
   * @example
   * ```typescript
   * // Basic error
   * const err1 = new RouterError("ROUTE_NOT_FOUND");
   *
   * // Error with custom message
   * const err2 = new RouterError("ERR", { message: "Something went wrong" });
   *
   * // Error with context and custom fields
   * const err3 = new RouterError("CANNOT_ACTIVATE", {
   *   message: "Insufficient permissions",
   *   segment: "admin",
   *   path: "/admin/users",
   *   userId: "123"  // custom field
   * });
   *
   * // Error with redirect
   * const err4 = new RouterError("TRANSITION_ERR", {
   *   redirect: { name: "home", path: "/", params: {} }
   * });
   * ```
   */
  constructor(
    code: string,
    {
      message,
      segment,
      path,
      redirect,
      ...rest
    }: {
      [key: string]: unknown;
      message?: string | undefined;
      segment?: string | undefined;
      path?: string | undefined;
      redirect?: State | undefined;
    } = {},
  ) {
    super(message ?? code);

    this.code = code;
    this.segment = segment;
    this.path = path;
    // Deep freeze redirect to prevent mutations (creates a frozen clone)
    this.redirect = redirect ? deepFreezeState(redirect) : undefined;

    // Assign custom fields, checking reserved properties and filtering out reserved method names
    // Issue #39: Throw for reserved properties to match setAdditionalFields behavior
    for (const [key, value] of Object.entries(rest)) {
      if (reservedProperties.has(key)) {
        throw new TypeError(
          `[RouterError] Cannot set reserved property "${key}"`,
        );
      }

      if (!reservedMethods.has(key)) {
        this[key] = value;
      }
    }
  }

  /**
   * Updates the error code and conditionally updates the message.
   *
   * If the current message is one of the standard error code values
   * (e.g., "ROUTE_NOT_FOUND", "SAME_STATES"), it will be replaced with the new code.
   * This allows keeping error messages in sync with codes when using standard error codes.
   *
   * If the message is custom (not a standard error code), it will be preserved.
   *
   * @param newCode - The new error code to set
   *
   * @example
   * // Message follows code (standard error code as message)
   * const err = new RouterError("ROUTE_NOT_FOUND", { message: "ROUTE_NOT_FOUND" });
   * err.setCode("CUSTOM_ERROR"); // message becomes "CUSTOM_ERROR"
   *
   * @example
   * // Custom message is preserved
   * const err = new RouterError("ERR", { message: "Custom error message" });
   * err.setCode("NEW_CODE"); // message stays "Custom error message"
   */
  setCode(newCode: string): void {
    this.code = newCode;

    // Only update message if it's a standard error code value (not a custom message)
    if (errorCodeValues.has(this.message)) {
      this.message = newCode;
    }
  }

  /**
   * Copies properties from another Error instance to this RouterError.
   *
   * This method updates the message, cause, and stack trace from the provided error.
   * Useful for wrapping native errors while preserving error context.
   *
   * @param err - The Error instance to copy properties from
   * @throws {TypeError} If err is null or undefined
   *
   * @example
   * ```typescript
   * const routerErr = new RouterError("TRANSITION_ERR");
   * try {
   *   // some operation that might fail
   * } catch (nativeErr) {
   *   routerErr.setErrorInstance(nativeErr);
   *   throw routerErr;
   * }
   * ```
   */
  setErrorInstance(err: Error): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!err) {
      throw new TypeError(
        "[RouterError.setErrorInstance] err parameter is required and must be an Error instance",
      );
    }

    this.message = err.message;
    this.cause = err.cause;
    this.stack = err.stack ?? "";
  }

  /**
   * Adds custom fields to the error object.
   *
   * This method allows attaching arbitrary data to the error for debugging or logging purposes.
   * All fields become accessible as properties on the error instance and are included in JSON serialization.
   *
   * Reserved method names (setCode, setErrorInstance, setAdditionalFields, hasField, getField, toJSON)
   * are automatically filtered out to prevent accidental overwriting of class methods.
   *
   * @param fields - Object containing custom fields to add to the error
   *
   * @example
   * ```typescript
   * const err = new RouterError("CANNOT_ACTIVATE");
   * err.setAdditionalFields({
   *   userId: "123",
   *   attemptedRoute: "/admin",
   *   reason: "insufficient permissions"
   * });
   *
   * console.log(err.userId); // "123"
   * console.log(JSON.stringify(err)); // includes all custom fields
   * ```
   */
  setAdditionalFields(fields: Record<string, unknown>): void {
    // Assign fields, throwing for reserved properties, silently ignoring methods
    for (const [key, value] of Object.entries(fields)) {
      if (reservedProperties.has(key)) {
        throw new TypeError(
          `[RouterError.setAdditionalFields] Cannot set reserved property "${key}"`,
        );
      }

      if (!reservedMethods.has(key)) {
        this[key] = value;
      }
    }
  }

  /**
   * Checks if a custom field exists on the error object.
   *
   * This method checks for both custom fields added via setAdditionalFields()
   * and built-in fields (code, message, segment, etc.).
   *
   * @param key - The field name to check
   * @returns `true` if the field exists, `false` otherwise
   *
   * @example
   * ```typescript
   * const err = new RouterError("ERR", { segment: "users" });
   * err.setAdditionalFields({ userId: "123" });
   *
   * err.hasField("userId");  // true
   * err.hasField("segment"); // true
   * err.hasField("unknown"); // false
   * ```
   */
  hasField(key: string): boolean {
    return key in this;
  }

  /**
   * Retrieves a custom field value from the error object.
   *
   * This method can access both custom fields and built-in fields.
   * Returns `undefined` if the field doesn't exist.
   *
   * @param key - The field name to retrieve
   * @returns The field value, or `undefined` if it doesn't exist
   *
   * @example
   * ```typescript
   * const err = new RouterError("ERR");
   * err.setAdditionalFields({ userId: "123", role: "admin" });
   *
   * err.getField("userId"); // "123"
   * err.getField("role");   // "admin"
   * err.getField("code");   // "ERR" (built-in field)
   * err.getField("unknown"); // undefined
   * ```
   */
  getField(key: string): unknown {
    return this[key];
  }

  /**
   * Serializes the error to a JSON-compatible object.
   *
   * This method is automatically called by JSON.stringify() and includes:
   * - Built-in fields: code, message, segment (if set), path (if set), redirect (if set)
   * - All custom fields added via setAdditionalFields() or constructor
   * - Excludes: stack trace (for security/cleanliness)
   *
   * @returns A plain object representation of the error, suitable for JSON serialization
   *
   * @example
   * ```typescript
   * const err = new RouterError("ROUTE_NOT_FOUND", {
   *   message: "Route not found",
   *   path: "/admin/users/123"
   * });
   * err.setAdditionalFields({ userId: "123" });
   *
   * JSON.stringify(err);
   * // {
   * //   "code": "ROUTE_NOT_FOUND",
   * //   "message": "Route not found",
   * //   "path": "/admin/users/123",
   * //   "userId": "123"
   * // }
   * ```
   */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      code: this.code,
      message: this.message,
    };

    if (this.segment !== undefined) {
      result.segment = this.segment;
    }
    if (this.path !== undefined) {
      result.path = this.path;
    }
    if (this.redirect !== undefined) {
      result.redirect = this.redirect;
    }

    // add all public fields
    // Using Set.has() for O(1) lookup instead of Array.includes() O(n)
    // Overall complexity: O(n) instead of O(n*m)
    const excludeKeys = new Set([
      "code",
      "message",
      "segment",
      "path",
      "redirect",
      "stack",
    ]);

    for (const key in this) {
      if (Object.hasOwn(this, key) && !excludeKeys.has(key)) {
        result[key] = this[key];
      }
    }

    return result;
  }
}
