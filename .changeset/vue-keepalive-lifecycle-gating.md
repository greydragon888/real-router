---
"@real-router/vue": patch
---

fix(vue): gate `useRouteEnter` / `useRouteExit` on `<KeepAlive>` deactivation (#1221)

Under Vue's native `<KeepAlive>` a component is deactivated (not unmounted) when
navigated away from, and its effect scope stays alive. Neither `useRouteEnter` (a
`watch(route)`) nor `useRouteExit` (a `subscribeLeave`) gated on
activated/deactivated state, so a sleeping page's handlers kept running on
unrelated app navigations — a kept-alive page's analytics fired on foreign navs,
and worst, a sleeping page's **async** (Promise-returning) exit handler was
spliced into every navigation's leave cycle and blocked the whole app. Both
composables now track `onActivated` / `onDeactivated` (which only fire under
KeepAlive — inert otherwise) and skip the handler while deactivated. A deactivated
page fires neither enter nor exit; waking a kept-alive page does NOT re-fire enter
(it was never unmounted, so reactivation is not a mount — use Vue's native
`onActivated` for a "re-run on show" hook).
