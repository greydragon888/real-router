import { useRoute } from "@real-router/solid";

import type { JSX } from "solid-js";

export function About(): JSX.Element {
  const routeState = useRoute();
  const lang = () => (routeState().route?.params.lang as string | undefined) ?? "en";

  return (
    <div>
      <h1>{lang() === "ru" ? "О нас" : "About"}</h1>
      <p>
        {lang() === "ru"
          ? "Параметр lang сохраняется при навигации между страницами."
          : "The lang param persists when navigating between pages."}
      </p>
      <p>
        {lang() === "ru"
          ? "URL сейчас содержит ?lang=ru — попробуйте перейти на Контакты."
          : "The URL now has ?lang=en — navigate to Contacts and the param stays."}
      </p>
    </div>
  );
}
