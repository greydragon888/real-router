import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
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
});

describe("HttpStatusCode", () => {
  describe("SSR (vue/server-renderer)", () => {
    it("writes the code to the provider's sink during render", async () => {
      const sink = createHttpStatusSink();
      const html = await renderToString(createSSRApp(buildHost(sink)));

      expect(sink.code).toBe(404);
      expect(html).toMatch(/^<!--/);
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
});
