// Typed loader errors that the SSR pipeline translates into HTTP semantics.
// Same shape as svelte/ssr/_loader-errors.ts and the angular ssr counterpart
// — kept duplicated here because each example is a standalone Vite app, no
// shared package between examples.

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

export function withTimeout<T>(
  routeName: string,
  ms: number,
  loader: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const work = (async () => loader())().finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  return Promise.race<T>([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new LoaderTimeout(routeName, ms));
      }, ms);
    }),
  ]);
}
