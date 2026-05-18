import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  custom: {
    entry: {
      index: "src/index.ts",
      legacy: "src/legacy.ts",
      ink: "src/ink.ts",
      "index.react-server": "src/index.react-server.ts",
      ssr: "src/ssr.ts",
      "ssr.react-server": "src/ssr.react-server.ts",
      "legacy.ssr": "src/legacy.ssr.ts",
    },
  },
});
