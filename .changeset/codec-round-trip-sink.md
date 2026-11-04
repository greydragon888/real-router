---
"@real-router/core": minor
---

Add the codec round-trip sink for `@real-router/validation-plugin` (#2905)

`navigate` takes params in the form a route's `decodeParams` returns and never runs it, so a link and a reload of the same URL commit different states when the decoder adds a key or does not undo `encodeParams`. Core now hands a validator what a check of that needs, and does nothing more without one.

- **Breaking:** `RouterValidator["state"]` has a new required member, `reportCodecRoundTrip(state, codec, pathSlots)`. A custom `RouterValidator` implementation must add it; a no-op satisfies it.
- `navigate` and `PluginApi.buildNavigationState` call it with the state they build, the route's `encodeParams` and `decodeParams` (either may be `undefined`) and the path slots its URL prints, the root's included — only while a validator is installed, and only for a route that has a codec.
- `@real-router/core/validation` exports `areParamValuesEqual`, the value comparison `areStatesEqual` makes.
