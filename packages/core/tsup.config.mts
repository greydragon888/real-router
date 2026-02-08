import { createIsomorphicConfig } from "../../tsup.base.mjs";

// Bundle private dependencies into the output
export default createIsomorphicConfig({
  noExternal: ["type-guards", "route-tree"],
});
