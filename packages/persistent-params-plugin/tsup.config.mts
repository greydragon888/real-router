import { createBrowserConfig } from "../../tsup.base.mjs";

// Browser-only plugin - bundle type-guards (private dependency)
export default createBrowserConfig({
  noExternal: ["type-guards"],
});
