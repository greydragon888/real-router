---
"@real-router/core": minor
---

Let a caller's value outrank a forwardTo chain default in either bag (#1570)

Layering a chain default into the channel the TARGET declares (#1570) split the
default and the caller's value across DIFFERENT bags whenever the caller named
the key in `params` while the target declares it with `?`. Nothing ranks two
values in two channels, and the channel-separation seam spreads `search` last —
so the DEFAULT won and the caller's value was lost, silently:

```ts
createRouter([
  { name: "src", path: "/src", forwardTo: "dst", defaultParams: { lang: "fr" } },
  { name: "dst", path: "/dst?lang" },
]);

router.navigate("src", { lang: "de" }); // committed /dst?lang=fr — "de" gone
```

`forwardState` now splits the chain defaults ALONE and layers each half under the
caller in its own channel, declining to default a slot the caller already filled
in either bag. Nothing moves between channels — the caller's key stays where the
caller put it — so channel correctness remains the producer's contract.

Two fixes for the price of one: the same code path used a spread to merge the
query half, which copied an explicit `undefined` over and DELETED the default.
`undefined` is absence on both sides of a merge (#1550 / #1551), so
`navigate("src", {}, { lang: undefined })` now keeps `lang: "fr"` — symmetric
with a route-level `defaultSearch`, where the rule already held.
