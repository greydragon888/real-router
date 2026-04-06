import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  deps: {
    alwaysBundle: ["dom-utils"],
  },
  custom: {
    entry: {
      index: "src/index.ts",
      legacy: "src/legacy.ts",
    },
  },
});
