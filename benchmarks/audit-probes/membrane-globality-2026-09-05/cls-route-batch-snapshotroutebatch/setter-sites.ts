// Кто именно пишет `children` присваиванием: снимаем стек в унаследованном
// сеттере, и отдельно — что происходит без сеттера (строгий режим среды
// подтверждён пробой strict-and-array-drift.ts, блок D).
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

type AnyRoute = Record<string, unknown>;

function frames(): string[] {
  return String(new Error("x").stack)
    .split("\n")
    .slice(1, 5)
    .map((l) => l.trim().replace(/^at /, "").replace(/\(.*core\//, "(core/"));
}

const out: Record<string, unknown> = {};

// ── (1) с сеттером: где именно происходит [[Set]] ────────────────────────────
{
  const injected: AnyRoute[] = [{ name: "evil", path: "/evil" }];
  const setterStacks: string[][] = [];
  const getterStacks: string[][] = [];

  Object.defineProperty(Object.prototype, "children", {
    configurable: true,
    get(this: unknown): unknown {
      if (
        this !== null &&
        typeof this === "object" &&
        (this as AnyRoute).name === "u"
      ) {
        getterStacks.push(frames());

        return injected;
      }

      return undefined;
    },
    set(): void {
      setterStacks.push(frames());
    },
  });

  try {
    const router = createRouter([{ name: "u", path: "/u" }] as never);

    out["1 · hasEvil"] = getRoutesApi(router).has("u.evil");
    router.dispose();
  } catch (error) {
    out["1 · threw"] = String(error).slice(0, 200);
  } finally {
    delete (Object.prototype as AnyRoute).children;
  }

  out["1 · setter sites"] = setterStacks;
  out["1 · getter sites (first 4)"] = getterStacks.slice(0, 4);
}

// ── (2) без сеттера: бросает ли, и если нет — почему ────────────────────────
{
  const injected: AnyRoute[] = [{ name: "u2evil", path: "/evil" }];
  const getterStacks: string[][] = [];

  Object.defineProperty(Object.prototype, "children", {
    configurable: true,
    get(this: unknown): unknown {
      if (
        this !== null &&
        typeof this === "object" &&
        (this as AnyRoute).name === "u"
      ) {
        getterStacks.push(frames());

        return injected;
      }

      return undefined;
    },
  });

  try {
    const router = createRouter([{ name: "u", path: "/u" }] as never);

    out["2 · hasEvil"] = getRoutesApi(router).has("u.u2evil");
    router.dispose();
  } catch (error) {
    out["2 · threw"] = String(error).slice(0, 200);
  } finally {
    delete (Object.prototype as AnyRoute).children;
  }

  out["2 · getter sites (first 4)"] = getterStacks.slice(0, 4);
}

console.log(JSON.stringify(out, null, 1));
