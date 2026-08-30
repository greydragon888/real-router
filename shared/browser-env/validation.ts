/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ `Object.keys` is not a convenience here — it IS the loop, and an empty
 * answer validates nothing at all. Measured by re-pointing it after boot:
 * `base: "/a/../b"` is accepted silently and the `..` rule never runs, together
 * with every other rule this validator owns. The guard does not weaken, it
 * disappears.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this
 * module loads"; it does not close it (#1798, and core's `guards.ts` says so of
 * its own captures).
 */
const objectKeys = Object.keys;
const hasOwn = Object.hasOwn;

export interface OptionRule<T> {
  validate: (value: T) => string | null;
}

export type OptionRules<T extends object> = {
  [K in keyof T]?: OptionRule<NonNullable<T[K]>>;
};

export function createOptionsValidator<T extends object>(
  defaults: Required<T>,
  loggerContext: string,
  rules?: OptionRules<T>,
): (opts: Partial<T> | undefined) => void {
  return (opts) => {
    if (!opts) {
      return;
    }

    for (const key of objectKeys(opts)) {
      // ⚑ `Object.hasOwn`, not `key in defaults` (#1838). `defaults` is a plain
      // object literal, so `in` walks its prototype and answers TRUE for every
      // own member of `Object.prototype` — measured through the public plugin
      // surface, all twelve (`toString`, `constructor`, the four `__define*__` /
      // `__lookup*__` accessors, …) produced a nonsense
      // `Invalid type for 'toString': expected function, got string` for a key
      // that is not an option at all, while a genuinely unknown key
      // (`nonsenseKey`) was silently skipped as intended. Shared by all three URL
      // plugins.
      if (!hasOwn(defaults, key)) {
        continue;
      }

      const value = opts[key as keyof typeof opts];

      if (value === undefined) {
        continue;
      }

      const expected = typeof defaults[key as keyof typeof defaults];
      const actual = typeof value;

      if (actual !== expected) {
        throw new Error(
          `[${loggerContext}] Invalid type for '${key}': expected ${expected}, got ${actual}`,
        );
      }

      const rule = rules?.[key as keyof T];

      if (rule) {
        const msg = (rule.validate as (input: unknown) => string | null)(value);

        if (msg !== null) {
          throw new Error(`[${loggerContext}] Invalid '${key}': ${msg}`);
        }
      }
    }
  };
}

// eslint-disable-next-line no-control-regex -- control characters are exactly what this rule rejects
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export const safeBaseRule: OptionRule<string> = {
  validate: (value) => {
    if (CONTROL_CHARS.test(value)) {
      return "must not contain control characters";
    }

    if (value.split("/").includes("..")) {
      return "must not contain '..' segments";
    }

    return null;
  },
};

export const safeHashPrefixRule: OptionRule<string> = {
  validate: (value) => {
    if (CONTROL_CHARS.test(value)) {
      return "must not contain control characters";
    }

    if (value.includes("/")) {
      return "must not contain '/' (slash is added before the path automatically)";
    }

    if (value.includes("#")) {
      return "must not contain '#' (it is added as the hash delimiter)";
    }

    if (value.includes("?")) {
      return "must not contain '?' (it conflicts with the query delimiter)";
    }

    return null;
  },
};

export const nonNegativeIntegerRule: OptionRule<number> = {
  validate: (value) => {
    if (!Number.isFinite(value)) {
      return `expected finite number, got ${String(value)}`;
    }

    if (!Number.isInteger(value)) {
      return `expected integer, got ${String(value)}`;
    }

    if (value < 0) {
      return `expected non-negative integer, got ${value}`;
    }

    return null;
  },
};
