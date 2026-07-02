import { mount } from "svelte";

import App from "./App.svelte";

const rootElement = document.querySelector("#root");
if (rootElement) {
  mount(App, { target: rootElement });
}
