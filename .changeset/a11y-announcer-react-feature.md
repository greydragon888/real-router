---
"@real-router/react": minor
---

Add `announceNavigation` prop to RouterProvider (#337)

WCAG-compliant screen reader announcements on route change. When enabled, a visually hidden `aria-live="assertive"` region announces each navigation, and focus moves to the first `<h1>` on the new page.

```tsx
<RouterProvider router={router} announceNavigation>
```
