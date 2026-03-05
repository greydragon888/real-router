import { createBrowserConfig } from "../../tsup.base.mjs";

// Browser-only plugin - bundle private dependencies
export default createBrowserConfig({
  noExternal: ["type-guards", "browser-env"],
});
