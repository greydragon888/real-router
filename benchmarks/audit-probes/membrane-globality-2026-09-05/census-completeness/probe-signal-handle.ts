// Census-completeness probe: `NavigationOptions.signal` is an app-supplied
// object (typed AbortSignal, but any duck-typed object arrives) that core holds
// for the navigation's whole life — read at the entry, adopted after the
// announce, subscribed via addEventListener, unsubscribed at commit, `reason`
// read on abort. No `*·options.signal` door exists in the census.
import { createRouter } from "@real-router/core";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "c", path: "/c" },
];

function fakeSignal(label: string, abortedAnswer: () => boolean) {
  const r = { aborted: 0, reason: 0, addEventListener: 0, removeEventListener: 0 };
  let handler: (() => void) | undefined;
  const sig = {
    get aborted() {
      r.aborted++;

      return abortedAnswer();
    },
    get reason() {
      r.reason++;

      return new Error(`${label}-reason`);
    },
    addEventListener(_t: string, fn: () => void) {
      r.addEventListener++;
      handler = fn;
    },
    removeEventListener() {
      r.removeEventListener++;
    },
    fire: () => handler?.(),
  };

  return { sig, r };
}

async function main(): Promise<void> {
  const router = createRouter(routes as never, {} as never);
  router.subscribeLeave(() => {});
  await router.start("/a");

  // (1) live signal, never aborted: held across frames until the commit.
  const s1 = fakeSignal("s1", () => false);
  await router.navigate("b", {}, undefined, { signal: s1.sig as never });
  const live = { ...s1.r, committed: router.getState()!.name };

  // (2) aborted mid-flight through the handle core kept.
  let release: (v: boolean) => void = () => {};
  const routes2 = [
    { name: "a", path: "/a" },
    { name: "g", path: "/g", canActivate: () => () => new Promise<boolean>((res) => { release = res; }) },
  ];
  const router2 = createRouter(routes2 as never, {} as never);
  router2.subscribeLeave(() => {});
  await router2.start("/a");
  const s2 = fakeSignal("s2", () => false);
  const p = router2.navigate("g", {}, undefined, { signal: s2.sig as never }).catch((e: { code: string }) => e.code);
  s2.sig.fire();
  const outcome = await p;
  release(true);
  const abortedMidFlight = { ...s2.r, outcome, stillAt: router2.getState()!.name };

  // (3) NEGATIVE CONTROL: no leave listeners, no pre-commit listeners → no bridge.
  const router3 = createRouter(routes as never, {} as never);
  await router3.start("/a");
  const s3 = fakeSignal("s3", () => false);
  await router3.navigate("b", {}, undefined, { signal: s3.sig as never });
  const noBridge = { ...s3.r };

  console.log(JSON.stringify({ live, abortedMidFlight, noBridge }, null, 1));
}

void main();
