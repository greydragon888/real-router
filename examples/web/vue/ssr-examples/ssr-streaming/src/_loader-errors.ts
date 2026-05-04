// Typed loader errors that the SSR pipeline translates into HTTP semantics.
// Same shape as the runtime SSR example (`../../ssr/src/_loader-errors.ts`)
// — re-exported here so each example app stays self-contained without
// cross-package imports.

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

export class LoaderTimeout extends Error {
  readonly code = "LOADER_TIMEOUT";

  constructor(
    readonly route: string,
    readonly ms: number,
  ) {
    super(`Loader for "${route}" exceeded ${ms}ms`);
    this.name = "LoaderTimeout";
  }
}
