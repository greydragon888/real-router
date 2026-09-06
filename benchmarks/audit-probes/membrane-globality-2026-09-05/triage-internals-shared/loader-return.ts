// Триаж: createSsrLoaderPlugin·SsrLoaderFn·return — ядро кладёт возврат колбэка
// приложения в state.context БЕЗ копии (нижняя дверь ядра — claim.write·value).
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
const router = createRouter(
  [{ name: "u", path: "/u/:id" }] as never,
  {} as never,
);
const api = getPluginApi(router as never);
const claim = api.claimContextNamespace("data");

await router.start("/u/1");

// Возврат «лоадера» приложения — контейнер вызывающего.
const loaderReturn = { rows: [1, 2, 3], client: { id: "svc" } };
claim.write(router.getState() as never, loaderReturn);

const stored = (router.getState() as never as { context: Record<string, unknown> })
  .context.data;

const out = {
  // ПОЗИТИВНЫЙ КОНТРОЛЬ: значение вообще доехало.
  reached: stored !== undefined,
  // Копии нет — та же ссылка.
  sameReference: stored === loaderReturn,
  frozenByCore: Object.isFrozen(stored),
  // Мутация после записи видна ядру (объект вызывающего, не снимок).
  postMutationVisible: (() => {
    (loaderReturn as Record<string, unknown>).late = "yes";

    return "late" in (stored as object);
  })(),
};

console.log(JSON.stringify(out, null, 1));
}

void main();
