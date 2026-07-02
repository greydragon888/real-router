// vue-router (official) base app — home/about/user. Full router: createRouter +
// createWebHistory, <RouterView>/<RouterLink>, useRoute for params.
import { createApp, defineComponent } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
  useRoute,
} from "vue-router";

import { About, Home, User } from "../../_shared/pages";

const UserRoute = defineComponent({
  setup() {
    const route = useRoute();
    return () => {
      const id = String(route.params.id);
      const next = String(Number(id) + 1);
      return (
        <>
          <User id={id} />
          <RouterLink to={`/users/${next}`} data-testid="link-user-next">
            Next
          </RouterLink>
        </>
      );
    };
  },
});

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Home },
    { path: "/about", component: About },
    { path: "/users/:id", component: UserRoute },
  ],
});

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          <RouterLink to="/" data-testid="link-home">
            Home
          </RouterLink>
          <RouterLink to="/about" data-testid="link-about">
            About
          </RouterLink>
        </nav>
        <RouterView />
      </>
    );
  },
});

createApp(App).use(router).mount("#root");
