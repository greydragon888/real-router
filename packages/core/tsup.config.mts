import { createIsomorphicConfig } from "../../tsup.base.mjs";

// Bundle private dependencies into the output
export default createIsomorphicConfig({
  noExternal: ["event-emitter", "type-guards", "route-tree"],
  custom: {
    entry: {
      index: "src/index.ts",
      api: "src/api/index.ts",
      utils: "src/utils/index.ts",
    },
  },
});
