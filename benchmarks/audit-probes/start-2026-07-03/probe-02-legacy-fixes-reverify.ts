// probe-02: ре-верификация закрытых legacy-находок start-deep-2026-05-22
// (#3 → #931 log-category; #4 → #939 invariant guard).
// Логгер console-backed → категорию ловим перехватом console.error
// (без импорта @real-router/logger — его нет в deps benchmarks).
// Structural/liveness — валидно на батарее.
import { createRouter } from "@real-router/core";

void (async () => {
  // legacy #4 → #939: start(undefined) без browser-plugin — actionable TypeError, не codePointAt
  {
    const r = createRouter([{ name: "a", path: "/a" }]);
    const res = await r
      .start(undefined as unknown as string)
      .then(
        () => "RESOLVED (?!)",
        (e: Error) => `REJECTED ${e.constructor.name}: ${e.message}`,
      );

    console.log(`#939 start(undefined): ${res}`);
    console.log(`     cryptic codePointAt: ${res.includes("codePointAt")} (ожидаемо false)`);
    console.log(
      `     actionable "[router.start] path must be a string": ${res.includes("[router.start] path must be a string")}`,
    );
    console.log(`     FSM recovered: isActive=${r.isActive()} (ожидаемо false)`);

    const retry = await r.start("/a").then(
      (s) => `RESOLVED ${s.name}`,
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );

    console.log(`     recovery start: ${retry} (ожидаемо RESOLVED a)`);
  }

  // legacy #3 → #931: fire-and-forget start-ошибка логируется под "router.start", не "router.navigate"
  {
    const captured: string[] = [];
    const orig = console.error;

    console.error = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };

    try {
      const r = createRouter([{ name: "a", path: "/a" }]);

      r.start(undefined as unknown as string); // fire-and-forget → TypeError (не suppressed RouterError)
      await new Promise((res) => setTimeout(res, 20));
    } finally {
      console.error = orig;
    }

    const startCat = captured.filter((line) => line.includes("router.start"));
    const navCat = captured.filter((line) => line.includes("router.navigate"));

    console.log(`#931 captured error-lines: ${captured.length}`);
    console.log(`     first line: ${captured[0]?.slice(0, 90) ?? "(none)"}`);
    console.log(
      `     категория корректна (router.start≥1, router.navigate=0): ${startCat.length >= 1 && navCat.length === 0}`,
    );
  }
})();
