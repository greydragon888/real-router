import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  deps: {
    alwaysBundle: ["dom-utils"],
  },
});
