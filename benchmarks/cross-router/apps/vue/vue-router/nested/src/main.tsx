// vue-router nested variant — shared section layout with sibling leaves a/b
// (nested children + <RouterView>; switching a↔b reuses the parent layout).
import { createApp, defineComponent } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
} from "vue-router";

const Leaf = defineComponent({
  props: { n: { type: String, required: true } },
  setup(props) {
    return () => (
      <main data-testid="page-item" data-n={props.n}>
        <h1>{props.n}</h1>
      </main>
    );
  },
});

const SectionLayout = defineComponent({
  setup() {
    return () => (
      <div class="sec">
        <nav>
          <RouterLink to="/sec/a" data-testid="link-sec-a">
            A
          </RouterLink>
          <RouterLink to="/sec/b" data-testid="link-sec-b">
            B
          </RouterLink>
        </nav>
        <RouterView />
      </div>
    );
  },
});

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: defineComponent({ setup: () => () => <main data-testid="page-home"><h1>Home</h1></main> }) },
    {
      path: "/sec",
      component: SectionLayout,
      children: [
        { path: "a", component: defineComponent({ setup: () => () => <Leaf n="a" /> }) },
        { path: "b", component: defineComponent({ setup: () => () => <Leaf n="b" /> }) },
      ],
    },
  ],
});

const App = defineComponent({ setup: () => () => <RouterView /> });

createApp(App).use(router).mount("#root");
