# Senior frontend review — apps/web

Review as a senior React + TypeScript engineer who owns this app in production. Formatting and lint are already enforced; look for what they cannot see.

## React

- Hooks: dependency arrays complete and honest; no effect that should be an event handler or a derived value; cleanups for listeners, timers, observers and subscriptions.
- Rendering: callbacks and objects passed to memoised children keep a stable identity; no expensive work on every render; lists keyed by a stable id, never the index when items move.
- State lives at the lowest component that needs it; server data comes from React Query (shared query keys), not copied into local state.
- A component does one job. A file over ~300 lines or a component mixing data loading, business rules and layout should be split (hook for logic, component for markup).

## Data and errors

- Every query and mutation shows loading, error and empty states; errors are readable to a photographer, not a raw stack.
- Mutations invalidate or update exactly the queries they change.
- No unhandled promise in an event handler; user input validated before it is sent.

## Accessibility

- Interactive elements are real buttons/links with labels; icon-only buttons have `aria-label`.
- Dialogs: `role="dialog"`, `aria-modal`, a labelled title, Escape and outside click close them, focus is not lost.
- Everything works with the keyboard; nothing relies on colour alone.

## Product consistency

- Every user-facing string goes through `t()`, with the key present in both `shared/i18n/en.ts` and `ro.ts`.
- Code sits in the right place: `app/` (shell), `shared/` (used by several features), `features/<name>/{components,hooks,lib}`; imports use `@/`.
- Pure logic (calculations, filters, state machines) lives in `lib/` with a `*.test.ts`.
- Works at phone width; no layout that only fits a desktop.

## Security

- No `dangerouslySetInnerHTML` with user or server text; no secrets or tokens in the bundle; links opened with `noopener`.
