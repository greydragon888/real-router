// _baseline — bare Vue, NO router. Manual view state + history.pushState. The
// floor: cold-start + one navigation with zero router overhead, so each router's
// number reads as "router work = engine − baseline".
import { createApp, defineComponent, ref } from "vue";

import { About, Home } from "../../_shared/pages";

const App = defineComponent({
  setup() {
    const view = ref<"home" | "about">(
      location.pathname === "/about" ? "about" : "home",
    );
    const go = (v: "home" | "about", path: string) => (event: Event) => {
      event.preventDefault();
      history.pushState(null, "", path);
      view.value = v;
    };
    return () => (
      <>
        <nav>
          <a href="/" data-testid="link-home" onClick={go("home", "/")}>
            Home
          </a>
          <a href="/about" data-testid="link-about" onClick={go("about", "/about")}>
            About
          </a>
        </nav>
        {view.value === "home" ? <Home /> : <About />}
      </>
    );
  },
});

createApp(App).mount("#root");
