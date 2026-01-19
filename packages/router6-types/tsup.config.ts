import { createIsomorphicConfig } from "../../tsup.base.mjs";

export default createIsomorphicConfig({
  minify: false,
  custom: {
    sourcemap: false,
  },
});
