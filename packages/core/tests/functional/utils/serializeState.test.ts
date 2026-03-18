import { describe, it, expect } from "vitest";

import { serializeState } from "../../../src/utils/serializeState";

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
});
