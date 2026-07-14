// _baseline (bare Solid, NO router) floor for the cold-start route-count sweep — one
// minimal view (page-ready) at every ?n: the flat bare-framework boot floor.
import { render } from "solid-js/web";

const root = document.querySelector("#root");
if (root) {
  render(() => <main data-testid="page-ready">home</main>, root);
}
