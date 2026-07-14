// _baseline (bare Svelte, NO router) floor for the cold-start route-count sweep — one
// minimal view (page-ready) at every ?n: the flat bare-framework boot floor.
import { mount } from "svelte";

import App from "./App.svelte";

const el = document.querySelector("#root");
if (el) {
  mount(App, { target: el });
}
