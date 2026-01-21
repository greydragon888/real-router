// packages/persistent-params-plugin/tests/unit/utils.test.ts

import { describe, it, expect } from "vitest";

import {
  validateParamKey,
  isValidParamsConfig,
  validateParamValue,
  extractOwnParams,
  parseQueryString,
  buildQueryString,
  mergeParams,
} from "../../src/utils";

import type { Params } from "core-types";

describe("validateParamKey", () => {
  describe("Valid parameter names", () => {
    it("should accept simple alphanumeric names", () => {
      expect(() => {
        validateParamKey("mode");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("lang");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("debug");
      }).not.toThrowError();
    });

    it("should accept names with numbers", () => {
      expect(() => {
        validateParamKey("param1");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("page2");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("test123");
      }).not.toThrowError();
    });

    it("should accept names with underscores", () => {
      expect(() => {
        validateParamKey("utm_source");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("user_id");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("_private");
      }).not.toThrowError();
    });

    it("should accept names with dashes", () => {
      expect(() => {
        validateParamKey("user-id");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("first-name");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("api-key");
      }).not.toThrowError();
    });

    it("should accept mixed alphanumeric with special valid chars", () => {
      expect(() => {
        validateParamKey("utm_campaign_2024");
      }).not.toThrowError();
      expect(() => {
        validateParamKey("user-profile-v2");
      }).not.toThrowError();
    });
  });

  describe("Invalid parameter names - URL special characters", () => {
    it("should reject parameter names containing =", () => {
      expect(() => {
        validateParamKey("param=value");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key=");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("=value");
      }).toThrowError(TypeError);
    });

    it("should reject parameter names containing &", () => {
      expect(() => {
        validateParamKey("param&other");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key&");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("&value");
      }).toThrowError(TypeError);
    });

    it("should reject parameter names containing ?", () => {
      expect(() => {
        validateParamKey("param?query");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key?");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("?value");
      }).toThrowError(TypeError);
    });

    it("should reject parameter names containing #", () => {
      expect(() => {
        validateParamKey("param#hash");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key#");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("#value");
      }).toThrowError(TypeError);
    });
  });

  describe("Invalid parameter names - encoding/path characters", () => {
    it("should reject parameter names containing % (percent encoding)", () => {
      expect(() => {
        validateParamKey("param%20value");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key%");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("%value");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("param%2F");
      }).toThrowError(TypeError);
    });

    it("should reject parameter names containing / (forward slash)", () => {
      expect(() => {
        validateParamKey("param/value");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key/");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("/value");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("path/to/param");
      }).toThrowError(TypeError);
    });

    it(`should reject parameter names containing backslash`, () => {
      expect(() => {
        validateParamKey(String.raw`param\value`);
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key\\");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey(String.raw`\value`);
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey(String.raw`path\to\param`);
      }).toThrowError(TypeError);
    });
  });

  describe("Invalid parameter names - whitespace", () => {
    it("should reject parameter names containing space", () => {
      expect(() => {
        validateParamKey("param value");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key ");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey(" value");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("  ");
      }).toThrowError(TypeError);
    });

    it("should reject parameter names containing tab", () => {
      expect(() => {
        validateParamKey("param\tvalue");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key\t");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("\tvalue");
      }).toThrowError(TypeError);
    });

    it("should reject parameter names containing newline", () => {
      expect(() => {
        validateParamKey("param\nvalue");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key\n");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("\nvalue");
      }).toThrowError(TypeError);
    });

    it("should reject parameter names containing carriage return", () => {
      expect(() => {
        validateParamKey("param\rvalue");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("key\r");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("\rvalue");
      }).toThrowError(TypeError);
    });
  });

  describe("Error messages", () => {
    it("should include parameter name in error message", () => {
      expect(() => {
        validateParamKey("bad=param");
      }).toThrowError(/Invalid parameter name "bad=param"/);
      expect(() => {
        validateParamKey("bad&param");
      }).toThrowError(/Invalid parameter name "bad&param"/);
    });

    it("should list forbidden characters in error message", () => {
      expect(() => {
        validateParamKey("bad=param");
      }).toThrowError(/Cannot contain: = & \? # % \/ \\ or whitespace/);
    });

    it("should throw TypeError for better error handling", () => {
      expect(() => {
        validateParamKey("bad=param");
      }).toThrowError(TypeError);
    });
  });

  describe("Edge cases", () => {
    it("should handle multiple invalid characters", () => {
      expect(() => {
        validateParamKey("bad=param&other");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("path/with spaces");
      }).toThrowError(TypeError);
      expect(() => {
        validateParamKey("%20?query#hash");
      }).toThrowError(TypeError);
    });

    it("should handle invalid characters at different positions", () => {
      // At start
      expect(() => {
        validateParamKey("=start");
      }).toThrowError(TypeError);
      // In middle
      expect(() => {
        validateParamKey("mid=dle");
      }).toThrowError(TypeError);
      // At end
      expect(() => {
        validateParamKey("end=");
      }).toThrowError(TypeError);
    });
  });
});

describe("isValidParamsConfig", () => {
  describe("Array configuration", () => {
    it("should validate array with valid parameter names", () => {
      expect(isValidParamsConfig(["mode", "lang", "debug"])).toBe(true);
      expect(isValidParamsConfig(["utm_source", "user-id"])).toBe(true);
    });

    it("should reject array with invalid parameter names", () => {
      expect(isValidParamsConfig(["mode", "bad=param"])).toBe(false);
      expect(isValidParamsConfig(["param with spaces"])).toBe(false);
      expect(isValidParamsConfig(["param%20"])).toBe(false);
      expect(isValidParamsConfig(["path/to"])).toBe(false);
      expect(isValidParamsConfig([String.raw`back\slash`])).toBe(false);
    });

    it("should reject array with empty strings", () => {
      expect(isValidParamsConfig(["mode", ""])).toBe(false);
      expect(isValidParamsConfig([""])).toBe(false);
    });

    it("should reject array with non-string items", () => {
      expect(isValidParamsConfig(["mode", 123])).toBe(false);
      expect(isValidParamsConfig(["mode", null])).toBe(false);
      expect(isValidParamsConfig(["mode", undefined])).toBe(false);
    });

    it("should accept empty array", () => {
      expect(isValidParamsConfig([])).toBe(true);
    });
  });

  describe("Object configuration", () => {
    it("should validate object with valid keys and values", () => {
      expect(isValidParamsConfig({ mode: "dev", lang: "en" })).toBe(true);
      expect(isValidParamsConfig({ utm_source: "google", page: 1 })).toBe(true);
      expect(isValidParamsConfig({ debug: true })).toBe(true);
    });

    it("should reject object with invalid parameter keys", () => {
      expect(isValidParamsConfig({ "bad=param": "value" })).toBe(false);
      expect(isValidParamsConfig({ "param with space": "value" })).toBe(false);
      expect(isValidParamsConfig({ "param%20": "value" })).toBe(false);
      expect(isValidParamsConfig({ "path/to": "value" })).toBe(false);
      expect(isValidParamsConfig({ "back\\slash": "value" })).toBe(false);
    });

    it("should reject object with empty string keys", () => {
      expect(isValidParamsConfig({ "": "value" })).toBe(false);
    });

    it("should reject object with non-primitive values", () => {
      expect(isValidParamsConfig({ mode: { nested: "value" } })).toBe(false);
      expect(isValidParamsConfig({ mode: ["array"] })).toBe(false);
      expect(isValidParamsConfig({ mode: null })).toBe(false);
    });

    it("should accept empty object", () => {
      expect(isValidParamsConfig({})).toBe(true);
    });
  });

  describe("Invalid configurations", () => {
    it("should reject null", () => {
      expect(isValidParamsConfig(null)).toBe(false);
    });

    it("should reject undefined", () => {
      expect(isValidParamsConfig(undefined)).toBe(false);
    });

    it("should reject non-plain objects", () => {
      expect(isValidParamsConfig(new Date())).toBe(false);
      expect(isValidParamsConfig(new Map())).toBe(false);
      expect(isValidParamsConfig(new Set())).toBe(false);
    });

    it("should reject primitive values", () => {
      expect(isValidParamsConfig("string")).toBe(false);
      expect(isValidParamsConfig(123)).toBe(false);
      expect(isValidParamsConfig(true)).toBe(false);
    });
  });
});

describe("validateParamValue", () => {
  describe("Valid values", () => {
    it("should accept string values", () => {
      expect(() => {
        validateParamValue("key", "value");
      }).not.toThrowError();
      expect(() => {
        validateParamValue("key", "");
      }).not.toThrowError();
      expect(() => {
        validateParamValue("key", "123");
      }).not.toThrowError();
    });

    it("should accept number values", () => {
      expect(() => {
        validateParamValue("key", 123);
      }).not.toThrowError();
      expect(() => {
        validateParamValue("key", 0);
      }).not.toThrowError();
      expect(() => {
        validateParamValue("key", -1);
      }).not.toThrowError();
      expect(() => {
        validateParamValue("key", 3.14);
      }).not.toThrowError();
    });

    it("should accept boolean values", () => {
      expect(() => {
        validateParamValue("key", true);
      }).not.toThrowError();
      expect(() => {
        validateParamValue("key", false);
      }).not.toThrowError();
    });

    it("should accept undefined", () => {
      expect(() => {
        validateParamValue("key", undefined);
      }).not.toThrowError();
    });
  });

  describe("Invalid values", () => {
    it("should reject null", () => {
      expect(() => {
        validateParamValue("key", null);
      }).toThrowError(TypeError);
      expect(() => {
        validateParamValue("key", null);
      }).toThrowError(/cannot be null.*Use undefined/);
    });

    it("should reject arrays", () => {
      expect(() => {
        validateParamValue("key", []);
      }).toThrowError(TypeError);
      expect(() => {
        validateParamValue("key", [1, 2, 3]);
      }).toThrowError(TypeError);
      expect(() => {
        validateParamValue("key", ["value"]);
      }).toThrowError(TypeError);
    });

    it("should reject objects", () => {
      expect(() => {
        validateParamValue("key", {});
      }).toThrowError(TypeError);
      expect(() => {
        validateParamValue("key", { nested: "value" });
      }).toThrowError(TypeError);
    });

    it("should reject functions", () => {
      expect(() => {
        validateParamValue("key", () => {});
      }).toThrowError(TypeError);
    });
  });

  describe("Error messages", () => {
    it("should include parameter name in error message", () => {
      expect(() => {
        validateParamValue("myParam", null);
      }).toThrowError(/myParam/);
      expect(() => {
        validateParamValue("myParam", []);
      }).toThrowError(/myParam/);
    });

    it("should describe the issue for null", () => {
      expect(() => {
        validateParamValue("key", null);
      }).toThrowError(/cannot be null/);
    });

    it("should describe the issue for non-primitives", () => {
      expect(() => {
        validateParamValue("key", []);
      }).toThrowError(/array/);
      expect(() => {
        validateParamValue("key", {});
      }).toThrowError(/object/);
    });
  });
});

describe("extractOwnParams", () => {
  it("should extract own properties", () => {
    const params = { mode: "dev", lang: "en" };
    const result = extractOwnParams(params);

    expect(result).toStrictEqual({ mode: "dev", lang: "en" });
  });

  it("should not include inherited properties", () => {
    const proto = { inherited: "value" };
    const params = Object.create(proto) as Params;

    params.own = "value";

    const result = extractOwnParams(params);

    expect(result).toStrictEqual({ own: "value" });
    expect(result).not.toHaveProperty("inherited");
  });

  it("should handle empty objects", () => {
    expect(extractOwnParams({})).toStrictEqual({});
  });

  it("should preserve undefined values", () => {
    const params = { mode: undefined, lang: "en" };
    const result = extractOwnParams(params);

    expect(result).toStrictEqual({ mode: undefined, lang: "en" });
  });
});

describe("parseQueryString", () => {
  it("should parse path with query string", () => {
    expect(parseQueryString("/users?page=1")).toStrictEqual({
      basePath: "/users",
      queryString: "page=1",
    });
  });

  it("should parse path without query string", () => {
    expect(parseQueryString("/users")).toStrictEqual({
      basePath: "/users",
      queryString: "",
    });
  });

  it("should handle path starting with ?", () => {
    expect(parseQueryString("?page=1")).toStrictEqual({
      basePath: "",
      queryString: "page=1",
    });
  });

  it("should handle empty path", () => {
    expect(parseQueryString("")).toStrictEqual({
      basePath: "",
      queryString: "",
    });
  });

  it("should handle multiple ? characters (takes first)", () => {
    expect(parseQueryString("/users?page=1?extra=2")).toStrictEqual({
      basePath: "/users",
      queryString: "page=1?extra=2",
    });
  });
});

describe("buildQueryString", () => {
  it("should build query string from param names", () => {
    expect(buildQueryString("", ["mode", "lang"])).toBe("mode&lang");
  });

  it("should append to existing query string", () => {
    expect(buildQueryString("existing=1", ["mode", "lang"])).toBe(
      "existing=1&mode&lang",
    );
  });

  it("should handle empty param names array", () => {
    expect(buildQueryString("existing=1", [])).toBe("existing=1");
    expect(buildQueryString("", [])).toBe("");
  });

  it("should handle single param name", () => {
    expect(buildQueryString("", ["mode"])).toBe("mode");
    expect(buildQueryString("existing=1", ["mode"])).toBe("existing=1&mode");
  });
});

describe("mergeParams", () => {
  it("should merge persistent and current params", () => {
    const persistent = { lang: "en", theme: "dark" };
    const current = { theme: "light", mode: "dev" };

    expect(mergeParams(persistent, current)).toStrictEqual({
      lang: "en",
      theme: "light",
      mode: "dev",
    });
  });

  it("should remove params set to undefined in current", () => {
    const persistent = { lang: "en", theme: "dark" };
    const current = { theme: undefined };

    expect(mergeParams(persistent, current)).toStrictEqual({ lang: "en" });
  });

  it("should exclude undefined values from persistent params", () => {
    const persistent = { lang: "en", theme: undefined };
    const current = { mode: "dev" };

    expect(mergeParams(persistent, current)).toStrictEqual({
      lang: "en",
      mode: "dev",
    });
  });

  it("should handle empty current params", () => {
    const persistent = { lang: "en", theme: "dark" };
    const current = {};

    expect(mergeParams(persistent, current)).toStrictEqual({
      lang: "en",
      theme: "dark",
    });
  });

  it("should handle empty persistent params", () => {
    const persistent = {};
    const current = { mode: "dev", lang: "en" };

    expect(mergeParams(persistent, current)).toStrictEqual({
      mode: "dev",
      lang: "en",
    });
  });

  it("should not mutate input objects", () => {
    const persistent = Object.freeze({ lang: "en" });
    const current = { mode: "dev" };

    mergeParams(persistent, current);

    expect(persistent).toStrictEqual({ lang: "en" });
    expect(current).toStrictEqual({ mode: "dev" });
  });
});
