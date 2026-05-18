import { makeEnvironmentProviders } from "@angular/core";

import { HTTP_STATUS_SINK } from "../utils/createHttpStatusSink";

import type { HttpStatusSink } from "../utils/createHttpStatusSink";
import type { EnvironmentProviders } from "@angular/core";

/**
 * Environment providers for a request-scoped `HttpStatusSink`. Pair with
 * `createHttpStatusSink()` and read `sink.code` after the SSR render pass
 * completes.
 *
 * Application bootstrap:
 *
 * ```ts
 * const sink = createHttpStatusSink();
 *
 * await bootstrapApplication(AppRoot, {
 *   providers: [
 *     provideRealRouterFactory({ ... }),
 *     provideHttpStatusSink(sink),
 *   ],
 * });
 *
 * response.status(sink.code ?? 200).send(html);
 * ```
 *
 * Equivalent to:
 *
 * ```ts
 * { provide: HTTP_STATUS_SINK, useValue: sink }
 * ```
 *
 * Use the explicit `useValue` form when you need to compose with other
 * application providers in a single `providers: [...]` block.
 */
export function provideHttpStatusSink(
  sink: HttpStatusSink,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HTTP_STATUS_SINK, useValue: sink },
  ]);
}
