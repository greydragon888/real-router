import { mount } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { HttpStatusCode } from "../../src/components/HttpStatusCode";
import { HttpStatusProvider } from "../../src/components/HttpStatusProvider";
import { createHttpStatusSink } from "../../src/utils/createHttpStatusSink";

import type { HttpStatusSink } from "../../src/utils/createHttpStatusSink";

const buildHost = (sink: HttpStatusSink, code = 404) =>
  defineComponent({
    setup: () => () =>
      h(
        HttpStatusProvider,
        { sink },
        {
          default: () => h(HttpStatusCode, { code }),
        },
      ),
  });

const buildHostWithChildren = (sink: HttpStatusSink) =>
  defineComponent({
    setup: () => () =>
      h(
        HttpStatusProvider,
        { sink },
        {
          default: () => [h(HttpStatusCode, { code: 410 }), h("p", "Hello")],
        },
      ),
  });

const buildHostMultiple = (sink: HttpStatusSink) =>
  defineComponent({
    setup: () => () =>
      h(
        HttpStatusProvider,
        { sink },
        {
          default: () => [
            h(HttpStatusCode, { code: 404 }),
            h(HttpStatusCode, { code: 410 }),
            h(HttpStatusCode, { code: 503 }),
          ],
        },
      ),
  });

describe("createHttpStatusSink", () => {
  it("starts with code === undefined", () => {
    const sink = createHttpStatusSink();

    expect(sink.code).toBeUndefined();
  });

  it("returns a fresh sink per call (no shared mutable state)", () => {
    const a = createHttpStatusSink();
    const b = createHttpStatusSink();

    a.code = 404;

    expect(b.code).toBeUndefined();
  });

  // Review §5.9 — `Object.freeze(sink)` is the documented anti-pattern: the
  // sink MUST stay mutable so `<HttpStatusCode>` can write `code` during
  // render. Freezing makes the write throw under ESM strict-mode semantics.
  // Lock the failure mode so a future refactor that silently de-freezes
  // (e.g. swapping to a plain readonly type guard) is caught immediately.
  it("Object.freeze(sink) → write throws TypeError under strict mode (documented anti-pattern)", () => {
    // ESM modules run under strict mode by default in Vite/Vitest, so a
    // direct assignment to a frozen property must throw rather than silently
    // no-op. Documented in CLAUDE.md: "Don't `Object.freeze` the sink".
    //
    // We cast to a mutable shape because Object.freeze narrows TS to
    // `Readonly<HttpStatusSink>` and the type checker would otherwise block
    // the very assignment we want to *observe* failing at runtime.
    const sink = Object.freeze(createHttpStatusSink()) as HttpStatusSink;

    expect(() => {
      sink.code = 404;
    }).toThrow(TypeError);
  });
});

describe("HttpStatusCode", () => {
  describe("SSR (vue/server-renderer)", () => {
    it("writes the code to the provider's sink during render", async () => {
      const sink = createHttpStatusSink();
      const html = await renderToString(createSSRApp(buildHost(sink)));

      expect(sink.code).toBe(404);
      // HttpStatusCode renders null → "<!---->"; provider slot wraps in a
      // Fragment → "<!--[--><!----><!--]-->". No real HTML elements emitted.
      expect(html).toContain("<!---->");
      expect(html).not.toMatch(/<[a-z]/i);
    });

    it("renders nothing — siblings still emit", async () => {
      const sink = createHttpStatusSink();
      const html = await renderToString(
        createSSRApp(buildHostWithChildren(sink)),
      );

      expect(html).toContain("Hello");
      expect(sink.code).toBe(410);
    });

    it("last write wins with multiple instances in render order", async () => {
      const sink = createHttpStatusSink();

      await renderToString(createSSRApp(buildHostMultiple(sink)));

      expect(sink.code).toBe(503);
    });

    it("no-op without provider (safe to render anywhere)", async () => {
      const NoProvider = defineComponent({
        setup: () => () => h(HttpStatusCode, { code: 404 }),
      });

      await expect(
        renderToString(createSSRApp(NoProvider)),
      ).resolves.not.toThrow();
    });

    it("non-404 codes (410 Gone, 451 Unavailable for Legal Reasons) round-trip", async () => {
      const sink = createHttpStatusSink();

      await renderToString(createSSRApp(buildHost(sink, 451)));

      expect(sink.code).toBe(451);
    });

    it("nested providers — inner sink wins (closest provider)", async () => {
      const outer = createHttpStatusSink();
      const inner = createHttpStatusSink();
      const Nested = defineComponent({
        setup: () => () =>
          h(
            HttpStatusProvider,
            { sink: outer },
            {
              default: () =>
                h(
                  HttpStatusProvider,
                  { sink: inner },
                  { default: () => h(HttpStatusCode, { code: 404 }) },
                ),
            },
          ),
      });

      await renderToString(createSSRApp(Nested));

      expect(inner.code).toBe(404);
      expect(outer.code).toBeUndefined();
    });
  });

  describe("client (mount)", () => {
    it("with provider also writes (provider is symmetric)", () => {
      const sink = createHttpStatusSink();

      mount(buildHost(sink, 418));

      expect(sink.code).toBe(418);
    });

    it("without provider does not throw", () => {
      const NoProvider = defineComponent({
        setup: () => () => h(HttpStatusCode, { code: 404 }),
      });

      expect(() => mount(NoProvider)).not.toThrow();
    });
  });

  describe("HttpStatusProvider", () => {
    it("renders children verbatim", () => {
      const sink = createHttpStatusSink();
      const Host = defineComponent({
        setup: () => () =>
          h(
            HttpStatusProvider,
            { sink },
            { default: () => h("span", "visible content") },
          ),
      });

      const wrapper = mount(Host);

      expect(wrapper.text()).toContain("visible content");
    });
  });

  describe("dev-only validation (#1441)", () => {
    // Symmetric with the preact HttpStatusCode dev-only validation: an invalid
    // `code` (not an integer in [100, 999]) logs a console.error in setup() —
    // Node's res.end() would otherwise reject it mid-response. The value is
    // still written to the sink (the warning is informational, not a block).
    it.each([[Number.NaN], [0], [1.5], [1000]])(
      "dev-warns when code === %s (still writes to sink)",
      async (invalidCode) => {
        const sink = createHttpStatusSink();
        const consoleError = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        await renderToString(createSSRApp(buildHost(sink, invalidCode)));

        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringMatching(
            /^\[real-router\] <HttpStatusCode :code="[^"]*" \/> received an invalid HTTP status code\./,
          ),
        );
        expect(sink.code).toBe(invalidCode);

        consoleError.mockRestore();
      },
    );

    it("does NOT warn for a valid integer code in [100, 999]", async () => {
      const sink = createHttpStatusSink();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await renderToString(createSSRApp(buildHost(sink, 404)));

      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});
