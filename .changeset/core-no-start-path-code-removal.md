---
"@real-router/core": minor
---

Remove `errorCodes.NO_START_PATH_OR_STATE`, a code core never raises (#2363)

The code leaves `errorCodes`, `ErrorCodeToValueMap`, `ErrorCodeKeys` and
`ErrorCodeValues`. Nothing produces it: `start()` takes a path, and called
without one — with no URL plugin to supply it — it rejects with
`TypeError: [router.start] path must be a string, got undefined`, an error that
carries no `code`.

**Breaking Change:** a reference to `errorCodes.NO_START_PATH_OR_STATE` no
longer compiles. Delete the branch that matches it — it never runs. An error you
build yourself as `new RouterError("NO_START_PATH_OR_STATE")` now keeps that
message when `setCode()` changes its code, as any non-standard code does.
