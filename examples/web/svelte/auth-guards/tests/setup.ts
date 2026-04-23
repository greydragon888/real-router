import "@testing-library/jest-dom/vitest";

import { store } from "../../../shared/store";

afterEach(() => {
  store.clear();
});
