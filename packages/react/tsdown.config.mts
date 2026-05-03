import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  custom: {
    entry: {
      index: "src/index.ts",
      legacy: "src/legacy.ts",
      ink: "src/ink.ts",
      "index.react-server": "src/index.react-server.ts",
    },
  },
});
