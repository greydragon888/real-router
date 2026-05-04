// Same shape as ssr/_loader-errors.ts. Kept duplicated here because each
// example is a standalone Vite app — no shared package between examples.
// Real applications would extract these into a package and reuse them.

export class LoaderNotFound extends Error {
  readonly code = "LOADER_NOT_FOUND";

  constructor(readonly resource: string) {
    super(`Resource not found: ${resource}`);
    this.name = "LoaderNotFound";
  }
}
