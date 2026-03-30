import { createBrowserConfig } from "../../tsdown.base.js";

// Browser-only plugin - bundle type-guards (private dependency)
export default createBrowserConfig({
  deps: {
    alwaysBundle: ["type-guards", "browser-env"],
  },
});
