import { createBrowserConfig } from "../../tsdown.base.js";

// Browser-only plugin - bundle type-guards and browser-env (private dependencies)
export default createBrowserConfig({
  deps: {
    alwaysBundle: ["type-guards", "browser-env"],
  },
});
