// vue-router deep variant — nested route records to depth 90 (layout per level
// renders a nested <RouterView>; empty-path index child = the level leaf).
import { createApp, defineComponent } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

import { CatalogItem } from "../../../_shared/pages";
import { DEEP_DEPTH, DEEP_TARGETS, deepPath } from "../../../_shared/deep-spec";

const LevelLayout = defineComponent({ name: "LevelLayout", setup: () => () => <RouterView /> });

function buildChildren(k: number): RouteRecordRaw[] {
  const leaf: RouteRecordRaw = {
    path: "",
    component: defineComponent({ setup: () => () => <CatalogItem n={String(k)} /> }),
  };
  const children: RouteRecordRaw[] = [leaf];
  if (k < DEEP_DEPTH) {
    children.push({ path: `l${k + 1}`, component: LevelLayout, children: buildChildren(k + 1) });
  }
  return children;
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: defineComponent({
        setup: () => () => (
          <nav>
            {DEEP_TARGETS.map((d) => (
              <RouterLink key={d} to={deepPath(d)} data-testid={`link-deep-${d}`}>
                Depth {d}
              </RouterLink>
            ))}
          </nav>
        ),
      }),
    },
    {
      path: "/deep",
      component: LevelLayout,
      children: [{ path: "l1", component: LevelLayout, children: buildChildren(1) }],
    },
  ],
});

const App = defineComponent({ setup: () => () => <RouterView /> });

createApp(App).use(router).mount("#root");
