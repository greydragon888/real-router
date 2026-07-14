// _baseline (bare Vue, NO router) floor for the cold-start route-count sweep — one
// minimal view (page-ready) at every ?n: the flat bare-framework boot floor.
import { createApp, defineComponent } from "vue";

createApp(
  defineComponent({
    setup: () => () => <main data-testid="page-ready">home</main>,
  }),
).mount("#root");
