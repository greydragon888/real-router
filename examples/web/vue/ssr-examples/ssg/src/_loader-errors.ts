// Typed loader errors for build-time SSG.
//
// Unlike the runtime SSR example, SSG runs all loaders during the
// build script, not per-request. LoaderNotFound thrown here aborts
// the build for that URL — ssg-build.ts catches the typed error,
// counts it as a build failure, and exits with a non-zero status if
// any URLs failed. This guards against silently shipping an empty
// "user not found" page for an id listed in entries.ts that's no
// longer in the database.

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
