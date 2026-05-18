import { formatSettleScript, getDeferBootstrapScript } from "./shared-ssr";

/**
 * Serialiser for deferred values. Output is JSON the client `JSON.parse`s.
 *
 * The `string | undefined` return matches `JSON.stringify`'s actual runtime
 * behaviour — `JSON.stringify(undefined)`, `JSON.stringify(() => 1)`,
 * `JSON.stringify(Symbol())` all return `undefined`. The wire-format
 * normalises that to `"null"` so consumers always receive valid JSON.
 */
export type Serializer = (value: unknown) => string | undefined;

export interface InjectDeferredScriptsOptions {
  /**
   * Serializer for deferred values. Default `JSON.stringify`. Pass
   * `devalue.stringify` / `superjson.stringify` if your deferred payload
   * contains Date / Map / Set / RegExp / BigInt — output must still be a
   * JSON string the client `JSON.parse`s.
   */
  serialize?: Serializer;
  /**
   * Serializer for the rejected-promise payload. Default `JSON.stringify` of
   * `{ name, message }`. Override to surface custom error fields to the
   * client.
   */
  serializeError?: (error: unknown) => string;
  /**
   * If `false`, do not emit the bootstrap `<script>`. Use when you embed the
   * bootstrap statically in `index.html` (one fewer per-request byte cost).
   * Default `true` — bootstrap lands once at the start of the deferred
   * stream when at least one promise is queued.
   */
  bootstrap?: boolean;
}

const DEFAULT_ERROR_SERIALIZER = (error: unknown): string => {
  if (error instanceof Error) {
    return JSON.stringify({ name: error.name, message: error.message });
  }

  return JSON.stringify({ message: String(error) });
};

// Panic fallback used when both `serialize` and `serializeError` throw.
// Without this, `<Await>` consumers stay suspended forever — better to
// surface a generic rejection than to hang the boundary indefinitely.
const PANIC_ERROR_JSON =
  '{"name":"Error","message":"deferred serialization failed"}';

function safeSerializeError(
  serializeError: (error: unknown) => string,
  error: unknown,
): string {
  try {
    return serializeError(error);
  } catch {
    return PANIC_ERROR_JSON;
  }
}

/**
 * Build the settle-promise array that emits `<script>__rrDefer__(...)</script>`
 * (or `__rrDeferError__`) chunks via `safeEnqueue` as each deferred promise
 * settles.
 *
 * Extracted from `injectDeferredScripts` so the streaming wrapper's `start`
 * callback reads top-down without a 35-line inline `entries.map` body.
 *
 * `Promise.resolve(thenable)` adopts the thenable's state under the standard
 * Promise machinery. This buys two safety properties:
 *   1. A duck-typed thenable whose `.then(...)` throws synchronously
 *      (`defer()` only validates `typeof .then === "function"`, not that the
 *      implementation behaves) is converted into a rejection instead of
 *      escaping `entries.map` and crashing the stream's `start` callback.
 *   2. Native promises pass through unchanged — `Promise.resolve(p)` returns
 *      `p` for native promises (per spec).
 */
function buildSettlePromises(
  entries: [string, Promise<unknown>][],
  encoder: TextEncoder,
  serialize: Serializer,
  serializeError: (error: unknown) => string,
  safeEnqueue: (chunk: Uint8Array) => void,
): Promise<void>[] {
  return entries.map(([key, promise]) =>
    Promise.resolve(promise).then(
      (value) => {
        try {
          // Mirror serializeState's `?? "null"` fallback (#606): a serializer
          // that returns undefined for unsupported inputs becomes `null` on
          // the wire instead of a confusing TypeError crash inside
          // escapeForScript. Throws (e.g. BigInt without a custom serializer,
          // circular refs) still route to the error-settle path below.
          const json = serialize(value) ?? "null";

          safeEnqueue(encoder.encode(formatSettleScript(key, json, false)));
        } catch (error) {
          const errJson = safeSerializeError(serializeError, error);

          safeEnqueue(encoder.encode(formatSettleScript(key, errJson, true)));
        }
      },
      (error: unknown) => {
        const errJson = safeSerializeError(serializeError, error);

        safeEnqueue(encoder.encode(formatSettleScript(key, errJson, true)));
      },
    ),
  );
}

/**
 * Emit the bootstrap `<script>` once, gated on `(includeBootstrap, entries)`.
 * Lifted out of the `start` callback so the streaming wrapper reads
 * top-down: bootstrap → upstream forwarding → settle awaits → close.
 *
 * Returns nothing — side-effect call into `safeEnqueue`. Kept as a function
 * (instead of inlining a 4-line `if`) so the reader can ignore the bootstrap
 * concern entirely when scanning `injectDeferredScripts`.
 */
function bootstrapForwarder(
  includeBootstrap: boolean,
  entryCount: number,
  encoder: TextEncoder,
  safeEnqueue: (chunk: Uint8Array) => void,
): void {
  if (includeBootstrap && entryCount > 0) {
    safeEnqueue(
      encoder.encode(`<script>${getDeferBootstrapScript()}</script>`),
    );
  }
}

/**
 * Pump every chunk from the upstream HTML reader into `safeEnqueue` until
 * the reader is exhausted (`done: true`) or the consumer cancels the
 * downstream stream (`cancelledRef.value === true`).
 *
 * Resolves to `{ error: null }` on success; `{ error: unknown }` on a
 * reader-level throw that the caller propagates via `controller.error(...)`.
 * Splitting the loop out of `start` keeps the upstream-reader +
 * settle-promise orchestration linear in the caller. The error is passed
 * through verbatim — matches the previous `controller.error(error)` shape
 * where non-Error throws stayed non-Error.
 */
async function htmlForwarder(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  cancelledRef: { value: boolean },
  safeEnqueue: (chunk: Uint8Array) => void,
): Promise<{ error: unknown }> {
  try {
    while (!cancelledRef.value) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      safeEnqueue(value);
    }

    return { error: null };
  } catch (error) {
    return { error };
  }
}

/**
 * Wraps an HTML `ReadableStream` (e.g. from React's `renderToReadableStream`)
 * with inline `<script>__rrDefer__("key", json)</script>` chunks emitted as
 * each promise in `deferred` resolves.
 *
 * The combined stream forwards every byte of the underlying HTML stream and
 * interleaves settle scripts in **resolution order** (not declaration order)
 * — the first promise to settle is the first script to land. This matches
 * the order client `useDeferred` observers will resolve in.
 *
 * Closing semantics: the returned stream stays open until **both** the HTML
 * stream is exhausted AND every deferred promise has settled. If the HTML
 * stream errors, that error propagates and outstanding settle promises are
 * abandoned (no controller.enqueue race).
 */
export function injectDeferredScripts(
  htmlStream: ReadableStream<Uint8Array>,
  deferred: Record<string, Promise<unknown>>,
  options: InjectDeferredScriptsOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const serialize = options.serialize ?? JSON.stringify;
  const serializeError = options.serializeError ?? DEFAULT_ERROR_SERIALIZER;
  const includeBootstrap = options.bootstrap !== false;
  const entries = Object.entries(deferred);

  // Tracked outside the `start` callback so the `cancel` callback can reach
  // the active reader and release its lock + propagate cancellation upstream
  // when the consumer aborts mid-stream (e.g. client disconnect). The
  // cancelled flag travels via a `{ value }` wrapper so `htmlForwarder` reads
  // it through the same reference after each loop turn.
  let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const cancelledRef = { value: false };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Mutated from within `safeEnqueue` (catch branch); TS narrowing
      // can't track the cross-closure write, so widen to `boolean`.
      let closed = false;

      const safeEnqueue = (chunk: Uint8Array): void => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      bootstrapForwarder(
        includeBootstrap,
        entries.length,
        encoder,
        safeEnqueue,
      );

      const settlePromises = buildSettlePromises(
        entries,
        encoder,
        serialize,
        serializeError,
        safeEnqueue,
      );

      upstreamReader = htmlStream.getReader();

      const forwardResult = await htmlForwarder(
        upstreamReader,
        cancelledRef,
        safeEnqueue,
      );

      if (forwardResult.error !== null) {
        closed = true;
        controller.error(forwardResult.error);
        upstreamReader.releaseLock();
        upstreamReader = null;

        return;
      }

      // The cancel handler may have already nulled `upstreamReader` while
      // the in-flight `read()` resolved as `{done:true}`. ESLint sees the
      // local control-flow type as `ReadableStreamDefaultReader<…>` (because
      // assignment + try/catch don't narrow to "possibly null after a yield
      // point"), so the optional chain is flagged as unnecessary even though
      // the cross-closure mutation makes it required.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      upstreamReader?.releaseLock();
      upstreamReader = null;

      await Promise.allSettled(settlePromises);

      // Two race conditions need this guard:
      //   - `closed === true` — `safeEnqueue` caught `controller.enqueue()`'s
      //     throw on a cancelled controller; closing again would re-throw
      //     "Invalid state: Controller is already closed".
      //   - `cancelledRef.value === true` — consumer called `reader.cancel()`;
      //     the stream is already in the closed state per WHATWG, so
      //     `controller.close()` would throw the same error. The throw is
      //     normally swallowed by ReadableStream's start-callback rejection
      //     handling (cancelled streams suppress start errors), but skipping
      //     the call is cleaner and avoids spurious unhandled-rejection
      //     warnings under stricter runtimes.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!closed && !cancelledRef.value) {
        controller.close();
      }
    },
    async cancel(reason) {
      // Propagate consumer cancellation upstream so the underlying React
      // (or other) HTML stream stops producing chunks. Without this, the
      // upstream renderer keeps running until its internal AbortSignal
      // fires (or never), wasting work after the client disconnected.
      cancelledRef.value = true;

      // The else-branch of the null check is a defensive fallback for the
      // cancel-before-start race. WHATWG runs start() synchronously during
      // ReadableStream construction, so `upstreamReader` is set before any
      // consumer code can call cancel. Reachable only if `getReader()` threw.
      /* v8 ignore start -- @preserve: defensive null-check, see above */

      if (upstreamReader === null) {
        try {
          await htmlStream.cancel(reason);
        } catch {
          // best-effort
        }

        return;
      }
      /* v8 ignore stop */

      try {
        await upstreamReader.cancel(reason);
      } catch {
        // upstream cancel rejected — best-effort, swallow
      }
      try {
        upstreamReader.releaseLock();
      } catch {
        // already released
      }
      upstreamReader = null;
    },
  });
}

export { getDeferBootstrapScript } from "./shared-ssr";
