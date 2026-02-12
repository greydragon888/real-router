import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { Router } from "@real-router/core";

let router: Router<TestDependencies>;

describe("core/dependencies/getDependency", () => {
  beforeEach(async () => {
    router = await createDependenciesTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return dependency by name", () => {
    expect(router.getDependency("foo")).toBe(1);
  });

  it("should throw ReferenceError if dependency not found", () => {
    expect(() => {
      router.getDependency("nonexistent" as "foo");
    }).toThrowError(ReferenceError);
    expect(() => {
      router.getDependency("nonexistent" as "foo");
    }).toThrowError(
      '[router.getDependency]: dependency "nonexistent" not found',
    );
  });

  it("should throw TypeError if name is not a string", () => {
    expect(() => {
      // @ts-expect-error: testing invalid input
      router.getDependency(123);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing invalid input
      router.getDependency(123);
    }).toThrowError(
      "[router.getDependency]: dependency name must be a string, got number",
    );
  });

  it("should return falsy values correctly", () => {
    router.setDependency("foo", 0 as number);

    expect(router.getDependency("foo")).toBe(0);

    // @ts-expect-error: testing null value
    router.setDependency("bar", null);

    expect(router.getDependency("bar")).toBe(null);

    // @ts-expect-error: testing false value
    router.setDependency("foo", false);

    expect(router.getDependency("foo")).toBe(false);
  });

  it("should return live references, not copies", () => {
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    const service = { baseUrl: "http://api.com", count: 0 };

    // @ts-expect-error: testing object value
    router.setDependency("foo", service);

    const ref1 = router.getDependency("foo");
    const ref2 = router.getDependency("foo");

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
    router.setDependency("API", api1);
    // @ts-expect-error: testing different case keys
    router.setDependency("api", api2);

    // @ts-expect-error: testing different case keys
    expect(router.getDependency("API")).toBe(api1);
    // @ts-expect-error: testing different case keys
    expect(router.getDependency("api")).toBe(api2);
    // @ts-expect-error: testing different case keys
    expect(router.getDependency("API")).not.toBe(api2);
  });

  it("should accept empty string as valid key", () => {
    // @ts-expect-error: testing empty string key
    router.setDependency("", "empty-key-value");

    // @ts-expect-error: testing empty string key
    expect(router.getDependency("")).toBe("empty-key-value");
  });

  it("should handle exotic objects with throwing toString", () => {
    const exoticKey = {
      toString() {
        throw new Error("toString failed");
      },
    };

    expect(() => {
      // @ts-expect-error: testing exotic object
      router.getDependency(exoticKey);
    }).toThrowError(TypeError);
  });

  it("should throw ReferenceError even for undefined value", () => {
    // undefined means "not set", even if explicitly set
    expect(() => {
      router.getDependency("notSet" as "foo");
    }).toThrowError(ReferenceError);
  });

  it("should work after setDependency and fail after removeDependency", () => {
    // @ts-expect-error: testing new key
    router.setDependency("temp", "value");

    // @ts-expect-error: testing new key
    expect(router.getDependency("temp")).toBe("value");

    // @ts-expect-error: testing new key
    router.removeDependency("temp");

    expect(() => {
      // @ts-expect-error: testing new key
      router.getDependency("temp");
    }).toThrowError(ReferenceError);
  });

  // 🟢 Edge cases: special string keys

  it("should handle Unicode keys", () => {
    // @ts-expect-error: testing Unicode key
    router.setDependency("日本語キー", "japanese");
    // @ts-expect-error: testing Unicode key
    router.setDependency("émoji🚀", "rocket");
    // @ts-expect-error: testing Unicode key
    router.setDependency("кириллица", "cyrillic");

    // @ts-expect-error: testing Unicode key
    expect(router.getDependency("日本語キー")).toBe("japanese");
    // @ts-expect-error: testing Unicode key
    expect(router.getDependency("émoji🚀")).toBe("rocket");
    // @ts-expect-error: testing Unicode key
    expect(router.getDependency("кириллица")).toBe("cyrillic");
  });

  it("should handle very long string keys", () => {
    const longKey = "a".repeat(10_000);

    // @ts-expect-error: testing long key
    router.setDependency(longKey, "long-key-value");

    // @ts-expect-error: testing long key
    expect(router.getDependency(longKey)).toBe("long-key-value");
  });

  it("should handle keys with whitespace characters", () => {
    // @ts-expect-error: testing whitespace key
    router.setDependency("key with spaces", "spaces");
    // @ts-expect-error: testing whitespace key
    router.setDependency("key\twith\ttabs", "tabs");
    // @ts-expect-error: testing whitespace key
    router.setDependency("key\nwith\nnewlines", "newlines");

    // @ts-expect-error: testing whitespace key
    expect(router.getDependency("key with spaces")).toBe("spaces");
    // @ts-expect-error: testing whitespace key
    expect(router.getDependency("key\twith\ttabs")).toBe("tabs");
    // @ts-expect-error: testing whitespace key
    expect(router.getDependency("key\nwith\nnewlines")).toBe("newlines");
  });

  it("should safely handle prototype-related keys (Object.create(null) protection)", () => {
    // These keys would be dangerous on regular objects, but safe with null-prototype

    // @ts-expect-error: testing prototype key
    router.setDependency("__proto__", "proto-value");
    // @ts-expect-error: testing prototype key
    router.setDependency("constructor", "constructor-value");
    // @ts-expect-error: testing prototype key
    router.setDependency("hasOwnProperty", "hasOwn-value");
    // @ts-expect-error: testing prototype key
    router.setDependency("toString", "toString-value");
    // @ts-expect-error: testing prototype key
    router.setDependency("valueOf", "valueOf-value");

    // @ts-expect-error: testing prototype key
    expect(router.getDependency("__proto__")).toBe("proto-value");
    // @ts-expect-error: testing prototype key
    expect(router.getDependency("constructor")).toBe("constructor-value");
    // @ts-expect-error: testing prototype key
    expect(router.getDependency("hasOwnProperty")).toBe("hasOwn-value");
    // @ts-expect-error: testing prototype key
    expect(router.getDependency("toString")).toBe("toString-value");
    // @ts-expect-error: testing prototype key
    expect(router.getDependency("valueOf")).toBe("valueOf-value");
  });
});
