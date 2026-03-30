import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  deps: {
    alwaysBundle: ["event-emitter", "route-tree"],
  },
  custom: {
    entry: {
      index: "src/index.ts",
      api: "src/api/index.ts",
      utils: "src/utils/index.ts",
      validation: "src/validation.ts",
    },
  },
});
