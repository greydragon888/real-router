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

    for (const key of Object.keys(opts)) {
      if (!(key in defaults)) {
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
