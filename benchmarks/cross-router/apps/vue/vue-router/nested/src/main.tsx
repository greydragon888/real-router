// vue-router nested variant — shared layout chain of DEPTH D (from `?n=`, default
// 1) with sibling leaves a/b at the bottom (nested children + <RouterView>;
// switching a↔b reuses the parent layouts).
import { createApp, defineComponent } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
} from "vue-router";

import type { RouteRecordRaw } from "vue-router";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;
const deepPrefix =
  "/sec" + Array.from({ length: DEPTH - 1 }, (_, i) => `/l${i + 2}`).join("");

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

const BottomLayout = defineComponent({
  setup() {
    return () => (
      <div class="sec">
        <nav>
          <RouterLink to={`${deepPrefix}/a`} data-testid="link-sec-a">
            A
          </RouterLink>
          <RouterLink to={`${deepPrefix}/b`} data-testid="link-sec-b">
            B
          </RouterLink>
        </nav>
        <RouterView />
      </div>
    );
  },
});

const PassLayout = defineComponent({
  setup: () => () => (
    <div class="lvl">
      <RouterView />
    </div>
  ),
});

function buildSec(): RouteRecordRaw {
  const abChildren: RouteRecordRaw[] = [
    { path: "a", component: defineComponent({ setup: () => () => <Leaf n="a" /> }) },
    { path: "b", component: defineComponent({ setup: () => () => <Leaf n="b" /> }) },
  ];
  let node: RouteRecordRaw = {
    path: DEPTH === 1 ? "/sec" : `l${DEPTH}`,
    component: BottomLayout,
    children: abChildren,
  };
  for (let k = DEPTH - 1; k >= 1; k--) {
    node = {
      path: k === 1 ? "/sec" : `l${k}`,
      component: PassLayout,
      children: [node],
    };
  }
  return node;
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: defineComponent({
        setup: () => () => (
          <main data-testid="page-home">
            <h1>Home</h1>
          </main>
        ),
      }),
    },
    buildSec(),
  ],
});

const App = defineComponent({ setup: () => () => <RouterView /> });

createApp(App).use(router).mount("#root");
