import { createSubscriber } from "svelte/reactivity";

// Demonstrates `createSubscriber` — Svelte 5's canonical primitive for
// integrating external reactive sources into the reactivity graph.
// Pairs the SSR-safe initial value (`$state`) with a setInterval-driven
// subscription that runs only on the client.
//
// Why createSubscriber matters:
// — Server-side: factory runs, $state initializes with `new Date()` (the
//   server's "now"). The subscribe callback is registered but never
//   fires (createSubscriber's setup runs only when the value is read
//   inside an effect/template AND we're on the client).
// — Client-side: when `useClock()` is read inside a reactive context,
//   the subscriber's setup runs once, registers an interval, and calls
//   `update()` every tick to mark the dependency dirty. The teardown
//   fires when the last subscriber unmounts (lazy cleanup).
//
// This is the Svelte-canonical way to wrap any subscribe(callback) API
// (websocket, IntersectionObserver, MediaQueryList, EventSource…) into
// a reactive value — analogous to Solid's createResource + onCleanup,
// or React's useSyncExternalStore.
export function useClock(): () => Date {
  let now = $state(new Date());

  const subscribe = createSubscriber((update) => {
    const id = setInterval(() => {
      now = new Date();
      update();
    }, 1000);

    return () => {
      clearInterval(id);
    };
  });

  return () => {
    subscribe();

    return now;
  };
}
