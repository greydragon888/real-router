import { useRoute } from "@real-router/solid";

import type { JSX } from "solid-js";

export function Contacts(): JSX.Element {
  const routeState = useRoute();
  const lang = () => (routeState().route?.params.lang as string | undefined) ?? "en";

  return (
    <div>
      <h1>{lang() === "ru" ? "Контакты" : "Contacts"}</h1>
      <p>
        {lang() === "ru"
          ? "Параметры lang и theme сохранились при переходе сюда."
          : "Both lang and theme params carried over when you navigated here."}
      </p>
      <div class="card">
        <p>
          <strong>GitHub:</strong>{" "}
          <a
            href="https://github.com/greydragon888/real-router"
            target="_blank"
            rel="noreferrer"
          >
            greydragon888/real-router
          </a>
        </p>
      </div>
    </div>
  );
}
