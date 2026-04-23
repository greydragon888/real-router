import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/vue";

import { cartState } from "../src/cart-state";
import { editorState } from "../src/editor-state";

afterEach(() => {
  cleanup();
  cartState.hasItems = true;
  editorState.hasUnsaved = false;
});
