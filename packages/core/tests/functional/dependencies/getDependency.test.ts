import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getDependenciesApi } from "@real-router/core";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { DependenciesApi, Router } from "@real-router/core";

let router: Router<TestDependencies>;
let deps: DependenciesApi<TestDependencies>;

describe("core/dependencies/getDependency", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
    deps = getDependenciesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should return dependency by name", () => {
    expect(deps.get("foo")).toBe(1);
  });

  it("should throw ReferenceError if dependency not found", () => {
    expect(() => {
      deps.get("nonexistent" as "foo");
    }).toThrowError(ReferenceError);
    expect(() => {
      deps.get("nonexistent" as "foo");
    }).toThrowError(
      '[router.getDependency]: dependency "nonexistent" not found',
    );
  });

  it("should throw TypeError if name is not a string", () => {
    expect(() => {
      // @ts-expect-error: testing invalid input
      deps.get(123);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing invalid input
      deps.get(123);
    }).toThrowError(
      "[router.getDependency]: dependency name must be a string, got number",
    );
  });

  it("should return falsy values correctly", () => {
    deps.set("foo", 0 as number);

    expect(deps.get("foo")).toBe(0);

    // @ts-expect-error: testing null value
    deps.set("bar", null);

    expect(deps.get("bar")).toBe(null);

    // @ts-expect-error: testing false value
    deps.set("foo", false);

    expect(deps.get("foo")).toBe(false);
  });

  it("should return live references, not copies", () => {
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    const service = { baseUrl: "http://api.com", count: 0 };

    // @ts-expect-error: testing object value
    deps.set("foo", service);

    const ref1 = deps.get("foo");
    const ref2 = deps.get("foo");

    // Same reference
    expect(ref1).toBe(ref2);
    expect(ref1).toBe(service);

    // Mutations are visible everywhere
    // @ts-expect-error: accessing object property
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    ref1.baseUrl = "http://new.com";

    // @ts-expect-error: accessing object property
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    expect(ref2.baseUrl).toBe("http://new.com");
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    expect(service.baseUrl).toBe("http://new.com");

    // @ts-expect-error: accessing object property
    ref2.count = 42;

    // @ts-expect-error: accessing object property
    expect(ref1.count).toBe(42);
    expect(service.count).toBe(42);
  });

  it("should be case-sensitive for dependency names", () => {
    const api1 = { name: "API1" };
    const api2 = { name: "API2" };

    // @ts-expect-error: testing different case keys
    deps.set("API", api1);
    // @ts-expect-error: testing different case keys
    deps.set("api", api2);

    // @ts-expect-error: testing different case keys
    expect(deps.get("API")).toBe(api1);
    // @ts-expect-error: testing different case keys
    expect(deps.get("api")).toBe(api2);
    // @ts-expect-error: testing different case keys
    expect(deps.get("API")).not.toBe(api2);
  });

  it("should accept empty string as valid key", () => {
    // @ts-expect-error: testing empty string key
    deps.set("", "empty-key-value");

    // @ts-expect-error: testing empty string key
    expect(deps.get("")).toBe("empty-key-value");
  });

  it("should handle exotic objects with throwing toString", () => {
    const exoticKey = {
      toString() {
        throw new Error("toString failed");
      },
    };

    expect(() => {
      // @ts-expect-error: testing exotic object
      deps.get(exoticKey);
    }).toThrowError(TypeError);
  });

  it("should throw ReferenceError even for undefined value", () => {
    // undefined means "not set", even if explicitly set
    expect(() => {
      deps.get("notSet" as "foo");
    }).toThrowError(ReferenceError);
  });

  it("should work after setDependency and fail after removeDependency", () => {
    // @ts-expect-error: testing new key
    deps.set("temp", "value");

    // @ts-expect-error: testing new key
    expect(deps.get("temp")).toBe("value");

    // @ts-expect-error: testing new key
    deps.remove("temp");

    expect(() => {
      // @ts-expect-error: testing new key
      deps.get("temp");
    }).toThrowError(ReferenceError);
  });

  // 🟢 Edge cases: special string keys

  it("should handle Unicode keys", () => {
    // @ts-expect-error: testing Unicode key
    deps.set("日本語キー", "japanese");
    // @ts-expect-error: testing Unicode key
    deps.set("émoji🚀", "rocket");
    // @ts-expect-error: testing Unicode key
    deps.set("кириллица", "cyrillic");

    // @ts-expect-error: testing Unicode key
    expect(deps.get("日本語キー")).toBe("japanese");
    // @ts-expect-error: testing Unicode key
    expect(deps.get("émoji🚀")).toBe("rocket");
    // @ts-expect-error: testing Unicode key
    expect(deps.get("кириллица")).toBe("cyrillic");
  });

  it("should handle very long string keys", () => {
    const longKey = "a".repeat(10_000);

    // @ts-expect-error: testing long key
    deps.set(longKey, "long-key-value");

    // @ts-expect-error: testing long key
    expect(deps.get(longKey)).toBe("long-key-value");
  });

  it("should handle keys with whitespace characters", () => {
    // @ts-expect-error: testing whitespace key
    deps.set("key with spaces", "spaces");
    // @ts-expect-error: testing whitespace key
    deps.set("key\twith\ttabs", "tabs");
    // @ts-expect-error: testing whitespace key
    deps.set("key\nwith\nnewlines", "newlines");

    // @ts-expect-error: testing whitespace key
    expect(deps.get("key with spaces")).toBe("spaces");
    // @ts-expect-error: testing whitespace key
    expect(deps.get("key\twith\ttabs")).toBe("tabs");
    // @ts-expect-error: testing whitespace key
    expect(deps.get("key\nwith\nnewlines")).toBe("newlines");
  });

  it("should safely handle prototype-related keys (Object.create(null) protection)", () => {
    // These keys would be dangerous on regular objects, but safe with null-prototype

    // @ts-expect-error: testing prototype key
    deps.set("__proto__", "proto-value");
    // @ts-expect-error: testing prototype key
    deps.set("constructor", "constructor-value");
    // @ts-expect-error: testing prototype key
    deps.set("hasOwnProperty", "hasOwn-value");
    // @ts-expect-error: testing prototype key
    deps.set("toString", "toString-value");
    // @ts-expect-error: testing prototype key
    deps.set("valueOf", "valueOf-value");

    // @ts-expect-error: testing prototype key
    expect(deps.get("__proto__")).toBe("proto-value");
    // @ts-expect-error: testing prototype key
    expect(deps.get("constructor")).toBe("constructor-value");
    // @ts-expect-error: testing prototype key
    expect(deps.get("hasOwnProperty")).toBe("hasOwn-value");
    // @ts-expect-error: testing prototype key
    expect(deps.get("toString")).toBe("toString-value");
    // @ts-expect-error: testing prototype key
    expect(deps.get("valueOf")).toBe("valueOf-value");
  });
});
