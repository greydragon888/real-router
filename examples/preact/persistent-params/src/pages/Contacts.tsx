import { useRoute } from "@real-router/preact";

import type { JSX } from "preact";

export function Contacts(): JSX.Element {
  const { route } = useRoute();
  const lang = (route?.params.lang as string | undefined) ?? "en";

  return (
    <div>
      <h1>{lang === "ru" ? "Контакты" : "Contacts"}</h1>
      <p>
        {lang === "ru"
          ? "Параметры lang и theme сохранились при переходе сюда."
          : "Both lang and theme params carried over when you navigated here."}
      </p>
      <div className="card">
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
