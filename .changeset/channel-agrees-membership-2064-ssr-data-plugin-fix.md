---
"@real-router/ssr-data-plugin": patch
---

Hydration no longer accepts a payload channel that conceals its matching key ([#2064](https://github.com/greydragon888/real-router/issues/2064))

`channelAgrees` counted the payload's channel with `objectKeys` — own **and**
enumerable — and then asked `hasOwn`, which is own **only**. A payload whose
visible channel is disjoint from the committed one, with the matching key hidden
behind `enumerable: false`, satisfied both: the counts agreed and the membership
test vouched for a key the count refused to see.

Measured through `hydrateRouter`: a payload with `search: { other: "x" }` plus a
concealed `tab` was accepted as describing `/users/42?tab=1`, the loader was
**skipped**, and server data built for a different state was served.

Membership now comes from the key list the count produced. The `#1835` rule this
replaces is kept rather than traded away — `Object.keys` excludes an inherited
key exactly as `hasOwn` did, and the cell that pins it stays green.

Found by `lint:membership`, the ratchet filed as
[#2108](https://github.com/greydragon888/real-router/issues/2108); two
hand-written scans had reported the tree clean, both looking for `Object.hasOwn(`
where this site spells the module-load capture `hasOwn(`.
