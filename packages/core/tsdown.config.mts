import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  deps: {
    alwaysBundle: ["engine"],
  },
  custom: {
    entry: {
      index: "src/index.ts",
      types: "src/public-types/index.ts",
      api: "src/api/index.ts",
      utils: "src/utils/index.ts",
      validation: "src/validation.ts",
    },
  },
});
