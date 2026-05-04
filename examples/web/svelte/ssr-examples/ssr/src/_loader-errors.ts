// Typed loader errors that the SSR pipeline translates into HTTP semantics.
//
// The ssr-data-plugin is intentionally HTTP-agnostic — it only awaits the
// loader and writes the resolved value to state.context.data. To bridge
// loaders ↔ HTTP status codes, loaders throw one of these named errors and
// renderPage() in entry-server.ts catches them, maps each `code` to the
// right RenderResult shape, and the express middleware in server/index.ts
// emits the right status code + headers. This keeps the plugin pure while
// giving applications the same expressiveness as Next.js redirect()/notFound().

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
