// LEAVES vs CONTAINER: which parts of a caller's bag survive into core state BY REFERENCE
// after the container copy — nested objects/arrays in `params`, arrays in `search`,
// and whether core freezes them (P4: only the level core minted).
import { createRouter } from "@real-router/core";

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    { queryParamsMode: "loose" } as never,
  );

  await router.start("/home");

  const nested = { deep: 1 };
  const list = ["a", "b"];
  const params = { id: "7", nested };
  const search = { tab: list };

  const state = await router.navigate("u", params as never, search as never);

  const out = {
    containerCopied: {
      params: state.params !== params,
      search: state.search !== search,
    },
    leavesByReference: {
      "params.nested": state.params.nested === nested,
      "search.tab (array)": state.search.tab === list,
    },
    frozen: {
      "state.params": Object.isFrozen(state.params),
      "state.search": Object.isFrozen(state.search),
      "params.nested (caller's leaf)": Object.isFrozen(state.params.nested),
      "search.tab (caller's array)": Object.isFrozen(state.search.tab),
      "caller's params container": Object.isFrozen(params),
      "caller's search container": Object.isFrozen(search),
    },
    // POSITIVE CONTROL: the leaf is live — mutating through the caller's handle is visible in state.
    mutationThroughCallerHandleVisible: (() => {
      list.push("c");
      nested.deep = 2;

      return {
        searchTabLength: (state.search.tab as string[]).length,
        paramsNestedDeep: (state.params.nested as { deep: number }).deep,
      };
    })(),
    path: state.path,
  };

  router.dispose();
  console.log(JSON.stringify(out, null, 2));
}

void main();
