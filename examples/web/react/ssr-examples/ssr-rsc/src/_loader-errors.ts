// Typed loader errors for the RSC pipeline.
// Same shape as the runtime SSR example. The RSC handler
// (entry.rsc.tsx) catches them BEFORE constructing the Flight stream
// and returns plain-text Response objects with the right HTTP status.
// This avoids two real failure modes:
//   1. Untyped throws bubble to Express's default error handler → 500
//      with no Cache-Control or specific status info.
//   2. Errors AFTER stream construction leak the router (cleanup runs
//      only in the success path).

export class LoaderRedirect extends Error {
  readonly code = "LOADER_REDIRECT";

  constructor(
    readonly target: string,
    readonly status: 301 | 302 | 307 | 308 = 302,
  ) {
    super(`Redirect to ${target}`);
    this.name = "LoaderRedirect";
  }
}

export class LoaderNotFound extends Error {
  readonly code = "LOADER_NOT_FOUND";

  constructor(readonly resource: string) {
    super(`Resource not found: ${resource}`);
    this.name = "LoaderNotFound";
  }
}
