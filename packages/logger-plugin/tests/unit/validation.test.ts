import { describe, it, expect } from "vitest";

import { validateOptions } from "../../src/validation";

describe("validateOptions", () => {
  it("should accept undefined options", () => {
    expect(() => {
      validateOptions();
    }).not.toThrowError();
  });

  it("should accept empty options object", () => {
    expect(() => {
      validateOptions({});
    }).not.toThrowError();
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
    }).not.toThrowError();
  });

  it("should throw TypeError for non-object options", () => {
    expect(() => {
      validateOptions("string" as never);
    }).toThrowError(TypeError);
    expect(() => {
      validateOptions(42 as never);
    }).toThrowError(TypeError);
    expect(() => {
      validateOptions(true as never);
    }).toThrowError(TypeError);
  });

  it("should throw TypeError for null options", () => {
    expect(() => {
      validateOptions(null as never);
    }).toThrowError(TypeError);
    expect(() => {
      validateOptions(null as never);
    }).toThrowError("Options must be an object");
  });

  describe("level", () => {
    it.each(["all", "transitions", "errors", "none"] as const)(
      "should accept valid level '%s'",
      (level) => {
        expect(() => {
          validateOptions({ level });
        }).not.toThrowError();
      },
    );

    it("should throw TypeError for invalid level", () => {
      expect(() => {
        validateOptions({ level: "verbose" as never });
      }).toThrowError(TypeError);
      expect(() => {
        validateOptions({ level: "verbose" as never });
      }).toThrowError('Invalid level: "verbose"');
    });

    it("should list valid levels in error message", () => {
      expect(() => {
        validateOptions({ level: "bad" as never });
      }).toThrowError("Expected: all, transitions, errors, none");
    });
  });

  describe("context", () => {
    it("should accept valid non-empty string", () => {
      expect(() => {
        validateOptions({ context: "my-router" });
      }).not.toThrowError();
    });

    it("should throw TypeError for empty string", () => {
      expect(() => {
        validateOptions({ context: "" });
      }).toThrowError(TypeError);
      expect(() => {
        validateOptions({ context: "" });
      }).toThrowError('"context" must be a non-empty string');
    });

    it("should throw TypeError for non-string", () => {
      expect(() => {
        validateOptions({ context: 42 as never });
      }).toThrowError(TypeError);
    });
  });

  describe("boolean options", () => {
    it("should throw TypeError for non-boolean showTiming", () => {
      expect(() => {
        validateOptions({ showTiming: "yes" as never });
      }).toThrowError(TypeError);
      expect(() => {
        validateOptions({ showTiming: "yes" as never });
      }).toThrowError('"showTiming" must be a boolean');
    });

    it("should throw TypeError for non-boolean showParamsDiff", () => {
      expect(() => {
        validateOptions({ showParamsDiff: "yes" as never });
      }).toThrowError(TypeError);
      expect(() => {
        validateOptions({ showParamsDiff: "yes" as never });
      }).toThrowError('"showParamsDiff" must be a boolean');
    });

    it("should throw TypeError for non-boolean usePerformanceMarks", () => {
      expect(() => {
        validateOptions({ usePerformanceMarks: "yes" as never });
      }).toThrowError(TypeError);
      expect(() => {
        validateOptions({ usePerformanceMarks: "yes" as never });
      }).toThrowError('"usePerformanceMarks" must be a boolean');
    });

    it("should accept boolean values", () => {
      expect(() => {
        validateOptions({ showTiming: false });
      }).not.toThrowError();
      expect(() => {
        validateOptions({ showParamsDiff: true });
      }).not.toThrowError();
      expect(() => {
        validateOptions({ usePerformanceMarks: false });
      }).not.toThrowError();
    });
  });

  describe("error prefix", () => {
    it("should include [@real-router/logger-plugin] prefix in error messages", () => {
      expect(() => {
        validateOptions(null as never);
      }).toThrowError("[@real-router/logger-plugin]");
    });
  });
});
