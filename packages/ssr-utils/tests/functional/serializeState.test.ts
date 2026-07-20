import { describe, it, expect } from "vitest";

import { serializeState } from "@real-router/ssr-utils";

describe("serializeState", () => {
  it("should serialize a plain object to JSON", () => {
    expect(serializeState({ name: "home" })).toBe('{"name":"home"}');
  });

  it("should escape < to prevent </script> injection", () => {
    const result = serializeState({
      html: "</script><script>alert(1)</script>",
    });

    expect(result).not.toContain("<");
    expect(result).toContain(String.raw`\u003c`);
  });

  it("should escape > to prevent HTML injection", () => {
    const result = serializeState({ val: "a>b" });

    expect(result).not.toContain(">");
    expect(result).toContain(String.raw`\u003e`);
  });

  it("should escape & to prevent HTML entity injection", () => {
    const result = serializeState({ val: "a&b" });

    expect(result).not.toContain("&");
    expect(result).toContain(String.raw`\u0026`);
  });

  it("should handle null", () => {
    expect(serializeState(null)).toBe("null");
  });

  it("should handle undefined as 'null'", () => {
    expect(serializeState(undefined)).toBe("null");
  });

  it("should handle arrays", () => {
    expect(serializeState([1, 2])).toBe("[1,2]");
  });

  it("should handle nested objects with special characters", () => {
    const data = { path: "/users/<id>", query: "a&b=1" };
    const result = serializeState(data);

    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain("&");
    expect(
      JSON.parse(
        result
          .replaceAll(String.raw`\u003c`, "<")
          .replaceAll(String.raw`\u003e`, ">")
          .replaceAll(String.raw`\u0026`, "&"),
      ),
    ).toStrictEqual(data);
  });

  it("should produce valid JSON after unescaping", () => {
    const data = { name: "home", params: { id: "123" }, path: "/" };
    const result = serializeState(data);

    expect(JSON.parse(result)).toStrictEqual(data);
  });

  describe("custom serialize option (#606)", () => {
    it("uses options.serialize instead of JSON.stringify", () => {
      const fakeSerialize = (data: unknown): string => {
        return `__custom__:${JSON.stringify(data)}`;
      };

      const result = serializeState(
        { name: "home" },
        { serialize: fakeSerialize },
      );

      expect(result).toBe('__custom__:{"name":"home"}');
    });

    it("XSS-escapes the output of a custom serializer", () => {
      const customSerialize = (data: unknown): string =>
        `${JSON.stringify(data)}<script>alert(1)</script>&end`;

      const result = serializeState(
        { name: "x" },
        { serialize: customSerialize },
      );

      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
      expect(result).not.toContain("&");
      expect(result).toContain(String.raw`\u003c`);
      expect(result).toContain(String.raw`\u003e`);
      expect(result).toContain(String.raw`\u0026`);
    });

    it("falls back to JSON.stringify when options is empty", () => {
      const result = serializeState({ a: 1 }, {});

      expect(result).toBe('{"a":1}');
    });

    it("calls custom serializer for undefined input (devalue/superjson can encode undefined)", () => {
      let called = false;
      const customSerialize = (data: unknown): string => {
        called = true;

        // Mimic devalue's "[-1]" encoding for undefined — ensures the user's
        // serializer/parser pair can round-trip undefined. The early-return
        // we used to do here would have suppressed this and forced "null".
        return data === undefined ? "[-1]" : JSON.stringify(data);
      };

      const result = serializeState(undefined, { serialize: customSerialize });

      expect(called).toBe(true);
      expect(result).toBe("[-1]");
    });

    it("falls back to 'null' when custom serializer returns undefined", () => {
      const broken = (): string | undefined => undefined;

      const result = serializeState(
        {},
        { serialize: broken as (data: unknown) => string },
      );

      expect(result).toBe("null");
    });

    it("falls back to 'null' for non-serializable top-level values (Symbol/function)", () => {
      // Pre-existing latent bug: JSON.stringify returns undefined for these,
      // and the previous implementation would crash on .replaceAll(undefined).
      // The post-serialize null-fallback now normalizes both to "null".
      expect(serializeState(Symbol("x"))).toBe("null");
      expect(serializeState((): number => 1)).toBe("null");
    });

    it("round-trips Date through serialize/deserialize pair (devalue/superjson-style)", () => {
      interface Tagged {
        __t: "Date";
        v: string;
      }

      const isTagged = (val: unknown): val is Tagged =>
        typeof val === "object" &&
        val !== null &&
        (val as { __t?: unknown }).__t === "Date" &&
        typeof (val as { v?: unknown }).v === "string";

      // Pre-walk Date instances into typed envelopes; JSON.stringify's
      // replacer doesn't see Date directly because Date.toJSON pre-converts
      // it to a string before the replacer runs.
      const tag = (val: unknown): unknown => {
        if (val instanceof Date) {
          return { __t: "Date", v: val.toISOString() };
        }

        if (val !== null && typeof val === "object") {
          const out: Record<string, unknown> = {};

          for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            out[k] = tag(v);
          }

          return out;
        }

        return val;
      };

      const serialize = (data: unknown): string => JSON.stringify(tag(data));

      const deserialize = (json: string): unknown =>
        JSON.parse(json, (_key, value: unknown) =>
          isTagged(value) ? new Date(value.v) : value,
        );

      const date = new Date("2026-05-08T10:00:00.000Z");
      const json = serializeState({ when: date }, { serialize });

      // JSON.parse natively decodes < / > / & escapes back
      // to the original characters inside string values — no manual unescape
      // needed, even though the date ISO above contains no XSS-sensitive chars.
      const parsed = deserialize(json) as { when: Date };

      expect(parsed.when).toBeInstanceOf(Date);
      expect(parsed.when.toISOString()).toBe(date.toISOString());
    });
  });
});
