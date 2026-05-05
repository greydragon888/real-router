import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  custom: {
    entry: {
      index: "src/index.ts",
      errors: "src/errors.ts",
    },
  },
});
