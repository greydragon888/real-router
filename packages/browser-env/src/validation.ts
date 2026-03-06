export function createOptionsValidator<T extends object>(
  defaults: Required<T>,
  loggerContext: string,
): (opts: Partial<T> | undefined) => void {
  return (opts) => {
    if (!opts) {
      return;
    }

    for (const key of Object.keys(opts)) {
      if (key in defaults) {
        const value = opts[key as keyof typeof opts];
        const expected = typeof defaults[key as keyof typeof defaults];
        const actual = typeof value;

        if (value !== undefined && actual !== expected) {
          throw new Error(
            `[${loggerContext}] Invalid type for '${key}': expected ${expected}, got ${actual}`,
          );
        }
      }
    }
  };
}
