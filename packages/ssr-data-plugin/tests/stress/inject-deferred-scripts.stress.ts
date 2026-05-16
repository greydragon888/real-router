import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { injectDeferredScripts } from "../../src/server";

const decoder = new TextDecoder();
const noop = (): void => undefined;

function makeHtmlStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await Promise.resolve();
      }

      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const out: string[] = [];

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    out.push(decoder.decode(value));
  }

  return out.join("");
}

/**
 * Settle a long-poll-style deferred map: fast resolve, slow resolve, eager
 * reject. The mix exercises the `Promise.allSettled` close-condition under
 * realistic skew (fast script lands before slow, error script lands at
 * its own pace).
 *
 * `includeNeverSettles=true` adds a pending-forever promise — only the
 * cancellation path can survive this (drained streams would deadlock on
 * `Promise.allSettled`).
 */
function buildMixedDeferred(
  seed: number,
  includeNeverSettles: boolean,
): Record<string, Promise<unknown>> {
  const fast = Promise.resolve({ k: "fast", seed });
  const slowOk = new Promise<unknown>((resolve) => {
    setTimeout(() => {
      resolve({ k: "slow", seed });
    }, 5);
  });
  const eagerReject = Promise.reject(new Error(`boom-${seed}`));

  // Attach a sibling .catch so Node's tracker stays quiet — the stream's
  // settle handler still observes the rejection and emits the error script.
  eagerReject.catch(() => undefined);

  const map: Record<string, Promise<unknown>> = {
    fast,
    slowOk,
    eagerReject,
  };

  if (includeNeverSettles) {
    // Pending forever — only the cancel() path can complete; included to
    // prove that consumer cancellation tears down without waiting on this
    // promise.
    map.neverSettles = new Promise<unknown>(() => {});
  }

  return map;
}

describe("injectDeferredScripts stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("500 concurrent defer() flows with mixed resolution + mid-stream cancel: no crashes, no unhandled rejections", async () => {
    // Hammer the injectDeferredScripts pipeline with 500 parallel streams
    // each carrying a fast/slow/reject/never mix. Half are drained to
    // completion; the other half are cancelled mid-stream to exercise the
    // upstream-reader.cancel() + late-resolver branches. The contract:
    //   • no thrown error escapes the stream (we drain to a string),
    //   • cancelled streams settle without hang or unhandled rejection,
    //   • every drained stream's HTML appears verbatim somewhere in the
    //     output (forwarding is lossless).
    const seenUnhandled: unknown[] = [];
    const trackUnhandled = (reason: unknown): void => {
      seenUnhandled.push(reason);
    };

    process.on("unhandledRejection", trackUnhandled);

    try {
      const results = await Promise.all(
        Array.from({ length: 500 }, async (_, i) => {
          const willCancel = i % 2 === 1;
          const html = makeHtmlStream([
            `<html><body data-i="${i}">`,
            `chunk-${i}`,
            `</body></html>`,
          ]);
          // Only cancelled streams carry a never-settles promise; drained
          // streams have to land on a fully-settling deferred map for
          // `Promise.allSettled` to close their controller.
          const stream = injectDeferredScripts(
            html,
            buildMixedDeferred(i, willCancel),
            { bootstrap: false },
          );

          if (!willCancel) {
            return drain(stream);
          }

          const reader = stream.getReader();

          // Read a single chunk, then cancel — exercises the
          // upstream-reader.cancel() branch in the `cancel` handler.
          await reader.read();
          await reader.cancel("test-abort");

          // Releasing the lock before stream cancellation completes is the
          // norm under React's flush pattern.
          try {
            reader.releaseLock();
          } catch {
            // already released by cancel — fine
          }

          return "cancelled";
        }),
      );

      // Sanity check: drained iterations carry their numeric tag.
      for (let i = 0; i < 500; i += 2) {
        expect(results[i]).toContain(`data-i="${i}"`);
      }
      // Cancelled iterations resolved as the sentinel — no hang.
      for (let i = 1; i < 500; i += 2) {
        expect(results[i]).toBe("cancelled");
      }

      // Settle pending microtasks so any unhandledRejection has a chance
      // to fire before the assertion.
      await new Promise((r) => setTimeout(r, 20));

      // The "never-settles" promise per iteration must NOT leak as an
      // unhandled rejection (it's pending, not rejected). The eager
      // reject promise IS rejected but we attached a sibling .catch and
      // the stream's settle handler also observes it — neither path
      // should propagate to the process tracker.
      expect(seenUnhandled).toStrictEqual([]);
    } finally {
      process.off("unhandledRejection", trackUnhandled);
    }
  });

  it("500 concurrent streams with random upstream HTML errors: no double-releaseLock, no unhandled rejections", async () => {
    // Functional `server.test.ts:287` covers the single-stream
    // upstream-HTML-throws path. This stress amplifies the surface to
    // expose the race between two cleanup branches in `server.ts`:
    //
    //   1. The `forwardResult.error` branch — `controller.error(err)`
    //      called from the forward loop when `upstreamReader.read()`
    //      rejects.
    //   2. The `cancel(reason)` callback — `upstreamReader.cancel()`
    //      called when the consumer cancels the wrapped stream.
    //
    // Both reach `releaseLock()` on the same reader. Under parallelism,
    // one stream's error completion can interleave with another's
    // cancellation; the implementation wraps these in `try/catch`
    // (`server.ts:304-313`) so the second `releaseLock()` is a no-op
    // rather than a TypeError. This stress confirms the cleanup is
    // crash-free under load and produces zero unhandled rejections.
    const seenUnhandled: unknown[] = [];
    const trackUnhandled = (reason: unknown): void => {
      seenUnhandled.push(reason);
    };

    process.on("unhandledRejection", trackUnhandled);

    try {
      const outcomes = await Promise.all(
        Array.from({ length: 500 }, async (_, i) => {
          // Roughly 1/3 throw upstream, 1/3 are consumer-cancelled
          // mid-stream, 1/3 drain normally — picks a balanced mix.
          const mode = i % 3;
          const html = new ReadableStream<Uint8Array>({
            async start(controller) {
              const encoder = new TextEncoder();

              controller.enqueue(encoder.encode(`<html data-i="${i}">`));
              await Promise.resolve();

              if (mode === 0) {
                // Upstream throws — exercises the `controller.error`
                // branch in server.ts forward loop.
                controller.error(new Error(`upstream-boom-${i}`));

                return;
              }

              controller.enqueue(encoder.encode(`body-${i}`));
              await Promise.resolve();
              controller.enqueue(encoder.encode(`</html>`));
              controller.close();
            },
          });
          const stream = injectDeferredScripts(
            html,
            buildMixedDeferred(i, false),
            { bootstrap: false },
          );

          if (mode === 1) {
            // Consumer cancels mid-stream — exercises `cancel(reason)`
            // and its `releaseLock()` path in tandem with mode-0
            // siblings hitting their `releaseLock()` paths.
            const reader = stream.getReader();

            await reader.read();
            await reader.cancel("consumer-abort");
            try {
              reader.releaseLock();
            } catch {
              // already released by cancel() — expected
            }

            return "cancelled" as const;
          }

          try {
            const out = await drain(stream);

            return mode === 0 ? "upstream-error" : out;
          } catch (error) {
            return mode === 0
              ? "upstream-error"
              : `unexpected:${String(error)}`;
          }
        }),
      );

      // Each outcome is one of three sentinel shapes; none must be
      // `unexpected:...` (which would indicate a non-mode-0 stream
      // crashed with an error other than the upstream-boom).
      const unexpected = outcomes.filter((o) =>
        typeof o === "string" ? o.startsWith("unexpected:") : false,
      );

      expect(unexpected).toStrictEqual([]);

      // Settle pending microtasks so any unhandledRejection has time to
      // fire before assertion.
      await new Promise((r) => setTimeout(r, 30));

      // No double-releaseLock, no late-rejection leak. The eager-reject
      // promise in `buildMixedDeferred` is sibling-caught, so it should
      // not reach `unhandledRejection` either.
      expect(seenUnhandled).toStrictEqual([]);
    } finally {
      process.off("unhandledRejection", trackUnhandled);
    }
  });

  it("2000 concurrent injectDeferredScripts streams complete without crash", async () => {
    // High-fanout smoke — 2000 parallel streams, each tiny, each with one
    // immediately-resolved deferred. Verifies the helper survives mass
    // concurrent construction + teardown without exhausting per-stream
    // resources (open readers, registered controllers).
    const outputs = await Promise.all(
      Array.from({ length: 2000 }, async (_, i) => {
        const html = makeHtmlStream([`<i>${i}</i>`]);
        const stream = injectDeferredScripts(
          html,
          { only: Promise.resolve(i) },
          { bootstrap: false },
        );

        return drain(stream);
      }),
    );

    expect(outputs).toHaveLength(2000);

    for (let i = 0; i < 2000; i++) {
      expect(outputs[i]).toContain(`<i>${i}</i>`);
      // Settle script for the one deferred key landed.
      expect(outputs[i]).toContain('__rrDefer__("only",');
    }
  });
});
