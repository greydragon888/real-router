import { useRoute } from "@real-router/preact";

import type { JSX } from "preact";

export function Home(): JSX.Element {
  const { route } = useRoute();
  const lang = (route?.params.lang as string | undefined) ?? "en";
  const theme = (route?.params.theme as string | undefined) ?? "light";

  return (
    <div>
      <h1>{lang === "ru" ? "Главная" : "Home"}</h1>
      <p>
        {lang === "ru"
          ? "Добро пожаловать! Переключите язык или тему в панели выше."
          : "Welcome! Switch language or theme using the toolbar above."}
      </p>
      <p>
        {lang === "ru"
          ? "Перейдите на другую страницу — параметры сохранятся в URL."
          : "Navigate to another page — the params persist in the URL."}
      </p>
      <div className="card">
        <p>
          Active lang: <strong>{lang}</strong>
        </p>
        <p>
          Active theme: <strong>{theme}</strong>
        </p>
      </div>
    </div>
  );
}
