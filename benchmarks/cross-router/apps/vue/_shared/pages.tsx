// Engine-agnostic Vue page components (Vue JSX) — IDENTICAL across the Vue
// cohort. Only the routing layer differs; pages + data-testid are shared so one
// Playwright driver runs against every engine (mirrors React/Preact cohorts).
import { defineComponent } from "vue";

export const Home = defineComponent({
  name: "PageHome",
  setup() {
    return () => (
      <main data-testid="page-home">
        <h1>Home</h1>
      </main>
    );
  },
});

export const About = defineComponent({
  name: "PageAbout",
  setup() {
    return () => (
      <main data-testid="page-about">
        <h1>About</h1>
      </main>
    );
  },
});

export const User = defineComponent({
  name: "PageUser",
  props: { id: { type: String, required: true } },
  setup(props) {
    return () => (
      <main data-testid="page-user" data-id={props.id}>
        <h1>User {props.id}</h1>
      </main>
    );
  },
});

export const CatalogItem = defineComponent({
  name: "PageItem",
  props: { n: { type: String, required: true } },
  setup(props) {
    return () => (
      <main data-testid="page-item" data-n={props.n}>
        <h1>Item {props.n}</h1>
      </main>
    );
  },
});
