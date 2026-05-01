export function createLoadersValidator(errorPrefix: string) {
  return function validateLoaders(loaders: unknown): void {
    if (
      loaders === null ||
      typeof loaders !== "object" ||
      Array.isArray(loaders)
    ) {
      throw new TypeError(`${errorPrefix} loaders must be a non-null object`);
    }

    for (const [key, value] of Object.entries(
      loaders as Record<string, unknown>,
    )) {
      if (typeof value !== "function") {
        throw new TypeError(
          `${errorPrefix} loader for route "${key}" must be a function`,
        );
      }
    }
  };
}
