// _baseline linkbuild — 1000 plain <a>, no router (raw <a> render floor).
import { createApp, defineComponent, ref } from "vue";

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
              <a key={i} href={`/r${i}`} data-testid={i === COUNT - 1 ? "last-link" : undefined}>
                r{i}
              </a>
            ))}
          </nav>
        )}
      </>
    );
  },
});

createApp(App).mount("#root");
