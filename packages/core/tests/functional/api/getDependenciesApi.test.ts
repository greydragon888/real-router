import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createRouter, getDependenciesApi } from "@real-router/core";

import type { Router, DependenciesApi } from "@real-router/core";

interface TestDeps {
  foo?: number;
  bar?: string;
}

let router: Router<TestDeps>;
let depsApi: DependenciesApi<TestDeps>;

describe("getDependenciesApi()", () => {
  beforeEach(() => {
    router = createRouter<TestDeps>([], {}, { foo: 1 });
    depsApi = getDependenciesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should return an object with all expected methods", () => {
    expect(typeof depsApi.get).toBe("function");
    expect(typeof depsApi.getAll).toBe("function");
    expect(typeof depsApi.set).toBe("function");
    expect(typeof depsApi.setAll).toBe("function");
    expect(typeof depsApi.remove).toBe("function");
    expect(typeof depsApi.reset).toBe("function");
    expect(typeof depsApi.has).toBe("function");
  });

  it("should return a new object on each call", () => {
    const depsApi2 = getDependenciesApi(router);

    expect(depsApi).not.toBe(depsApi2);
  });

  it("get should return dependency value", () => {
    expect(depsApi.get("foo")).toBe(1);
  });

  it("getAll should return all dependencies", () => {
    const all = depsApi.getAll();

    expect(all).toStrictEqual({ foo: 1 });
  });

  it("set should set a dependency", () => {
    depsApi.set("bar", "hello");

    expect(router.getDependency("bar")).toBe("hello");
  });

  it("setAll should set multiple dependencies", () => {
    depsApi.setAll({ foo: 2, bar: "world" });

    expect(router.getDependency("foo")).toBe(2);
    expect(router.getDependency("bar")).toBe("world");
  });

  it("remove should remove a dependency", () => {
    depsApi.remove("foo");

    expect(router.hasDependency("foo")).toBe(false);
  });

  it("reset should clear all dependencies", () => {
    depsApi.reset();

    expect(router.hasDependency("foo")).toBe(false);
  });

  it("has should check if dependency exists", () => {
    expect(depsApi.has("foo")).toBe(true);
    expect(depsApi.has("bar")).toBe(false);
  });
});
