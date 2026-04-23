import "@testing-library/jest-dom/vitest";

import { cartState } from "../src/cart-state";
import { editorState } from "../src/editor-state";

afterEach(() => {
  cartState.hasItems = true;
  editorState.hasUnsaved = false;
});
