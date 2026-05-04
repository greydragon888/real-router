// Same shape as svelte/ssr-streaming/_loader-errors.ts and the angular ssr
// counterpart. Each example is a standalone Vite app — no shared package
// between examples.

export class LoaderNotFound extends Error {
  readonly code = "LOADER_NOT_FOUND";

  constructor(readonly resource: string) {
    super(`Resource not found: ${resource}`);
    this.name = "LoaderNotFound";
  }
}
