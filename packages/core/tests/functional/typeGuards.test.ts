import { describe, it, expect } from "vitest";

import { assertLoggerConfig } from "../../src/typeGuards";

describe("typeGuards", () => {
  describe("assertLoggerConfig", () => {
    it("does not throw for empty config object", () => {
      expect(() => {
        assertLoggerConfig({});
      }).not.toThrow();
    });

    it("does not throw for valid level 'all'", () => {
      expect(() => {
        assertLoggerConfig({ level: "all" });
      }).not.toThrow();
    });

    it("does not throw for valid level 'warn-error'", () => {
      expect(() => {
        assertLoggerConfig({ level: "warn-error" });
      }).not.toThrow();
    });

    it("does not throw for valid level 'error-only'", () => {
      expect(() => {
        assertLoggerConfig({ level: "error-only" });
      }).not.toThrow();
    });

    it("does not throw for valid callback function", () => {
      expect(() => {
        assertLoggerConfig({ callback: () => {} });
      }).not.toThrow();
    });

    it("does not throw for valid config with both level and callback", () => {
      expect(() => {
        assertLoggerConfig({ level: "all", callback: () => {} });
      }).not.toThrow();
    });

    it('does not throw for valid level "none" (#789)', () => {
      expect(() => {
        assertLoggerConfig({ level: "none" });
      }).not.toThrow();
    });

    it("does not throw for callbackIgnoresLevel boolean (#789)", () => {
      expect(() => {
        assertLoggerConfig({ callbackIgnoresLevel: true });
      }).not.toThrow();
      expect(() => {
        assertLoggerConfig({ callbackIgnoresLevel: false });
      }).not.toThrow();
    });

    it("does not throw for the full LoggerConfig surface (#789)", () => {
      expect(() => {
        assertLoggerConfig({
          level: "none",
          callback: () => {},
          callbackIgnoresLevel: true,
        });
      }).not.toThrow();
    });

    it("throws TypeError for non-object config (null)", () => {
      expect(() => {
        assertLoggerConfig(null);
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig(null);
      }).toThrow("Logger config must be an object");
    });

    it("throws TypeError for non-object config (primitive)", () => {
      expect(() => {
        assertLoggerConfig("string");
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig(123);
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig(true);
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig(undefined);
      }).toThrow(TypeError);
    });

    it("throws TypeError for unknown property", () => {
      expect(() => {
        assertLoggerConfig({ unknown: "value" });
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig({ unknown: "value" });
      }).toThrow('Unknown logger config property: "unknown"');
    });

    it("throws TypeError for invalid level - number", () => {
      expect(() => {
        assertLoggerConfig({ level: 123 });
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig({ level: 123 });
      }).toThrow("Invalid logger level");
    });

    it("throws TypeError for invalid level - string not in set", () => {
      expect(() => {
        assertLoggerConfig({ level: "invalid" });
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig({ level: "invalid" });
      }).toThrow("Invalid logger level");
    });

    it("throws TypeError for invalid level - object (formatValue branch)", () => {
      expect(() => {
        assertLoggerConfig({ level: { nested: true } });
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig({ level: { nested: true } });
      }).toThrow('Invalid logger level: {"nested":true}');
    });

    it("throws TypeError for callback that is not a function", () => {
      expect(() => {
        assertLoggerConfig({ callback: "not-a-function" });
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig({ callback: "not-a-function" });
      }).toThrow("Logger callback must be a function");
    });

    it("throws TypeError for callbackIgnoresLevel that is not a boolean (#789)", () => {
      expect(() => {
        assertLoggerConfig({ callbackIgnoresLevel: "yes" });
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig({ callbackIgnoresLevel: "yes" });
      }).toThrow("Logger callbackIgnoresLevel must be a boolean");
    });

    it('lists "none" in the invalid-level error message (#789)', () => {
      expect(() => {
        assertLoggerConfig({ level: "invalid" });
      }).toThrow('"all" | "warn-error" | "error-only" | "none"');
    });

    it("does not throw for undefined values on optional properties", () => {
      expect(() => {
        assertLoggerConfig({ level: undefined });
      }).not.toThrow();
      expect(() => {
        assertLoggerConfig({ callback: undefined });
      }).not.toThrow();
      expect(() => {
        assertLoggerConfig({ callbackIgnoresLevel: undefined });
      }).not.toThrow();
      expect(() => {
        assertLoggerConfig({ level: undefined, callback: undefined });
      }).not.toThrow();
    });

    it("formats non-string, non-object values using String()", () => {
      // Symbol is neither string nor object — exercises the formatValue fallback
      const symbolLevel = Symbol("test");

      expect(() => {
        assertLoggerConfig({ level: symbolLevel });
      }).toThrow(TypeError);
      expect(() => {
        assertLoggerConfig({ level: symbolLevel });
      }).toThrow("Invalid logger level: Symbol(test)");
    });
  });
});
