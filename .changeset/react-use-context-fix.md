---
"@real-router/react": patch
---

Replace `use()` with `useContext()` in hooks for React 18 compatibility (#288)

`useRouter`, `useRoute`, and `useNavigator` used React 19's `use()` API, breaking the `@real-router/react/legacy` entry point on React 18. Replaced with `useContext()` which is available in both React 18 and 19.
