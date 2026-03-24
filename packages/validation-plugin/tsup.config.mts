import { createBrowserConfig } from "../../tsup.base.mjs";

// Validation plugin - bundle type-guards and route-tree (private dependencies)
export default createBrowserConfig({
  noExternal: ["type-guards", "route-tree"],
});
