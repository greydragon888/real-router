---
"@real-router/core": minor
---

Type a route codec's two sides apart: the state side carries application values such as a `Date` (#2834)

A route's `decodeParams` may return what the application uses — a `Date`, a
plain object, an array of those — and the state side is typed for it.
`State.params`, `State.search` and the doors that take a state-side bag
(`navigate`, `buildPath`, `makeState`, `buildNavigationState`, `canNavigateTo`,
`isActiveRoute` and a `<Link>`'s `routeParams` and `routeSearch` among them)
carry the new `ParamValue`. `decodeParams` receives the new `UrlChannels` —
path slots as the strings the matcher captured, query values as the parser
typed them (`SearchParamValue`) — and `encodeParams` receives and returns
`ParamsSearch`, the state side.

Runtime behaviour is unchanged. Without a route codec, a `Date` or a plain
object prints as its JSON text in a path slot and as its `String()` in a query
value, a reload reads back a string, and inside a query array it throws a
`TypeError`.

**Breaking Change:** code typed against the old shapes may stop compiling.

- A channel value you read — `state.search.q`, `state.params.day` — is a
  `ParamValue`: narrow it (`typeof`, `instanceof Date`, `Array.isArray`) or cast
  it where it reaches a narrower slot, such as a JSX child or a
  `SearchParamValue` parameter.
- A route's `decodeParams` takes URL values. Call it with path slots as strings
  (`{ params: { id: "7" }, search: {} }`), not with a committed state's
  channels, and type a variable that holds it
  `(channels: UrlChannels) => ParamsSearch`: one typed
  `(channels: ParamsSearch) => ParamsSearch` no longer accepts it. Inside a
  decoder a path slot is a `string`, so comparing it with a number no longer
  compiles, and a decoder that wrote into its argument returns a new object
  instead. A decoder typed `(channels: ParamsSearch) => ParamsSearch` still
  assigns to a route.
- A path-slot cast in a decoder (`params.id as string`) is now reported by
  `@typescript-eslint/no-unnecessary-type-assertion`, and `String(search.q)` in
  an encoder by `@typescript-eslint/no-base-to-string`.
