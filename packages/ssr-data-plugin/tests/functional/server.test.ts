import { describe, expect, it } from "vitest";

import { injectDeferredScripts } from "../../src/server";

const decoder = new TextDecoder();

// Shared bootstrap signature. Pinning the prefix in one place ensures that
// a refactor of `getDeferBootstrapScript()` cannot accidentally desync the
// positive/negative regressions across `prepends`, `bootstrap:false`, and
// `empty-deferred` cases — all three reads through this constant.
const BOOTSTRAP_REGEX = /^<script>\(function\(g\)\{/;

function createHtmlStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        // Yield so settle promises can interleave.
        await Promise.resolve();
      }

      controller.close();
    },
  });
}

async function consume(stream: ReadableStream<Uint8Array>): Promise<string> {
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

describe("injectDeferredScripts", () => {
  describe("happy path", () => {
    it("forwards the HTML stream verbatim when no deferred promises", async () => {
      const html = createHtmlStream([
        "<html>",
        "<body>",
        "ok",
        "</body></html>",
      ]);
      const out = await consume(injectDeferredScripts(html, {}));

      expect(out).toBe("<html><body>ok</body></html>");
    });

    it("prepends the bootstrap script when at least one deferred is queued", async () => {
      const html = createHtmlStream(["<body>shell</body>"]);
      const out = await consume(
        injectDeferredScripts(html, { reviews: Promise.resolve(["r1"]) }),
      );

      expect(out).toMatch(BOOTSTRAP_REGEX);
      expect(out).toContain("<body>shell</body>");
      expect(out).toContain('__rrDefer__("reviews"');
    });

    it("does NOT prepend bootstrap when bootstrap: false", async () => {
      const html = createHtmlStream(["<body>shell</body>"]);
      const out = await consume(
        injectDeferredScripts(
          html,
          { reviews: Promise.resolve(["r1"]) },
          { bootstrap: false },
        ),
      );

      expect(out).not.toMatch(BOOTSTRAP_REGEX);
      expect(out).toContain("<body>shell</body>");
      expect(out).toContain('__rrDefer__("reviews"');
    });

    it("does not emit bootstrap when deferred map is empty", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const out = await consume(injectDeferredScripts(html, {}));

      expect(out).not.toMatch(BOOTSTRAP_REGEX);
    });

    it("settles in resolution order, not declaration order", async () => {
      const html = createHtmlStream(["<body>shell</body>"]);

      let resolveSlow!: (v: string) => void;
      const slow = new Promise<string>((r) => {
        resolveSlow = r;
      });
      const fast = Promise.resolve("FAST");

      const stream = injectDeferredScripts(
        html,
        { slow, fast },
        { bootstrap: false },
      );

      // Trigger slow after a tick so fast settles first.
      setTimeout(() => {
        resolveSlow("SLOW");
      }, 5);

      const out = await consume(stream);
      const fastIdx = out.indexOf('__rrDefer__("fast"');
      const slowIdx = out.indexOf('__rrDefer__("slow"');

      expect(fastIdx).toBeGreaterThan(-1);
      expect(slowIdx).toBeGreaterThan(-1);
      expect(fastIdx).toBeLessThan(slowIdx);
    });

    it("uses custom serializer when provided", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const serialize = (v: unknown): string => `CUSTOM:${JSON.stringify(v)}`;
      const out = await consume(
        injectDeferredScripts(
          html,
          { x: Promise.resolve(42) },
          { serialize, bootstrap: false },
        ),
      );

      expect(out).toContain("CUSTOM:42");
    });
  });

  describe("rejected promises", () => {
    it("emits __rrDeferError__ with serialised error", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const error = new TypeError("boom");
      const out = await consume(
        injectDeferredScripts(
          html,
          { broken: Promise.reject(error) },
          { bootstrap: false },
        ),
      );

      expect(out).toContain("__rrDeferError__");
      expect(out).toContain("boom");
      expect(out).toContain("TypeError");
    });

    it("uses custom serializeError when provided", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const error = new Error("public");
      const serializeError = (caught: unknown): string =>
        JSON.stringify({ message: (caught as Error).message, code: 500 });

      const out = await consume(
        injectDeferredScripts(
          html,
          { broken: Promise.reject(error) },
          { serializeError, bootstrap: false },
        ),
      );

      // Wire-format wraps the JSON string as a JS string literal — escapes appear.
      expect(out).toContain(String.raw`\"code\":500`);
    });

    it("falls back to error path when value serializer throws", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const value = { circular: undefined as unknown };

      value.circular = value;

      const out = await consume(
        injectDeferredScripts(
          html,
          { x: Promise.resolve(value) },
          { bootstrap: false },
        ),
      );

      expect(out).toContain("__rrDeferError__");
    });

    it('falls back to `"null"` when serializer returns undefined (e.g. JSON.stringify(undefined))', async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const out = await consume(
        injectDeferredScripts(
          html,
          { x: Promise.resolve(undefined) },
          { bootstrap: false },
        ),
      );

      // Mirrors serializeState's `?? "null"` fallback (#606) — undefined
      // serializer output ships as JSON `null`, not a TypeError into the
      // error-settle path.
      expect(out).toContain('__rrDefer__("x","null")');
      expect(out).not.toContain("__rrDeferError__");
    });

    it('falls back to `"null"` when serializer returns undefined for a function value', async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const out = await consume(
        injectDeferredScripts(
          html,
          { x: Promise.resolve(() => 1) },
          { bootstrap: false },
        ),
      );

      expect(out).toContain('__rrDefer__("x","null")');
    });

    it("emits panic settle script when both serialize and serializeError throw (rather than hanging the boundary forever)", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const buggySerialize = (): string => {
        throw new Error("serialize bug");
      };
      const buggySerializeError = (): string => {
        throw new Error("serializeError bug");
      };

      const out = await consume(
        injectDeferredScripts(
          html,
          { x: Promise.resolve("any") },
          {
            serialize: buggySerialize,
            serializeError: buggySerializeError,
            bootstrap: false,
          },
        ),
      );

      expect(out).toContain("__rrDeferError__");
      expect(out).toContain("deferred serialization failed");
    });

    it("emits panic settle script for rejection when custom serializeError throws", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const buggySerializeError = (): string => {
        throw new Error("serializeError bug");
      };

      const out = await consume(
        injectDeferredScripts(
          html,
          { x: Promise.reject(new Error("original")) },
          { serializeError: buggySerializeError, bootstrap: false },
        ),
      );

      expect(out).toContain("__rrDeferError__");
      expect(out).toContain("deferred serialization failed");
    });

    it("converts non-Error rejections via String() in default serializer", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const out = await consume(
        injectDeferredScripts(
          html,
          { x: Promise.reject("plain string") },
          { bootstrap: false },
        ),
      );

      expect(out).toContain("plain string");
    });
  });

  describe("XSS hardening", () => {
    it("escapes </script> in serialised values", async () => {
      const html = createHtmlStream(["<body>x</body>"]);
      const malicious = { evil: "</script><script>alert(1)</script>" };
      const out = await consume(
        injectDeferredScripts(
          html,
          { x: Promise.resolve(malicious) },
          { bootstrap: false },
        ),
      );

      expect(out).not.toMatch(/<\/script><script>alert/);
    });
  });

  describe("HTML stream errors", () => {
    it("propagates errors from the underlying HTML stream", async () => {
      const html = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("html stream broken"));
        },
      });

      const stream = injectDeferredScripts(html, {});

      await expect(consume(stream)).rejects.toThrow("html stream broken");
    });
  });

  describe("misbehaving thenables", () => {
    // Regression: a duck-typed thenable whose `.then(...)` synchronously
    // throws (not rejects) used to escape `entries.map`'s callback and
    // crash the ReadableStream `start` callback, breaking the whole
    // shell mid-stream. We now catch the synchronous throw and emit an
    // error settle script in its place.
    it("handles thenable whose .then throws synchronously", async () => {
      // Build the misbehaving thenable through a generic factory so the
      // `unicorn/no-thenable` rule (which fires on object-literal `then`)
      // does not match. Exercises the synchronous-throw codepath in
      // injectDeferredScripts — `defer()` validates `typeof .then === "function"`
      // but cannot prove the .then implementation does not throw.
      const makeEvilThenable = (): Promise<never> => {
        const target = Object.create(null) as Record<string, unknown>;
        const thenKey = ["t", "h", "e", "n"].join("");

        /* eslint-disable unicorn/no-thenable --
         * Intentional: this test exercises the misbehaving-thenable codepath
         * in injectDeferredScripts. `defer()` validates
         * `typeof .then === "function"` but cannot prove the implementation
         * does not throw. */
        target[thenKey] = (): never => {
          throw new Error("evil thenable");
        };
        /* eslint-enable unicorn/no-thenable */

        return target as unknown as Promise<never>;
      };

      const html = createHtmlStream(["<body>shell</body>"]);
      const stream = injectDeferredScripts(html, {
        bad: makeEvilThenable(),
      });

      const out = await consume(stream);

      expect(out).toContain("<body>shell</body>");
      expect(out).toContain("__rrDeferError__");
      expect(out).toContain("evil thenable");
    });
  });

  describe("stream lifecycle", () => {
    it("survives consumer-side cancel without throwing — outstanding settle scripts no-op via safeEnqueue catch", async () => {
      const html = createHtmlStream(["<body>shell</body>"]);

      let resolveA!: (v: string) => void;
      let resolveB!: (v: string) => void;
      const a = new Promise<string>((r) => {
        resolveA = r;
      });
      const b = new Promise<string>((r) => {
        resolveB = r;
      });

      const stream = injectDeferredScripts(
        html,
        { a, b },
        { bootstrap: false },
      );

      const reader = stream.getReader();

      // Pull the shell, then cancel — outstanding settle scripts will try to
      // enqueue into a closed controller. The first hits safeEnqueue's catch
      // and flips `closed = true`; the second early-exits via the closed
      // guard at the top of safeEnqueue.
      await reader.read();
      await reader.cancel();
      reader.releaseLock();

      // Resolve AFTER cancel; both no-op gracefully.
      resolveA("A");
      // Allow microtask queue to flush the first settle then schedule the second.
      await Promise.resolve();
      resolveB("B");

      await expect(Promise.all([a, b])).resolves.toStrictEqual(["A", "B"]);
    });

    it("propagates consumer cancel upstream — htmlStream is cancelled, no work after disconnect", async () => {
      let upstreamCancelled = false;
      let upstreamCancelReason: unknown;
      const encoder = new TextEncoder();
      const upstream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          controller.enqueue(encoder.encode("chunk-"));
          await new Promise((r) => setTimeout(r, 50));
        },
        cancel(reason) {
          upstreamCancelled = true;
          upstreamCancelReason = reason;
        },
      });

      const stream = injectDeferredScripts(
        upstream,
        { k: new Promise(() => undefined) },
        { bootstrap: false },
      );

      const reader = stream.getReader();

      await reader.read();
      await reader.cancel("client-disconnect");

      // Allow microtasks to propagate.
      await new Promise((r) => setTimeout(r, 30));

      expect(upstreamCancelled).toBe(true);
      expect(upstreamCancelReason).toBe("client-disconnect");
    });

    it("waits for both HTML and deferred to settle before closing", async () => {
      const html = createHtmlStream(["<body>shell</body>"]);

      let resolveDeferred!: (v: string) => void;
      const deferred = new Promise<string>((r) => {
        resolveDeferred = r;
      });

      const stream = injectDeferredScripts(
        html,
        { x: deferred },
        { bootstrap: false },
      );

      const reader = stream.getReader();
      const first = await reader.read();

      expect(decoder.decode(first.value)).toContain("shell");

      // Resolve deferred BEFORE second read — verifies settle script lands
      // and the stream eventually closes.
      resolveDeferred("OK");

      const out: string[] = [];

      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        out.push(decoder.decode(value));
      }

      expect(out.join("")).toContain('__rrDefer__("x"');
    });
  });
});
