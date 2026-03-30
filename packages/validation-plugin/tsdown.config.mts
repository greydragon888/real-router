import { createBrowserConfig } from "../../tsdown.base.js";

export default createBrowserConfig({
  deps: {
    alwaysBundle: ["type-guards", "route-tree"],
  },
});
