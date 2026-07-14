// vue-router link-build variant — mount 1000 <RouterLink>s; each resolves its
// href via the router (1000 target routes registered so resolve is real).
import { createApp, defineComponent, ref } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
} from "vue-router";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

const App = defineComponent({
  setup() {
    const show = ref(false);
    return () => (
      <>
        <button data-testid="mount-links" onClick={() => { show.value = true; }}>
          mount
        </button>
        <main data-testid="page-ready">{show.value ? "shown" : "idle"}</main>
        {show.value && (
          <nav>
            {Array.from({ length: COUNT }, (_, i) => (
              <RouterLink
                key={i}
                to={`/r${i}`}
                data-testid={i === COUNT - 1 ? "last-link" : undefined}
              >
                r{i}
              </RouterLink>
            ))}
          </nav>
        )}
      </>
    );
  },
});

const Empty = defineComponent({ setup: () => () => null });

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: App },
    ...Array.from({ length: COUNT }, (_, i) => ({ path: `/r${i}`, component: Empty })),
  ],
});

const Root = defineComponent({ setup: () => () => <RouterView /> });

createApp(Root).use(router).mount("#root");
