import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/vue";

import { store } from "../../../shared/store";

afterEach(() => {
  cleanup();
  store.clear();
});
