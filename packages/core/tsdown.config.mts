import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  custom: {
    entry: {
      index: "src/index.ts",
      types: "src/types/index.ts",
      api: "src/api/index.ts",
      utils: "src/utils/index.ts",
      validation: "src/validation.ts",
    },
  },
});
