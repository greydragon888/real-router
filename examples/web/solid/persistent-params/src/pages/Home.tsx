import { useRoute } from "@real-router/solid";

import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  const routeState = useRoute();
  const lang = () =>
    (routeState().route?.params.lang as string | undefined) ?? "en";
  const theme = () =>
    (routeState().route?.params.theme as string | undefined) ?? "light";

  return (
    <div>
      <h1>{lang() === "ru" ? "Главная" : "Home"}</h1>
      <p>
        {lang() === "ru"
          ? "Добро пожаловать! Переключите язык или тему в панели выше."
          : "Welcome! Switch language or theme using the toolbar above."}
      </p>
      <p>
        {lang() === "ru"
          ? "Перейдите на другую страницу — параметры сохранятся в URL."
          : "Navigate to another page — the params persist in the URL."}
      </p>
      <div class="card">
        <p>
          Active lang: <strong>{lang()}</strong>
        </p>
        <p>
          Active theme: <strong>{theme()}</strong>
        </p>
      </div>
    </div>
  );
}
