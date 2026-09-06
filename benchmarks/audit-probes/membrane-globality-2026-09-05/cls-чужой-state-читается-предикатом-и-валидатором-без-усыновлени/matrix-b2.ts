// matrix-b2: доразбор P1 на D2 — ДИСКРИМИНИРУЮЩИЙ дрейф.
// computeTransitionPath читает toState.name ДВАЖДЫ: getMeta(toState.name)
// (transitionPath.ts · computeTransitionPath) и nameToIDs(toState.name)
// ниже. Нужен узел, на котором два прочтения дают РАЗНЫЙ ответ.
import { createRouter } from "@real-router/core";

import { driftingBag } from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;
type St = { name: string; params: Bag; search: Bag; path: string };
const out = (s: string, d: unknown): void => {
  console.log(`${s} ${JSON.stringify(d)}`);
};

const r: any = createRouter(
  [
    { name: "home", path: "/home" },
    {
      name: "users",
      path: "/users/:uid",
      children: [
        { name: "list", path: "/list" },
        { name: "profile", path: "/p/:id" },
      ],
    },
  ] as never,
  {} as never,
);

const to = (): St => ({
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: {},
  path: "/users/1/p/7",
});
const from = (): St => ({
  name: "users.list",
  params: { uid: "1" },
  search: {},
  path: "/users/1/list",
});

for (const node of ["users.profile", "users.list", "users", "home"]) {
  const p = r.shouldUpdateNode(node) as (a: any, b?: any) => boolean;
  const honest = p(to(), from()); // свежие ссылки — промах кэша, честный ответ
  const d = driftingBag(to(), { name: "home" } as Partial<St>);
  const drifted = p(d.bag, from());
  out(`P1 · D2 узел "${node}"`, {
    честный: honest,
    дрейф: drifted,
    reads: { ...d.reads },
    вердиктРазошёлся: honest !== drifted,
  });
}
