import { describe, it, expect } from "vitest";

import { validateOptions } from "../../src/validation";

describe("validateOptions", () => {
  it("should accept undefined options", () => {
    expect(() => {
      validateOptions();
    }).not.toThrow();
  });

  it("should accept empty options object", () => {
    expect(() => {
      validateOptions({});
    }).not.toThrow();
  });

  it("should accept all valid options", () => {
    expect(() => {
      validateOptions({
        level: "all",
        context: "my-router",
        showTiming: true,
        showParamsDiff: false,
        usePerformanceMarks: true,
      });
    }).not.toThrow();
  });

  it("should throw TypeError for non-object options", () => {
    expect(() => {
      validateOptions("string" as never);
    }).toThrow(TypeError);
    expect(() => {
      validateOptions(42 as never);
    }).toThrow(TypeError);
    expect(() => {
      validateOptions(true as never);
    }).toThrow(TypeError);
  });

  it("should throw TypeError for null options", () => {
    expect(() => {
      validateOptions(null as never);
    }).toThrow(TypeError);
    expect(() => {
      validateOptions(null as never);
    }).toThrow("Options must be an object");
  });

  describe("level", () => {
    it.each(["all", "transitions", "errors", "none"] as const)(
      "should accept valid level '%s'",
      (level) => {
        expect(() => {
          validateOptions({ level });
        }).not.toThrow();
      },
    );

    it("should throw TypeError for invalid level", () => {
      expect(() => {
        validateOptions({ level: "verbose" as never });
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ level: "verbose" as never });
      }).toThrow('Invalid level: "verbose"');
    });

    it("should list valid levels in error message", () => {
      expect(() => {
        validateOptions({ level: "bad" as never });
      }).toThrow("Expected: all, transitions, errors, none");
    });
  });

  describe("context", () => {
    it("should accept valid non-empty string", () => {
      expect(() => {
        validateOptions({ context: "my-router" });
      }).not.toThrow();
    });

    it("should throw TypeError for empty string", () => {
      expect(() => {
        validateOptions({ context: "" });
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ context: "" });
      }).toThrow('"context" must be a non-empty string');
    });

    it("should throw TypeError for non-string", () => {
      expect(() => {
        validateOptions({ context: 42 as never });
      }).toThrow(TypeError);
    });
  });

  describe("boolean options", () => {
    it("should throw TypeError for non-boolean showTiming", () => {
      expect(() => {
        validateOptions({ showTiming: "yes" as never });
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ showTiming: "yes" as never });
      }).toThrow('"showTiming" must be a boolean');
    });

    it("should throw TypeError for non-boolean showParamsDiff", () => {
      expect(() => {
        validateOptions({ showParamsDiff: "yes" as never });
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ showParamsDiff: "yes" as never });
      }).toThrow('"showParamsDiff" must be a boolean');
    });

    it("should throw TypeError for non-boolean usePerformanceMarks", () => {
      expect(() => {
        validateOptions({ usePerformanceMarks: "yes" as never });
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ usePerformanceMarks: "yes" as never });
      }).toThrow('"usePerformanceMarks" must be a boolean');
    });

    it("should accept boolean values", () => {
      expect(() => {
        validateOptions({ showTiming: false });
      }).not.toThrow();
      expect(() => {
        validateOptions({ showParamsDiff: true });
      }).not.toThrow();
      expect(() => {
        validateOptions({ usePerformanceMarks: false });
      }).not.toThrow();
    });
  });

  describe("error prefix", () => {
    it("should include [@real-router/logger-plugin] prefix in error messages", () => {
      expect(() => {
        validateOptions(null as never);
      }).toThrow("[@real-router/logger-plugin]");
    });
  });
});
