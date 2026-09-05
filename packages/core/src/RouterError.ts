// packages/core/src/RouterError.ts

import { errorCodes, UNSAFE_KEY } from "./constants";
import { putField } from "./utils/ingest";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

const objectEntries = Object.entries;
const objectValues = Object.values;

// Pre-compute Set of error code values for O(1) lookup in setCode()
// This avoids creating array and doing linear search on every setCode() call
// ⚑ Captured at module load, for the reason `helpers.ts` states over its own
// three: an application can re-point `Object.hasOwn` after boot, and this one
// gates a PUBLIC read (#1829). ⚠ The file's four other intrinsic reads are still
// raw — #1971 owns that sweep, and a point fix here would be the N+1 it exists
// to prevent; capturing the read this commit ADDS is not the same thing as
// sweeping the ones it found.
const hasOwn = Object.hasOwn;

const errorCodeValues = new Set(objectValues(errorCodes));

// Reserved built-in properties - throw error if user tries to set these
const reservedProperties = new Set(["code", "segment", "path"]);

// Reserved method names - silently ignore attempts to overwrite these
const reservedMethods = new Set([
  "setCode",
  "setErrorInstance",
  "setAdditionalFields",
  "hasField",
  "getField",
  "toJSON",
]);

/**
 * Freeze a `RouterError` at the moment it stops being core's to change — the
 * throw (#1960).
 *
 * ⚑ At the THROW, never in the constructor. `RouterError` publishes three
 * mutators (`setCode`, `setErrorInstance`, `setAdditionalFields`) with worked
 * examples in the wiki, and `rethrowAsRouterError` copies an error and re-codes
 * the copy before throwing it. Freezing on construction was measured: it reds
 * across the tier and concentrates in this class's own suite, because it
 * withdraws published API from errors a CONSUMER builds. Freezing here
 * withdraws exactly one thing — writing to an error core threw at you — which
 * #1606 already established is corruption when the instance is one of the
 * cached, process-shared ones, and which a repository-wide sweep of every
 * `catch` binding found nobody doing.
 *
 * ⚠ Only for errors core CONSTRUCTED. A re-thrown foreign error stays untouched:
 * freezing someone else's object on the way through is the hazard, not the fix.
 */
export function freezeThrownError<E extends RouterError>(error: E): E {
  return freeze(error);
}

export class RouterError extends Error {
  [key: string]: unknown;

  // Using public properties to ensure structural compatibility
  // with the `RouterError` interface in `types/base.ts`
  readonly segment: string | undefined;
  readonly path: string | undefined;

  // Note: code appears to be writable but setCode() should be used
  // to properly update both code and message together
  code: string;

  /**
   * Creates a new RouterError instance.
   *
   * The options object accepts built-in fields (message, segment, path)
   * and any additional custom fields, which will all be attached to the error instance.
   *
   * @param code - The error code (e.g., "ROUTE_NOT_FOUND", "CANNOT_ACTIVATE")
   * @param options - Optional configuration object
   * @param options.message - Custom error message (defaults to code if not provided)
   * @param options.segment - The route segment where the error occurred
   * @param options.path - The full path where the error occurred
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
   * ```
   */
  constructor(
    code: string,
    {
      message,
      segment,
      path,
      ...rest
    }: {
      [key: string]: unknown;
      message?: string | undefined;
      segment?: string | undefined;
      path?: string | undefined;
    } = {},
  ) {
    super(message ?? code);

    // Subclasses don't auto-set `name`; without this `error.name` inherits
    // "Error", breaking `error.name === "RouterError"` checks at catch sites that
    // can't `instanceof` across bundle boundaries.
    this.name = "RouterError";

    this.code = code;
    this.segment = segment;
    this.path = path;

    // Assign custom fields, checking reserved properties and filtering out reserved method names
    // Issue #39: Throw for reserved properties to match setAdditionalFields behavior
    for (const [key, value] of objectEntries(rest)) {
      if (reservedProperties.has(key)) {
        throw new TypeError(
          `[RouterError] Cannot set reserved property "${key}"`,
        );
      }

      // ⚑ `UNSAFE_KEY` skipped for the reason the state channels give (#1852):
      // this instance is a container core hands out and `toJSON` serializes, so
      // an own `"__proto__"` on it is a prototype-swap primitive for whoever
      // merges or re-parses the error — measured, a guard throwing a plain
      // object put the key into `JSON.stringify(err)`.
      //
      // ⚠ Plain assignment is the alternative that looks equivalent and is
      // worse than losing the key: measured, `new RouterError("X", bag)` swaps
      // the INSTANCE's prototype and `instanceof RouterError` answers `false`.
      // `putField` keeps the instance intact; the skip keeps the key off a
      // container someone will merge.
      if (key !== UNSAFE_KEY && !reservedMethods.has(key)) {
        // ⚑ `putField` (#1852). The target is `this`, whose chain runs
        // `RouterError.prototype → Error.prototype → Object.prototype`, and the
        // key comes from the caller's bag. `reservedProperties` / `reservedMethods`
        // above filter by NAME and therefore cannot see an ambient one: measured,
        // an accessor under a custom field name threw out of the constructor,
        // and a setter left the field non-own while reading back the hijacked
        // value.
        putField(this as unknown as Record<string, unknown>, key, value);
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
    for (const [key, value] of objectEntries(fields)) {
      if (reservedProperties.has(key)) {
        throw new TypeError(
          `[RouterError.setAdditionalFields] Cannot set reserved property "${key}"`,
        );
      }

      // ⚑ `UNSAFE_KEY` skipped, and `putField` rather than assignment, for the
      // reasons the constructor's own field loop states (#1852). Not restated
      // here — one mechanism, one explanation.
      if (key !== UNSAFE_KEY && !reservedMethods.has(key)) {
        // ⚑ `putField` (#1852). The target is `this`, whose chain runs
        // `RouterError.prototype → Error.prototype → Object.prototype`, and the
        // key comes from the caller's bag. `reservedProperties` / `reservedMethods`
        // above filter by NAME and therefore cannot see an ambient one: measured,
        // an accessor under a custom field name threw out of the constructor,
        // and a setter left the field non-own while reading back the hijacked
        // value.
        putField(this as unknown as Record<string, unknown>, key, value);
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
    // ⚑ `hasOwn`, not `in` (#1829). `in` walks the prototype chain, so this
    // answered `true` for `Object.prototype`'s twelve members and for the
    // class's own six methods — eighteen names for an error carrying ONE field
    // and `toString` / `constructor` are ordinary strings arriving from a config
    // key, a route param name or a serialized payload.
    //
    // ⚠ NOT `toJSON`'s `excludeKeys`, which the issue proposed. Measured against
    // the docstring above: that set excludes `code`, `segment` and `path`,
    // which this method documents as answering `true`. The two functions ask
    // different questions (what to SERIALIZE vs what the error CARRIES), so
    // agreeing on those three is the contract and diverging on `message` /
    // `stack` / `name` is not drift.
    return hasOwn(this, key);
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
    // Reachable without `hasField` — a consumer may just read — so the same gate
    // stands here rather than being implied by the predicate (#1829). Before
    // this, `getField("toString")` handed back the native function.
    return hasOwn(this, key) ? this[key] : undefined;
  }

  /**
   * Serializes the error to a JSON-compatible object.
   *
   * This method is automatically called by JSON.stringify() and includes:
   * - Built-in fields: code, message, segment (if set), path (if set)
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

    // add all public fields
    // Using Set.has() for O(1) lookup instead of Array.includes() O(n)
    // Overall complexity: O(n) instead of O(n*m)
    const excludeKeys = new Set([
      "code",
      "message",
      "segment",
      "path",
      "stack",
      // `name` is now an own enumerable prop (constructor sets it to
      // "RouterError"); it's class metadata, not a custom field — keep it out of
      // the serialized output (preserves toJSON shape).
      "name",
    ]);

    for (const key in this) {
      if (hasOwn(this, key) && !excludeKeys.has(key)) {
        // ⚑ `putField` (#1852): `result` is a fresh literal and the keys are the
        // user's own error fields. Measured, a setter under one of them made the
        // field vanish from the serialized output with no error at all.
        putField(result, key, this[key]);
      }
    }

    return result;
  }
}
