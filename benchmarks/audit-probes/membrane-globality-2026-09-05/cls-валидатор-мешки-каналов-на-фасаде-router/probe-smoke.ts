// Дым: резолвится ли РЕАЛЬНЫЙ validation-plugin из benchmarks и ставит ли он ctx.validator.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

const routes = [{ name: "b", path: "/b/:id?q" }];

async function main(): Promise<void> {
  const plain = createRouter(routes as never, {} as never);
  console.log(
    JSON.stringify({ noPlugin_validator: getInternals(plain).validator }),
  );

  const r = createRouter(routes as never, {} as never);
  r.usePlugin(validationPlugin() as never);
  await r.start("/b/1?q=x");
  const ctx = getInternals(r);
  console.log(
    JSON.stringify({
      withPlugin_validatorInstalled:
        ctx.validator !== null && ctx.validator !== undefined,
      keys: ctx.validator ? Object.keys(ctx.validator as object) : null,
      path: r.buildPath("b", { id: "1" }, { q: "x" }),
    }),
  );
  // позитивный контроль: плагин действительно судит — массив как params должен бросить
  let threw = "";
  try {
    r.buildPath("b", [] as never);
  } catch (e) {
    threw = (e as Error).message;
  }
  console.log(JSON.stringify({ control_arrayParamsThrows: threw }));
}

void main();
